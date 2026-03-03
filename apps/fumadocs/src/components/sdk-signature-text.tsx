"use client";

import { useShiki } from "fumadocs-core/highlight/client";
import { Suspense, type ComponentProps } from "react";

interface SdkSignatureTextProps {
  className?: string;
  value: string;
}

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter((value) => value && value.length > 0).join(" ");
}

function SignatureFallback({ className, value }: SdkSignatureTextProps) {
  return (
    <span className={joinClassNames("sdk-signature", className)}>{value}</span>
  );
}

function SignatureHighlight({ className, value }: SdkSignatureTextProps) {
  return useShiki(value, {
    components: {
      pre: (props: ComponentProps<"pre">) => (
        <span
          {...props}
          className={joinClassNames(
            "sdk-signature",
            "shiki",
            className,
            props.className
          )}
        />
      ),
    },
    lang: "csharp",
  });
}

export function SdkSignatureText(props: SdkSignatureTextProps) {
  return (
    <Suspense fallback={<SignatureFallback {...props} />}>
      <SignatureHighlight {...props} />
    </Suspense>
  );
}
