import type { NextRequest } from "next/server";

import { listAgentTools } from "@/features/api/v1/services/tool-registry";
import {
  createRouteContext,
  handleRouteError,
  ok,
} from "@/features/api/v1/transport/http";

export const runtime = "nodejs";

export const GET = (request: NextRequest) => {
  const context = createRouteContext(request);

  try {
    return ok(context, {
      tools: listAgentTools(),
    });
  } catch (error) {
    return handleRouteError(context, error);
  }
};
