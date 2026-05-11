import { after } from "next/server";

import {
  getServerAnalyticsClientData,
  trackServerUmamiEvent,
} from "@/features/analytics/utils/server-umami";
import type { ServerUmamiEventData } from "@/features/analytics/utils/server-umami";
import type { ToolName } from "@/features/api/v1/domain/schemas";

export interface McpAnalyticsContext {
  request: Request;
}

interface ToolCallAnalyticsInput {
  input: unknown;
  latencyMs: number;
  ok: boolean;
  request: Request;
  toolName: ToolName;
  transport: "mcp" | "rest";
}

interface JsonRpcRequest {
  method?: unknown;
  params?: unknown;
}

interface McpClientInfo {
  name?: unknown;
  version?: unknown;
}

interface McpInitializeParams {
  clientInfo?: McpClientInfo;
}

interface McpToolCallParams {
  arguments?: unknown;
  name?: unknown;
}

const MAX_EVENT_VALUE_LENGTH = 160;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toEventString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_EVENT_VALUE_LENGTH) : undefined;
};

const toEventNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const getTargetKind = (target: string): string => {
  if (target.startsWith("docs://guide/")) {
    return "guide";
  }

  if (target.startsWith("docs://type/")) {
    return "type";
  }

  if (target.startsWith("docs://member/")) {
    return "member";
  }

  if (target.startsWith("docs://namespace/")) {
    return "namespace";
  }

  return "symbol";
};

const getStringInputSummary = (
  input: Record<string, unknown>
): ServerUmamiEventData => {
  const query = toEventString(input.query);
  const target = toEventString(input.target);
  const symbol = toEventString(input.symbol);
  const name = toEventString(input.name);

  return {
    ...(query ? { query_length: query.length } : {}),
    ...(symbol ? { symbol_length: symbol.length } : {}),
    ...(name ? { name_length: name.length } : {}),
    ...(target ? { target_kind: getTargetKind(target) } : {}),
  };
};

const getInputSummary = (input: unknown): ServerUmamiEventData => {
  if (!isRecord(input)) {
    return {};
  }

  const detail = toEventString(input.detail);
  const kind = toEventString(input.kind);
  const limit = toEventNumber(input.limit);
  const namespace = toEventString(input.namespace);

  return {
    ...getStringInputSummary(input),
    ...(detail ? { detail } : {}),
    ...(kind ? { kind } : {}),
    ...(limit === undefined ? {} : { limit }),
    ...(namespace ? { namespace } : {}),
  };
};

const asJsonRpcRequests = (body: unknown): JsonRpcRequest[] => {
  const requests = Array.isArray(body) ? body : [body];

  return requests.filter(isRecord);
};

const getClientInfo = (requests: JsonRpcRequest[]): ServerUmamiEventData => {
  for (const request of requests) {
    if (request.method !== "initialize" || !isRecord(request.params)) {
      continue;
    }

    const params = request.params as McpInitializeParams;

    if (!isRecord(params.clientInfo)) {
      return {};
    }

    const clientName = toEventString(params.clientInfo.name);
    const clientVersion = toEventString(params.clientInfo.version);

    return {
      ...(clientName ? { mcp_client: clientName } : {}),
      ...(clientVersion ? { mcp_client_version: clientVersion } : {}),
    };
  }

  return {};
};

const getToolCallParams = (
  request: JsonRpcRequest
): McpToolCallParams | undefined => {
  if (request.method !== "tools/call" || !isRecord(request.params)) {
    return;
  }

  return request.params as McpToolCallParams;
};

export const createMcpAnalyticsContext = (
  request: Request
): McpAnalyticsContext => ({
  request,
});

export const getMcpRequestAnalyticsData = async (
  request: Request
): Promise<ServerUmamiEventData> => {
  if (request.method !== "POST") {
    return {
      http_method: request.method,
      transport: "mcp",
    };
  }

  try {
    const body = (await request.clone().json()) as unknown;
    const rpcRequests = asJsonRpcRequests(body);
    const rpcMethods = rpcRequests
      .map((rpcRequest) => toEventString(rpcRequest.method))
      .filter((method) => method !== undefined);
    const toolNames = rpcRequests
      .map(getToolCallParams)
      .map((params) => toEventString(params?.name))
      .filter((toolName) => toolName !== undefined);

    return {
      ...getServerAnalyticsClientData(request),
      ...getClientInfo(rpcRequests),
      http_method: request.method,
      rpc_method: rpcMethods.join(",").slice(0, MAX_EVENT_VALUE_LENGTH),
      rpc_request_count: rpcRequests.length,
      tool: toolNames.join(",").slice(0, MAX_EVENT_VALUE_LENGTH),
      transport: "mcp",
    };
  } catch {
    return {
      ...getServerAnalyticsClientData(request),
      http_method: request.method,
      transport: "mcp",
    };
  }
};

export const trackMcpRequest = async (
  request: Request,
  latencyMs: number,
  dataPromise?: Promise<ServerUmamiEventData>
): Promise<void> => {
  const data = dataPromise
    ? await dataPromise
    : await getMcpRequestAnalyticsData(request);

  await trackServerUmamiEvent({
    data: {
      ...data,
      latency_ms: latencyMs,
    },
    name: "mcp_request",
    request,
    title: "MCP request",
    url: "/api/v1/mcp",
  });
};

export const trackToolCall = async ({
  input,
  latencyMs,
  ok,
  request,
  toolName,
  transport,
}: ToolCallAnalyticsInput): Promise<void> => {
  await trackServerUmamiEvent({
    data: {
      ...getServerAnalyticsClientData(request),
      ...getInputSummary(input),
      latency_ms: latencyMs,
      ok,
      tool: toolName,
      transport,
    },
    name: "mcp_tool_call",
    request,
    title: "MCP tool call",
    url: transport === "mcp" ? "/api/v1/mcp" : `/api/v1/tools/${toolName}`,
  });
};

export const trackToolCallFromContext = (
  context: McpAnalyticsContext | undefined,
  input: Omit<ToolCallAnalyticsInput, "request" | "transport">
): void => {
  if (!context) {
    return;
  }

  after(() =>
    trackToolCall({
      ...input,
      request: context.request,
      transport: "mcp",
    })
  );
};
