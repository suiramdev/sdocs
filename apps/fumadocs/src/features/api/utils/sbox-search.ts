import { z } from "zod";

import { getEntityById } from "@/features/api/utils/data";
import { apiEntityTypes } from "@/features/api/utils/schemas";
import type { ApiEntityType } from "@/features/api/utils/schemas";
import { searchApiService } from "@/features/api/utils/service";

const toOptionalString = z.string().trim().min(1).optional();

export const sboxDocsSearchInputSchema = z.object({
  className: toOptionalString,
  includeObsolete: z.boolean().default(false),
  limit: z.number().int().min(1).max(25).default(10),
  namespace: toOptionalString,
  query: z.string().trim().min(1),
  type: z.enum(apiEntityTypes).optional(),
  useHybrid: z.boolean().optional(),
});

export interface SboxDocsSnippet {
  className: string;
  description: string;
  displaySignature: string;
  exampleUsage: string | null;
  examples: string[];
  id: string;
  methodName: string | null;
  name: string;
  namespace: string;
  parameters: {
    description?: string;
    name: string;
    type: string;
  }[];
  returnType: string | null;
  snippet: string;
  type: ApiEntityType;
  url: string;
}

export interface SboxDocsSearchResponse {
  query: string;
  results: SboxDocsSnippet[];
  returned: number;
  source: "meilisearch" | "local-fallback";
  total: number;
}

export interface SboxDocsSearchInput {
  className?: string;
  includeObsolete?: boolean;
  limit?: number;
  namespace?: string;
  query: string;
  type?: ApiEntityType;
  useHybrid?: boolean;
}

const normalizeMethodName = (name: string): string =>
  name.split(".").at(-1) ?? name;

type SearchResultItem = Awaited<
  ReturnType<typeof searchApiService>
>["results"][number];

const toSnippetText = (input: {
  description: string;
  displaySignature: string;
  exampleUsage: string | null;
  methodName: string | null;
  name: string;
  type: ApiEntityType;
}): string => {
  const lines = [
    `Name: ${input.name}`,
    `Type: ${input.type}`,
    `Method: ${input.methodName ?? "n/a"}`,
    `Signature: ${input.displaySignature}`,
    `Description: ${input.description || "No description available."}`,
  ];

  if (input.exampleUsage) {
    lines.push("Example:");
    lines.push(input.exampleUsage);
  }

  return lines.join("\n");
};

const toSboxDocsSnippet = (input: {
  entity: Awaited<ReturnType<typeof getEntityById>>;
  includeObsolete: boolean;
  result: SearchResultItem;
}): SboxDocsSnippet | null => {
  const { entity, includeObsolete, result } = input;
  if (entity && !includeObsolete && entity.isObsolete) {
    return null;
  }

  const examples = entity?.examples ?? [];
  const exampleUsage = examples.at(0) ?? null;
  const methodName =
    result.type === "method" ? normalizeMethodName(result.name) : null;
  const description =
    entity?.description || entity?.summary || result.description;
  const displaySignature = entity?.displaySignature ?? result.displaySignature;

  return {
    className: result.class,
    description,
    displaySignature,
    exampleUsage,
    examples,
    id: result.id,
    methodName,
    name: result.name,
    namespace: result.namespace,
    parameters: entity?.parameters ?? [],
    returnType: entity?.returnType ?? null,
    snippet: toSnippetText({
      description,
      displaySignature,
      exampleUsage,
      methodName,
      name: result.name,
      type: result.type,
    }),
    type: result.type,
    url: result.url,
  };
};

export const searchSboxDocsService = async (
  input: SboxDocsSearchInput
): Promise<SboxDocsSearchResponse> => {
  const request = sboxDocsSearchInputSchema.parse({
    className: input.className,
    includeObsolete: input.includeObsolete,
    limit: input.limit,
    namespace: input.namespace,
    query: input.query,
    type: input.type,
    useHybrid: input.useHybrid,
  });
  const searchResponse = await searchApiService({
    className: request.className,
    limit: request.limit,
    namespace: request.namespace,
    query: request.query,
    type: request.type,
    useHybrid: request.useHybrid,
  });

  const entities = await Promise.all(
    searchResponse.results.map((result) => getEntityById(result.id))
  );

  const results = searchResponse.results
    .map((result, index) =>
      toSboxDocsSnippet({
        entity: entities.at(index) ?? null,
        includeObsolete: request.includeObsolete,
        result,
      })
    )
    .filter((result): result is SboxDocsSnippet => result !== null);

  return {
    query: searchResponse.query,
    results,
    returned: results.length,
    source: searchResponse.source,
    total: searchResponse.total,
  };
};
