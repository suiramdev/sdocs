"use client";

import { useDeferredValue, useEffect, useEffectEvent, useState } from "react";

interface MemberSectionSearchProps {
  describedBy: string;
  emptyStateId: string;
  inputId: string;
  sectionId: string;
  totalCount: number;
  title: string;
}

const getElementByIdSelector = (id: string): string => `#${CSS.escape(id)}`;

const getVisibleMemberCount = (
  group: HTMLElement,
  normalizedValue: string
): number => {
  const memberItems = group.querySelectorAll<HTMLElement>("[data-member-item]");
  let visibleMemberCount = 0;

  for (const memberItem of memberItems) {
    const searchableValue = memberItem.dataset.memberSearch ?? "";
    const isVisible =
      normalizedValue.length === 0 || searchableValue.includes(normalizedValue);

    memberItem.hidden = !isVisible;
    if (isVisible) {
      visibleMemberCount += 1;
    }
  }

  group.hidden = visibleMemberCount === 0;
  return visibleMemberCount;
};

const updateEmptyState = (
  emptyState: HTMLElement | null,
  normalizedValue: string,
  nextVisibleCount: number
) => {
  if (!emptyState) {
    return;
  }

  emptyState.hidden = !(normalizedValue.length > 0 && nextVisibleCount === 0);
};

const getNextVisibleCount = (
  root: HTMLElement,
  normalizedValue: string
): number => {
  const groups = root.querySelectorAll<HTMLElement>("[data-member-group]");
  let nextVisibleCount = 0;

  for (const group of groups) {
    nextVisibleCount += getVisibleMemberCount(group, normalizedValue);
  }

  return nextVisibleCount;
};

export const MemberSectionSearch = ({
  describedBy,
  emptyStateId,
  inputId,
  sectionId,
  totalCount,
  title,
}: MemberSectionSearchProps) => {
  const [draftValue, setDraftValue] = useState("");
  const [visibleCount, setVisibleCount] = useState(totalCount);
  const deferredDraftValue = useDeferredValue(draftValue);
  const lowerCaseTitle = title.toLocaleLowerCase();

  const applyFilter = useEffectEvent((nextValue: string) => {
    const root = document.querySelector<HTMLElement>(
      getElementByIdSelector(sectionId)
    );
    const emptyState = document.querySelector<HTMLElement>(
      getElementByIdSelector(emptyStateId)
    );
    const normalizedValue = nextValue.trim().toLocaleLowerCase();

    if (!root) {
      return;
    }

    const nextVisibleCount = getNextVisibleCount(root, normalizedValue);
    updateEmptyState(emptyState, normalizedValue, nextVisibleCount);
    setVisibleCount(nextVisibleCount);
  });

  useEffect(() => {
    applyFilter(deferredDraftValue);
  }, [applyFilter, deferredDraftValue]);

  return (
    <div className="mt-3 grid gap-2">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(20rem,32rem)] sm:items-baseline sm:gap-4">
        <h2 className="m-0 leading-tight">{title}</h2>
        <label className="sr-only" htmlFor={inputId}>
          {`Search ${lowerCaseTitle}`}
        </label>
        <div className="w-full sm:justify-self-end">
          <input
            aria-describedby={describedBy}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            id={inputId}
            onChange={(event) => {
              setDraftValue(event.target.value);
            }}
            placeholder={`Search ${lowerCaseTitle}`}
            type="search"
            value={draftValue}
          />
        </div>
      </div>
      <p
        className="text-xs leading-relaxed text-muted-foreground"
        id={describedBy}
      >
        {draftValue.trim().length > 0
          ? `${visibleCount} of ${totalCount} ${lowerCaseTitle} shown`
          : `Showing ${totalCount} ${lowerCaseTitle}`}
      </p>
    </div>
  );
};
