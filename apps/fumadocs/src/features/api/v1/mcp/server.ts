import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { listAgentToolRuntime } from "@/features/api/v1/services/tool-registry";

const SERVER_NAME = "sdocs-api-reference";
const SERVER_VERSION = "1.0.0";

const toToolTextContent = (payload: unknown): string =>
  JSON.stringify(payload, null, 2);

const toStructuredContent = (payload: unknown): Record<string, unknown> => {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  return {
    value: payload,
  };
};

export const createApiReferenceMcpServer = (): McpServer => {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions:
        "Use tools to retrieve grounded API reference results before answering.",
    }
  );

  for (const tool of listAgentToolRuntime()) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema,
      },
      async (input: unknown) => {
        const result = await tool.execute(input);
        const structuredContent = toStructuredContent(result);

        return {
          content: [
            {
              text: toToolTextContent(result),
              type: "text" as const,
            },
          ],
          structuredContent,
        };
      }
    );
  }

  return server;
};
