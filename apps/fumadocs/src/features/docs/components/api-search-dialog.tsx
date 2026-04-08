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
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { trackUmamiEvent } from "@/features/analytics/utils/umami";

type NonActionSearchItem = Exclude<SearchItemType, { type: "action" }>;
type SearchGroupKey =
  | "class"
  | "enum"
  | "guide"
  | "method"
  | "property"
  | "other";

const emptyTags: NonNullable<DefaultSearchDialogProps["tags"]> = [];
const emptyLinks: NonNullable<DefaultSearchDialogProps["links"]> = [];
const minimumTrackedSearchLength = 2;
const maxTrackedQueryLength = 120;

const searchGroupOrder = [
  "guide",
  "class",
  "enum",
  "method",
  "property",
  "other",
] as const satisfies readonly SearchGroupKey[];

const searchGroupLabels: Record<Exclude<SearchGroupKey, "other">, string> = {
  class: "CLASS",
  enum: "ENUMS",
  guide: "GUIDES",
  method: "METHODS",
  property: "PROPERTIES",
};

const isKnownSearchGroupKey = (
  value: string
): value is Exclude<SearchGroupKey, "guide" | "other"> =>
  value === "class" ||
  value === "enum" ||
  value === "method" ||
  value === "property";

const isGuideSearchResult = (item: SearchItemType): boolean =>
  item.type !== "action" &&
  "url" in item &&
  typeof item.url === "string" &&
  item.url.startsWith("/docs") &&
  !item.url.startsWith("/docs/api");

const getEntitySearchGroupKey = (
  item: NonActionSearchItem
): Exclude<SearchGroupKey, "guide" | "other"> | null => {
  const entityType = item.breadcrumbs?.at(-1);
  if (typeof entityType !== "string") {
    return null;
  }

  const normalizedEntityType = entityType.toLowerCase();
  return isKnownSearchGroupKey(normalizedEntityType)
    ? normalizedEntityType
    : null;
};

const getSearchGroupKey = (item: SearchItemType): SearchGroupKey => {
  if (item.type === "action") {
    return "other";
  }

  if (isGuideSearchResult(item)) {
    return "guide";
  }

  return getEntitySearchGroupKey(item) ?? "other";
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

const normalizeSearchTerm = (value: string): string =>
  value.trim().replaceAll(/\s+/g, " ");

const getTrackedSearchItemCount = (
  items: SearchItemType[] | null | undefined
): number => {
  if (!items) {
    return 0;
  }

  let trackedItemCount = 0;
  for (const item of items) {
    if (item.type !== "action") {
      trackedItemCount += 1;
    }
  }

  return trackedItemCount;
};

const getSearchItemUrl = (item: NonActionSearchItem): string | undefined =>
  "url" in item && typeof item.url === "string" ? item.url : undefined;

const getSearchItemLabel = (item: NonActionSearchItem): string =>
  typeof item.content === "string"
    ? item.content.slice(0, maxTrackedQueryLength)
    : item.id;

const trackDocsSearch = (
  activeTag: string | undefined,
  normalizedSearch: string,
  trackedSearchItemCount: number
) => {
  trackUmamiEvent("docs_search", {
    pathname: window.location.pathname,
    query: normalizedSearch.slice(0, maxTrackedQueryLength),
    results: trackedSearchItemCount,
    tag: activeTag ?? "all",
  });
};

const useTrackDocsSearch = ({
  activeTag,
  isLoading,
  search,
  trackedSearchItemCount,
}: {
  activeTag: string | undefined;
  isLoading: boolean;
  search: string;
  trackedSearchItemCount: number;
}) => {
  const lastTrackedSearchKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const normalizedSearch = normalizeSearchTerm(search);
    const trackedSearchKey = `${activeTag ?? "all"}:${normalizedSearch}`;
    const canTrackSearch =
      normalizedSearch.length >= minimumTrackedSearchLength && !isLoading;
    if (!canTrackSearch) {
      lastTrackedSearchKeyRef.current = null;
      return;
    }

    if (lastTrackedSearchKeyRef.current === trackedSearchKey) {
      return;
    }

    lastTrackedSearchKeyRef.current = trackedSearchKey;
    trackDocsSearch(activeTag, normalizedSearch, trackedSearchItemCount);
  }, [activeTag, isLoading, search, trackedSearchItemCount]);
};

const trackDocsSearchResultClick = (
  activeTag: string | undefined,
  item: SearchItemType,
  search: string
) => {
  if (item.type === "action") {
    return;
  }

  trackUmamiEvent("docs_search_result_click", {
    pathname: window.location.pathname,
    query: normalizeSearchTerm(search).slice(0, maxTrackedQueryLength),
    resultLabel: getSearchItemLabel(item),
    resultType: item.type,
    resultUrl: getSearchItemUrl(item) ?? item.id,
    tag: activeTag ?? "all",
  });
};

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
  item.content.includes("font-mono text-sm");

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
  label ? (
    <div className="my-3 flex items-center gap-2 px-0.5 text-[0.69rem] font-bold tracking-[0.18em] text-foreground/90 uppercase">
      <span>{label}</span>
      <span className="h-px flex-1 bg-border/70" />
    </div>
  ) : null;

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
      className="min-w-0 text-popover-foreground/90"
      dangerouslySetInnerHTML={{ __html: item.content }}
    />
  );
};

const TrackedSearchDialogListItem = ({
  activeTag,
  groupLabel,
  item,
  onClick,
  search,
}: {
  activeTag: string | undefined;
  groupLabel?: string;
  item: SearchItemType;
  onClick: () => void;
  search: string;
}) => (
  <Fragment>
    <SearchGroupLabel label={groupLabel} />
    <SearchDialogListItem
      item={item}
      onClick={() => {
        trackDocsSearchResultClick(activeTag, item, search);
        onClick();
      }}
    >
      <SearchItemContent item={item} />
    </SearchDialogListItem>
  </Fragment>
);

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
  useTrackDocsSearch({
    activeTag,
    isLoading: query.isLoading,
    search,
    trackedSearchItemCount: getTrackedSearchItemCount(
      query.data === "empty" ? [] : query.data
    ),
  });

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
            <TrackedSearchDialogListItem
              activeTag={activeTag}
              groupLabel={groupHeadings.get(item.id)}
              item={item}
              onClick={onClick}
              search={search}
            />
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
