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
import { listAgentToolRuntime } from "@/features/api/v1/services/tool-registry";

const SERVER_NAME = "sdocs-api-reference";
const SERVER_VERSION = "2.1.0";
const RESOURCE_SCHEMA_URI = "docs://schema";
const ROOT_NAMESPACE_URI = "docs://namespace/root";

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
        "You are a documentation agent for the s&box API. Always start with search_docs. When the user names a type, call resolve_symbol before inspecting it. Use get_symbol for type metadata, get_type_members for member discovery, get_method_details for exact overloads, get_examples for code samples, get_related_guides for broader usage context, and list_namespaces to explore the API tree. When you already know the canonical namespace, type, member, or guide path, read the matching docs:// resource to load the full structured documentation page. Follow related guide links from type and member resources when the user needs conceptual guidance, editor workflows, or broader method usage patterns. Do not answer from memory when a tool or resource can verify the symbol.",
    }
  );

  server.registerResource(
    "documentation-schema",
    RESOURCE_SCHEMA_URI,
    {
      description:
        "Schema and URI guide for the s&box documentation MCP resources.",
      mimeType: "application/json",
      title: "Documentation Resource Schema",
    },
    () => toDocumentationResourceResult(readDocumentationSchemaResource())
  );

  server.registerResource(
    "root-namespace",
    ROOT_NAMESPACE_URI,
    {
      description: "Root namespace listing for the indexed s&box API.",
      mimeType: "application/json",
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
      mimeType: "application/json",
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
      mimeType: "application/json",
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
      mimeType: "application/json",
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
      mimeType: "application/json",
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
