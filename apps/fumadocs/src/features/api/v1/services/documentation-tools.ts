import {
  getEntitiesByClass,
  getEntityById,
  getEntityByUrl,
  loadApiEntities,
} from "@/features/api/utils/data";
import type {
  ApiEntity,
  ApiEntityKind,
  ApiException,
  ApiParameter,
} from "@/features/api/utils/schemas";
import { searchApiService } from "@/features/api/utils/service";
import { ApiV1Error } from "@/features/api/v1/domain/errors";

const TYPE_KINDS = new Set<ApiEntityKind>([
  "class",
  "struct",
  "interface",
  "enum",
]);
const METHOD_KINDS = new Set<ApiEntityKind>(["constructor", "method"]);
const MEMBER_KINDS = new Set<ApiEntityKind>([
  "constructor",
  "method",
  "property",
]);

type DocumentationSymbolKind = ApiEntityKind | "namespace";
type DocumentationTypeKind = Extract<
  DocumentationSymbolKind,
  "class" | "struct" | "interface" | "enum"
>;
type DocumentationMemberKind = Extract<
  DocumentationSymbolKind,
  "constructor" | "method" | "property"
>;
type ResolveMatchType =
  | "exact_name"
  | "exact_qualified_name"
  | "partial_name"
  | "prefix_name"
  | "search_ranked"
  | "suffix_name";
type DirectResolveMatchType = Exclude<ResolveMatchType, "search_ranked">;

interface DocumentationSearchInput {
  includeObsolete?: boolean;
  kind?: ApiEntityKind;
  limit?: number;
  namespace?: string;
  query: string;
  typeName?: string;
  useHybrid?: boolean;
}

interface ResolveSymbolInput {
  kind?: DocumentationTypeKind;
  limit?: number;
  name: string;
  namespace?: string;
}

interface GetSymbolInput {
  kind?: ApiEntityKind;
  symbol: string;
}

interface GetTypeMembersInput {
  includeObsolete?: boolean;
  kind?: DocumentationMemberKind;
  limit?: number;
  symbol: string;
}

interface GetMethodDetailsInput {
  namespace?: string;
  symbol: string;
  typeName?: string;
}

interface GetExamplesInput {
  includeRelated?: boolean;
  limit?: number;
  symbol: string;
}

interface ListNamespacesInput {
  limit?: number;
  namespace?: string;
}

interface DocumentationSymbolRef {
  declaringType: string | null;
  displaySignature: string;
  fullName: string;
  id: string;
  isObsolete: boolean;
  kind: ApiEntityKind;
  name: string;
  namespace: string;
  obsoleteMessage: string | null;
  signature: string;
  summary: string;
  url: string;
}

interface DocumentationSymbolDetails extends DocumentationSymbolRef {
  assembly: string;
  declaration: {
    displaySignature: string;
    signature: string;
    sourceSignature: string;
  };
  examplesCount: number;
  exceptions: ApiException[];
  parameters: ApiParameter[];
  remarks: string;
  returnType: string | null;
  returnsDescription: string;
}

interface DocumentationSearchHit {
  score?: number;
  symbol: DocumentationSymbolRef;
}

interface ResolveSymbolMatch {
  matchType: ResolveMatchType;
  score: number;
  symbol: DocumentationSymbolRef;
}

interface DirectResolveSymbolMatch extends Omit<
  ResolveSymbolMatch,
  "matchType"
> {
  matchType: DirectResolveMatchType;
}

interface NamespaceNode {
  childNamespaces: Set<string>;
  fullName: string;
  memberCount: number;
  name: string;
  parent: string | null;
  typeCounts: Record<DocumentationTypeKind, number>;
  typeIds: string[];
}

interface DocumentationIndex {
  entities: ApiEntity[];
  methodEntities: (ApiEntity & { entityKind: "constructor" | "method" })[];
  namespaceNodes: Map<string, NamespaceNode>;
  typeEntities: (ApiEntity & { entityKind: DocumentationTypeKind })[];
}

let documentationIndexPromise: Promise<DocumentationIndex> | null = null;

const normalizeText = (value: string): string =>
  value.trim().replaceAll(/\s+/gu, " ");

const normalizeLookup = (value: string): string =>
  normalizeText(value).toLowerCase();

const stripEmptyParameterList = (value: string): string =>
  value.endsWith("()") ? value.slice(0, -2) : value;

const isTypeEntity = (
  entity: ApiEntity
): entity is ApiEntity & { entityKind: DocumentationTypeKind } =>
  TYPE_KINDS.has(entity.entityKind);

const isMethodEntity = (
  entity: ApiEntity
): entity is ApiEntity & { entityKind: "constructor" | "method" } =>
  METHOD_KINDS.has(entity.entityKind);

const isMemberEntity = (
  entity: ApiEntity
): entity is ApiEntity & { entityKind: DocumentationMemberKind } =>
  MEMBER_KINDS.has(entity.entityKind);

const toApiSearchType = (kind?: ApiEntityKind) => {
  if (!kind) {
    return;
  }

  if (kind === "enum") {
    return "enum" as const;
  }

  if (kind === "property") {
    return "property" as const;
  }

  if (kind === "constructor" || kind === "method") {
    return "method" as const;
  }

  return "class" as const;
};

const getSimpleTypeName = (fullName: string): string =>
  fullName.split(".").at(-1) ?? fullName;

const getSimpleMemberName = (entity: ApiEntity): string => {
  if (entity.entityKind === "constructor") {
    return getSimpleTypeName(entity.class);
  }

  return entity.name.split(".").at(-1) ?? entity.name;
};

const getQualifiedTypeName = (entity: ApiEntity): string => entity.class;

const getQualifiedMemberName = (entity: ApiEntity): string =>
  `${entity.class}.${getSimpleMemberName(entity)}`;

const getCanonicalFullName = (entity: ApiEntity): string =>
  isTypeEntity(entity) ? getQualifiedTypeName(entity) : entity.signature;

const matchesTypeReference = (typeName: string, reference: string): boolean => {
  const normalizedReference = normalizeLookup(reference);

  return (
    normalizeLookup(typeName) === normalizedReference ||
    normalizeLookup(getSimpleTypeName(typeName)) === normalizedReference
  );
};

const toSummary = (entity: ApiEntity): string =>
  entity.summary || entity.description || "No summary available.";

const toSymbolRef = (entity: ApiEntity): DocumentationSymbolRef => ({
  declaringType: isTypeEntity(entity) ? null : entity.class,
  displaySignature: entity.displaySignature,
  fullName: getCanonicalFullName(entity),
  id: entity.id,
  isObsolete: entity.isObsolete,
  kind: entity.entityKind,
  name: isTypeEntity(entity) ? entity.name : getSimpleMemberName(entity),
  namespace: entity.namespace,
  obsoleteMessage:
    entity.obsoleteMessage.trim().length > 0 ? entity.obsoleteMessage : null,
  signature: entity.signature,
  summary: toSummary(entity),
  url: entity.url,
});

const toSymbolDetails = (entity: ApiEntity): DocumentationSymbolDetails => ({
  ...toSymbolRef(entity),
  assembly: entity.assembly,
  declaration: {
    displaySignature: entity.displaySignature,
    signature: entity.signature,
    sourceSignature: entity.sourceSignature,
  },
  examplesCount: entity.examples.length,
  exceptions: entity.exceptions,
  parameters: entity.parameters,
  remarks: entity.remarks,
  returnType: entity.returnType,
  returnsDescription: entity.returnsDescription,
});

const getTypeCounts = (
  members: ApiEntity[]
): Record<DocumentationMemberKind, number> => ({
  constructor: members.filter((member) => member.entityKind === "constructor")
    .length,
  method: members.filter((member) => member.entityKind === "method").length,
  property: members.filter((member) => member.entityKind === "property").length,
});

const createTypeCounts = (): Record<DocumentationTypeKind, number> => ({
  class: 0,
  enum: 0,
  interface: 0,
  struct: 0,
});

const getNamespaceParent = (fullName: string): string | null => {
  if (fullName.length === 0) {
    return null;
  }

  const parent = fullName.split(".").slice(0, -1).join(".");
  return parent.length > 0 ? parent : "";
};

const getNamespaceNodeName = (fullName: string): string =>
  fullName.length === 0 ? "root" : (fullName.split(".").at(-1) ?? fullName);

const createNamespaceNode = (fullName: string): NamespaceNode => ({
  childNamespaces: new Set(),
  fullName,
  memberCount: 0,
  name: getNamespaceNodeName(fullName),
  parent: getNamespaceParent(fullName),
  typeCounts: createTypeCounts(),
  typeIds: [],
});

const ensureNamespaceNode = (
  namespaceNodes: Map<string, NamespaceNode>,
  fullName: string
): NamespaceNode => {
  const existing = namespaceNodes.get(fullName);
  if (existing) {
    return existing;
  }

  const node = createNamespaceNode(fullName);
  namespaceNodes.set(fullName, node);

  if (node.parent !== null && fullName.length > 0) {
    const parentNode = ensureNamespaceNode(namespaceNodes, node.parent);
    parentNode.childNamespaces.add(fullName);
  }

  return node;
};

const indexNamespaceEntity = (
  namespaceNodes: Map<string, NamespaceNode>,
  entity: ApiEntity
): void => {
  const namespaceNode = ensureNamespaceNode(namespaceNodes, entity.namespace);

  if (isTypeEntity(entity)) {
    namespaceNode.typeIds.push(entity.id);
    namespaceNode.typeCounts[entity.entityKind] += 1;
    return;
  }

  namespaceNode.memberCount += 1;
};

const matchesResolveFilters = (
  entity: ApiEntity & { entityKind: DocumentationTypeKind },
  input: ResolveSymbolInput
): boolean => {
  if (input.kind && entity.entityKind !== input.kind) {
    return false;
  }

  if (input.namespace && entity.namespace !== input.namespace) {
    return false;
  }

  return true;
};

const scoreTypeEntityMatch = (
  entity: ApiEntity & { entityKind: DocumentationTypeKind },
  query: string,
  normalizedQuery: string
): DirectResolveSymbolMatch | null => {
  const fullName = getQualifiedTypeName(entity);
  const normalizedFullName = normalizeLookup(fullName);
  const normalizedShortName = normalizeLookup(entity.name);
  const match = (
    [
      [fullName === query, "exact_qualified_name", 120],
      [normalizedFullName === normalizedQuery, "exact_qualified_name", 118],
      [entity.name === query, "exact_name", 110],
      [normalizedShortName === normalizedQuery, "exact_name", 108],
      [normalizedFullName.endsWith(`.${normalizedQuery}`), "suffix_name", 98],
      [
        normalizedShortName.startsWith(normalizedQuery) ||
          normalizedFullName.startsWith(normalizedQuery),
        "prefix_name",
        88,
      ],
      [
        normalizedFullName.includes(normalizedQuery) ||
          normalizedShortName.includes(normalizedQuery),
        "partial_name",
        72,
      ],
    ] as const
  ).find(([passes]) => passes);

  if (!match) {
    return null;
  }

  const [, matchType, score] = match;
  return {
    matchType,
    score,
    symbol: toSymbolRef(entity),
  };
};

const sortResolveMatches = <T extends ResolveSymbolMatch>(matches: T[]): T[] =>
  matches.toSorted((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.symbol.fullName.localeCompare(right.symbol.fullName);
  });

const buildFallbackResolveMatches = (
  results: Awaited<ReturnType<typeof searchApiService>>["results"],
  entities: (ApiEntity | null)[],
  limit: number
): ResolveSymbolMatch[] =>
  entities
    .map((entity, resultIndex) => ({
      entity,
      result: results.at(resultIndex) ?? null,
    }))
    .filter(
      (
        item
      ): item is {
        entity: ApiEntity & { entityKind: DocumentationTypeKind };
        result: (typeof results)[number];
      } =>
        item.entity !== null &&
        item.result !== null &&
        isTypeEntity(item.entity)
    )
    .map((item) => ({
      matchType: "search_ranked" as const,
      score: item.result.score ?? 0,
      symbol: toSymbolRef(item.entity),
    }))
    .slice(0, limit);

const buildDocumentationIndex = async (): Promise<DocumentationIndex> => {
  const entities = await loadApiEntities();
  const namespaceNodes = new Map<string, NamespaceNode>();
  ensureNamespaceNode(namespaceNodes, "");

  for (const entity of entities) {
    indexNamespaceEntity(namespaceNodes, entity);
  }

  return {
    entities,
    methodEntities: entities.filter((entity) => isMethodEntity(entity)),
    namespaceNodes,
    typeEntities: entities.filter((entity) => isTypeEntity(entity)),
  };
};

const getDocumentationIndex = (): Promise<DocumentationIndex> => {
  if (!documentationIndexPromise) {
    documentationIndexPromise = buildDocumentationIndex();
  }

  return documentationIndexPromise;
};

const resolveTypeMatches = async (
  input: ResolveSymbolInput
): Promise<ResolveSymbolMatch[]> => {
  const documentationIndex = await getDocumentationIndex();
  const normalizedQuery = normalizeLookup(input.name);

  const directMatches = documentationIndex.typeEntities
    .filter((entity) => matchesResolveFilters(entity, input))
    .map((entity) => scoreTypeEntityMatch(entity, input.name, normalizedQuery))
    .filter((match): match is DirectResolveSymbolMatch => match !== null);

  if (directMatches.length > 0) {
    return sortResolveMatches(directMatches).slice(0, input.limit ?? 10);
  }

  const fallbackSearch = await searchApiService({
    entityKind: input.kind,
    limit: Math.min(Math.max((input.limit ?? 10) * 3, 10), 50),
    namespace: input.namespace,
    query: input.name,
    type: toApiSearchType(input.kind),
  });
  const entities = await Promise.all(
    fallbackSearch.results.map((result) => getEntityById(result.id))
  );

  return buildFallbackResolveMatches(
    fallbackSearch.results,
    entities,
    input.limit ?? 10
  );
};

const throwAmbiguousSymbolError = (
  message: string,
  matches: DocumentationSymbolRef[]
): never => {
  throw new ApiV1Error({
    code: "INVALID_INPUT",
    details: {
      matches,
    },
    message,
    status: 400,
  });
};

const throwNotFoundError = (message: string, symbol: string): never => {
  throw new ApiV1Error({
    code: "NOT_FOUND",
    details: {
      symbol,
    },
    message,
    status: 404,
  });
};

const isNotFoundError = (error: unknown): error is ApiV1Error =>
  error instanceof ApiV1Error && error.code === "NOT_FOUND";

const assertTypeEntity = (
  entity: ApiEntity,
  symbol: string,
  expectedKind?: DocumentationTypeKind
): ApiEntity & { entityKind: DocumentationTypeKind } => {
  if (!isTypeEntity(entity)) {
    throw new ApiV1Error({
      code: "INVALID_INPUT",
      details: {
        kind: entity.entityKind,
        symbol,
      },
      message: "The provided symbol does not resolve to a type.",
      status: 400,
    });
  }

  if (expectedKind && entity.entityKind !== expectedKind) {
    throw new ApiV1Error({
      code: "INVALID_INPUT",
      details: {
        expectedKind,
        kind: entity.entityKind,
        symbol,
      },
      message: "The provided symbol resolved to a different type kind.",
      status: 400,
    });
  }

  return entity;
};

const getDirectTypeEntity = async (
  symbol: string,
  expectedKind?: DocumentationTypeKind
): Promise<(ApiEntity & { entityKind: DocumentationTypeKind }) | null> => {
  const directById = await getEntityById(symbol);
  if (directById) {
    return assertTypeEntity(directById, symbol, expectedKind);
  }

  const directByUrl = await getEntityByUrl(symbol);
  if (directByUrl) {
    return assertTypeEntity(directByUrl, symbol, expectedKind);
  }

  return null;
};

const loadResolvedTypeMatch = async (
  matches: ResolveSymbolMatch[],
  matchType: DirectResolveMatchType
): Promise<(ApiEntity & { entityKind: DocumentationTypeKind }) | null> => {
  const exactMatches = matches.filter((match) => match.matchType === matchType);
  if (exactMatches.length !== 1) {
    return null;
  }

  const entity = await getEntityById(exactMatches[0].symbol.id);
  return entity && isTypeEntity(entity) ? entity : null;
};

const getDirectEntityReference = async (
  symbol: string,
  kind?: ApiEntityKind
): Promise<ApiEntity | null> => {
  const directById = await getEntityById(symbol);
  if (directById && (!kind || directById.entityKind === kind)) {
    return directById;
  }

  const directByUrl = await getEntityByUrl(symbol);
  if (directByUrl && (!kind || directByUrl.entityKind === kind)) {
    return directByUrl;
  }

  return null;
};

const findExactReferenceMatches = (
  entities: ApiEntity[],
  symbol: string,
  kind?: ApiEntityKind
): ApiEntity[] => {
  const normalizedSymbol = normalizeLookup(symbol);

  return entities.filter((entity) => {
    if (kind && entity.entityKind !== kind) {
      return false;
    }

    return (
      normalizeLookup(getCanonicalFullName(entity)) === normalizedSymbol ||
      normalizeLookup(getQualifiedMemberName(entity)) === normalizedSymbol
    );
  });
};

const assertMethodEntity = (
  entity: ApiEntity,
  symbol: string
): ApiEntity & { entityKind: "constructor" | "method" } => {
  if (!isMethodEntity(entity)) {
    throw new ApiV1Error({
      code: "INVALID_INPUT",
      details: {
        kind: entity.entityKind,
        symbol,
      },
      message: "The provided symbol does not resolve to a method.",
      status: 400,
    });
  }

  return entity;
};

const filterMethodCandidates = (
  methods: (ApiEntity & { entityKind: "constructor" | "method" })[],
  input: GetMethodDetailsInput
): (ApiEntity & { entityKind: "constructor" | "method" })[] => {
  if (!input.namespace && !input.typeName) {
    return methods;
  }

  return methods.filter((entity) => {
    if (input.namespace && entity.namespace !== input.namespace) {
      return false;
    }

    if (input.typeName && !matchesTypeReference(entity.class, input.typeName)) {
      return false;
    }

    return true;
  });
};

const scoreMethodEntityMatch = (
  entity: ApiEntity & { entityKind: "constructor" | "method" },
  symbol: string,
  normalizedSymbol: string
): {
  entity: ApiEntity & { entityKind: "constructor" | "method" };
  score: number;
} | null => {
  const fullSignature = normalizeLookup(entity.signature);
  const qualifiedName = normalizeLookup(getQualifiedMemberName(entity));
  const simpleName = normalizeLookup(getSimpleMemberName(entity));
  const normalizedNoArgsSymbol = stripEmptyParameterList(normalizedSymbol);
  const score = (
    [
      [entity.signature === symbol, 120],
      [fullSignature === normalizedSymbol, 118],
      [qualifiedName === normalizedNoArgsSymbol, 110],
      [simpleName === normalizedNoArgsSymbol, 96],
      [
        fullSignature.startsWith(normalizedSymbol) ||
          qualifiedName.startsWith(normalizedSymbol),
        84,
      ],
      [
        fullSignature.includes(normalizedSymbol) ||
          qualifiedName.includes(normalizedSymbol),
        72,
      ],
    ] as const
  ).find(([passes]) => passes)?.[1];

  return score
    ? {
        entity,
        score,
      }
    : null;
};

const resolveBestMethodMatch = (
  matches: {
    entity: ApiEntity & { entityKind: "constructor" | "method" };
    score: number;
  }[],
  symbol: string
): ApiEntity & { entityKind: "constructor" | "method" } => {
  if (matches.length === 0) {
    return throwNotFoundError("Method symbol not found.", symbol);
  }

  const topScore = matches[0].score;
  const topMatches = matches.filter((match) => match.score === topScore);
  if (topMatches.length > 1) {
    return throwAmbiguousSymbolError(
      "Method reference is ambiguous. Retry with the full signature from search_docs or get_type_members.",
      topMatches.map((match) => toSymbolRef(match.entity))
    );
  }

  return matches[0].entity;
};

const loadTypeMembers = async (
  typeEntity: ApiEntity & { entityKind: DocumentationTypeKind }
): Promise<(ApiEntity & { entityKind: DocumentationMemberKind })[]> => {
  const entitiesByType = await getEntitiesByClass(
    typeEntity.namespace,
    typeEntity.class
  );
  return entitiesByType.filter((entity) => isMemberEntity(entity));
};

const resolvePreferredTypeMatch = async (
  symbol: string,
  matches: ResolveSymbolMatch[]
): Promise<ApiEntity & { entityKind: DocumentationTypeKind }> => {
  if (matches.length === 0) {
    return throwNotFoundError("Type symbol not found.", symbol);
  }

  const exactQualifiedMatch = await loadResolvedTypeMatch(
    matches,
    "exact_qualified_name"
  );
  if (exactQualifiedMatch) {
    return exactQualifiedMatch;
  }

  const exactNameMatch = await loadResolvedTypeMatch(matches, "exact_name");
  if (exactNameMatch) {
    return exactNameMatch;
  }

  return throwAmbiguousSymbolError(
    "Type name is ambiguous. Resolve the type first and retry with the fully-qualified name.",
    matches.map((match) => match.symbol)
  );
};

const resolveTypeEntity = async (
  symbol: string,
  kind?: DocumentationTypeKind
): Promise<ApiEntity & { entityKind: DocumentationTypeKind }> => {
  const directEntity = await getDirectTypeEntity(symbol, kind);
  if (directEntity) {
    return directEntity;
  }

  const matches = await resolveTypeMatches({ kind, limit: 5, name: symbol });
  return await resolvePreferredTypeMatch(symbol, matches);
};

const resolveExactEntityReference = async (
  symbol: string,
  kind?: ApiEntityKind
): Promise<ApiEntity | null> => {
  const directEntity = await getDirectEntityReference(symbol, kind);
  if (directEntity) {
    return directEntity;
  }

  const documentationIndex = await getDocumentationIndex();
  const exactMatches = findExactReferenceMatches(
    documentationIndex.entities,
    symbol,
    kind
  );

  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  if (exactMatches.length > 1) {
    throwAmbiguousSymbolError(
      "Symbol reference matched multiple entities.",
      exactMatches.map((entity) => toSymbolRef(entity))
    );
  }

  return null;
};

const resolveMethodEntity = async (
  input: GetMethodDetailsInput
): Promise<ApiEntity & { entityKind: "constructor" | "method" }> => {
  const directMatch = await resolveExactEntityReference(input.symbol);
  if (directMatch) {
    return assertMethodEntity(directMatch, input.symbol);
  }

  const documentationIndex = await getDocumentationIndex();
  const methods = filterMethodCandidates(
    documentationIndex.methodEntities,
    input
  );
  const normalizedSymbol = normalizeLookup(input.symbol);
  const scoredMatches = methods
    .map((entity) =>
      scoreMethodEntityMatch(entity, input.symbol, normalizedSymbol)
    )
    .filter(
      (
        match
      ): match is {
        entity: ApiEntity & { entityKind: "constructor" | "method" };
        score: number;
      } => match !== null
    )
    .toSorted((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.entity.signature.localeCompare(right.entity.signature);
    });

  return resolveBestMethodMatch(scoredMatches, input.symbol);
};

const resolveExplicitSymbolKind = async (
  input: GetSymbolInput
): Promise<ApiEntity | null> => {
  if (!input.kind) {
    return null;
  }

  if (TYPE_KINDS.has(input.kind)) {
    return await resolveTypeEntity(
      input.symbol,
      input.kind as DocumentationTypeKind
    );
  }

  if (METHOD_KINDS.has(input.kind)) {
    return await resolveMethodEntity({
      symbol: input.symbol,
    });
  }

  if (input.kind === "property") {
    return throwNotFoundError("Symbol not found.", input.symbol);
  }

  return null;
};

const resolveFallbackSymbolEntity = async (
  symbol: string
): Promise<ApiEntity> => {
  try {
    return await resolveTypeEntity(symbol);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }

    return await resolveMethodEntity({
      symbol,
    });
  }
};

const resolveEntityForExamples = async (symbol: string): Promise<ApiEntity> => {
  const directMatch = await resolveExactEntityReference(symbol);
  if (directMatch) {
    return directMatch;
  }

  try {
    return await resolveTypeEntity(symbol);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }

    return await resolveMethodEntity({
      symbol,
    });
  }
};

const maybeResolveTypeFilter = async (
  typeName?: string
): Promise<string | undefined> => {
  if (!typeName) {
    return;
  }

  const documentationIndex = await getDocumentationIndex();
  const exactFullNameMatch = documentationIndex.typeEntities.find(
    (entity) => entity.class === typeName
  );
  if (exactFullNameMatch) {
    return exactFullNameMatch.class;
  }

  const exactMatches = documentationIndex.typeEntities.filter(
    (entity) => normalizeLookup(entity.name) === normalizeLookup(typeName)
  );
  if (exactMatches.length === 1) {
    return exactMatches[0].class;
  }
};

const resolveSymbolEntity = async (
  input: GetSymbolInput
): Promise<ApiEntity> => {
  const exactEntity = await resolveExactEntityReference(
    input.symbol,
    input.kind
  );
  if (exactEntity) {
    return exactEntity;
  }

  const explicitKindEntity = await resolveExplicitSymbolKind(input);
  if (explicitKindEntity) {
    return explicitKindEntity;
  }

  return await resolveFallbackSymbolEntity(input.symbol);
};

export const searchDocumentation = async (input: DocumentationSearchInput) => {
  const requestedLimit = input.limit ?? 8;
  const resolvedTypeName = await maybeResolveTypeFilter(input.typeName);
  const searchResponse = await searchApiService({
    className: resolvedTypeName,
    entityKind: input.kind,
    limit:
      input.typeName && !resolvedTypeName
        ? Math.min(Math.max(requestedLimit * 4, 20), 50)
        : requestedLimit,
    namespace: input.namespace,
    query: input.query,
    type: toApiSearchType(input.kind),
    useHybrid: input.useHybrid,
  });
  const entities = await Promise.all(
    searchResponse.results.map((result) => getEntityById(result.id))
  );

  const filteredResults = searchResponse.results
    .map((result, index) => ({
      entity: entities.at(index) ?? null,
      result,
    }))
    .filter(
      (
        item
      ): item is {
        entity: ApiEntity;
        result: (typeof searchResponse.results)[number];
      } => item.entity !== null
    )
    .filter((item) => {
      if (!input.includeObsolete && item.entity.isObsolete) {
        return false;
      }

      if (input.typeName) {
        return matchesTypeReference(item.entity.class, input.typeName);
      }

      return true;
    });

  const results: DocumentationSearchHit[] = filteredResults
    .slice(0, requestedLimit)
    .map((item) => ({
      score: item.result.score,
      symbol: toSymbolRef(item.entity),
    }));

  return {
    query: searchResponse.query,
    results,
    returned: results.length,
    source: searchResponse.source,
    total: filteredResults.length,
    workflow: {
      nextSteps: [
        "Use resolve_symbol when the user names a type without a namespace.",
        "Use get_symbol to inspect a specific type or symbol id.",
        "Use get_type_members or get_method_details before answering method questions.",
      ],
      recommendedFirstTool: "search_docs",
    },
  };
};

export const resolveDocumentationSymbol = async (input: ResolveSymbolInput) => {
  const matches = await resolveTypeMatches(input);

  return {
    matches,
    query: input.name,
    returned: matches.length,
  };
};

export const getDocumentationSymbol = async (input: GetSymbolInput) => {
  const entity = await resolveSymbolEntity(input);
  const details = toSymbolDetails(entity);

  if (!isTypeEntity(entity)) {
    return {
      symbol: details,
    };
  }

  const members = await loadTypeMembers(entity);

  return {
    memberCounts: getTypeCounts(members),
    symbol: details,
  };
};

export const getDocumentationTypeMembers = async (
  input: GetTypeMembersInput
) => {
  const typeEntity = await resolveTypeEntity(input.symbol);
  const typeMembers = await loadTypeMembers(typeEntity);
  const members = typeMembers
    .filter((entity) => (input.kind ? entity.entityKind === input.kind : true))
    .filter((entity) =>
      input.includeObsolete ? true : entity.isObsolete === false
    )
    .toSorted((left, right) => {
      const kindOrder = ["constructor", "method", "property"];
      const leftIndex = kindOrder.indexOf(left.entityKind);
      const rightIndex = kindOrder.indexOf(right.entityKind);

      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }

      return left.signature.localeCompare(right.signature);
    })
    .slice(0, input.limit ?? 200);

  return {
    memberCounts: getTypeCounts(typeMembers),
    members: members.map((member) => ({
      ...toSymbolRef(member),
      returnType: member.returnType,
    })),
    returned: members.length,
    type: toSymbolDetails(typeEntity),
  };
};

export const getDocumentationMethodDetails = async (
  input: GetMethodDetailsInput
) => {
  const methodEntity = await resolveMethodEntity(input);

  return {
    method: toSymbolDetails(methodEntity),
  };
};

export const getDocumentationExamples = async (input: GetExamplesInput) => {
  const entity = await resolveEntityForExamples(input.symbol);
  const directExamples = entity.examples
    .slice(0, input.limit ?? 20)
    .map((example) => ({
      ...example,
      source: "symbol" as const,
    }));
  const includeRelated = input.includeRelated ?? true;
  const declaringType =
    includeRelated && isMemberEntity(entity)
      ? await resolveTypeEntity(entity.class).catch(() => null)
      : null;
  const relatedExamples = declaringType
    ? declaringType.examples.slice(0, input.limit ?? 20).map((example) => ({
        ...example,
        source: "declaring_type" as const,
        symbol: toSymbolRef(declaringType),
      }))
    : [];

  return {
    examples: directExamples,
    relatedExamples,
    returned: directExamples.length,
    symbol: toSymbolRef(entity),
  };
};

export const listDocumentationNamespaces = async (
  input: ListNamespacesInput
) => {
  const documentationIndex = await getDocumentationIndex();
  const targetNamespace = input.namespace ?? "";
  const namespaceNode = documentationIndex.namespaceNodes.get(targetNamespace);

  if (!namespaceNode) {
    return throwNotFoundError("Namespace not found.", targetNamespace);
  }

  const childNamespaces = [...namespaceNode.childNamespaces]
    .map((namespaceName) =>
      documentationIndex.namespaceNodes.get(namespaceName)
    )
    .filter((node): node is NamespaceNode => node !== undefined)
    .toSorted((left, right) => left.fullName.localeCompare(right.fullName))
    .slice(0, input.limit ?? 100)
    .map((node) => ({
      childNamespaceCount: node.childNamespaces.size,
      fullName: node.fullName,
      memberCount: node.memberCount,
      name: node.name,
      parent: node.parent,
      typeCounts: node.typeCounts,
    }));

  const namespaceTypeEntities = await Promise.all(
    namespaceNode.typeIds.map((typeId) => getEntityById(typeId))
  );
  const typeEntities = namespaceTypeEntities
    .filter((entity): entity is ApiEntity => entity !== null)
    .toSorted((left, right) => left.class.localeCompare(right.class))
    .slice(0, input.limit ?? 100)
    .map((entity) => toSymbolRef(entity));

  return {
    namespace: targetNamespace.length > 0 ? targetNamespace : null,
    namespaces: childNamespaces,
    returned: childNamespaces.length,
    types: typeEntities,
  };
};
