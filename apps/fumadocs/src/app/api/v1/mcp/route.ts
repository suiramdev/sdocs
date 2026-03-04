import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createApiReferenceMcpServer } from "@/features/api/v1/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handleMcpRequest = async (request: Request) => {
  const server = createApiReferenceMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  return await transport.handleRequest(request);
};

export const DELETE = handleMcpRequest;
export const GET = handleMcpRequest;
export const POST = handleMcpRequest;
