import { sdkConfig } from "@/lib/sdk/config";
import { searchSdkToolInputSchema } from "@/lib/sdk/schemas";
import type { SdkSearchResult } from "@/lib/sdk/schemas";
import { searchSdkService } from "@/lib/sdk/service";

export const searchSdkTool = {
  description:
    "Search the C# SDK index using natural language and return exact signatures with documentation links.",
  input_schema: {
    additionalProperties: false,
    properties: {
      query: {
        description: "Natural language query to find SDK entities.",
        type: "string",
      },
      limit: {
        description: "Maximum number of ranked entities to return.",
        maximum: 20,
        minimum: 1,
        type: "integer",
      },
    },
    required: ["query"],
    type: "object",
  },
  name: "search_sdk",
} as const;

export interface SearchSdkToolOutput {
  tool: "search_sdk";
  query: string;
  total: number;
  source: "api-search" | "service-fallback";
  entities: SdkSearchResult[];
}

function buildSearchUrl(query: string, limit?: number): URL {
  const url = new URL("/api/search", sdkConfig.app.baseUrl);
  url.searchParams.set("q", query);

  if (limit) {
    url.searchParams.set("limit", String(limit));
  }

  return url;
}

export async function executeSearchSdkTool(
  input: unknown
): Promise<SearchSdkToolOutput> {
  const parsed = searchSdkToolInputSchema.parse(input);

  try {
    const searchUrl = buildSearchUrl(parsed.query, parsed.limit);
    const response = await fetch(searchUrl, {
      cache: "no-store",
      headers: {
        "x-sdk-tool": "search_sdk",
      },
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`search_sdk call failed with status ${response.status}`);
    }

    const data = (await response.json()) as {
      query: string;
      total: number;
      results: SdkSearchResult[];
    };

    return {
      entities: data.results,
      query: data.query,
      source: "api-search",
      tool: "search_sdk",
      total: data.total,
    };
  } catch {
    const fallback = await searchSdkService({
      limit: parsed.limit,
      query: parsed.query,
    });

    return {
      entities: fallback.results,
      query: fallback.query,
      source: "service-fallback",
      tool: "search_sdk",
      total: fallback.total,
    };
  }
}
