import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import type { CSSProperties } from "react";

import { highlightCode } from "@/features/code/utils/tree-sitter-highlight";
import { cn } from "@/shared/utils/cn";

interface TreeSitterCodeBlockProps {
  className?: string;
  code: string;
  lang?: string;
  title?: string;
}

export const TreeSitterCodeBlock = async ({
  className,
  code,
  lang,
  title,
}: TreeSitterCodeBlockProps) => {
  const lines = await highlightCode({
    language: lang,
    source: code,
  });

  return (
    <CodeBlock className={cn("my-0", className)} title={title}>
      <Pre>
        <code>
          {lines.map((line, lineIndex) => (
            <span className="line" key={`line-${lineIndex}`}>
              {line.segments.map((segment, segmentIndex) => (
                <span
                  className="code-token"
                  key={`segment-${lineIndex}-${segmentIndex}`}
                  style={
                    {
                      "--syntax-dark": segment.darkColor,
                      "--syntax-light": segment.lightColor,
                    } as CSSProperties
                  }
                >
                  {segment.text}
                </span>
              ))}
              {lineIndex < lines.length - 1 ? "\n" : null}
            </span>
          ))}
        </code>
      </Pre>
    </CodeBlock>
  );
};
