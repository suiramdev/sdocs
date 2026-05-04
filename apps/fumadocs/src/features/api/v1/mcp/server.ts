import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  completeGuideDocumentationResourceNames,
  completeMemberResourceNames,
  completeNamespaceResourceNames,
  completeTypeResourceNames,
  readDocumentationGuideResource,
  readDocumentationMemberResource,
  readDocumentationNamespaceResource,
  readDocumentationSchemaResource,
  readDocumentationTypeResource,
  toDocumentationResourceResult,
} from "@/features/api/v1/services/documentation-resources";
import { compactMcpToolResult } from "@/features/api/v1/services/mcp-compact";
import {
  encodeMcpContent,
  MCP_TOON_MIME_TYPE,
} from "@/features/api/v1/services/mcp-format";
import { listAgentToolRuntime } from "@/features/api/v1/services/tool-registry";

const SERVER_NAME = "sdocs-api-reference";
const SERVER_VERSION = "2.1.0";
const RESOURCE_SCHEMA_URI = "docs://schema";
const ROOT_NAMESPACE_URI = "docs://namespace/root";

export const createApiReferenceMcpServer = (): McpServer => {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions:
        'You are a documentation agent for the s&box API. Tool and resource text content is compact TOON to reduce token usage; parse it as the same data model as JSON. The MCP workflow has exactly two tools. Always start with search_docs to search official guides and API symbols together. Then call read_doc on the most relevant handle, whether it is a guide, enum, class, method, constructor, or property. Every search result, document, and reference includes tips for next steps. Iterate by calling read_doc again on relevant reference handles until you have enough exact API contracts and guide context to answer. Do not guess from memory when a tool or resource can verify the subject. Pass detail: "full" only when you need larger raw field sets.',
    }
  );

  server.registerResource(
    "documentation-schema",
    RESOURCE_SCHEMA_URI,
    {
      description:
        "Schema and URI guide for the s&box documentation MCP resources.",
      mimeType: MCP_TOON_MIME_TYPE,
      title: "Documentation Resource Schema",
    },
    () => toDocumentationResourceResult(readDocumentationSchemaResource())
  );

  server.registerResource(
    "root-namespace",
    ROOT_NAMESPACE_URI,
    {
      description: "Root namespace listing for the indexed s&box API.",
      mimeType: MCP_TOON_MIME_TYPE,
      title: "Root Namespace",
    },
    async () =>
      toDocumentationResourceResult(
        await readDocumentationNamespaceResource("root")
      )
  );

  server.registerResource(
    "namespace-documentation",
    new ResourceTemplate("docs://namespace/{name}", {
      complete: {
        name: completeNamespaceResourceNames,
      },
      list: undefined,
    }),
    {
      description:
        "Canonical namespace pages from the indexed s&box API documentation.",
      mimeType: MCP_TOON_MIME_TYPE,
      title: "Namespace Documentation",
    },
    async (_uri, variables) =>
      toDocumentationResourceResult(
        await readDocumentationNamespaceResource(String(variables.name ?? ""))
      )
  );

  server.registerResource(
    "type-documentation",
    new ResourceTemplate("docs://type/{full_name}", {
      complete: {
        full_name: completeTypeResourceNames,
      },
      list: undefined,
    }),
    {
      description:
        "Canonical type pages for classes, structs, interfaces, and enums.",
      mimeType: MCP_TOON_MIME_TYPE,
      title: "Type Documentation",
    },
    async (_uri, variables) =>
      toDocumentationResourceResult(
        await readDocumentationTypeResource(String(variables.full_name ?? ""))
      )
  );

  server.registerResource(
    "guide-documentation",
    new ResourceTemplate("docs://guide/{path}", {
      complete: {
        path: completeGuideDocumentationResourceNames,
      },
      list: undefined,
    }),
    {
      description:
        "Official guide pages related to the indexed s&box API documentation.",
      mimeType: MCP_TOON_MIME_TYPE,
      title: "Guide Documentation",
    },
    async (_uri, variables) =>
      toDocumentationResourceResult(
        await readDocumentationGuideResource(String(variables.path ?? "index"))
      )
  );

  server.registerResource(
    "member-documentation",
    new ResourceTemplate("docs://member/{full_name}", {
      complete: {
        full_name: completeMemberResourceNames,
      },
      list: undefined,
    }),
    {
      description:
        "Canonical member pages for methods, constructors, and properties.",
      mimeType: MCP_TOON_MIME_TYPE,
      title: "Member Documentation",
    },
    async (_uri, variables) =>
      toDocumentationResourceResult(
        await readDocumentationMemberResource(String(variables.full_name ?? ""))
      )
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
        const content = compactMcpToolResult(tool.name, result, input);

        return {
          content: [
            {
              text: encodeMcpContent(content),
              type: "text" as const,
            },
          ],
        };
      }
    );
  }

  return server;
};
