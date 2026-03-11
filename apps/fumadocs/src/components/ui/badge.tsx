import type { HTMLAttributes } from "react";

import { cn } from "@/shared/utils/cn";

export const Badge = ({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.72rem] font-semibold uppercase tracking-wide",
      className
    )}
    {...props}
  />
);
