import { z } from "zod";

import {
  apiEntityKinds,
  apiMemberEntityKinds,
  apiTypeEntityKinds,
} from "@/features/api/utils/schemas";

const optionalString = z.string().trim().min(1).optional();

const optionalBooleanQuery = z
  .string()
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return;
    }

    return value === "1" || value === "true";
  });

export const entityIdSchema = z.object({
  id: z.string().trim().min(1),
});

export const toolNameSchema = z.enum([
  "get_examples",
  "get_method_details",
  "get_related_guides",
  "get_symbol",
  "get_type_members",
  "list_namespaces",
  "resolve_symbol",
  "search_docs",
]);

export const searchDocsQuerySchema = z.object({
  includeObsolete: optionalBooleanQuery,
  kind: z.enum(apiEntityKinds).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
  namespace: optionalString,
  query: z.string().trim().min(1),
  typeName: optionalString,
  useHybrid: optionalBooleanQuery,
});

export const searchDocsToolInputSchema = z.object({
  includeObsolete: z.boolean().optional(),
  kind: z.enum(apiEntityKinds).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  namespace: optionalString,
  query: z.string().trim().min(1),
  typeName: optionalString,
  useHybrid: z.boolean().optional(),
});

export const resolveSymbolToolInputSchema = z.object({
  kind: z.enum(apiTypeEntityKinds).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  name: z.string().trim().min(1),
  namespace: optionalString,
});

export const getSymbolToolInputSchema = z.object({
  kind: z.enum(apiEntityKinds).optional(),
  symbol: z.string().trim().min(1),
});

export const getTypeMembersToolInputSchema = z.object({
  includeObsolete: z.boolean().optional(),
  kind: z.enum(apiMemberEntityKinds).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  symbol: z.string().trim().min(1),
});

export const getMethodDetailsToolInputSchema = z.object({
  namespace: optionalString,
  symbol: z.string().trim().min(1),
  typeName: optionalString,
});

export const getRelatedGuidesToolInputSchema = z.object({
  kind: z.enum(apiEntityKinds).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  symbol: z.string().trim().min(1),
});

export const getExamplesToolInputSchema = z.object({
  includeRelated: z.boolean().optional(),
  limit: z.number().int().min(1).max(20).optional(),
  symbol: z.string().trim().min(1),
});

export const listNamespacesToolInputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  namespace: optionalString,
});

export type ToolName = z.infer<typeof toolNameSchema>;
export type SearchDocsToolInput = z.infer<typeof searchDocsToolInputSchema>;
