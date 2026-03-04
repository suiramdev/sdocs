import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiV1Error } from "@/features/api/v1/domain/errors";

interface ApiMeta {
  latencyMs: number;
  requestId: string;
}

interface ApiErrorShape {
  code: string;
  details?: unknown;
  message: string;
}

interface RequestContext {
  requestId: string;
  startedAt: number;
}

const buildMeta = (context: RequestContext): ApiMeta => ({
  latencyMs: Date.now() - context.startedAt,
  requestId: context.requestId,
});

const toContext = (request: Request): RequestContext => ({
  requestId: request.headers.get("x-request-id") ?? randomUUID(),
  startedAt: Date.now(),
});

const errorResponse = (
  context: RequestContext,
  error: ApiErrorShape,
  status: number
) =>
  NextResponse.json(
    {
      error,
      meta: buildMeta(context),
      ok: false,
    },
    { status }
  );

export const createRouteContext = (request: Request): RequestContext =>
  toContext(request);

export const ok = <T>(context: RequestContext, data: T, status = 200) =>
  NextResponse.json(
    {
      data,
      meta: buildMeta(context),
      ok: true,
    },
    { status }
  );

export const handleRouteError = (context: RequestContext, error: unknown) => {
  if (error instanceof z.ZodError) {
    return errorResponse(
      context,
      {
        code: "INVALID_INPUT",
        details: error.flatten(),
        message: "Invalid request input",
      },
      400
    );
  }

  if (error instanceof SyntaxError) {
    return errorResponse(
      context,
      {
        code: "INVALID_INPUT",
        message: "Malformed JSON body",
      },
      400
    );
  }

  if (error instanceof ApiV1Error) {
    return errorResponse(
      context,
      {
        code: error.code,
        details: error.details,
        message: error.message,
      },
      error.status
    );
  }

  return errorResponse(
    context,
    {
      code: "INTERNAL_ERROR",
      message: "Unexpected server error",
    },
    500
  );
};
