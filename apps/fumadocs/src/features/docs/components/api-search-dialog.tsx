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
import { useMemo, useState } from "react";

type NonActionSearchItem = Exclude<SearchItemType, { type: "action" }>;

const isApiHtmlContent = (
  item: SearchItemType
): item is NonActionSearchItem & {
  content: string;
} =>
  item.type === "page" &&
  typeof item.content === "string" &&
  item.content.includes("search-result-signature");

const HtmlSearchItem = ({
  item,
  onClick,
}: {
  item: SearchItemType;
  onClick: () => void;
}) => {
  if (!isApiHtmlContent(item)) {
    return <SearchDialogListItem item={item} onClick={onClick} />;
  }

  return (
    <SearchDialogListItem item={item} onClick={onClick}>
      <div className="inline-flex items-center text-fd-muted-foreground text-xs empty:hidden">
        {(item.breadcrumbs ?? []).join(" / ")}
      </div>
      <div
        className="min-w-0 text-fd-popover-foreground/90"
        dangerouslySetInnerHTML={{ __html: item.content }}
      />
    </SearchDialogListItem>
  );
};

const ApiSearchDialog = ({
  defaultTag,
  tags = [],
  api,
  delayMs,
  type = "fetch",
  allowClear = false,
  links = [],
  footer,
  ...props
}: DefaultSearchDialogProps) => {
  const { locale } = useI18n();
  const [tag, setTag] = useState(defaultTag);
  const { search, setSearch, query } = useDocsSearch(
    type === "fetch"
      ? {
          api,
          delayMs,
          locale,
          tag,
          type: "fetch",
        }
      : {
          delayMs,
          from: api,
          locale,
          tag,
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
    setTag(nextDefaultTag);
  });
  const items = query.data === "empty" ? defaultItems : query.data;

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
            <HtmlSearchItem item={item} onClick={onClick} />
          )}
          items={items}
        />
      </SearchDialogContent>
      <SearchDialogFooter>
        {tags.length > 0 ? (
          <TagsList allowClear={allowClear} onTagChange={setTag} tag={tag}>
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
