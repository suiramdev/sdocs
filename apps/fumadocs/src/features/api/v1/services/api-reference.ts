import {
  describeApiEntityService,
  getSignatureService,
} from "@/features/api/utils/service";
import { ApiV1Error } from "@/features/api/v1/domain/errors";
import type { SearchDocsToolInput } from "@/features/api/v1/domain/schemas";

import {
  explainDocumentationSymbolContext,
  getDocumentationExamples,
  getDocumentationMethodDetails,
  getDocumentationRelatedGuides,
  getDocumentationSymbol,
  getDocumentationTypeMembers,
  listDocumentationNamespaces,
  resolveDocumentationSymbol,
  searchDocumentation,
} from "./documentation-tools";

export const searchApiReference = (input: SearchDocsToolInput) =>
  searchDocumentation(input);

export const getApiEntityById = async (id: string) => {
  const result = await describeApiEntityService({ id });
  if (!result.entity) {
    throw new ApiV1Error({
      code: "NOT_FOUND",
      details: { id },
      message: "Entity not found",
      status: 404,
    });
  }

  return result;
};

export const getApiSignatureById = async (id: string) => {
  const result = await getSignatureService({ id });
  if (!result.signature) {
    throw new ApiV1Error({
      code: "NOT_FOUND",
      details: { id },
      message: "Signature not found",
      status: 404,
    });
  }

  return result;
};

export const resolveApiReferenceSymbol = (input: {
  kind?: "class" | "struct" | "interface" | "enum";
  limit?: number;
  name: string;
  namespace?: string;
}) => resolveDocumentationSymbol(input);

export const getApiReferenceSymbol = (input: {
  kind?:
    | "class"
    | "constructor"
    | "enum"
    | "interface"
    | "method"
    | "property"
    | "struct";
  symbol: string;
}) => getDocumentationSymbol(input);

export const explainApiReferenceSymbolContext = (input: {
  includeMembers?: boolean;
  kind?:
    | "class"
    | "constructor"
    | "enum"
    | "interface"
    | "method"
    | "property"
    | "struct";
  memberLimit?: number;
  symbol: string;
}) => explainDocumentationSymbolContext(input);

export const getApiReferenceTypeMembers = (input: {
  includeObsolete?: boolean;
  kind?: "constructor" | "method" | "property";
  limit?: number;
  symbol: string;
}) => getDocumentationTypeMembers(input);

export const getApiReferenceMethodDetails = (input: {
  namespace?: string;
  symbol: string;
  typeName?: string;
}) => getDocumentationMethodDetails(input);

export const getApiReferenceRelatedGuides = (input: {
  kind?:
    | "class"
    | "constructor"
    | "enum"
    | "interface"
    | "method"
    | "property"
    | "struct";
  limit?: number;
  symbol: string;
}) => getDocumentationRelatedGuides(input);

export const getApiReferenceExamples = (input: {
  includeRelated?: boolean;
  limit?: number;
  symbol: string;
}) => getDocumentationExamples(input);

export const listApiReferenceNamespaces = (input: {
  limit?: number;
  namespace?: string;
}) => listDocumentationNamespaces(input);
