import type { z } from "zod";

import type { ToolName } from "@/features/api/v1/domain/schemas";
import {
  explainSymbolContextToolInputSchema,
  getExamplesToolInputSchema,
  getMethodDetailsToolInputSchema,
  getRelatedGuidesToolInputSchema,
  getSymbolToolInputSchema,
  getTypeMembersToolInputSchema,
  listNamespacesToolInputSchema,
  resolveSymbolToolInputSchema,
  searchDocsToolInputSchema,
} from "@/features/api/v1/domain/schemas";
import {
  explainApiReferenceSymbolContext,
  getApiReferenceExamples,
  getApiReferenceMethodDetails,
  getApiReferenceRelatedGuides,
  getApiReferenceSymbol,
  getApiReferenceTypeMembers,
  listApiReferenceNamespaces,
  resolveApiReferenceSymbol,
  searchApiReference,
} from "@/features/api/v1/services/api-reference";

type JsonSchema = Record<string, unknown>;

const detailModeInputProperty = {
  description:
    "MCP response detail level. Defaults to compact; use full for a larger payload with more raw fields.",
  enum: ["compact", "full"],
  type: "string",
} as const;

interface ToolDefinition {
  description: string;
  inputSchema: JsonSchema;
  name: ToolName;
}

interface ToolRuntimeDefinition extends ToolDefinition {
  execute: (input: unknown) => Promise<unknown>;
  schema: z.ZodType;
}

const searchDocsInputSchema: JsonSchema = {
  additionalProperties: false,
  properties: {
    detail: detailModeInputProperty,
    includeObsolete: {
      description: "Include obsolete API symbols in the results.",
      type: "boolean",
    },
    kind: {
      description:
        "Optional .NET-style symbol kind filter for classes, structs, methods, properties, and constructors.",
      enum: [
        "class",
        "struct",
        "interface",
        "enum",
        "constructor",
        "method",
        "property",
      ],
      type: "string",
    },
    limit: {
      description: "Maximum number of ranked documentation results to return.",
      maximum: 20,
      minimum: 1,
      type: "integer",
    },
    namespace: {
      description: "Optional exact namespace filter.",
      type: "string",
    },
    query: {
      description: "Keyword or natural-language documentation query.",
      type: "string",
    },
    typeName: {
      description:
        "Optional declaring type filter. Use a fully-qualified type when available.",
      type: "string",
    },
    useHybrid: {
      description: "Enable hybrid semantic and keyword ranking when available.",
      type: "boolean",
    },
  },
  required: ["query"],
  type: "object",
};

const resolveSymbolInputSchema: JsonSchema = {
  additionalProperties: false,
  properties: {
    detail: detailModeInputProperty,
    kind: {
      description: "Restrict resolution to a specific type kind.",
      enum: ["class", "struct", "interface", "enum"],
      type: "string",
    },
    limit: {
      description: "Maximum number of matching types to return.",
      maximum: 20,
      minimum: 1,
      type: "integer",
    },
    name: {
      description: "Short or fully-qualified type name to resolve.",
      type: "string",
    },
    namespace: {
      description: "Optional exact namespace filter.",
      type: "string",
    },
  },
  required: ["name"],
  type: "object",
};

const getSymbolInputSchema: JsonSchema = {
  additionalProperties: false,
  properties: {
    detail: detailModeInputProperty,
    kind: {
      description: "Optional expected symbol kind.",
      enum: [
        "class",
        "struct",
        "interface",
        "enum",
        "constructor",
        "method",
        "property",
      ],
      type: "string",
    },
    symbol: {
      description:
        "Exact symbol id, fully-qualified type name, or fully-qualified member signature.",
      type: "string",
    },
  },
  required: ["symbol"],
  type: "object",
};

const explainSymbolContextInputSchema: JsonSchema = {
  additionalProperties: false,
  properties: {
    detail: detailModeInputProperty,
    includeMembers: {
      description:
        "Include a compact list of type members. Defaults to true for types and false for members.",
      type: "boolean",
    },
    kind: {
      description: "Optional expected symbol kind.",
      enum: [
        "class",
        "struct",
        "interface",
        "enum",
        "constructor",
        "method",
        "property",
      ],
      type: "string",
    },
    memberLimit: {
      description:
        "Maximum number of compact type members to include in the context envelope.",
      maximum: 50,
      minimum: 1,
      type: "integer",
    },
    symbol: {
      description:
        "Exact symbol id, fully-qualified type name, or fully-qualified member signature.",
      type: "string",
    },
  },
  required: ["symbol"],
  type: "object",
};

const getTypeMembersInputSchema: JsonSchema = {
  additionalProperties: false,
  properties: {
    detail: detailModeInputProperty,
    includeObsolete: {
      description: "Include obsolete members in the result set.",
      type: "boolean",
    },
    kind: {
      description: "Optional member kind filter.",
      enum: ["constructor", "method", "property"],
      type: "string",
    },
    limit: {
      description: "Maximum number of members to return.",
      maximum: 200,
      minimum: 1,
      type: "integer",
    },
    symbol: {
      description: "Type symbol id or fully-qualified type name.",
      type: "string",
    },
  },
  required: ["symbol"],
  type: "object",
};

const getMethodDetailsInputSchema: JsonSchema = {
  additionalProperties: false,
  properties: {
    detail: detailModeInputProperty,
    namespace: {
      description: "Optional exact namespace filter for disambiguation.",
      type: "string",
    },
    symbol: {
      description:
        "Method id, fully-qualified method signature, or qualified member name.",
      type: "string",
    },
    typeName: {
      description: "Optional declaring type used to disambiguate overloads.",
      type: "string",
    },
  },
  required: ["symbol"],
  type: "object",
};

const getExamplesInputSchema: JsonSchema = {
  additionalProperties: false,
  properties: {
    detail: detailModeInputProperty,
    includeRelated: {
      description:
        "When true, also return examples from the declaring type when the symbol has no direct examples.",
      type: "boolean",
    },
    limit: {
      description: "Maximum number of examples to return per source.",
      maximum: 20,
      minimum: 1,
      type: "integer",
    },
    symbol: {
      description: "Symbol id or exact type/member reference.",
      type: "string",
    },
  },
  required: ["symbol"],
  type: "object",
};

const getRelatedGuidesInputSchema: JsonSchema = {
  additionalProperties: false,
  properties: {
    detail: detailModeInputProperty,
    kind: {
      description: "Optional expected symbol kind.",
      enum: [
        "class",
        "struct",
        "interface",
        "enum",
        "constructor",
        "method",
        "property",
      ],
      type: "string",
    },
    limit: {
      description: "Maximum number of related guides to return.",
      maximum: 20,
      minimum: 1,
      type: "integer",
    },
    symbol: {
      description:
        "Exact symbol id, fully-qualified type name, or fully-qualified member signature.",
      type: "string",
    },
  },
  required: ["symbol"],
  type: "object",
};

const listNamespacesInputSchema: JsonSchema = {
  additionalProperties: false,
  properties: {
    detail: detailModeInputProperty,
    limit: {
      description: "Maximum number of child namespaces and types to return.",
      maximum: 100,
      minimum: 1,
      type: "integer",
    },
    namespace: {
      description: "Optional namespace to inspect. Omit to list the root.",
      type: "string",
    },
  },
  type: "object",
};

const toolRuntimeByName: Record<ToolName, ToolRuntimeDefinition> = {
  explain_symbol_context: {
    description:
      "Best first tool for 'what is this symbol?' or 'how do I use this API?'. Returns compact symbol details, top member handles, related guide handles, resource URI, and recommended next tools without loading full guide pages.",
    execute: async (input) => {
      const parsed = explainSymbolContextToolInputSchema.parse(input);
      return await explainApiReferenceSymbolContext(parsed);
    },
    inputSchema: explainSymbolContextInputSchema,
    name: "explain_symbol_context",
    schema: explainSymbolContextToolInputSchema,
  },
  get_examples: {
    description:
      "Fetch direct code examples for a symbol, plus declaring-type examples when available.",
    execute: async (input) => {
      const parsed = getExamplesToolInputSchema.parse(input);
      return await getApiReferenceExamples(parsed);
    },
    inputSchema: getExamplesInputSchema,
    name: "get_examples",
    schema: getExamplesToolInputSchema,
  },
  get_method_details: {
    description:
      "Inspect one method or constructor and return exact signatures, parameters, return docs, and exceptions.",
    execute: async (input) => {
      const parsed = getMethodDetailsToolInputSchema.parse(input);
      return await getApiReferenceMethodDetails(parsed);
    },
    inputSchema: getMethodDetailsInputSchema,
    name: "get_method_details",
    schema: getMethodDetailsToolInputSchema,
  },
  get_related_guides: {
    description:
      "Use after get_symbol, get_method_details, or explain_symbol_context when guideCount is non-zero or the user needs conceptual usage, editor workflow, lifecycle, or broader method guidance.",
    execute: async (input) => {
      const parsed = getRelatedGuidesToolInputSchema.parse(input);
      return await getApiReferenceRelatedGuides(parsed);
    },
    inputSchema: getRelatedGuidesInputSchema,
    name: "get_related_guides",
    schema: getRelatedGuidesToolInputSchema,
  },
  get_symbol: {
    description:
      "Retrieve structured metadata for a resolved symbol or type. If the compact result has guideCount or workflow.next includes get_related_guides, call get_related_guides before explaining conceptual usage.",
    execute: async (input) => {
      const parsed = getSymbolToolInputSchema.parse(input);
      return await getApiReferenceSymbol(parsed);
    },
    inputSchema: getSymbolInputSchema,
    name: "get_symbol",
    schema: getSymbolToolInputSchema,
  },
  get_type_members: {
    description:
      "List constructors, methods, and properties for a specific type. Use this for member discovery only; call get_related_guides or explain_symbol_context for conceptual context.",
    execute: async (input) => {
      const parsed = getTypeMembersToolInputSchema.parse(input);
      return await getApiReferenceTypeMembers(parsed);
    },
    inputSchema: getTypeMembersInputSchema,
    name: "get_type_members",
    schema: getTypeMembersToolInputSchema,
  },
  list_namespaces: {
    description:
      "Explore the namespace hierarchy and list types available in a namespace.",
    execute: async (input) => {
      const parsed = listNamespacesToolInputSchema.parse(input);
      return await listApiReferenceNamespaces(parsed);
    },
    inputSchema: listNamespacesInputSchema,
    name: "list_namespaces",
    schema: listNamespacesToolInputSchema,
  },
  resolve_symbol: {
    description:
      "Resolve a short or ambiguous type name to fully-qualified API type symbols.",
    execute: async (input) => {
      const parsed = resolveSymbolToolInputSchema.parse(input);
      return await resolveApiReferenceSymbol(parsed);
    },
    inputSchema: resolveSymbolInputSchema,
    name: "resolve_symbol",
    schema: resolveSymbolToolInputSchema,
  },
  search_docs: {
    description:
      "Search the indexed s&box API docs first. For a symbol result, prefer explain_symbol_context next; use get_symbol for raw metadata, get_type_members for member discovery, and get_related_guides for conceptual docs.",
    execute: async (input) => {
      const parsed = searchDocsToolInputSchema.parse(input);
      return await searchApiReference(parsed);
    },
    inputSchema: searchDocsInputSchema,
    name: "search_docs",
    schema: searchDocsToolInputSchema,
  },
};

const toolRuntime = Object.freeze([
  toolRuntimeByName.search_docs,
  toolRuntimeByName.resolve_symbol,
  toolRuntimeByName.explain_symbol_context,
  toolRuntimeByName.get_symbol,
  toolRuntimeByName.get_type_members,
  toolRuntimeByName.get_method_details,
  toolRuntimeByName.get_related_guides,
  toolRuntimeByName.get_examples,
  toolRuntimeByName.list_namespaces,
]);

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
