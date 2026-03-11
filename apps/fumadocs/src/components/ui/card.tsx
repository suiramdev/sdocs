import type { HTMLAttributes } from "react";

import { cn } from "@/shared/utils/cn";

export const Card = ({ className, ...props }: HTMLAttributes<HTMLElement>) => (
  <article
    className={cn("rounded-xl border bg-card text-card-foreground", className)}
    {...props}
  />
);
