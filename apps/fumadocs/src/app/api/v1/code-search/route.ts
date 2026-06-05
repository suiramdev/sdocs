import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  CODE_SEARCH_MAX_TAKE,
  searchCodeExamples,
} from "@/features/api/utils/code-search";
import {
  createRouteContext,
  handleRouteError,
  ok,
} from "@/features/api/v1/transport/http";

export const runtime = "nodejs";

const codeSearchQuerySchema = z.object({
  q: z.string().trim().min(1),
  skip: z.coerce.number().int().min(0).optional(),
  take: z.coerce.number().int().min(1).max(CODE_SEARCH_MAX_TAKE).optional(),
});

export const GET = async (request: NextRequest) => {
  const context = createRouteContext(request);

  try {
    const { searchParams } = request.nextUrl;
    const input = codeSearchQuerySchema.parse({
      q: searchParams.get("q") ?? undefined,
      skip: searchParams.get("skip") ?? undefined,
      take: searchParams.get("take") ?? undefined,
    });
    const result = await searchCodeExamples({
      query: input.q,
      skip: input.skip,
      take: input.take,
    });

    return ok(context, result);
  } catch (error) {
    return handleRouteError(context, error);
  }
};
