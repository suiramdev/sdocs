import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";

import { TreeSitterCodeBlock } from "@/features/code/components/tree-sitter-code-block";
import { SDOCS_MCP_URL } from "@/features/docs/utils/mcp-install";

const formatJson = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`;

const renderPlainTextCodeBlock = (code: string) => (
  <CodeBlock>
    <Pre>
      <code>{code}</code>
    </Pre>
  </CodeBlock>
);

export const McpVscodeConfigSnippet = () => (
  <TreeSitterCodeBlock
    code={formatJson({
      servers: {
        sdocs: {
          type: "http",
          url: SDOCS_MCP_URL,
        },
      },
    })}
    lang="json"
  />
);

export const McpCursorConfigSnippet = () => (
  <TreeSitterCodeBlock
    code={formatJson({
      mcpServers: {
        sdocs: {
          type: "streamableHttp",
          url: SDOCS_MCP_URL,
        },
      },
    })}
    lang="json"
  />
);

export const McpRemoteUrlSnippet = () =>
  renderPlainTextCodeBlock(SDOCS_MCP_URL);

export const McpOtherToolConfigSnippet = () => (
  <TreeSitterCodeBlock
    code={formatJson({
      mcpServers: {
        sdocs: {
          type: "http",
          url: SDOCS_MCP_URL,
        },
      },
    })}
    lang="json"
  />
);
