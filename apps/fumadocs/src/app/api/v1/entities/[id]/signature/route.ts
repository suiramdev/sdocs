import type { NextRequest } from "next/server";

import { entityIdSchema } from "@/features/api/v1/domain/schemas";
import { getApiSignatureById } from "@/features/api/v1/services/api-reference";
import {
  createRouteContext,
  handleRouteError,
  ok,
} from "@/features/api/v1/transport/http";

export const runtime = "nodejs";

export const GET = async (
  request: NextRequest,
  { params }: RouteContext<"/api/v1/entities/[id]/signature">
) => {
  const context = createRouteContext(request);

  try {
    const { id } = entityIdSchema.parse(await params);
    const result = await getApiSignatureById(id);

    return ok(context, result);
  } catch (error) {
    return handleRouteError(context, error);
  }
};
