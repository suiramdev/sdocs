import { apiConfig } from "@/features/api/utils/config";
import { searchApiToolInputSchema } from "@/features/api/utils/schemas";
import type { ApiSearchResult } from "@/features/api/utils/schemas";
import { searchApiService } from "@/features/api/utils/service";

export const searchApiTool = {
  description:
    "Search the C# API index using natural language and return exact signatures with documentation links.",
  input_schema: {
    additionalProperties: false,
    properties: {
      limit: {
        description: "Maximum number of ranked entities to return.",
        maximum: 20,
        minimum: 1,
        type: "integer",
      },
      query: {
        description: "Natural language query to find API entities.",
        type: "string",
      },
    },
    required: ["query"],
    type: "object",
  },
  name: "search_api",
} as const;

export interface SearchApiToolOutput {
  tool: "search_api";
  query: string;
  total: number;
  source: "api-search" | "service-fallback";
  entities: ApiSearchResult[];
}

function buildSearchUrl(query: string, limit?: number): URL {
  const url = new URL("/api/search", apiConfig.app.baseUrl);
  url.searchParams.set("q", query);

  if (limit) {
    url.searchParams.set("limit", String(limit));
  }

  return url;
}

export async function executeSearchApiTool(
  input: unknown
): Promise<SearchApiToolOutput> {
  const parsed = searchApiToolInputSchema.parse(input);

  try {
    const searchUrl = buildSearchUrl(parsed.query, parsed.limit);
    const response = await fetch(searchUrl, {
      cache: "no-store",
      headers: {
        "x-api-tool": "search_api",
      },
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`search_api call failed with status ${response.status}`);
    }

    const data = (await response.json()) as {
      query: string;
      total: number;
      results: ApiSearchResult[];
    };

    return {
      entities: data.results,
      query: data.query,
      source: "api-search",
      tool: "search_api",
      total: data.total,
    };
  } catch {
    const fallback = await searchApiService({
      limit: parsed.limit,
      query: parsed.query,
    });

    return {
      entities: fallback.results,
      query: fallback.query,
      source: "service-fallback",
      tool: "search_api",
      total: fallback.total,
    };
  }
}
