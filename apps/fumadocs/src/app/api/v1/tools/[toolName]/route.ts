import type { NextRequest } from "next/server";
import { after } from "next/server";

import type { ToolName } from "@/features/api/v1/domain/schemas";
import { toolNameSchema } from "@/features/api/v1/domain/schemas";
import { trackToolCall } from "@/features/api/v1/services/mcp-analytics";
import { executeAgentTool } from "@/features/api/v1/services/tool-registry";
import {
  createRouteContext,
  handleRouteError,
  ok,
} from "@/features/api/v1/transport/http";

export const runtime = "nodejs";

export const POST = async (
  request: NextRequest,
  { params }: RouteContext<"/api/v1/tools/[toolName]">
) => {
  const context = createRouteContext(request);
  const startedAt = Date.now();
  let parsedToolName: ToolName | undefined;
  let payload: unknown;

  try {
    const { toolName } = await params;
    parsedToolName = toolNameSchema.parse(toolName);
    payload = (await request.json()) as unknown;
    const result = await executeAgentTool(parsedToolName, payload);
    const analyticsToolName = parsedToolName;

    after(() =>
      trackToolCall({
        input: payload,
        latencyMs: Date.now() - startedAt,
        ok: true,
        request,
        toolName: analyticsToolName,
        transport: "rest",
      })
    );

    return ok(context, {
      result,
      tool: parsedToolName,
    });
  } catch (error) {
    if (parsedToolName) {
      const analyticsToolName = parsedToolName;

      after(() =>
        trackToolCall({
          input: payload,
          latencyMs: Date.now() - startedAt,
          ok: false,
          request,
          toolName: analyticsToolName,
          transport: "rest",
        })
      );
    }

    return handleRouteError(context, error);
  }
};
