import { performance } from "node:perf_hooks";

import { getEntityById } from "@/lib/sdk/data";
import { logSdkError, logSdkInfo } from "@/lib/sdk/logging";
import { sdkSearchRequestSchema } from "@/lib/sdk/schemas";
import type { SdkEntityType } from "@/lib/sdk/schemas";
import { searchSdk } from "@/lib/sdk/search";
import type { SdkSearchResponse } from "@/lib/sdk/search";

interface SearchSdkInput {
  className?: string;
  limit?: number;
  namespace?: string;
  query: string;
  type?: SdkEntityType;
  useHybrid?: boolean;
}

export const searchSdkService = async (
  input: SearchSdkInput
): Promise<SdkSearchResponse> => {
  const request = sdkSearchRequestSchema.parse({
    className: input.className,
    limit: input.limit,
    namespace: input.namespace,
    query: input.query,
    type: input.type,
    useHybrid: input.useHybrid,
  });

  const started = performance.now();

  try {
    const response = await searchSdk(request);

    logSdkInfo({
      action: "search",
      details: {
        source: response.source,
        total: response.total,
      },
      durationMs: Math.round(performance.now() - started),
      query: request.query,
      route: "/api/sdk/search",
    });

    return response;
  } catch (error) {
    logSdkError(
      {
        action: "search",
        durationMs: Math.round(performance.now() - started),
        query: request.query,
        route: "/api/sdk/search",
      },
      error
    );
    throw error;
  }
};

export const describeSdkEntityService = async (input: { id: string }) => {
  const started = performance.now();

  try {
    const entity = await getEntityById(input.id);

    logSdkInfo({
      action: "describe",
      details: {
        found: entity ? 1 : 0,
      },
      durationMs: Math.round(performance.now() - started),
      route: "/api/sdk/describe",
    });

    return {
      entity,
    };
  } catch (error) {
    logSdkError(
      {
        action: "describe",
        durationMs: Math.round(performance.now() - started),
        route: "/api/sdk/describe",
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

    logSdkInfo({
      action: "get-signature",
      details: {
        found: entity ? 1 : 0,
      },
      durationMs: Math.round(performance.now() - started),
      route: "/api/sdk/get-signature",
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
    logSdkError(
      {
        action: "get-signature",
        durationMs: Math.round(performance.now() - started),
        route: "/api/sdk/get-signature",
      },
      error
    );
    throw error;
  }
};
