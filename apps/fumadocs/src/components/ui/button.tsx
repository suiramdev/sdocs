import { Children, cloneElement, isValidElement } from "react";
import type { ButtonHTMLAttributes, ReactElement } from "react";

import { cn } from "@/shared/utils/cn";

type ButtonVariant = "default" | "secondary" | "outline" | "ghost";
type ButtonSize = "default" | "sm" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  outline:
    "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-9 px-4 py-2",
  icon: "h-9 w-9",
  sm: "h-8 rounded-md px-3 text-xs",
};

export const Button = ({
  asChild = false,
  children,
  className,
  size = "default",
  type = "button",
  variant = "default",
  ...props
}: ButtonProps) => {
  const buttonClassName = cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    variantClasses[variant],
    sizeClasses[size],
    className
  );

  if (asChild) {
    const child = Children.only(children);

    if (!isValidElement(child)) {
      throw new Error(
        "Button with asChild expects a single valid React element."
      );
    }

    const element = child as ReactElement<{ className?: string }>;

    return cloneElement(element, {
      ...props,
      className: cn(buttonClassName, element.props.className),
    });
  }

  return (
    <button className={buttonClassName} type={type} {...props}>
      {children}
    </button>
  );
};
