import type { ToolName } from "@/features/api/v1/domain/schemas";

type JsonRecord = Record<string, unknown>;

const EMPTY_STRING = "";
const DETAIL_FULL = "full";

const keyAliases: Record<string, string> = {
  childNamespaceCount: "children",
  declaringType: "owner",
  displaySignature: "sig",
  docsUrl: "url",
  filePath: "file",
  fileUrl: "fileUrl",
  fullName: "name",
  githubUrl: "sourceUrl",
  isObsolete: "obsolete",
  lineEnd: "end",
  lineStart: "start",
  matchKind: "match",
  matchScore: "score",
  matchType: "match",
  matchedAliases: "aliases",
  memberCount: "members",
  memberCounts: "counts",
  obsoleteMessage: "obsoleteReason",
  parameters: "params",
  reason: "why",
  relatedExamples: "related",
  relatedGuides: "guides",
  relatedSymbols: "symbols",
  repositoryName: "repo",
  repositoryRef: "ref",
  repositoryUrl: "repoUrl",
  resourceUri: "uri",
  returnType: "returns",
  returnsDescription: "returnsText",
  sourceSignature: "sourceSig",
  typeCounts: "counts",
  uriTemplate: "uri",
};

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isEmptyRecord = (value: JsonRecord): boolean =>
  Object.keys(value).length === 0;

const isEmptyValue = (value: unknown): boolean => {
  if (value === null || value === undefined || value === EMPTY_STRING) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return isRecord(value) && isEmptyRecord(value);
};

const aliasKey = (key: string): string =>
  Object.hasOwn(keyAliases, key) ? (keyAliases[key] ?? key) : key;

const compactEntry = (
  visit: (value: unknown) => unknown,
  rawKey: string,
  rawValue: unknown
): readonly [string, unknown] | null => {
  const nextValue = visit(rawValue);
  return isEmptyValue(nextValue) ? null : [aliasKey(rawKey), nextValue];
};

const compactRecord = (
  visit: (value: unknown) => unknown,
  value: JsonRecord
): JsonRecord => {
  const compacted: JsonRecord = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const entry = compactEntry(visit, rawKey, rawValue);
    if (entry) {
      const [key, nextValue] = entry;
      compacted[key] = nextValue;
    }
  }

  return compacted;
};

export const compactValue = (value: unknown): unknown => {
  const visit = (current: unknown): unknown => {
    if (Array.isArray(current)) {
      return current.map(visit).filter((item) => !isEmptyValue(item));
    }

    if (!isRecord(current)) {
      return current;
    }

    return compactRecord(visit, current);
  };

  return visit(value);
};

const readRecord = (value: unknown, key: string): JsonRecord | null => {
  if (!isRecord(value)) {
    return null;
  }

  const child = value[key];
  return isRecord(child) ? child : null;
};

const readArray = (value: unknown, key: string): unknown[] => {
  if (!isRecord(value)) {
    return [];
  }

  const child = value[key];
  return Array.isArray(child) ? child : [];
};

const readString = (value: JsonRecord, key: string): string | undefined => {
  const child = value[key];
  return typeof child === "string" && child.length > 0 ? child : undefined;
};

const readNumber = (value: JsonRecord, key: string): number | undefined => {
  const child = value[key];
  return typeof child === "number" && Number.isFinite(child)
    ? child
    : undefined;
};

const readBoolean = (value: JsonRecord, key: string): boolean | undefined => {
  const child = value[key];
  return typeof child === "boolean" ? child : undefined;
};

const isFullDetailRequest = (input: unknown): boolean =>
  isRecord(input) && input.detail === DETAIL_FULL;

const compactSymbolRef = (value: unknown): JsonRecord => {
  if (!isRecord(value)) {
    return {};
  }

  return compactValue({
    id: readString(value, "id"),
    kind: readString(value, "kind"),
    name: readString(value, "fullName") ?? readString(value, "name"),
    obsolete: readBoolean(value, "isObsolete") ? true : undefined,
    obsoleteReason: readString(value, "obsoleteMessage"),
    owner: readString(value, "declaringType"),
    returns: readString(value, "returnType"),
    sig:
      readString(value, "displaySignature") ?? readString(value, "signature"),
    summary: readString(value, "summary"),
    url: readString(value, "url"),
  }) as JsonRecord;
};

const compactParameter = (value: unknown): JsonRecord => {
  if (!isRecord(value)) {
    return {};
  }

  return compactValue({
    default: readString(value, "defaultValue"),
    desc: readString(value, "description"),
    name: readString(value, "name"),
    type: readString(value, "type"),
  }) as JsonRecord;
};

const compactException = (value: unknown): JsonRecord => {
  if (!isRecord(value)) {
    return {};
  }

  return compactValue({
    desc: readString(value, "description"),
    type: readString(value, "type"),
  }) as JsonRecord;
};

const compactSymbolDetails = (value: unknown): JsonRecord => {
  if (!isRecord(value)) {
    return {};
  }

  return compactValue({
    ...compactSymbolRef(value),
    assembly: readString(value, "assembly"),
    examples: readNumber(value, "examplesCount"),
    namespace: readString(value, "namespace"),
    params: readArray(value, "parameters").map(compactParameter),
    remarks: readString(value, "remarks"),
    returnsText: readString(value, "returnsDescription"),
    throws: readArray(value, "exceptions").map(compactException),
  }) as JsonRecord;
};

const compactGuide = (value: unknown): JsonRecord => {
  if (!isRecord(value)) {
    return {};
  }

  return compactValue({
    summary: readString(value, "description"),
    title: readString(value, "title"),
    uri: readString(value, "resourceUri"),
  }) as JsonRecord;
};

const compactWorkflow = (value: unknown): JsonRecord => {
  if (!isRecord(value)) {
    return {};
  }

  return compactValue({
    next: readArray(value, "nextTools"),
    policy: value.policy,
    resource: readString(value, "resource"),
  }) as JsonRecord;
};

const compactExample = (value: unknown): JsonRecord => {
  if (!isRecord(value)) {
    return {};
  }

  return compactValue({
    code: readString(value, "code"),
    end: readNumber(value, "lineEnd"),
    file: readString(value, "filePath"),
    repo: readString(value, "repositoryName"),
    source: readString(value, "source"),
    sourceKind: readString(value, "sourceKind"),
    start: readNumber(value, "lineStart"),
    symbol: compactSymbolRef(value.symbol),
  }) as JsonRecord;
};

const compactResolveMatch = (value: unknown): JsonRecord => {
  const symbol = readRecord(value, "symbol");

  return compactValue({
    match: isRecord(value) ? readString(value, "matchType") : undefined,
    score: isRecord(value) ? readNumber(value, "score") : undefined,
    ...compactSymbolRef(symbol),
  }) as JsonRecord;
};

const compactNamespace = (value: unknown): JsonRecord => {
  if (!isRecord(value)) {
    return {};
  }

  return compactValue({
    children: readNumber(value, "childNamespaceCount"),
    counts: value.typeCounts,
    members: readNumber(value, "memberCount"),
    name: readString(value, "fullName") ?? readString(value, "name"),
    parent: readString(value, "parent"),
  }) as JsonRecord;
};

const compactResolveSymbolResult = (result: unknown): unknown => {
  if (!isRecord(result)) {
    return compactValue(result);
  }

  return compactValue({
    matches: readArray(result, "matches").map(compactResolveMatch),
    query: readString(result, "query"),
    returned: readNumber(result, "returned"),
  });
};

const compactGetSymbolResult = (result: unknown): unknown => {
  if (!isRecord(result)) {
    return compactValue(result);
  }

  return compactValue({
    counts: result.memberCounts,
    guideCount: readArray(result, "relatedGuides").length,
    symbol: compactSymbolDetails(result.symbol),
    workflow: compactWorkflow(result.workflow),
  });
};

const compactExplainSymbolContextResult = (result: unknown): unknown => {
  if (!isRecord(result)) {
    return compactValue(result);
  }

  const context = readRecord(result, "context");

  return compactValue({
    context: {
      counts: context?.memberCounts,
      guideCount: context ? readNumber(context, "guideCount") : undefined,
      guides: context ? readArray(context, "guides").map(compactGuide) : [],
      members: context
        ? readArray(context, "members").map((member) =>
            compactSymbolRef(member)
          )
        : [],
      returnedMembers: context
        ? readNumber(context, "returnedMembers")
        : undefined,
      totalMembers: context ? readNumber(context, "totalMembers") : undefined,
    },
    symbol: compactSymbolDetails(result.symbol),
    workflow: compactWorkflow(result.workflow),
  });
};

const compactGetTypeMembersResult = (result: unknown): unknown => {
  if (!isRecord(result)) {
    return compactValue(result);
  }

  return compactValue({
    counts: result.memberCounts,
    members: readArray(result, "members").map((member) =>
      compactSymbolRef(member)
    ),
    returned: readNumber(result, "returned"),
    type: compactSymbolRef(result.type),
    workflow: compactWorkflow(result.workflow),
  });
};

const compactGetMethodDetailsResult = (result: unknown): unknown => {
  if (!isRecord(result)) {
    return compactValue(result);
  }

  return compactValue({
    guideCount: readArray(result, "relatedGuides").length,
    method: compactSymbolDetails(result.method),
    workflow: compactWorkflow(result.workflow),
  });
};

const compactGetRelatedGuidesResult = (result: unknown): unknown => {
  if (!isRecord(result)) {
    return compactValue(result);
  }

  return compactValue({
    guides: readArray(result, "guides").map(compactGuide),
    returned: readNumber(result, "returned"),
    symbol: compactSymbolRef(result.symbol),
  });
};

const compactGetExamplesResult = (result: unknown): unknown => {
  if (!isRecord(result)) {
    return compactValue(result);
  }

  return compactValue({
    examples: readArray(result, "examples").map(compactExample),
    related: readArray(result, "relatedExamples").map(compactExample),
    returned: readNumber(result, "returned"),
    symbol: compactSymbolRef(result.symbol),
  });
};

const compactListNamespacesResult = (result: unknown): unknown => {
  if (!isRecord(result)) {
    return compactValue(result);
  }

  return compactValue({
    namespace: readString(result, "namespace") ?? "root",
    namespaces: readArray(result, "namespaces").map(compactNamespace),
    returned: readNumber(result, "returned"),
    types: readArray(result, "types").map(compactSymbolRef),
  });
};

const toolResultCompactors: Record<ToolName, (result: unknown) => unknown> = {
  expand_documentation: compactValue,
  explain_symbol_context: compactExplainSymbolContextResult,
  get_examples: compactGetExamplesResult,
  get_method_details: compactGetMethodDetailsResult,
  get_related_guides: compactGetRelatedGuidesResult,
  get_symbol: compactGetSymbolResult,
  get_type_members: compactGetTypeMembersResult,
  list_namespaces: compactListNamespacesResult,
  read_doc: compactValue,
  read_documentation: compactValue,
  resolve_symbol: compactResolveSymbolResult,
  search_docs: compactValue,
  search_documentation: compactValue,
};

export const compactMcpToolResult = (
  toolName: ToolName,
  result: unknown,
  input: unknown
): unknown => {
  if (isFullDetailRequest(input)) {
    return compactValue(result);
  }

  return toolResultCompactors[toolName](result);
};

export const compactMcpResource = (resource: unknown): unknown => {
  if (!isRecord(resource)) {
    return compactValue(resource);
  }

  const metadata = readRecord(resource, "resource");
  const data = readRecord(resource, "data");
  const compactMetadata = {
    kind: metadata ? readString(metadata, "kind") : undefined,
    title: metadata ? readString(metadata, "title") : undefined,
    url: metadata ? readString(metadata, "docsUrl") : undefined,
  };

  return data
    ? compactValue({ ...compactMetadata, ...data })
    : compactValue({ ...compactMetadata, data: resource.data });
};
