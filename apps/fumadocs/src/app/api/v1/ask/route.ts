import type { NextRequest } from "next/server";

import { askQuestionSchema } from "@/features/api/v1/domain/schemas";
import { askApiReferenceQuestion } from "@/features/api/v1/services/api-reference";
import {
  createRouteContext,
  handleRouteError,
  ok,
} from "@/features/api/v1/transport/http";

export const runtime = "nodejs";

export const POST = async (request: NextRequest) => {
  const context = createRouteContext(request);

  try {
    const parsed = askQuestionSchema.parse(await request.json());
    const result = await askApiReferenceQuestion(parsed);

    return ok(context, result);
  } catch (error) {
    return handleRouteError(context, error);
  }
};
