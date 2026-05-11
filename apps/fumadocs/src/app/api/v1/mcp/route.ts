import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { after } from "next/server";

import { createApiReferenceMcpServer } from "@/features/api/v1/mcp/server";
import {
  createMcpAnalyticsContext,
  getMcpRequestAnalyticsData,
  trackMcpRequest,
} from "@/features/api/v1/services/mcp-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handleMcpRequest = async (request: Request) => {
  const startedAt = Date.now();
  const requestAnalyticsData = getMcpRequestAnalyticsData(request);
  const server = createApiReferenceMcpServer({
    analytics: createMcpAnalyticsContext(request),
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  try {
    return await transport.handleRequest(request);
  } finally {
    after(() =>
      trackMcpRequest(request, Date.now() - startedAt, requestAnalyticsData)
    );
  }
};

export const DELETE = handleMcpRequest;
export const GET = handleMcpRequest;
export const POST = handleMcpRequest;
