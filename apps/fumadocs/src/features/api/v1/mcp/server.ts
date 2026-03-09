import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { listAgentToolRuntime } from "@/features/api/v1/services/tool-registry";

const SERVER_NAME = "sdocs-api-reference";
const SERVER_VERSION = "2.0.0";

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
        "You are a documentation agent for the s&box API. Always start with search_docs. When the user names a type, call resolve_symbol before inspecting it. Use get_symbol for type metadata, get_type_members for member discovery, get_method_details for exact overloads, get_examples for code samples, and list_namespaces to explore the API tree. Do not answer from memory when a tool can verify the symbol.",
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
