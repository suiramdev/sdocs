import { z } from "zod";

import { apiEntityTypes } from "@/features/api/utils/schemas";

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

export const searchApiBodySchema = z.object({
  className: optionalString,
  limit: z.number().int().min(1).max(50).optional(),
  namespace: optionalString,
  query: z.string().trim().min(1),
  type: z.enum(apiEntityTypes).optional(),
  useHybrid: z.boolean().optional(),
});

export const searchApiQuerySchema = z.object({
  className: optionalString,
  limit: z.coerce.number().int().min(1).max(50).optional(),
  namespace: optionalString,
  query: z.string().trim().min(1),
  type: z.enum(apiEntityTypes).optional(),
  useHybrid: optionalBooleanQuery,
});

export const askQuestionSchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  question: z.string().trim().min(1),
});

export const toolNameSchema = z.enum([
  "answer_question",
  "describe_entity",
  "get_signature",
  "search_docs",
]);

export const searchDocsToolInputSchema = z.object({
  className: optionalString,
  limit: z.number().int().min(1).max(20).optional(),
  namespace: optionalString,
  query: z.string().trim().min(1),
  type: z.enum(apiEntityTypes).optional(),
  useHybrid: z.boolean().optional(),
});

export const describeEntityToolInputSchema = entityIdSchema;

export const getSignatureToolInputSchema = entityIdSchema;

export const answerQuestionToolInputSchema = askQuestionSchema;

export type ToolName = z.infer<typeof toolNameSchema>;
export type SearchApiBodyInput = z.infer<typeof searchApiBodySchema>;
export type SearchApiQueryInput = z.infer<typeof searchApiQuerySchema>;
