import { DocsDescription, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import type { ReactNode } from "react";

import { cn } from "@/shared/utils/cn";

interface DocsPageHeaderProps {
  actions?: ReactNode;
  actionsClassName?: string;
  description?: ReactNode;
  descriptionClassName?: string;
  dividerClassName?: string;
  title: ReactNode;
  titleClassName?: string;
}

const hasDescriptionContent = (description: ReactNode): boolean => {
  if (typeof description === "string") {
    return description.trim().length > 0;
  }

  return description !== null && description !== undefined;
};

export const DocsPageHeader = ({
  actions,
  actionsClassName,
  description,
  descriptionClassName,
  dividerClassName,
  title,
  titleClassName,
}: DocsPageHeaderProps) => (
  <>
    <DocsTitle className={titleClassName}>{title}</DocsTitle>
    {hasDescriptionContent(description) ? (
      <DocsDescription className={cn("mb-0", descriptionClassName)}>
        {description}
      </DocsDescription>
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
