import { z } from "zod";

export const apiEntityTypes = ["class", "method", "enum", "property"] as const;
export const apiEntityKinds = [
  "class",
  "struct",
  "interface",
  "enum",
  "constructor",
  "method",
  "property",
] as const;
export const apiTypeEntityKinds = [
  "class",
  "struct",
  "interface",
  "enum",
] as const;
export const apiMemberEntityKinds = [
  "constructor",
  "method",
  "property",
] as const;

export const apiParameterSchema = z.object({
  defaultValue: z.string().optional(),
  description: z.string().optional(),
  name: z.string(),
  type: z.string(),
});

export const apiExceptionSchema = z.object({
  description: z.string().optional(),
  type: z.string(),
});

export const apiExampleSourceKinds = ["documentation", "repository"] as const;

const apiStructuredExampleSchema = z.object({
  code: z.string(),
  filePath: z.string().optional(),
  fileUrl: z.string().optional(),
  lineEnd: z.number().int().min(1).optional(),
  lineStart: z.number().int().min(1).optional(),
  repositoryName: z.string().optional(),
  repositoryRef: z.string().optional(),
  repositoryUrl: z.string().optional(),
  sourceKind: z.enum(apiExampleSourceKinds),
});

export const apiExampleSchema = z.preprocess(
  (value) =>
    typeof value === "string"
      ? {
          code: value,
          sourceKind: "documentation" as const,
        }
      : value,
  apiStructuredExampleSchema
);

export const apiEntitySchema = z.object({
  anchor: z.string().optional(),
  assembly: z.string(),
  canonicalUrl: z.string().optional(),
  class: z.string(),
  description: z.string(),
  displaySignature: z.string(),
  docId: z.string(),
  entityKind: z.enum(apiEntityKinds),
  examples: z.array(apiExampleSchema),
  exceptions: z.array(apiExceptionSchema).default([]),
  id: z.string(),
  isObsolete: z.boolean().default(false),
  meiliId: z.string(),
  name: z.string(),
  namespace: z.string(),
  obsoleteMessage: z.string().default(""),
  parameters: z.array(apiParameterSchema),
  path: z.string(),
  remarks: z.string().default(""),
  returnType: z.string().nullable(),
  returnsDescription: z.string().default(""),
  signature: z.string(),
  sourceSignature: z.string(),
  summary: z.string().default(""),
  type: z.enum(apiEntityTypes),
  url: z.string(),
});

export type ApiParameter = z.infer<typeof apiParameterSchema>;
export type ApiException = z.infer<typeof apiExceptionSchema>;
export type ApiExample = z.infer<typeof apiExampleSchema>;
export type ApiEntity = z.infer<typeof apiEntitySchema>;
export type ApiEntityType = (typeof apiEntityTypes)[number];
export type ApiEntityKind = (typeof apiEntityKinds)[number];

export const apiSearchRequestSchema = z.object({
  className: z.string().trim().min(1).optional(),
  entityKind: z.enum(apiEntityKinds).optional(),
  limit: z.number().int().min(1).max(50).default(10),
  namespace: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1),
  type: z.enum(apiEntityTypes).optional(),
  useHybrid: z.boolean().optional(),
});

export type ApiSearchRequest = z.infer<typeof apiSearchRequestSchema>;

export const apiSearchResultSchema = z.object({
  class: z.string(),
  description: z.string(),
  displaySignature: z.string(),
  entityKind: z.enum(apiEntityKinds),
  id: z.string(),
  isObsolete: z.boolean().optional(),
  name: z.string(),
  namespace: z.string(),
  obsoleteMessage: z.string().optional(),
  score: z.number().optional(),
  signature: z.string(),
  type: z.enum(apiEntityTypes),
  url: z.string(),
});

export type ApiSearchResult = z.infer<typeof apiSearchResultSchema>;

export const searchApiToolInputSchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  query: z.string().trim().min(1),
});

export type SearchApiToolInput = z.infer<typeof searchApiToolInputSchema>;
