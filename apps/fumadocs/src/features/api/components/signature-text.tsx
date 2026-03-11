import Link from "next/link";

import { tokenizeSignature } from "@/features/api/utils/signature-tokens";
import type {
  SignatureToken,
  SignatureTokenKind,
} from "@/features/api/utils/signature-tokens";
import { cn } from "@/shared/utils/cn";

interface SignatureTextProps {
  className?: string;
  getTokenHref?: (token: SignatureToken) => string | null | undefined;
  value: string;
}

const tokenClassNames: Record<SignatureTokenKind, string> = {
  default: "text-foreground/90",
  generic: "text-purple-700 dark:text-purple-300",
  keyword: "text-indigo-700 dark:text-indigo-300",
  member: "font-semibold text-foreground",
  modifier: "text-violet-700 dark:text-violet-300",
  parameter: "text-amber-700 dark:text-amber-300",
  type: "text-teal-700 dark:text-teal-300",
};

export const SignatureText = ({
  className,
  getTokenHref,
  value,
}: SignatureTextProps) => {
  const signatureTokens = tokenizeSignature(value);

  return (
    <span
      className={cn(
        "block whitespace-pre-wrap break-words font-mono text-[0.95rem] leading-relaxed tracking-tight",
        className
      )}
      role="text"
    >
      {signatureTokens.map((token, index) => {
        const key = `${token.value}-${index}`;
        const href = getTokenHref?.(token);
        const tokenClassName = tokenClassNames[token.kind];

        if (href) {
          return (
            <Link
              className={cn(tokenClassName, "underline underline-offset-2")}
              href={href}
              key={key}
              prefetch={false}
            >
              {token.value}
            </Link>
          );
        }

        return (
          <span className={tokenClassName} key={key}>
            {token.value}
          </span>
        );
      })}
    </span>
  );
};
