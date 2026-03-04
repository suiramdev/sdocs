import { z } from "zod";

export const sdkEntityTypes = ["class", "method", "enum", "property"] as const;

export const sdkParameterSchema = z.object({
  defaultValue: z.string().optional(),
  description: z.string().optional(),
  name: z.string(),
  type: z.string(),
});

export const sdkExceptionSchema = z.object({
  description: z.string().optional(),
  type: z.string(),
});

export const sdkEntitySchema = z.object({
  anchor: z.string().optional(),
  assembly: z.string(),
  canonicalUrl: z.string().optional(),
  class: z.string(),
  description: z.string(),
  displaySignature: z.string(),
  docId: z.string(),
  entityKind: z.string(),
  examples: z.array(z.string()),
  exceptions: z.array(sdkExceptionSchema).default([]),
  id: z.string(),
  isObsolete: z.boolean().default(false),
  meiliId: z.string(),
  name: z.string(),
  namespace: z.string(),
  obsoleteMessage: z.string().default(""),
  parameters: z.array(sdkParameterSchema),
  path: z.string(),
  remarks: z.string().default(""),
  returnType: z.string().nullable(),
  returnsDescription: z.string().default(""),
  signature: z.string(),
  sourceSignature: z.string(),
  summary: z.string().default(""),
  type: z.enum(sdkEntityTypes),
  url: z.string(),
});

export type SdkParameter = z.infer<typeof sdkParameterSchema>;
export type SdkException = z.infer<typeof sdkExceptionSchema>;
export type SdkEntity = z.infer<typeof sdkEntitySchema>;
export type SdkEntityType = (typeof sdkEntityTypes)[number];

export const sdkSearchRequestSchema = z.object({
  className: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(50).default(10),
  namespace: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1),
  type: z.enum(sdkEntityTypes).optional(),
  useHybrid: z.boolean().optional(),
});

export type SdkSearchRequest = z.infer<typeof sdkSearchRequestSchema>;

export const sdkSearchResultSchema = z.object({
  class: z.string(),
  description: z.string(),
  displaySignature: z.string(),
  id: z.string(),
  name: z.string(),
  namespace: z.string(),
  score: z.number().optional(),
  signature: z.string(),
  type: z.enum(sdkEntityTypes),
  url: z.string(),
});

export type SdkSearchResult = z.infer<typeof sdkSearchResultSchema>;

export const searchSdkToolInputSchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  query: z.string().trim().min(1),
});

export type SearchSdkToolInput = z.infer<typeof searchSdkToolInputSchema>;
