import Link from "next/link";
import type { CSSProperties } from "react";

import { highlightSignatureTokens } from "@/features/api/utils/signature-tokens";
import type { SignatureToken } from "@/features/api/utils/signature-tokens";
import { cn } from "@/shared/utils/cn";

interface SignatureTextProps {
  className?: string;
  getTokenHref?: (token: SignatureToken) => string | null | undefined;
  value: string;
}

export const SignatureText = async ({
  className,
  getTokenHref,
  value,
}: SignatureTextProps) => {
  const signatureTokens = await highlightSignatureTokens(value);

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
        const tokenStyle = {
          "--syntax-dark": token.darkColor,
          "--syntax-light": token.lightColor,
        } as CSSProperties;

        if (href) {
          return (
            <Link
              className="signature-token underline underline-offset-2"
              href={href}
              key={key}
              prefetch={false}
              style={tokenStyle}
            >
              {token.value}
            </Link>
          );
        }

        return (
          <span className="signature-token" key={key} style={tokenStyle}>
            {token.value}
          </span>
        );
      })}
    </span>
  );
};
