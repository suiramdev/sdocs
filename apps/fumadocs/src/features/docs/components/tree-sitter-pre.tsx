import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";

import { TreeSitterCodeBlock } from "@/features/code/components/tree-sitter-code-block";

const extractTextContent = (value: ReactNode): string => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(extractTextContent).join("");
  }

  if (
    isValidElement<{
      children?: ReactNode;
    }>(value)
  ) {
    return extractTextContent(value.props.children);
  }

  return "";
};

const extractLanguage = (className: string | undefined) => className?.match(/language-([^\s]+)/u)?.[1];

export const TreeSitterPre = ({
  children,
  ...props
}: ComponentProps<"pre">) => {
  if (
    !isValidElement<{
      children?: ReactNode;
      className?: string;
      metastring?: string;
    }>(children) ||
    children.type !== "code"
  ) {
    return (
      <CodeBlock {...props}>
        <Pre>{children}</Pre>
      </CodeBlock>
    );
  }

  const code = extractTextContent(children.props.children).replace(/\n$/u, "");

  return (
    <TreeSitterCodeBlock
      code={code}
      lang={extractLanguage(children.props.className)}
      title={children.props.metastring}
    />
  );
};
