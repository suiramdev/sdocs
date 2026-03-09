import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import type { ApiSearchResult } from "@/features/api/utils/schemas";
import { searchApiService } from "@/features/api/utils/service";
import { signatureToHtml } from "@/features/api/utils/signature-tokens";

export const runtime = "nodejs";

const defaultSearchQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  query: z.string().trim().min(1),
});

interface FumadocsSearchResult {
  breadcrumbs: string[];
  content: string;
  id: string;
  type: "page";
  url: string;
}

const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const buildSearchContent = (result: ApiSearchResult): string => {
  let obsoletePart = "";
  if (result.isObsolete === true) {
    const obsoleteMessage = result.obsoleteMessage?.trim() ?? "";
    const obsoleteTitle =
      obsoleteMessage.length > 0
        ? ` title="${escapeHtml(obsoleteMessage)}"`
        : "";
    obsoletePart = `<span class="search-result-obsolete-row"><span class="api-obsolete-badge"${obsoleteTitle}>Obsolete</span></span>`;
  }

  const signaturePart = signatureToHtml(result.displaySignature);
  const desc =
    (result.description?.trim().length ?? 0) > 0
      ? `<span class="search-result-desc">${escapeHtml(result.description.trim())}</span>`
      : "";
  return signaturePart + obsoletePart + (desc ? " " + desc : "");
};

const toFumadocsResult = (result: ApiSearchResult): FumadocsSearchResult => ({
  breadcrumbs: [result.namespace, result.class, result.type],
  content: buildSearchContent(result),
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
  const result = await searchApiService({
    limit: parsed.limit,
    query: parsed.query,
  });

  return result.results.map(toFumadocsResult);
};

const handleSearchError = (error: unknown, message: string) => {
  if (error instanceof z.ZodError) {
    return invalidRequestResponse(message, error);
  }

  return searchFailedResponse();
};

export const GET = async (request: NextRequest) => {
  try {
    return NextResponse.json(await runFumadocsSearch(request));
  } catch (error) {
    return handleSearchError(error, "Invalid search query");
  }
};
