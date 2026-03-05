import Link from "next/link";

import { tokenizeSignature } from "@/features/api/utils/signature-tokens";
import type { SignatureToken } from "@/features/api/utils/signature-tokens";

interface SignatureTextProps {
  className?: string;
  getTokenHref?: (token: SignatureToken) => string | null | undefined;
  value: string;
}

const getSignatureClassName = (className?: string): string => {
  if (!className || className.length === 0) {
    return "api-signature";
  }

  return `api-signature ${className}`;
};

export const SignatureText = ({
  className,
  getTokenHref,
  value,
}: SignatureTextProps) => {
  const signatureTokens = tokenizeSignature(value);

  return (
    <span className={getSignatureClassName(className)} role="text">
      {signatureTokens.map((token, index) => {
        const classNames = `api-token api-token-${token.kind}`;
        const key = `${token.value}-${index}`;
        const href = getTokenHref?.(token);

        if (href) {
          return (
            <Link
              className={`${classNames} api-token-link`}
              href={href}
              key={key}
              prefetch={false}
            >
              {token.value}
            </Link>
          );
        }

        return (
          <span className={classNames} key={key}>
            {token.value}
          </span>
        );
      })}
    </span>
  );
};
