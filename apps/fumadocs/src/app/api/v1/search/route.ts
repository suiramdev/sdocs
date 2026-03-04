import type { NextRequest } from "next/server";

import {
  searchApiBodySchema,
  searchApiQuerySchema,
} from "@/features/api/v1/domain/schemas";
import { searchApiReference } from "@/features/api/v1/services/api-reference";
import {
  createRouteContext,
  handleRouteError,
  ok,
} from "@/features/api/v1/transport/http";

export const runtime = "nodejs";

export const GET = async (request: NextRequest) => {
  const context = createRouteContext(request);

  try {
    const parsed = searchApiQuerySchema.parse({
      className: request.nextUrl.searchParams.get("className") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
      namespace: request.nextUrl.searchParams.get("namespace") ?? undefined,
      query:
        request.nextUrl.searchParams.get("query") ??
        request.nextUrl.searchParams.get("q") ??
        "",
      type: request.nextUrl.searchParams.get("type") ?? undefined,
      useHybrid: request.nextUrl.searchParams.get("useHybrid") ?? undefined,
    });

    const result = await searchApiReference(parsed);
    return ok(context, result);
  } catch (error) {
    return handleRouteError(context, error);
  }
};

export const POST = async (request: NextRequest) => {
  const context = createRouteContext(request);

  try {
    const parsed = searchApiBodySchema.parse(await request.json());
    const result = await searchApiReference(parsed);

    return ok(context, result);
  } catch (error) {
    return handleRouteError(context, error);
  }
};
