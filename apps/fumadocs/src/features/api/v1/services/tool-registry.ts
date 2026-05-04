import type { z } from "zod";

import type { ToolName } from "@/features/api/v1/domain/schemas";
import {
  expandDocumentationToolInputSchema,
  explainSymbolContextToolInputSchema,
  getExamplesToolInputSchema,
  getMethodDetailsToolInputSchema,
  getRelatedGuidesToolInputSchema,
  getSymbolToolInputSchema,
  getTypeMembersToolInputSchema,
  listNamespacesToolInputSchema,
  readDocToolInputSchema,
  readDocumentationToolInputSchema,
  resolveSymbolToolInputSchema,
  searchDocumentationToolInputSchema,
} from "@/features/api/v1/domain/schemas";
import {
  expandApiReferenceDocumentation,
  explainApiReferenceSymbolContext,
  getApiReferenceExamples,
  getApiReferenceMethodDetails,
  getApiReferenceRelatedGuides,
  getApiReferenceSymbol,
  getApiReferenceTypeMembers,
  listApiReferenceNamespaces,
  readApiReferenceDocumentation,
  resolveApiReferenceSymbol,
  searchApiReferenceDocumentation,
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
    includeGuides: {
      description: "Include official guide pages in the results.",
      type: "boolean",
    },
    includeSymbols: {
      description:
        "Include API symbols such as classes, enums, methods, constructors, and properties in the results.",
      type: "boolean",
    },
    limit: {
      description: "Maximum number of mixed documentation results to return.",
      maximum: 20,
      minimum: 1,
      type: "integer",
    },
    query: {
      description:
        "Keyword, symbol name, or natural-language documentation question.",
      type: "string",
    },
  },
  required: ["query"],
  type: "object",
};

const searchDocumentationInputSchema: JsonSchema = {
  additionalProperties: false,
  properties: {
    detail: detailModeInputProperty,
    includeGuides: {
      description: "Include official guide pages in the results.",
      type: "boolean",
    },
    includeSymbols: {
      description:
        "Include API symbols such as classes, enums, methods, constructors, and properties in the results.",
      type: "boolean",
    },
    limit: {
      description: "Maximum number of mixed documentation results to return.",
      maximum: 20,
      minimum: 1,
      type: "integer",
    },
    query: {
      description:
        "Keyword, symbol name, or natural-language documentation question.",
      type: "string",
    },
  },
  required: ["query"],
  type: "object",
};

const readDocumentationInputSchema: JsonSchema = {
  additionalProperties: false,
  properties: {
    detail: detailModeInputProperty,
    includeContent: {
      description:
        "Include guide markdown excerpts when reading guide pages. Defaults to true.",
      type: "boolean",
    },
    includeReferences: {
      description:
        "Include immediate references discovered from the target. Defaults to true.",
      type: "boolean",
    },
    target: {
      description:
        "Handle returned by search_docs or a read_doc reference, such as docs://guide/..., docs://type/..., docs://member/..., or an exact API symbol.",
      type: "string",
    },
  },
  required: ["target"],
  type: "object",
};

const expandDocumentationInputSchema: JsonSchema = {
  additionalProperties: false,
  properties: {
    detail: detailModeInputProperty,
    limit: {
      description: "Maximum number of related handles to return.",
      maximum: 50,
      minimum: 1,
      type: "integer",
    },
    target: {
      description:
        "Handle returned by search_documentation or read_documentation to expand into related guides, symbols, members, and examples.",
      type: "string",
    },
  },
  required: ["target"],
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
  expand_documentation: {
    description:
      "Expand a guide or API handle into related guides, classes, enums, methods, properties, and members. Use this after read_documentation, then loop back to read_documentation on relevant returned handles.",
    execute: async (input) => {
      const parsed = expandDocumentationToolInputSchema.parse(input);
      return await expandApiReferenceDocumentation(parsed);
    },
    inputSchema: expandDocumentationInputSchema,
    name: "expand_documentation",
    schema: expandDocumentationToolInputSchema,
  },
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
      "Focused metadata lookup only. For user questions like 'what is NetworkMode?' prefer explain_symbol_context instead. If this result has guideCount, workflow.next includes get_related_guides, or workflow.policy.answerRequiresGuideLookup is true, call get_related_guides before answering conceptual usage.",
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
      "List constructors, methods, and properties for classes, structs, and interfaces. Do not use this to discover enum values; enum values are not modeled as members in this index. Call get_related_guides or explain_symbol_context for conceptual context.",
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
  read_doc: {
    description:
      "Read any handle returned by search_docs or a previous read_doc reference. Returns the document, references, and tips for which references to read next.",
    execute: async (input) => {
      const parsed = readDocToolInputSchema.parse(input);
      return await readApiReferenceDocumentation(parsed);
    },
    inputSchema: readDocumentationInputSchema,
    name: "read_doc",
    schema: readDocToolInputSchema,
  },
  read_documentation: {
    description:
      "Deep-read any documentation handle returned by search_documentation or expand_documentation, regardless of whether it is a guide, enum, class, method, constructor, or property.",
    execute: async (input) => {
      const parsed = readDocumentationToolInputSchema.parse(input);
      return await readApiReferenceDocumentation(parsed);
    },
    inputSchema: readDocumentationInputSchema,
    name: "read_documentation",
    schema: readDocumentationToolInputSchema,
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
      "Start here. Search across official guides and all API symbols at once, including classes, enums, methods, constructors, and properties. Returns handles for read_doc.",
    execute: async (input) => {
      const parsed = searchDocumentationToolInputSchema.parse(input);
      return await searchApiReferenceDocumentation(parsed);
    },
    inputSchema: searchDocsInputSchema,
    name: "search_docs",
    schema: searchDocumentationToolInputSchema,
  },
  search_documentation: {
    description:
      "Start here. Search across official guides and all API symbols at once, including classes, enums, methods, constructors, and properties. Returns handles for read_documentation.",
    execute: async (input) => {
      const parsed = searchDocumentationToolInputSchema.parse(input);
      return await searchApiReferenceDocumentation(parsed);
    },
    inputSchema: searchDocumentationInputSchema,
    name: "search_documentation",
    schema: searchDocumentationToolInputSchema,
  },
};

const toolRuntime = Object.freeze([
  toolRuntimeByName.search_docs,
  toolRuntimeByName.read_doc,
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
