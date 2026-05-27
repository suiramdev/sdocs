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

const emptyTags: NonNullable<DefaultSearchDialogProps["tags"]> = [];
const emptyLinks: NonNullable<DefaultSearchDialogProps["links"]> = [];
const minimumTrackedSearchLength = 2;
const maxTrackedQueryLength = 120;
const searchAnalyticsDebounceMs = 1200;

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
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (lastTrackedSearchKeyRef.current === trackedSearchKey) {
        return;
      }

      lastTrackedSearchKeyRef.current = trackedSearchKey;
      trackDocsSearch(activeTag, normalizedSearch, trackedSearchItemCount);
    }, searchAnalyticsDebounceMs);

    return () => window.clearTimeout(timeoutId);
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
  item,
  onClick,
  search,
}: {
  activeTag: string | undefined;
  item: SearchItemType;
  onClick: () => void;
  search: string;
}) => (
  <SearchDialogListItem
    item={item}
    onClick={() => {
      trackDocsSearchResultClick(activeTag, item, search);
      onClick();
    }}
  >
    <SearchItemContent item={item} />
  </SearchDialogListItem>
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
              item={item}
              onClick={onClick}
              search={search}
            />
          )}
          items={items}
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
