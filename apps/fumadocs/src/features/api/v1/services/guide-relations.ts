import type { Folder, Item, Node } from "fumadocs-core/page-tree";

import { loadApiEntities } from "@/features/api/utils/data";
import type { ApiEntity, ApiEntityKind } from "@/features/api/utils/schemas";
import {
  getLatestOfficialDocsSha,
  getOfficialDocPage,
  getOfficialDocsSectionTree,
  OFFICIAL_DOCS_FOLDER_URL,
} from "@/features/official-docs/utils/source";

const GUIDE_RESOURCE_INDEX_NAME = "index";
const GUIDE_RESOURCE_PREFIX = "docs://guide/";
const GUIDE_COMPLETION_LIMIT = 50;
const IDENTIFIER_TOKEN_PATTERN =
  /[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*(?:\(\))?/gu;
const INLINE_CODE_PATTERN = /`([^`\n]+)`/gu;
const CODE_FENCE_PATTERN = /```[\s\S]*?```/gu;
const MAX_GUIDE_RELATIONS = 8;
const MAX_GUIDE_SYMBOLS = 20;
const MAX_MATCHED_ALIASES = 8;
const MIN_TOKEN_LENGTH = 3;
const TYPE_ENTITY_KINDS = new Set<ApiEntityKind>([
  "class",
  "enum",
  "interface",
  "struct",
]);
const MEMBER_ENTITY_KINDS = new Set<ApiEntityKind>([
  "constructor",
  "method",
  "property",
]);

export interface RelatedGuide {
  breadcrumbs: string[];
  description?: string;
  githubUrl: string;
  matchKind: "declaring_type" | "direct_symbol";
  matchScore: number;
  matchedAliases: string[];
  resourceUri: string;
  title: string;
  url: string;
}

export interface RelatedGuideSymbol {
  docsUrl: string;
  fullName: string;
  kind: ApiEntityKind;
  matchScore: number;
  matchedAliases: string[];
  resourceUri: string;
  summary: string;
}

interface AliasScore {
  matchedAliases: string[];
  score: number;
}

interface GuideDocument {
  breadcrumbs: string[];
  description?: string;
  githubUrl: string;
  markdown: string;
  resourceName: string;
  resourceUri: string;
  title: string;
  url: string;
}

interface PreparedGuideDocument extends GuideDocument {
  allTokens: ReadonlySet<string>;
  codeTokens: ReadonlySet<string>;
  normalizedMarkdown: string;
}

interface GuideRelation {
  guide: GuideDocument;
  matchScore: number;
  matchedAliases: string[];
}

interface GuideRelationIndex {
  guideNames: string[];
  relatedSymbolsByGuideName: ReadonlyMap<string, RelatedGuideSymbol[]>;
  relatedGuidesByEntityId: ReadonlyMap<string, GuideRelation[]>;
  typeEntityIdByClass: ReadonlyMap<string, string>;
}

const guideRelationIndexCache = new Map<string, Promise<GuideRelationIndex>>();
const EMPTY_ALIAS_SCORE: AliasScore = {
  matchedAliases: [],
  score: 0,
};
const EMPTY_GUIDE_RELATION_INDEX: GuideRelationIndex = {
  guideNames: [],
  relatedGuidesByEntityId: new Map(),
  relatedSymbolsByGuideName: new Map(),
  typeEntityIdByClass: new Map(),
};

const normalizeLookup = (value: string): string => value.trim().toLowerCase();

const stripCallableSuffix = (value: string): string =>
  value.endsWith("()") ? value.slice(0, -2) : value;

const getDottedIdentifierAliases = (token: string): string[] => {
  const segments = stripCallableSuffix(token).split(".");
  const aliases: string[] = [];
  for (let endIndex = 1; endIndex < segments.length; endIndex += 1) {
    aliases.push(segments.slice(0, endIndex).join("."));
  }

  for (let startIndex = 1; startIndex < segments.length - 1; startIndex += 1) {
    aliases.push(segments.slice(startIndex).join("."));
  }

  return aliases.filter((alias) => alias.length >= MIN_TOKEN_LENGTH);
};

const appendDottedIdentifierAliases = (
  tokens: Set<string>,
  token: string
): void => {
  for (const alias of getDottedIdentifierAliases(token)) {
    tokens.add(alias);
  }
};

const getSimpleTypeName = (fullName: string): string =>
  fullName.split(".").at(-1) ?? fullName;

const getSimpleMemberName = (entity: ApiEntity): string => {
  if (entity.entityKind === "constructor") {
    return getSimpleTypeName(entity.class);
  }

  return entity.name.split(".").at(-1) ?? entity.name;
};

const getCanonicalFullName = (entity: ApiEntity): string =>
  TYPE_ENTITY_KINDS.has(entity.entityKind) ? entity.class : entity.signature;

const guideResourceNameFromUrl = (url: string): string => {
  const relativePath = url
    .slice(OFFICIAL_DOCS_FOLDER_URL.length)
    .replace(/^\/+/u, "");
  return relativePath.length > 0 ? relativePath : GUIDE_RESOURCE_INDEX_NAME;
};

const guideResourceUri = (resourceName: string): string =>
  `${GUIDE_RESOURCE_PREFIX}${resourceName}`;

const toGuideSlugs = (resourceName: string): string[] =>
  resourceName === GUIDE_RESOURCE_INDEX_NAME
    ? []
    : resourceName.split("/").filter((segment) => segment.length > 0);

const isFolderNode = (node: Folder | Node): node is Folder =>
  node.type === "folder";

const isPageNode = (node: Folder | Node): node is Item => node.type === "page";

const collectGuidePageUrls = (node: Folder | Node, urls: Set<string>): void => {
  if ("index" in node && node.index?.url) {
    urls.add(node.index.url);
  }

  if (isPageNode(node)) {
    urls.add(node.url);
    return;
  }

  if (!isFolderNode(node)) {
    return;
  }

  for (const child of node.children) {
    collectGuidePageUrls(child, urls);
  }
};

const extractIdentifierTokens = (value: string): ReadonlySet<string> => {
  const tokens = new Set<string>();

  for (const match of value.matchAll(IDENTIFIER_TOKEN_PATTERN)) {
    const token = normalizeLookup(match[0] ?? "");
    if (token.length < MIN_TOKEN_LENGTH) {
      continue;
    }

    tokens.add(token);
    appendDottedIdentifierAliases(tokens, token);
  }

  return tokens;
};

const extractCodeTokens = (markdown: string): ReadonlySet<string> => {
  const inlineSegments = [...markdown.matchAll(INLINE_CODE_PATTERN)].map(
    (match) => match[1] ?? ""
  );
  const fencedSegments = [...markdown.matchAll(CODE_FENCE_PATTERN)].map(
    (match) => match[0] ?? ""
  );

  return extractIdentifierTokens(
    [...inlineSegments, ...fencedSegments].join("\n")
  );
};

const prepareGuideDocument = (guide: GuideDocument): PreparedGuideDocument => ({
  ...guide,
  allTokens: extractIdentifierTokens(guide.markdown),
  codeTokens: extractCodeTokens(guide.markdown),
  normalizedMarkdown: normalizeLookup(guide.markdown),
});

const buildGuideDocument = async (
  url: string
): Promise<GuideDocument | null> => {
  try {
    const page = await getOfficialDocPage(
      toGuideSlugs(guideResourceNameFromUrl(url))
    );
    if (!page) {
      return null;
    }

    const resourceName = guideResourceNameFromUrl(page.url);
    return {
      breadcrumbs: page.breadcrumbs,
      description: page.description,
      githubUrl: page.githubUrl,
      markdown: page.markdown,
      resourceName,
      resourceUri: guideResourceUri(resourceName),
      title: page.title,
      url: page.url,
    };
  } catch {
    return null;
  }
};

const getAllGuideDocuments = async (): Promise<PreparedGuideDocument[]> => {
  const tree = await getOfficialDocsSectionTree().catch(() => null);
  if (!tree) {
    return [];
  }

  const urls = new Set<string>();
  collectGuidePageUrls(tree, urls);

  const guides = await Promise.allSettled(
    [...urls].map(async (url) => {
      const guide = await buildGuideDocument(url);
      return guide ? prepareGuideDocument(guide) : null;
    })
  );

  return guides
    .filter(
      (guide): guide is PromiseFulfilledResult<PreparedGuideDocument | null> =>
        guide.status === "fulfilled"
    )
    .flatMap((guide) => (guide.value ? [guide.value] : []));
};

const limitMatchedAliases = (aliases: string[]): string[] =>
  [...new Set(aliases)].slice(0, MAX_MATCHED_ALIASES);

const combineAliasScores = (...scores: AliasScore[]): AliasScore => ({
  matchedAliases: limitMatchedAliases(
    scores.flatMap((score) => score.matchedAliases)
  ),
  score: scores.reduce((total, score) => total + score.score, 0),
});

const scoreAliases = (
  tokens: ReadonlySet<string>,
  aliases: string[],
  points: number
): AliasScore => {
  const matchedAliases = aliases.filter((alias) =>
    tokens.has(normalizeLookup(alias))
  );

  return {
    matchedAliases,
    score: matchedAliases.length * points,
  };
};

const scoreSignatureMention = (
  markdown: string,
  signature: string
): AliasScore => {
  if (signature.length > 120) {
    return EMPTY_ALIAS_SCORE;
  }

  return markdown.includes(normalizeLookup(signature))
    ? {
        matchedAliases: [signature],
        score: 16,
      }
    : EMPTY_ALIAS_SCORE;
};

const scoreSimpleTypeMention = (
  guide: PreparedGuideDocument,
  simpleTypeName: string
): AliasScore => {
  if (guide.codeTokens.has(normalizeLookup(simpleTypeName))) {
    return {
      matchedAliases: [simpleTypeName],
      score: 14,
    };
  }

  if (
    simpleTypeName.length >= 6 &&
    guide.allTokens.has(normalizeLookup(simpleTypeName))
  ) {
    return {
      matchedAliases: [simpleTypeName],
      score: 3,
    };
  }

  return EMPTY_ALIAS_SCORE;
};

const scoreTypeMentions = (
  guide: PreparedGuideDocument,
  entity: ApiEntity
): AliasScore =>
  combineAliasScores(
    scoreAliases(guide.allTokens, [entity.class], 12),
    scoreSimpleTypeMention(guide, getSimpleTypeName(entity.class))
  );

const getDirectMemberAliases = (entity: ApiEntity): string[] => {
  const simpleTypeName = getSimpleTypeName(entity.class);
  const simpleMemberName = getSimpleMemberName(entity);
  const baseAliases = [
    `${simpleTypeName}.${simpleMemberName}`,
    `${entity.class}.${simpleMemberName}`,
  ];

  return entity.entityKind === "constructor" || entity.entityKind === "method"
    ? [...baseAliases, ...baseAliases.map((alias) => `${alias}()`)]
    : baseAliases;
};

const scoreMemberSpecificMentions = (
  guide: PreparedGuideDocument,
  entity: ApiEntity
): AliasScore => {
  const simpleMemberName = getSimpleMemberName(entity);
  const callableAliasScore =
    entity.entityKind === "constructor" || entity.entityKind === "method"
      ? scoreAliases(guide.codeTokens, [`${simpleMemberName}()`], 6)
      : EMPTY_ALIAS_SCORE;
  const propertyAliasScore =
    entity.entityKind === "property"
      ? scoreAliases(guide.codeTokens, [simpleMemberName], 4)
      : EMPTY_ALIAS_SCORE;

  return combineAliasScores(
    scoreAliases(guide.allTokens, getDirectMemberAliases(entity), 12),
    scoreSignatureMention(guide.normalizedMarkdown, entity.signature),
    callableAliasScore,
    propertyAliasScore
  );
};

const toGuideRelation = (
  guide: PreparedGuideDocument,
  score: AliasScore
): GuideRelation | null =>
  score.score > 0
    ? {
        guide,
        matchScore: score.score,
        matchedAliases: score.matchedAliases,
      }
    : null;

const scoreGuideForEntity = (
  guide: PreparedGuideDocument,
  entity: ApiEntity
): GuideRelation | null => {
  const score = TYPE_ENTITY_KINDS.has(entity.entityKind)
    ? scoreTypeMentions(guide, entity)
    : scoreMemberSpecificMentions(guide, entity);

  return toGuideRelation(guide, score);
};

const sortGuideRelations = (relations: GuideRelation[]): GuideRelation[] =>
  relations.toSorted((left, right) => {
    if (right.matchScore !== left.matchScore) {
      return right.matchScore - left.matchScore;
    }

    return left.guide.title.localeCompare(right.guide.title);
  });

const toRelatedGuide = (
  relation: GuideRelation,
  matchKind: "declaring_type" | "direct_symbol",
  scoreScale = 1
): RelatedGuide => ({
  breadcrumbs: relation.guide.breadcrumbs,
  description: relation.guide.description,
  githubUrl: relation.guide.githubUrl,
  matchKind,
  matchScore: Math.max(1, Math.round(relation.matchScore * scoreScale)),
  matchedAliases: relation.matchedAliases,
  resourceUri: relation.guide.resourceUri,
  title: relation.guide.title,
  url: relation.guide.url,
});

const toRelatedGuideSymbol = (
  entity: ApiEntity,
  relation: GuideRelation
): RelatedGuideSymbol => ({
  docsUrl: entity.url,
  fullName: getCanonicalFullName(entity),
  kind: entity.entityKind,
  matchScore: relation.matchScore,
  matchedAliases: relation.matchedAliases,
  resourceUri: TYPE_ENTITY_KINDS.has(entity.entityKind)
    ? `docs://type/${encodeURIComponent(entity.class)}`
    : `docs://member/${encodeURIComponent(entity.signature)}`,
  summary: entity.summary || entity.description || "No summary available.",
});

const buildTypeEntityIdByClass = (
  entities: ApiEntity[]
): ReadonlyMap<string, string> => {
  const typeEntityIdByClass = new Map<string, string>();

  for (const entity of entities) {
    if (TYPE_ENTITY_KINDS.has(entity.entityKind)) {
      typeEntityIdByClass.set(entity.class, entity.id);
    }
  }

  return typeEntityIdByClass;
};

const buildFallbackGuideRelationIndex = (
  entities: ApiEntity[]
): GuideRelationIndex => ({
  ...EMPTY_GUIDE_RELATION_INDEX,
  typeEntityIdByClass: buildTypeEntityIdByClass(entities),
});

const getTopGuideRelations = (
  guides: PreparedGuideDocument[],
  entity: ApiEntity
): GuideRelation[] =>
  sortGuideRelations(
    guides
      .map((guide) => scoreGuideForEntity(guide, entity))
      .filter((relation): relation is GuideRelation => relation !== null)
  ).slice(0, MAX_GUIDE_RELATIONS);

const appendGuideRelationSymbols = (
  relatedSymbolsByGuideName: Map<string, RelatedGuideSymbol[]>,
  entity: ApiEntity,
  relations: GuideRelation[]
): void => {
  for (const relation of relations) {
    const existing =
      relatedSymbolsByGuideName.get(relation.guide.resourceName) ?? [];
    const next = [...existing, toRelatedGuideSymbol(entity, relation)]
      .toSorted((left, right) => right.matchScore - left.matchScore)
      .slice(0, MAX_GUIDE_SYMBOLS);

    relatedSymbolsByGuideName.set(relation.guide.resourceName, next);
  }
};

const buildGuideRelationIndex = async (): Promise<GuideRelationIndex> => {
  const [guides, entities] = await Promise.all([
    getAllGuideDocuments(),
    loadApiEntities(),
  ]);
  const relatedGuidesByEntityId = new Map<string, GuideRelation[]>();
  const relatedSymbolsByGuideName = new Map<string, RelatedGuideSymbol[]>();

  for (const entity of entities) {
    const relations = getTopGuideRelations(guides, entity);
    if (relations.length === 0) {
      continue;
    }

    relatedGuidesByEntityId.set(entity.id, relations);
    appendGuideRelationSymbols(relatedSymbolsByGuideName, entity, relations);
  }

  return {
    guideNames: guides
      .map((guide) => guide.resourceName)
      .toSorted((left, right) => left.localeCompare(right)),
    relatedGuidesByEntityId,
    relatedSymbolsByGuideName,
    typeEntityIdByClass: buildTypeEntityIdByClass(entities),
  };
};

const buildGuideRelationIndexSafe = async (): Promise<GuideRelationIndex> => {
  const entities = await loadApiEntities();

  try {
    return await buildGuideRelationIndex();
  } catch {
    return buildFallbackGuideRelationIndex(entities);
  }
};

const buildCachedGuideRelationIndex = async (
  sha: string
): Promise<GuideRelationIndex> => {
  try {
    const promise = buildGuideRelationIndexSafe();
    guideRelationIndexCache.set(sha, promise);
    return await promise;
  } catch {
    guideRelationIndexCache.delete(sha);
    return EMPTY_GUIDE_RELATION_INDEX;
  }
};

const getGuideRelationIndex = async (): Promise<GuideRelationIndex> => {
  const sha = await getLatestOfficialDocsSha().catch(() => null);
  if (!sha) {
    return EMPTY_GUIDE_RELATION_INDEX;
  }

  const cached = guideRelationIndexCache.get(sha);
  if (cached) {
    return cached;
  }

  return buildCachedGuideRelationIndex(sha);
};

const mergeRelatedGuides = (
  directGuides: RelatedGuide[],
  declaringTypeGuides: RelatedGuide[],
  limit: number
): RelatedGuide[] => {
  const guidesByResourceUri = new Map<string, RelatedGuide>();

  for (const guide of [...directGuides, ...declaringTypeGuides]) {
    const existing = guidesByResourceUri.get(guide.resourceUri);
    if (!existing || guide.matchScore > existing.matchScore) {
      guidesByResourceUri.set(guide.resourceUri, guide);
    }
  }

  return [...guidesByResourceUri.values()]
    .toSorted((left, right) => {
      if (right.matchScore !== left.matchScore) {
        return right.matchScore - left.matchScore;
      }

      return left.title.localeCompare(right.title);
    })
    .slice(0, limit);
};

export const completeGuideResourceNames = async (
  prefix: string
): Promise<string[]> => {
  const index = await getGuideRelationIndex();
  const normalizedPrefix = normalizeLookup(prefix);
  const matches =
    normalizedPrefix.length === 0
      ? index.guideNames
      : index.guideNames.filter((name) =>
          normalizeLookup(name).includes(normalizedPrefix)
        );

  return matches.slice(0, GUIDE_COMPLETION_LIMIT);
};

export const getGuideRelatedSymbols = async (
  resourceName: string
): Promise<RelatedGuideSymbol[]> => {
  const index = await getGuideRelationIndex();
  return index.relatedSymbolsByGuideName.get(resourceName) ?? [];
};

export const getRelatedGuidesForEntity = async (
  entity: ApiEntity,
  limit = MAX_GUIDE_RELATIONS
): Promise<RelatedGuide[]> => {
  const index = await getGuideRelationIndex();
  const directGuides = (index.relatedGuidesByEntityId.get(entity.id) ?? []).map(
    (relation) => toRelatedGuide(relation, "direct_symbol")
  );
  if (!MEMBER_ENTITY_KINDS.has(entity.entityKind)) {
    return directGuides.slice(0, limit);
  }

  const typeEntityId = index.typeEntityIdByClass.get(entity.class);
  const declaringTypeGuides = typeEntityId
    ? (index.relatedGuidesByEntityId.get(typeEntityId) ?? []).map((relation) =>
        toRelatedGuide(relation, "declaring_type", 0.65)
      )
    : [];

  return mergeRelatedGuides(directGuides, declaringTypeGuides, limit);
};
