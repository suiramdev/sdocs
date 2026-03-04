import type { NextRequest } from "next/server";

import { toolNameSchema } from "@/features/api/v1/domain/schemas";
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

  try {
    const { toolName } = await params;
    const parsedToolName = toolNameSchema.parse(toolName);
    const payload = (await request.json()) as unknown;
    const result = await executeAgentTool(parsedToolName, payload);

    return ok(context, {
      result,
      tool: parsedToolName,
    });
  } catch (error) {
    return handleRouteError(context, error);
  }
};
