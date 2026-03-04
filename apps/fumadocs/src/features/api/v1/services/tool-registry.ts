import type { z } from "zod";

import type { ToolName } from "@/features/api/v1/domain/schemas";
import {
  answerQuestionToolInputSchema,
  describeEntityToolInputSchema,
  getSignatureToolInputSchema,
  searchDocsToolInputSchema,
} from "@/features/api/v1/domain/schemas";
import {
  askApiReferenceQuestion,
  getApiEntityById,
  getApiSignatureById,
  searchApiReference,
} from "@/features/api/v1/services/api-reference";

type JsonSchema = Record<string, unknown>;

interface ToolDefinition {
  description: string;
  inputSchema: JsonSchema;
  name: ToolName;
}

interface ToolRuntimeDefinition extends ToolDefinition {
  schema: z.ZodType;
  execute: (input: unknown) => Promise<unknown>;
}

const searchDocsInputSchema: JsonSchema = {
  additionalProperties: false,
  properties: {
    className: {
      description: "Optional exact class filter.",
      type: "string",
    },
    limit: {
      description: "Maximum number of ranked entities to return.",
      maximum: 20,
      minimum: 1,
      type: "integer",
    },
    namespace: {
      description: "Optional exact namespace filter.",
      type: "string",
    },
    query: {
      description: "Natural language query to search API entities.",
      type: "string",
    },
    type: {
      description: "Optional entity type filter.",
      enum: ["class", "method", "enum", "property"],
      type: "string",
    },
    useHybrid: {
      description: "Enable hybrid semantic + lexical ranking when available.",
      type: "boolean",
    },
  },
  required: ["query"],
  type: "object",
};

const entityInputSchema: JsonSchema = {
  additionalProperties: false,
  properties: {
    id: {
      description: "Entity id from API search results.",
      type: "string",
    },
  },
  required: ["id"],
  type: "object",
};

const answerInputSchema: JsonSchema = {
  additionalProperties: false,
  properties: {
    limit: {
      description: "Maximum number of citations to retrieve before answering.",
      maximum: 20,
      minimum: 1,
      type: "integer",
    },
    question: {
      description: "Question about the API reference.",
      type: "string",
    },
  },
  required: ["question"],
  type: "object",
};

const toolRuntimeByName: Record<ToolName, ToolRuntimeDefinition> = {
  answer_question: {
    description:
      "Answer a question using retrieved API reference entities as grounding.",
    execute: async (input) => {
      const parsed = answerQuestionToolInputSchema.parse(input);
      return await askApiReferenceQuestion(parsed);
    },
    inputSchema: answerInputSchema,
    name: "answer_question",
    schema: answerQuestionToolInputSchema,
  },
  describe_entity: {
    description: "Fetch complete metadata for a single API entity id.",
    execute: async (input) => {
      const parsed = describeEntityToolInputSchema.parse(input);
      return await getApiEntityById(parsed.id);
    },
    inputSchema: entityInputSchema,
    name: "describe_entity",
    schema: describeEntityToolInputSchema,
  },
  get_signature: {
    description: "Return the exact signature for a single API entity id.",
    execute: async (input) => {
      const parsed = getSignatureToolInputSchema.parse(input);
      return await getApiSignatureById(parsed.id);
    },
    inputSchema: entityInputSchema,
    name: "get_signature",
    schema: getSignatureToolInputSchema,
  },
  search_docs: {
    description:
      "Search API reference entities and return ranked signatures and links.",
    execute: async (input) => {
      const parsed = searchDocsToolInputSchema.parse(input);
      return await searchApiReference(parsed);
    },
    inputSchema: searchDocsInputSchema,
    name: "search_docs",
    schema: searchDocsToolInputSchema,
  },
};

const toolRuntime = Object.freeze(Object.values(toolRuntimeByName));

export const listAgentTools = (): ToolDefinition[] =>
  toolRuntime.map(({ description, inputSchema, name }) => ({
    description,
    inputSchema,
    name,
  }));

export const listAgentToolRuntime = (): readonly ToolRuntimeDefinition[] =>
  toolRuntime;

export const executeAgentTool = async (
  name: ToolName,
  input: unknown
): Promise<unknown> => {
  const tool = toolRuntimeByName[name];
  return await tool.execute(input);
};
