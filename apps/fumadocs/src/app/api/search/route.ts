import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import type { SdkSearchResult } from "@/features/sdk/utils/schemas";
import { searchSdkService } from "@/features/sdk/utils/service";

export const runtime = "nodejs";

const defaultSearchQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  query: z.string().trim().min(1),
});

const sdkToolQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  q: z.string().trim().min(1),
});

const bodySchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  query: z.string().trim().min(1),
});

interface FumadocsSearchResult {
  breadcrumbs: string[];
  content: string;
  id: string;
  type: "page";
  url: string;
}

const toFumadocsResult = (result: SdkSearchResult): FumadocsSearchResult => ({
  breadcrumbs: [result.namespace, result.class, result.type],
  content: result.displaySignature,
  id: result.id,
  type: "page",
  url: result.url,
});

const invalidRequestResponse = (message: string, error: z.ZodError) =>
  NextResponse.json(
    {
      error: message,
      issues: error.flatten(),
    },
    {
      status: 400,
    }
  );

const searchFailedResponse = () =>
  NextResponse.json(
    {
      error: "Search failed",
    },
    {
      status: 500,
    }
  );

const runFumadocsSearch = async (
  request: NextRequest
): Promise<FumadocsSearchResult[]> => {
  const parsed = defaultSearchQuerySchema.parse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    query: request.nextUrl.searchParams.get("query") ?? "",
  });
  const result = await searchSdkService({
    limit: parsed.limit,
    query: parsed.query,
  });

  return result.results.map(toFumadocsResult);
};

const runToolSearch = (request: NextRequest) => {
  const parsed = sdkToolQuerySchema.parse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    q: request.nextUrl.searchParams.get("q") ?? "",
  });

  return searchSdkService({
    limit: parsed.limit,
    query: parsed.q,
  });
};

const handleSearchError = (error: unknown, message: string) => {
  if (error instanceof z.ZodError) {
    return invalidRequestResponse(message, error);
  }

  return searchFailedResponse();
};

export const GET = async (request: NextRequest) => {
  try {
    if (request.nextUrl.searchParams.has("query")) {
      return NextResponse.json(await runFumadocsSearch(request));
    }

    return NextResponse.json(await runToolSearch(request));
  } catch (error) {
    return handleSearchError(error, "Invalid search query");
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const body = bodySchema.parse(await request.json());
    return NextResponse.json(
      await searchSdkService({
        limit: body.limit,
        query: body.query,
      })
    );
  } catch (error) {
    return handleSearchError(error, "Invalid request body");
  }
};
