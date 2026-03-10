import { getEntityById, loadApiEntities } from "@/features/api/utils/data";
import type { ApiEntity, ApiExample } from "@/features/api/utils/schemas";
import { ApiV1Error } from "@/features/api/v1/domain/errors";

import {
  getDocumentationExamples,
  getDocumentationMethodDetails,
  getDocumentationSymbol,
  getDocumentationTypeMembers,
  listDocumentationNamespaces,
} from "./documentation-tools";

type DocumentationResourceKind = "member" | "namespace" | "schema" | "type";
type DocumentationMemberKind = "constructor" | "event" | "method" | "property";
type DocumentationTypeMemberKind = Exclude<DocumentationMemberKind, "event">;
type DocumentationTypeKind = "class" | "enum" | "interface" | "struct";

interface ResourceLink {
  docsUrl: string | null;
  rel: string;
  title: string;
  uri: string;
}

interface ResourceEnvelope<TData> {
  data: TData;
  resource: {
    description: string;
    docsUrl: string | null;
    kind: DocumentationResourceKind;
    mimeType: "application/json";
    title: string;
    uri: string;
  };
}

interface ResourceSchemaDocument {
  notes: string[];
  resources: {
    description: string;
    kind: DocumentationResourceKind;
    returns: string[];
    uriTemplate: string;
    whenToUse: string;
  }[];
  workflow: {
    nextStep: string;
    startWith: string;
  };
}

interface NamespaceResourceDocument {
  childNamespaces: {
    childNamespaceCount: number;
    fullName: string;
    memberCount: number;
    resourceUri: string;
    typeCounts: Record<DocumentationTypeKind, number>;
  }[];
  links: ResourceLink[];
  namespace: {
    fullName: string | null;
    name: string;
    resourceUri: string;
  };
  typeCount: number;
  types: {
    docsUrl: string;
    fullName: string;
    kind: DocumentationTypeKind;
    resourceUri: string;
    summary: string;
  }[];
}

interface TypeResourceDocument {
  examples: (ApiExample & {
    source: "declaring_type" | "symbol";
  })[];
  links: ResourceLink[];
  members: {
    docsUrl: string;
    fullName: string;
    kind: DocumentationTypeMemberKind;
    name: string;
    resourceUri: string;
    returnType: string | null;
    summary: string;
  }[];
  symbol: {
    declaration: {
      displaySignature: string;
      signature: string;
      sourceSignature: string;
    };
    description: string;
    docsUrl: string;
    examplesCount: number;
    fullName: string;
    id: string;
    kind: DocumentationTypeKind;
    memberCounts: Record<DocumentationTypeMemberKind, number>;
    namespace: string;
    remarks: string;
    resourceUri: string;
    summary: string;
  };
}

interface MemberResourceDocument {
  declaringType: {
    fullName: string;
    resourceUri: string;
  } | null;
  examples: (ApiExample & {
    source: "declaring_type" | "symbol";
  })[];
  links: ResourceLink[];
  member: {
    declaration: {
      displaySignature: string;
      signature: string;
      sourceSignature: string;
    };
    description: string;
    docsUrl: string;
    exceptions: {
      description?: string;
      type: string;
    }[];
    fullName: string;
    id: string;
    kind: DocumentationMemberKind | "event";
    name: string;
    namespace: string;
    parameters: {
      defaultValue?: string;
      description?: string;
      name: string;
      type: string;
    }[];
    remarks: string;
    resourceUri: string;
    returnType: string | null;
    returnsDescription: string;
    summary: string;
  };
}

interface ResourceCatalog {
  memberNames: string[];
  namespaces: string[];
  typeNames: string[];
}

const RESOURCE_SCHEMA_URI = "docs://schema";
const ROOT_NAMESPACE_KEY = "root";
const ROOT_NAMESPACE_NAME = "Root";
const ROOT_NAMESPACE_URI = `docs://namespace/${ROOT_NAMESPACE_KEY}`;
const JSON_MIME_TYPE = "application/json" as const;
const RESOURCE_COMPLETION_LIMIT = 50;
const EMPTY_MEMBER_COUNTS: Record<DocumentationTypeMemberKind, number> = {
  constructor: 0,
  method: 0,
  property: 0,
};

let resourceCatalogPromise: Promise<ResourceCatalog> | null = null;

const normalizeLookup = (value: string): string => value.trim().toLowerCase();

const encodeResourceSegment = (value: string): string =>
  encodeURIComponent(value);

const decodeResourceSegment = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const namespaceUri = (namespace: string | null): string =>
  namespace && namespace.length > 0
    ? `docs://namespace/${encodeResourceSegment(namespace)}`
    : ROOT_NAMESPACE_URI;

const typeUri = (fullName: string): string =>
  `docs://type/${encodeResourceSegment(fullName)}`;

const memberUri = (fullName: string): string =>
  `docs://member/${encodeResourceSegment(fullName)}`;

const toJsonResourceContents = (
  uri: string,
  payload: unknown
): {
  contents: [
    {
      mimeType: "application/json";
      text: string;
      uri: string;
    },
  ];
} => ({
  contents: [
    {
      mimeType: JSON_MIME_TYPE,
      text: JSON.stringify(payload, null, 2),
      uri,
    },
  ],
});

const getEntityDescription = (entity: ApiEntity): string =>
  entity.description || entity.summary || "No description available.";

const isTypeKind = (kind: string): kind is DocumentationTypeKind =>
  kind === "class" ||
  kind === "enum" ||
  kind === "interface" ||
  kind === "struct";

const isMemberKind = (kind: string): kind is DocumentationTypeMemberKind =>
  kind === "constructor" || kind === "method" || kind === "property";

const getQualifiedMemberName = (entity: ApiEntity): string =>
  `${entity.class}.${entity.name}`;

const sortValues = (values: Set<string>): string[] =>
  [...values].toSorted((left, right) => left.localeCompare(right));

const addEntityToResourceCatalog = (
  entity: ApiEntity,
  state: {
    memberNames: Set<string>;
    namespaces: Set<string>;
    typeNames: Set<string>;
  }
) => {
  if (entity.namespace.length > 0) {
    state.namespaces.add(entity.namespace);
  }

  if (isTypeKind(entity.entityKind)) {
    state.typeNames.add(entity.class);
    return;
  }

  if (isMemberKind(entity.entityKind)) {
    state.memberNames.add(entity.signature);
    state.memberNames.add(getQualifiedMemberName(entity));
  }
};

const toCompletionMatches = (values: string[], prefix: string): string[] => {
  const normalizedPrefix = normalizeLookup(decodeResourceSegment(prefix));
  const matches =
    normalizedPrefix.length === 0
      ? values
      : values.filter((value) =>
          normalizeLookup(value).includes(normalizedPrefix)
        );

  return matches.slice(0, RESOURCE_COMPLETION_LIMIT);
};

const buildResourceCatalog = async (): Promise<ResourceCatalog> => {
  const entities = await loadApiEntities();
  const state = {
    memberNames: new Set<string>(),
    namespaces: new Set<string>(),
    typeNames: new Set<string>(),
  };

  for (const entity of entities) {
    addEntityToResourceCatalog(entity, state);
  }

  return {
    memberNames: sortValues(state.memberNames),
    namespaces: sortValues(state.namespaces),
    typeNames: sortValues(state.typeNames),
  };
};

const getResourceCatalog = (): Promise<ResourceCatalog> => {
  if (!resourceCatalogPromise) {
    resourceCatalogPromise = buildResourceCatalog();
  }

  return resourceCatalogPromise;
};

const getRequiredEntityById = async (id: string): Promise<ApiEntity> => {
  const entity = await getEntityById(id);
  if (!entity) {
    throw new ApiV1Error({
      code: "NOT_FOUND",
      details: { id },
      message: "Entity not found.",
      status: 404,
    });
  }

  return entity;
};

const getMemberSymbolKind = (
  kind: string,
  symbol: string
): DocumentationTypeMemberKind => {
  if (!isMemberKind(kind)) {
    throw new ApiV1Error({
      code: "INVALID_INPUT",
      details: { kind, symbol },
      message: "The resource URI does not resolve to a member.",
      status: 400,
    });
  }

  return kind;
};

const resolveMemberResourceDetails = async (symbol: {
  fullName: string;
  kind: DocumentationTypeMemberKind;
}) => {
  if (symbol.kind !== "constructor" && symbol.kind !== "method") {
    return;
  }

  const methodDetails = await getDocumentationMethodDetails({
    symbol: symbol.fullName,
  });

  return methodDetails.method;
};

const buildDeclaringTypeReference = (declaringType: string | null) =>
  declaringType
    ? {
        fullName: declaringType,
        resourceUri: typeUri(declaringType),
      }
    : null;

const buildMemberResourceLinks = (input: {
  declaringType: string | null;
  namespace: string;
}): ResourceLink[] => [
  {
    docsUrl: null,
    rel: "namespace",
    title: input.namespace,
    uri: namespaceUri(input.namespace),
  },
  ...(input.declaringType
    ? [
        {
          docsUrl: null,
          rel: "declaring_type",
          title: input.declaringType,
          uri: typeUri(input.declaringType),
        },
      ]
    : []),
];

const buildSchemaResource = (): ResourceEnvelope<ResourceSchemaDocument> => ({
  data: {
    notes: [
      "Resources complement the MCP tools. Start with search_docs for discovery, then read a docs:// resource when you know the canonical target symbol.",
      "Namespace URIs use docs://namespace/{name}. Use docs://namespace/root for the root namespace listing.",
      "Type URIs use docs://type/{full_name}. Member URIs use docs://member/{full_name}, typically with a fully-qualified member reference such as Sandbox.Component.OnUpdate.",
    ],
    resources: [
      {
        description:
          "Canonical namespace page with child namespaces and types.",
        kind: "namespace",
        returns: [
          "namespace summary",
          "child namespaces",
          "types in the namespace",
          "resource links to related API elements",
        ],
        uriTemplate: "docs://namespace/{name}",
        whenToUse:
          "Use when the agent already knows the namespace and wants its canonical listing.",
      },
      {
        description:
          "Canonical type page for classes, structs, interfaces, and enums.",
        kind: "type",
        returns: [
          "type summary and description",
          "signatures and remarks",
          "member counts",
          "member listings",
          "examples and related links",
        ],
        uriTemplate: "docs://type/{full_name}",
        whenToUse:
          "Use after search_docs or resolve_symbol when the exact type is known.",
      },
      {
        description:
          "Canonical member page for methods, constructors, properties, and future event-like members.",
        kind: "member",
        returns: [
          "member summary and description",
          "exact signature",
          "parameters and return docs",
          "examples",
          "links to the declaring type and namespace",
        ],
        uriTemplate: "docs://member/{full_name}",
        whenToUse:
          "Use after get_type_members or get_method_details when the exact member is known.",
      },
    ],
    workflow: {
      nextStep:
        "Load a docs:// resource after tool-based discovery to retrieve the canonical structured page.",
      startWith: "search_docs",
    },
  },
  resource: {
    description:
      "Schema and usage guide for the s&box documentation MCP resources.",
    docsUrl: null,
    kind: "schema",
    mimeType: JSON_MIME_TYPE,
    title: "s&box Documentation Resource Schema",
    uri: RESOURCE_SCHEMA_URI,
  },
});

export const completeNamespaceResourceNames = async (
  prefix: string
): Promise<string[]> => {
  const catalog = await getResourceCatalog();
  return toCompletionMatches(
    [ROOT_NAMESPACE_KEY, ...catalog.namespaces],
    prefix
  );
};

export const completeTypeResourceNames = async (
  prefix: string
): Promise<string[]> => {
  const catalog = await getResourceCatalog();
  return toCompletionMatches(catalog.typeNames, prefix);
};

export const completeMemberResourceNames = async (
  prefix: string
): Promise<string[]> => {
  const catalog = await getResourceCatalog();
  return toCompletionMatches(catalog.memberNames, prefix);
};

export const readDocumentationSchemaResource = () => buildSchemaResource();

export const readDocumentationNamespaceResource = async (
  rawNamespace: string
): Promise<ResourceEnvelope<NamespaceResourceDocument>> => {
  const namespace =
    rawNamespace === ROOT_NAMESPACE_KEY
      ? undefined
      : decodeResourceSegment(rawNamespace);
  const result = await listDocumentationNamespaces({
    limit: Number.MAX_SAFE_INTEGER,
    namespace,
  });
  const fullName = result.namespace;
  const title = fullName ?? ROOT_NAMESPACE_NAME;

  return {
    data: {
      childNamespaces: result.namespaces.map((node) => ({
        childNamespaceCount: node.childNamespaceCount,
        fullName: node.fullName,
        memberCount: node.memberCount,
        resourceUri: namespaceUri(node.fullName),
        typeCounts: node.typeCounts,
      })),
      links: result.types.map((type) => ({
        docsUrl: type.url,
        rel: "type",
        title: type.fullName,
        uri: typeUri(type.fullName),
      })),
      namespace: {
        fullName,
        name: title,
        resourceUri: namespaceUri(fullName),
      },
      typeCount: result.types.length,
      types: result.types
        .filter((type): type is typeof type & { kind: DocumentationTypeKind } =>
          isTypeKind(type.kind)
        )
        .map((type) => ({
          docsUrl: type.url,
          fullName: type.fullName,
          kind: type.kind,
          resourceUri: typeUri(type.fullName),
          summary: type.summary,
        })),
    },
    resource: {
      description:
        "Structured namespace page from the indexed s&box API documentation.",
      docsUrl: null,
      kind: "namespace",
      mimeType: JSON_MIME_TYPE,
      title: `${title} namespace`,
      uri: namespaceUri(fullName),
    },
  };
};

export const readDocumentationTypeResource = async (
  rawFullName: string
): Promise<ResourceEnvelope<TypeResourceDocument>> => {
  const symbol = decodeResourceSegment(rawFullName);
  const symbolResult = await getDocumentationSymbol({ symbol });
  const entity = await getRequiredEntityById(symbolResult.symbol.id);

  if (!isTypeKind(symbolResult.symbol.kind)) {
    throw new ApiV1Error({
      code: "INVALID_INPUT",
      details: { kind: symbolResult.symbol.kind, symbol },
      message: "The resource URI does not resolve to a type.",
      status: 400,
    });
  }

  const membersResult = await getDocumentationTypeMembers({
    includeObsolete: true,
    limit: Number.MAX_SAFE_INTEGER,
    symbol: symbolResult.symbol.fullName,
  });
  const examplesResult = await getDocumentationExamples({
    includeRelated: false,
    limit: Number.MAX_SAFE_INTEGER,
    symbol: symbolResult.symbol.fullName,
  });

  return {
    data: {
      examples: examplesResult.examples,
      links: [
        {
          docsUrl: null,
          rel: "namespace",
          title: symbolResult.symbol.namespace,
          uri: namespaceUri(symbolResult.symbol.namespace),
        },
        ...membersResult.members.map((member) => ({
          docsUrl: member.url,
          rel: "member",
          title: member.fullName,
          uri: memberUri(member.fullName),
        })),
      ],
      members: membersResult.members
        .filter(
          (
            member
          ): member is typeof member & { kind: DocumentationTypeMemberKind } =>
            isMemberKind(member.kind)
        )
        .map((member) => ({
          docsUrl: member.url,
          fullName: member.fullName,
          kind: member.kind,
          name: member.name,
          resourceUri: memberUri(member.fullName),
          returnType: member.returnType,
          summary: member.summary,
        })),
      symbol: {
        declaration: symbolResult.symbol.declaration,
        description: getEntityDescription(entity),
        docsUrl: symbolResult.symbol.url,
        examplesCount: symbolResult.symbol.examplesCount,
        fullName: symbolResult.symbol.fullName,
        id: symbolResult.symbol.id,
        kind: symbolResult.symbol.kind,
        memberCounts: symbolResult.memberCounts ?? EMPTY_MEMBER_COUNTS,
        namespace: symbolResult.symbol.namespace,
        remarks: symbolResult.symbol.remarks,
        resourceUri: typeUri(symbolResult.symbol.fullName),
        summary: symbolResult.symbol.summary,
      },
    },
    resource: {
      description:
        "Canonical type page from the indexed s&box API documentation.",
      docsUrl: symbolResult.symbol.url,
      kind: "type",
      mimeType: JSON_MIME_TYPE,
      title: symbolResult.symbol.fullName,
      uri: typeUri(symbolResult.symbol.fullName),
    },
  };
};

export const readDocumentationMemberResource = async (
  rawFullName: string
): Promise<ResourceEnvelope<MemberResourceDocument>> => {
  const symbol = decodeResourceSegment(rawFullName);
  const symbolResult = await getDocumentationSymbol({ symbol });
  const entity = await getRequiredEntityById(symbolResult.symbol.id);
  const memberKind = getMemberSymbolKind(symbolResult.symbol.kind, symbol);

  const memberDetails =
    (await resolveMemberResourceDetails({
      fullName: symbolResult.symbol.fullName,
      kind: memberKind,
    })) ?? symbolResult.symbol;
  const examplesResult = await getDocumentationExamples({
    includeRelated: true,
    limit: Number.MAX_SAFE_INTEGER,
    symbol: symbolResult.symbol.fullName,
  });

  return {
    data: {
      declaringType: buildDeclaringTypeReference(
        symbolResult.symbol.declaringType
      ),
      examples: [
        ...examplesResult.examples,
        ...examplesResult.relatedExamples.map((example) => ({
          ...example,
        })),
      ],
      links: buildMemberResourceLinks({
        declaringType: symbolResult.symbol.declaringType,
        namespace: symbolResult.symbol.namespace,
      }),
      member: {
        declaration: memberDetails.declaration,
        description: getEntityDescription(entity),
        docsUrl: memberDetails.url,
        exceptions: memberDetails.exceptions,
        fullName: memberDetails.fullName,
        id: memberDetails.id,
        kind: memberKind,
        name: memberDetails.name,
        namespace: memberDetails.namespace,
        parameters: memberDetails.parameters,
        remarks: memberDetails.remarks,
        resourceUri: memberUri(memberDetails.fullName),
        returnType: memberDetails.returnType,
        returnsDescription: memberDetails.returnsDescription,
        summary: memberDetails.summary,
      },
    },
    resource: {
      description:
        "Canonical member page from the indexed s&box API documentation.",
      docsUrl: memberDetails.url,
      kind: "member",
      mimeType: JSON_MIME_TYPE,
      title: memberDetails.fullName,
      uri: memberUri(memberDetails.fullName),
    },
  };
};

export const toDocumentationResourceResult = (
  resource:
    | ResourceEnvelope<MemberResourceDocument>
    | ResourceEnvelope<NamespaceResourceDocument>
    | ResourceEnvelope<ResourceSchemaDocument>
    | ResourceEnvelope<TypeResourceDocument>
) => toJsonResourceContents(resource.resource.uri, resource);
