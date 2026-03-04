import { performance } from "node:perf_hooks";

import { getEntityById } from "@/features/api/utils/data";
import { logApiError, logApiInfo } from "@/features/api/utils/logging";
import { apiSearchRequestSchema } from "@/features/api/utils/schemas";
import type { ApiEntityType } from "@/features/api/utils/schemas";
import { searchApi } from "@/features/api/utils/search";
import type { ApiSearchResponse } from "@/features/api/utils/search";

interface SearchApiInput {
  className?: string;
  limit?: number;
  namespace?: string;
  query: string;
  type?: ApiEntityType;
  useHybrid?: boolean;
}

export const searchApiService = async (
  input: SearchApiInput
): Promise<ApiSearchResponse> => {
  const request = apiSearchRequestSchema.parse({
    className: input.className,
    limit: input.limit,
    namespace: input.namespace,
    query: input.query,
    type: input.type,
    useHybrid: input.useHybrid,
  });

  const started = performance.now();

  try {
    const response = await searchApi(request);

    logApiInfo({
      action: "search",
      details: {
        source: response.source,
        total: response.total,
      },
      durationMs: Math.round(performance.now() - started),
      query: request.query,
      route: "/api/api/search",
    });

    return response;
  } catch (error) {
    logApiError(
      {
        action: "search",
        durationMs: Math.round(performance.now() - started),
        query: request.query,
        route: "/api/api/search",
      },
      error
    );
    throw error;
  }
};

export const describeApiEntityService = async (input: { id: string }) => {
  const started = performance.now();

  try {
    const entity = await getEntityById(input.id);

    logApiInfo({
      action: "describe",
      details: {
        found: entity ? 1 : 0,
      },
      durationMs: Math.round(performance.now() - started),
      route: "/api/api/describe",
    });

    return {
      entity,
    };
  } catch (error) {
    logApiError(
      {
        action: "describe",
        durationMs: Math.round(performance.now() - started),
        route: "/api/api/describe",
      },
      error
    );
    throw error;
  }
};

export const getSignatureService = async (input: { id: string }) => {
  const started = performance.now();

  try {
    const entity = await getEntityById(input.id);

    logApiInfo({
      action: "get-signature",
      details: {
        found: entity ? 1 : 0,
      },
      durationMs: Math.round(performance.now() - started),
      route: "/api/api/get-signature",
    });

    return {
      displaySignature: entity?.displaySignature ?? null,
      id: input.id,
      name: entity?.name ?? null,
      signature: entity?.signature ?? null,
      sourceSignature: entity?.sourceSignature ?? null,
      type: entity?.type ?? null,
      url: entity?.url ?? null,
    };
  } catch (error) {
    logApiError(
      {
        action: "get-signature",
        durationMs: Math.round(performance.now() - started),
        route: "/api/api/get-signature",
      },
      error
    );
    throw error;
  }
};
