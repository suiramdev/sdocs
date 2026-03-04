import { z } from "zod";

import { apiConfig } from "@/features/api/utils/config";
import {
  searchSboxDocsService,
  sboxDocsSearchInputSchema,
} from "@/features/api/utils/sbox-search";
import type { SboxDocsSnippet } from "@/features/api/utils/sbox-search";

export const searchSboxDocsTool = {
  description: "Search the s&box documentation.",
  input_schema: {
    additionalProperties: false,
    properties: {
      className: {
        description: "Optional exact class filter.",
        type: "string",
      },
      limit: {
        description: "Maximum number of ranked documentation snippets.",
        maximum: 25,
        minimum: 1,
        type: "integer",
      },
      namespace: {
        description: "Optional exact namespace filter.",
        type: "string",
      },
      query: {
        description:
          "Natural-language query using class names, methods, components, or gameplay systems.",
        type: "string",
      },
      type: {
        description: "Optional entity type filter.",
        enum: ["class", "method", "enum", "property"],
        type: "string",
      },
      useHybrid: {
        description:
          "Force hybrid semantic+lexical ranking when Meilisearch is enabled.",
        type: "boolean",
      },
    },
    required: ["query"],
    type: "object",
  },
  name: "search_sbox_docs",
} as const;

export const searchSboxDocsToolInputSchema = sboxDocsSearchInputSchema
  .pick({
    className: true,
    limit: true,
    namespace: true,
    query: true,
    type: true,
    useHybrid: true,
  })
  .extend({
    includeObsolete: z.boolean().optional(),
  });

type SearchSboxDocsToolInput = z.infer<typeof searchSboxDocsToolInputSchema>;

export interface SearchSboxDocsToolOutput {
  query: string;
  results: SboxDocsSnippet[];
  returned: number;
  source: "api-search" | "service-fallback";
  tool: "search_sbox_docs";
  total: number;
}

const buildSearchUrl = (input: SearchSboxDocsToolInput): URL => {
  const url = new URL("/api/sbox/search", apiConfig.app.baseUrl);
  const pairs = [
    ["q", input.query],
    ["className", input.className],
    ["limit", input.limit === undefined ? undefined : String(input.limit)],
    ["namespace", input.namespace],
    ["type", input.type],
    ["useHybrid", input.useHybrid ? "true" : undefined],
    ["includeObsolete", input.includeObsolete ? "true" : undefined],
  ] as const;

  for (const [key, value] of pairs) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url;
};

export const executeSearchSboxDocsTool = async (
  input: unknown,
): Promise<SearchSboxDocsToolOutput> => {
  const parsed = searchSboxDocsToolInputSchema.parse(input);

  try {
    const searchUrl = buildSearchUrl(parsed);
    const response = await fetch(searchUrl, {
      cache: "no-store",
      headers: {
        "x-api-tool": "search_sbox_docs",
      },
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(
        `search_sbox_docs call failed with status ${response.status}`,
      );
    }

    const data = (await response.json()) as {
      query: string;
      results: SboxDocsSnippet[];
      returned: number;
      total: number;
    };

    return {
      query: data.query,
      results: data.results,
      returned: data.returned,
      source: "api-search",
      tool: "search_sbox_docs",
      total: data.total,
    };
  } catch {
    const fallback = await searchSboxDocsService(parsed);

    return {
      query: fallback.query,
      results: fallback.results,
      returned: fallback.returned,
      source: "service-fallback",
      tool: "search_sbox_docs",
      total: fallback.total,
    };
  }
};
