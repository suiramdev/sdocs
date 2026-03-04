import { tokenizeSignature } from "@/features/api/utils/signature-tokens";

interface SignatureTextProps {
  className?: string;
  value: string;
}

const getSignatureClassName = (className?: string): string => {
  if (!className || className.length === 0) {
    return "api-signature";
  }

  return `api-signature ${className}`;
};

export const SignatureText = ({ className, value }: SignatureTextProps) => {
  const signatureTokens = tokenizeSignature(value);

  return (
    <span className={getSignatureClassName(className)} role="text">
      {signatureTokens.map((token, index) => (
        <span
          className={`api-token api-token-${token.kind}`}
          key={`${token.value}-${index}`}
        >
          {token.value}
        </span>
      ))}
    </span>
  );
};
