"use client";

import { useDocsSearch } from "fumadocs-core/search/client";
import { useOnChange } from "fumadocs-core/utils/use-on-change";
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogFooter,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogListItem,
  SearchDialogOverlay,
  TagsList,
  TagsListItem,
} from "fumadocs-ui/components/dialog/search";
import type { SearchItemType } from "fumadocs-ui/components/dialog/search";
import type { DefaultSearchDialogProps } from "fumadocs-ui/components/dialog/search-default";
import { useI18n } from "fumadocs-ui/contexts/i18n";
import { ChevronRight, Hash } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

type NonActionSearchItem = Exclude<SearchItemType, { type: "action" }>;
type SearchGroupKey = "class" | "enum" | "method" | "property" | "other";

const emptyTags: NonNullable<DefaultSearchDialogProps["tags"]> = [];
const emptyLinks: NonNullable<DefaultSearchDialogProps["links"]> = [];

const searchGroupOrder = [
  "class",
  "enum",
  "method",
  "property",
  "other",
] as const satisfies readonly SearchGroupKey[];

const searchGroupLabels: Record<Exclude<SearchGroupKey, "other">, string> = {
  class: "CLASS",
  enum: "ENUMS",
  method: "METHODS",
  property: "PROPERTIES",
};

const isKnownSearchGroupKey = (
  value: string
): value is Exclude<SearchGroupKey, "other"> =>
  value === "class" ||
  value === "enum" ||
  value === "method" ||
  value === "property";

const getSearchGroupKey = (item: SearchItemType): SearchGroupKey => {
  if (item.type === "action") {
    return "other";
  }

  const entityType = item.breadcrumbs?.at(-1);
  if (typeof entityType !== "string") {
    return "other";
  }

  const normalizedEntityType = entityType.toLowerCase();
  if (isKnownSearchGroupKey(normalizedEntityType)) {
    return normalizedEntityType;
  }

  return "other";
};

const createGroupedEntries = (): Map<SearchGroupKey, SearchItemType[]> => {
  const groupedEntries = new Map<SearchGroupKey, SearchItemType[]>();
  for (const groupKey of searchGroupOrder) {
    groupedEntries.set(groupKey, []);
  }

  return groupedEntries;
};

const populateGroupedEntries = (
  groupedEntries: Map<SearchGroupKey, SearchItemType[]>,
  items: SearchItemType[]
) => {
  for (const item of items) {
    const groupItems = groupedEntries.get(getSearchGroupKey(item));
    if (groupItems) {
      groupItems.push(item);
    }
  }
};

const getGroupHeadingLabel = (groupKey: SearchGroupKey): string | undefined =>
  groupKey === "other" ? undefined : searchGroupLabels[groupKey];

const appendGroupedSearchItems = (
  groupHeadings: Map<string, string>,
  groupedEntries: Map<SearchGroupKey, SearchItemType[]>,
  groupedItems: SearchItemType[]
) => {
  for (const groupKey of searchGroupOrder) {
    const groupItems = groupedEntries.get(groupKey) ?? [];
    if (groupItems.length === 0) {
      continue;
    }

    const label = getGroupHeadingLabel(groupKey);
    if (label) {
      const [firstItem] = groupItems;
      if (firstItem) {
        groupHeadings.set(firstItem.id, label);
      }
    }

    groupedItems.push(...groupItems);
  }
};

const createGroupedSearchItems = (items: SearchItemType[]) => {
  const groupedEntries = createGroupedEntries();
  const groupedItems: SearchItemType[] = [];
  const groupHeadings = new Map<string, string>();
  populateGroupedEntries(groupedEntries, items);
  appendGroupedSearchItems(groupHeadings, groupedEntries, groupedItems);

  return {
    groupHeadings,
    groupedItems,
  };
};

const sortSearchItems = (items: SearchItemType[] | null | undefined) => {
  if (!items) {
    return {
      groupHeadings: new Map<string, string>(),
      groupedItems: items,
    };
  }

  return createGroupedSearchItems(items);
};

const isApiHtmlContent = (
  item: SearchItemType
): item is NonActionSearchItem & {
  content: string;
} =>
  item.type === "page" &&
  typeof item.content === "string" &&
  item.content.includes("search-result-signature");

const renderHighlights = (
  highlights: NonNullable<NonActionSearchItem["contentWithHighlights"]>
) => {
  const seenHighlights = new Map<string, number>();

  return highlights.map((node) => {
    const nodeKey = `${node.styles?.highlight === true ? "highlight" : "plain"}:${String(node.content)}`;
    const duplicateCount = seenHighlights.get(nodeKey) ?? 0;
    seenHighlights.set(nodeKey, duplicateCount + 1);
    const key = `${nodeKey}:${duplicateCount}`;

    if (node.styles?.highlight) {
      return (
        <span className="text-fd-primary underline" key={key}>
          {node.content}
        </span>
      );
    }

    return <Fragment key={key}>{node.content}</Fragment>;
  });
};

const getSearchItemContentClassName = (item: NonActionSearchItem): string => {
  if (item.type === "text") {
    return "min-w-0 truncate ps-4 text-fd-popover-foreground/80";
  }

  const paddingClassName = item.type === "page" ? "" : " ps-4";
  return `min-w-0 truncate font-medium${paddingClassName}`;
};

const SearchGroupLabel = ({ label }: { label?: string }) =>
  label ? <div className="search-result-group-label">{label}</div> : null;

const SearchItemContent = ({ item }: { item: SearchItemType }) => {
  if (item.type === "action") {
    return item.node;
  }

  if (!isApiHtmlContent(item)) {
    return (
      <>
        <div className="inline-flex items-center text-fd-muted-foreground text-xs empty:hidden">
          {item.breadcrumbs?.map((breadcrumb) => (
            <Fragment key={`${item.id}-${breadcrumb}`}>
              {breadcrumb === item.breadcrumbs?.[0] ? null : (
                <ChevronRight className="size-4" />
              )}
              {breadcrumb}
            </Fragment>
          ))}
        </div>
        {item.type === "page" ? null : (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 start-3 w-px bg-fd-border"
            role="none"
          />
        )}
        <p className={getSearchItemContentClassName(item)}>
          {item.type === "heading" ? (
            <Hash className="me-1 inline size-4 text-fd-muted-foreground" />
          ) : null}
          {item.contentWithHighlights
            ? renderHighlights(item.contentWithHighlights)
            : item.content}
        </p>
      </>
    );
  }

  return (
    <div
      className="min-w-0 text-fd-popover-foreground/90"
      dangerouslySetInnerHTML={{ __html: item.content }}
    />
  );
};

const ApiSearchDialog = ({
  defaultTag,
  tags = emptyTags,
  api,
  delayMs,
  type = "fetch",
  allowClear = false,
  links = emptyLinks,
  footer,
  ...props
}: DefaultSearchDialogProps) => {
  const { locale } = useI18n();
  const [tag, setTag] = useState<string | undefined>();
  const activeTag = tag ?? defaultTag;
  const { search, setSearch, query } = useDocsSearch(
    type === "fetch"
      ? {
          api,
          delayMs,
          locale,
          tag: activeTag,
          type: "fetch",
        }
      : {
          delayMs,
          from: api,
          locale,
          tag: activeTag,
          type: "static",
        }
  );
  const defaultItems = useMemo(() => {
    if (links.length === 0) {
      return null;
    }

    return links.map(([name, link]) => ({
      content: name,
      id: name,
      type: "page" as const,
      url: link,
    }));
  }, [links]);

  useOnChange(defaultTag, (nextDefaultTag) => {
    setTag((currentTag) =>
      currentTag === nextDefaultTag ? currentTag : undefined
    );
  });
  const items = query.data === "empty" ? defaultItems : query.data;
  const { groupedItems, groupHeadings } = useMemo(
    () => sortSearchItems(items),
    [items]
  );

  return (
    <SearchDialog
      {...props}
      isLoading={query.isLoading}
      onSearchChange={setSearch}
      search={search}
    >
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList
          Item={({ item, onClick }) => (
            <Fragment>
              <SearchGroupLabel label={groupHeadings.get(item.id)} />
              <SearchDialogListItem item={item} onClick={onClick}>
                <SearchItemContent item={item} />
              </SearchDialogListItem>
            </Fragment>
          )}
          items={groupedItems}
        />
      </SearchDialogContent>
      <SearchDialogFooter>
        {tags.length > 0 ? (
          <TagsList
            allowClear={allowClear}
            onTagChange={setTag}
            tag={activeTag}
          >
            {tags.map((tagItem) => (
              <TagsListItem key={tagItem.value} value={tagItem.value}>
                {tagItem.name}
              </TagsListItem>
            ))}
          </TagsList>
        ) : null}
        {footer}
      </SearchDialogFooter>
    </SearchDialog>
  );
};

export default ApiSearchDialog;
