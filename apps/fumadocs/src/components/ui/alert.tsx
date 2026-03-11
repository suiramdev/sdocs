import type { HTMLAttributes } from "react";

import { cn } from "@/shared/utils/cn";

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "warning";
}

export const Alert = ({
  className,
  variant = "default",
  ...props
}: AlertProps) => (
  <div
    className={cn(
      "relative w-full rounded-lg border p-4 text-sm",
      variant === "warning" &&
        "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100",
      variant === "default" && "border-border bg-card",
      className
    )}
    {...props}
  />
);

export const AlertTitle = ({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) => (
  <h5 className={cn("mb-1 font-semibold", className)} {...props} />
);

export const AlertDescription = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("text-sm leading-relaxed", className)} {...props} />
);
