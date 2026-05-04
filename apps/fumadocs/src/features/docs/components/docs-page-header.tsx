import { DocsDescription, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import type { ReactNode } from "react";

import { cn } from "@/shared/utils/cn";

interface DocsPageHeaderProps {
  actions?: ReactNode;
  actionsClassName?: string;
  description?: ReactNode;
  descriptionClassName?: string;
  dividerClassName?: string;
  metadata?: ReactNode;
  metadataClassName?: string;
  title: ReactNode;
  titleClassName?: string;
  titleIcon?: ReactNode;
}

const hasContent = (content: ReactNode): boolean => {
  if (typeof content === "string") {
    return content.trim().length > 0;
  }

  return content !== null && content !== undefined;
};

export const DocsPageHeader = ({
  actions,
  actionsClassName,
  description,
  descriptionClassName,
  dividerClassName,
  metadata,
  metadataClassName,
  title,
  titleClassName,
  titleIcon,
}: DocsPageHeaderProps) => (
  <>
    <DocsTitle className={titleClassName}>
      {titleIcon ? (
        <span className="inline-flex items-baseline gap-3">
          <span aria-hidden="true" className="shrink-0">
            {titleIcon}
          </span>
          <span>{title}</span>
        </span>
      ) : (
        title
      )}
    </DocsTitle>
    {hasContent(description) ? (
      <DocsDescription className={cn("mb-0", descriptionClassName)}>
        {description}
      </DocsDescription>
    ) : null}
    {hasContent(metadata) ? (
      <div
        className={cn(
          "mt-3 text-fd-muted-foreground text-sm",
          metadataClassName
        )}
      >
        {metadata}
      </div>
    ) : null}
    <div className={cn("border-b pb-6", dividerClassName)}>
      {actions ? (
        <div
          className={cn("flex flex-row items-center gap-2", actionsClassName)}
        >
          {actions}
        </div>
      ) : null}
    </div>
  </>
);
