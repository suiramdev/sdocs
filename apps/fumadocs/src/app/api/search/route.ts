import type { SortedResult } from "fumadocs-core/search";
import { createFromSource } from "fumadocs-core/search/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import type { ApiSearchResult } from "@/features/api/utils/schemas";
import { searchApiService } from "@/features/api/utils/service";
import { signatureToHtml } from "@/features/api/utils/signature-tokens";
import { source } from "@/features/docs/utils/source";
import { getOfficialDocsSearch } from "@/features/official-docs/utils/source";

export const runtime = "nodejs";

const localDocsSearch = createFromSource(source);

const defaultSearchQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  query: z.string().trim().min(1),
});

interface FumadocsSearchResult {
  breadcrumbs?: string[];
  content: string;
  contentWithHighlights?: SortedResult["contentWithHighlights"];
  id: string;
  type: "heading" | "page" | "text";
  url: string;
}

const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const buildSearchContent = async (result: ApiSearchResult): Promise<string> => {
  let obsoletePart = "";
  if (result.isObsolete === true) {
    const obsoleteMessage = result.obsoleteMessage?.trim() ?? "";
    const obsoleteTitle =
      obsoleteMessage.length > 0
        ? ` title="${escapeHtml(obsoleteMessage)}"`
        : "";
    obsoletePart = `<span class="block pt-1"><span class="inline-flex items-center rounded-full border border-destructive/40 px-2 py-0.5 text-[0.72rem] font-semibold tracking-wide text-destructive uppercase"${obsoleteTitle}>Obsolete</span></span>`;
  }

  const signaturePart = await signatureToHtml(result.displaySignature);
  const desc =
    (result.description?.trim().length ?? 0) > 0
      ? `<span class="mt-1 block text-xs leading-5 text-muted-foreground">${escapeHtml(result.description.trim())}</span>`
      : "";
  return signaturePart + obsoletePart + (desc ? " " + desc : "");
};

const toFumadocsResult = async (
  result: ApiSearchResult
): Promise<FumadocsSearchResult> => ({
  breadcrumbs: [result.namespace, result.class, result.type],
  content: await buildSearchContent(result),
  id: result.id,
  type: "page",
  url: result.url,
});

const toDocsSearchResult = (
  result: SortedResult<string>
): FumadocsSearchResult => ({
  breadcrumbs: result.breadcrumbs,
  content: result.content,
  contentWithHighlights: result.contentWithHighlights,
  id: result.id,
  type: result.type,
  url: result.url,
});

const dedupeSearchResults = (
  results: FumadocsSearchResult[]
): FumadocsSearchResult[] => {
  const dedupedResults = new Map<string, FumadocsSearchResult>();
  for (const result of results) {
    const key = `${result.type}:${result.url}:${result.id}`;
    if (!dedupedResults.has(key)) {
      dedupedResults.set(key, result);
    }
  }

  return [...dedupedResults.values()];
};

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
  const [localDocsResults, officialDocsSearch, apiSearchResult] =
    await Promise.all([
      localDocsSearch.search(parsed.query),
      getOfficialDocsSearch(),
      searchApiService({
        limit: parsed.limit,
        query: parsed.query,
      }),
    ]);
  const [officialDocsResults, apiResults] = await Promise.all([
    officialDocsSearch.search(parsed.query),
    Promise.all(apiSearchResult.results.map(toFumadocsResult)),
  ]);

  return dedupeSearchResults([
    ...localDocsResults.map(toDocsSearchResult),
    ...officialDocsResults.map(toDocsSearchResult),
    ...apiResults,
  ]).slice(0, parsed.limit);
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
