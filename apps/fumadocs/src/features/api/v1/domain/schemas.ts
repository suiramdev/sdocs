import { z } from "zod";

import {
  apiEntityKinds,
  apiMemberEntityKinds,
  apiTypeEntityKinds,
} from "@/features/api/utils/schemas";

const optionalString = z.string().trim().min(1).optional();
const mcpDetailModeSchema = z.enum(["compact", "full"]).optional();

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
  "explain_symbol_context",
  "expand_documentation",
  "get_examples",
  "get_method_details",
  "get_related_guides",
  "get_symbol",
  "get_type_members",
  "list_namespaces",
  "read_doc",
  "read_documentation",
  "resolve_symbol",
  "search_docs",
  "search_documentation",
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
  detail: mcpDetailModeSchema,
  includeObsolete: z.boolean().optional(),
  kind: z.enum(apiEntityKinds).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  namespace: optionalString,
  query: z.string().trim().min(1),
  typeName: optionalString,
  useHybrid: z.boolean().optional(),
});

export const searchDocumentationToolInputSchema = z.object({
  detail: mcpDetailModeSchema,
  includeGuides: z.boolean().optional(),
  includeSymbols: z.boolean().optional(),
  limit: z.number().int().min(1).max(20).optional(),
  query: z.string().trim().min(1),
});

export const readDocumentationToolInputSchema = z.object({
  detail: mcpDetailModeSchema,
  includeContent: z.boolean().optional(),
  includeReferences: z.boolean().optional(),
  target: z.string().trim().min(1),
});

export const readDocToolInputSchema = readDocumentationToolInputSchema;

export const expandDocumentationToolInputSchema = z.object({
  detail: mcpDetailModeSchema,
  limit: z.number().int().min(1).max(50).optional(),
  target: z.string().trim().min(1),
});

export const resolveSymbolToolInputSchema = z.object({
  detail: mcpDetailModeSchema,
  kind: z.enum(apiTypeEntityKinds).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  name: z.string().trim().min(1),
  namespace: optionalString,
});

export const getSymbolToolInputSchema = z.object({
  detail: mcpDetailModeSchema,
  kind: z.enum(apiEntityKinds).optional(),
  symbol: z.string().trim().min(1),
});

export const explainSymbolContextToolInputSchema = z.object({
  detail: mcpDetailModeSchema,
  includeMembers: z.boolean().optional(),
  kind: z.enum(apiEntityKinds).optional(),
  memberLimit: z.number().int().min(1).max(50).optional(),
  symbol: z.string().trim().min(1),
});

export const getTypeMembersToolInputSchema = z.object({
  detail: mcpDetailModeSchema,
  includeObsolete: z.boolean().optional(),
  kind: z.enum(apiMemberEntityKinds).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  symbol: z.string().trim().min(1),
});

export const getMethodDetailsToolInputSchema = z.object({
  detail: mcpDetailModeSchema,
  namespace: optionalString,
  symbol: z.string().trim().min(1),
  typeName: optionalString,
});

export const getRelatedGuidesToolInputSchema = z.object({
  detail: mcpDetailModeSchema,
  kind: z.enum(apiEntityKinds).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  symbol: z.string().trim().min(1),
});

export const getExamplesToolInputSchema = z.object({
  detail: mcpDetailModeSchema,
  includeRelated: z.boolean().optional(),
  limit: z.number().int().min(1).max(20).optional(),
  symbol: z.string().trim().min(1),
});

export const listNamespacesToolInputSchema = z.object({
  detail: mcpDetailModeSchema,
  limit: z.number().int().min(1).max(100).optional(),
  namespace: optionalString,
});

export type ToolName = z.infer<typeof toolNameSchema>;
export type SearchDocsToolInput = z.infer<typeof searchDocsToolInputSchema>;
