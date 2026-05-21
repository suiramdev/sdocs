import { loadApiEntities } from "@/features/api/utils/data";
import type { ApiEntity, ApiEntityKind } from "@/features/api/utils/schemas";
import {
  completeTutorialResourceNames,
  getAllTutorialDocPages,
  getLatestTutorialDocsSha,
} from "@/features/learn-docs/utils/source";
import type { TutorialDocPage } from "@/features/learn-docs/utils/source";
import {
  getOfficialDocPage,
  OFFICIAL_DOCS_FOLDER_URL,
} from "@/features/official-docs/utils/source";

const GUIDE_RESOURCE_INDEX_NAME = "index";
const GUIDE_RESOURCE_PREFIX = "docs://guide/";
const MAX_MATCHED_ALIASES = 8;
const MAX_RELATED_GUIDES = 8;
const MAX_RELATED_SYMBOLS = 20;
const MAX_RELATED_TUTORIALS = 8;
const MIN_TOKEN_LENGTH = 3;
const IDENTIFIER_TOKEN_PATTERN =
  /[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\(\))?)*/gu;
const INLINE_CODE_PATTERN = /`([^`\n]+)`/gu;
const CODE_FENCE_PATTERN = /```[\s\S]*?```/gu;
const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\(([^)]+)\)/gu;
const AUTOLINK_PATTERN = /<((?:https?:\/\/|\/)[^>\s]+)>/gu;
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

export interface RelatedTutorial {
  author?: string;
  difficulty?: string;
  githubUrl: string;
  matchKind: "declaring_type" | "direct_symbol" | "guide_reference";
  matchScore: number;
  matchedAliases: string[];
  resourceUri: string;
  summary?: string;
  tags: string[];
  title: string;
  topic?: string;
  url: string;
}

export interface RelatedTutorialGuide {
  breadcrumbs: string[];
  description?: string;
  githubUrl: string;
  matchScore: number;
  matchedUrls: string[];
  resourceUri: string;
  title: string;
  url: string;
}

export interface RelatedTutorialSymbol {
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

interface GuideRelation {
  matchScore: number;
  matchedUrls: string[];
  resourceName: string;
}

interface PreparedTutorialDocument extends TutorialDocPage {
  allTokens: ReadonlySet<string>;
  apiUrlTokens: ReadonlySet<string>;
  codeTokens: ReadonlySet<string>;
  guideLinks: readonly string[];
  normalizedMarkdown: string;
}

interface TutorialRelation {
  matchScore: number;
  matchedAliases: string[];
  tutorial: PreparedTutorialDocument;
}

interface TutorialRelationIndex {
  relatedGuidesByTutorialSlug: ReadonlyMap<string, GuideRelation[]>;
  relatedSymbolsByTutorialSlug: ReadonlyMap<string, RelatedTutorialSymbol[]>;
  relatedTutorialsByEntityId: ReadonlyMap<string, TutorialRelation[]>;
  relatedTutorialsByGuideResourceName: ReadonlyMap<string, TutorialRelation[]>;
  tutorialSlugs: readonly string[];
  typeEntityIdByClass: ReadonlyMap<string, string>;
}

const tutorialRelationIndexCache = new Map<
  string,
  Promise<TutorialRelationIndex>
>();

const EMPTY_ALIAS_SCORE: AliasScore = {
  matchedAliases: [],
  score: 0,
};

const EMPTY_TUTORIAL_RELATION_INDEX: TutorialRelationIndex = {
  relatedGuidesByTutorialSlug: new Map(),
  relatedSymbolsByTutorialSlug: new Map(),
  relatedTutorialsByEntityId: new Map(),
  relatedTutorialsByGuideResourceName: new Map(),
  tutorialSlugs: [],
  typeEntityIdByClass: new Map(),
};

const normalizeLookup = (value: string): string => value.trim().toLowerCase();

const stripCallableSuffix = (value: string): string =>
  value.endsWith("()") ? value.slice(0, -2) : value;

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

const limitMatchedAliases = (aliases: string[]): string[] =>
  [...new Set(aliases)].slice(0, MAX_MATCHED_ALIASES);

const combineAliasScores = (...scores: AliasScore[]): AliasScore => ({
  matchedAliases: limitMatchedAliases(
    scores.flatMap((score) => score.matchedAliases)
  ),
  score: scores.reduce((total, score) => total + score.score, 0),
});

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

const guideResourceUri = (resourceName: string): string =>
  `${GUIDE_RESOURCE_PREFIX}${resourceName}`;

const guideResourceNameFromUrl = (url: string): string | null => {
  const normalizedUrl = url.trim();
  if (normalizedUrl.length === 0) {
    return null;
  }

  const prefixes = [
    "https://sbox.game/dev/doc/",
    "https://sbox.facepunch.com/docs/",
    `${OFFICIAL_DOCS_FOLDER_URL}/`,
    `${OFFICIAL_DOCS_FOLDER_URL}`,
    "/dev/doc/",
  ];

  for (const prefix of prefixes) {
    if (normalizedUrl.startsWith(prefix)) {
      const relativePath = normalizedUrl
        .slice(prefix.length)
        .replace(/[#?].*$/u, "")
        .replaceAll(/^\/+|\/+$/gu, "");

      return relativePath.length > 0 ? relativePath : GUIDE_RESOURCE_INDEX_NAME;
    }
  }

  return null;
};

const extractLinkedUrls = (markdown: string): string[] =>
  [
    ...[...markdown.matchAll(MARKDOWN_LINK_PATTERN)].map((match) => match[1]),
    ...[...markdown.matchAll(AUTOLINK_PATTERN)].map((match) => match[1]),
  ]
    .flatMap((value) => (typeof value === "string" ? [value.trim()] : []))
    .filter((value) => value.length > 0);

const extractGuideLinks = (markdown: string): string[] => [
  ...new Set(
    extractLinkedUrls(markdown).flatMap((url) => {
      const resourceName = guideResourceNameFromUrl(url);
      return resourceName ? [resourceName] : [];
    })
  ),
];

const toSboxUrl = (urlText: string): URL | null => {
  try {
    return urlText.startsWith("/")
      ? new URL(`https://sbox.game${urlText}`)
      : new URL(urlText);
  } catch {
    return null;
  }
};

const getApiUrlSegments = (url: URL): string[] => {
  if (url.hostname !== "sbox.game" || !url.pathname.startsWith("/api/")) {
    return [];
  }

  return url.pathname
    .replace(/^\/api\//u, "")
    .split("/")
    .map((segment) => decodeURIComponent(segment).trim())
    .filter((segment) => segment.length > 0);
};

const addTypeTokens = (tokens: Set<string>, typeName: string): void => {
  tokens.add(normalizeLookup(typeName));
  tokens.add(normalizeLookup(getSimpleTypeName(typeName)));
};

const addApiUrlTokens = (tokens: Set<string>, url: URL): void => {
  const segments = getApiUrlSegments(url);
  const [typeName, memberName] = segments;
  if (!typeName) {
    return;
  }

  addTypeTokens(tokens, typeName);
  if (!memberName) {
    return;
  }

  tokens.add(normalizeLookup(memberName));
  tokens.add(normalizeLookup(`${typeName}.${memberName}`));
};

const extractApiUrlTokens = (markdown: string): ReadonlySet<string> => {
  const tokens = new Set<string>();

  for (const urlText of extractLinkedUrls(markdown)) {
    const url = toSboxUrl(urlText);
    if (!url) {
      continue;
    }

    addApiUrlTokens(tokens, url);
  }

  return tokens;
};

const prepareTutorialDocument = (
  tutorial: TutorialDocPage
): PreparedTutorialDocument => ({
  ...tutorial,
  allTokens: extractIdentifierTokens(tutorial.markdown),
  apiUrlTokens: extractApiUrlTokens(tutorial.markdown),
  codeTokens: extractCodeTokens(tutorial.markdown),
  guideLinks: extractGuideLinks(tutorial.markdown),
  normalizedMarkdown: normalizeLookup(tutorial.markdown),
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
  tutorial: PreparedTutorialDocument,
  simpleTypeName: string
): AliasScore => {
  if (tutorial.codeTokens.has(normalizeLookup(simpleTypeName))) {
    return {
      matchedAliases: [simpleTypeName],
      score: 14,
    };
  }

  if (
    simpleTypeName.length >= 6 &&
    tutorial.allTokens.has(normalizeLookup(simpleTypeName))
  ) {
    return {
      matchedAliases: [simpleTypeName],
      score: 3,
    };
  }

  return EMPTY_ALIAS_SCORE;
};

const scoreApiUrlMention = (
  tutorial: PreparedTutorialDocument,
  aliases: string[]
): AliasScore => scoreAliases(tutorial.apiUrlTokens, aliases, 24);

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

const scoreTypeMentions = (
  tutorial: PreparedTutorialDocument,
  entity: ApiEntity
): AliasScore =>
  combineAliasScores(
    scoreAliases(tutorial.allTokens, [entity.class], 12),
    scoreSimpleTypeMention(tutorial, getSimpleTypeName(entity.class)),
    scoreApiUrlMention(tutorial, [
      entity.class,
      getSimpleTypeName(entity.class),
    ])
  );

const scoreMemberSpecificMentions = (
  tutorial: PreparedTutorialDocument,
  entity: ApiEntity
): AliasScore => {
  const simpleMemberName = getSimpleMemberName(entity);
  const callableAliasScore =
    entity.entityKind === "constructor" || entity.entityKind === "method"
      ? scoreAliases(tutorial.codeTokens, [`${simpleMemberName}()`], 6)
      : EMPTY_ALIAS_SCORE;
  const propertyAliasScore =
    entity.entityKind === "property"
      ? scoreAliases(tutorial.codeTokens, [simpleMemberName], 4)
      : EMPTY_ALIAS_SCORE;

  return combineAliasScores(
    scoreAliases(tutorial.allTokens, getDirectMemberAliases(entity), 12),
    scoreSignatureMention(tutorial.normalizedMarkdown, entity.signature),
    callableAliasScore,
    propertyAliasScore,
    scoreApiUrlMention(tutorial, getDirectMemberAliases(entity))
  );
};

const scoreTutorialForEntity = (
  tutorial: PreparedTutorialDocument,
  entity: ApiEntity
): TutorialRelation | null => {
  const score = TYPE_ENTITY_KINDS.has(entity.entityKind)
    ? scoreTypeMentions(tutorial, entity)
    : scoreMemberSpecificMentions(tutorial, entity);

  return score.score > 0
    ? {
        matchScore: score.score,
        matchedAliases: score.matchedAliases,
        tutorial,
      }
    : null;
};

const toRelatedTutorial = (
  relation: TutorialRelation,
  matchKind: RelatedTutorial["matchKind"],
  scoreScale = 1
): RelatedTutorial => ({
  author: relation.tutorial.author,
  difficulty: relation.tutorial.difficulty,
  githubUrl: relation.tutorial.githubUrl,
  matchKind,
  matchScore: Math.max(1, Math.round(relation.matchScore * scoreScale)),
  matchedAliases: relation.matchedAliases,
  resourceUri: relation.tutorial.resourceUri,
  summary: relation.tutorial.summary,
  tags: relation.tutorial.tags,
  title: relation.tutorial.title,
  topic: relation.tutorial.topic,
  url: relation.tutorial.url,
});

const toRelatedTutorialSymbol = (
  entity: ApiEntity,
  relation: TutorialRelation
): RelatedTutorialSymbol => ({
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

const appendTutorialRelationSymbols = (
  relatedSymbolsByTutorialSlug: Map<string, RelatedTutorialSymbol[]>,
  entity: ApiEntity,
  relations: TutorialRelation[]
): void => {
  for (const relation of relations) {
    const existing =
      relatedSymbolsByTutorialSlug.get(relation.tutorial.slug) ?? [];
    const next = [...existing, toRelatedTutorialSymbol(entity, relation)]
      .toSorted((left, right) => right.matchScore - left.matchScore)
      .slice(0, MAX_RELATED_SYMBOLS);

    relatedSymbolsByTutorialSlug.set(relation.tutorial.slug, next);
  }
};

const appendGuideTutorialRelation = (
  relatedTutorialsByGuideResourceName: Map<string, TutorialRelation[]>,
  resourceName: string,
  tutorial: PreparedTutorialDocument
): void => {
  const existing = relatedTutorialsByGuideResourceName.get(resourceName) ?? [];
  const next = [
    ...existing,
    {
      matchScore: 30,
      matchedAliases: [resourceName],
      tutorial,
    },
  ]
    .toSorted((left, right) => right.matchScore - left.matchScore)
    .slice(0, MAX_RELATED_TUTORIALS);

  relatedTutorialsByGuideResourceName.set(resourceName, next);
};

const buildGuideRelations = async (
  tutorial: PreparedTutorialDocument
): Promise<GuideRelation[]> => {
  const relations = await Promise.all(
    tutorial.guideLinks.map(async (resourceName) => {
      const page = await getOfficialDocPage(
        resourceName === GUIDE_RESOURCE_INDEX_NAME
          ? []
          : resourceName.split("/").filter((segment) => segment.length > 0)
      );

      if (!page) {
        return null;
      }

      return {
        matchScore: 30,
        matchedUrls: [resourceName],
        resourceName,
      } satisfies GuideRelation;
    })
  );

  return relations
    .filter((relation): relation is GuideRelation => relation !== null)
    .slice(0, MAX_RELATED_GUIDES);
};

const buildGuideTutorialMaps = async (
  tutorials: PreparedTutorialDocument[]
): Promise<{
  relatedGuidesByTutorialSlug: Map<string, GuideRelation[]>;
  relatedTutorialsByGuideResourceName: Map<string, TutorialRelation[]>;
}> => {
  const relatedGuidesByTutorialSlug = new Map<string, GuideRelation[]>();
  const relatedTutorialsByGuideResourceName = new Map<
    string,
    TutorialRelation[]
  >();

  for (const tutorial of tutorials) {
    const guideRelations = await buildGuideRelations(tutorial);
    if (guideRelations.length === 0) {
      continue;
    }

    relatedGuidesByTutorialSlug.set(tutorial.slug, guideRelations);
    for (const relation of guideRelations) {
      appendGuideTutorialRelation(
        relatedTutorialsByGuideResourceName,
        relation.resourceName,
        tutorial
      );
    }
  }

  return {
    relatedGuidesByTutorialSlug,
    relatedTutorialsByGuideResourceName,
  };
};

const buildEntityTutorialMaps = (
  tutorials: PreparedTutorialDocument[],
  entities: ApiEntity[]
): {
  relatedSymbolsByTutorialSlug: Map<string, RelatedTutorialSymbol[]>;
  relatedTutorialsByEntityId: Map<string, TutorialRelation[]>;
} => {
  const relatedSymbolsByTutorialSlug = new Map<
    string,
    RelatedTutorialSymbol[]
  >();
  const relatedTutorialsByEntityId = new Map<string, TutorialRelation[]>();

  for (const entity of entities) {
    const relations = tutorials
      .map((tutorial) => scoreTutorialForEntity(tutorial, entity))
      .filter((relation): relation is TutorialRelation => relation !== null)
      .toSorted((left, right) => right.matchScore - left.matchScore)
      .slice(0, MAX_RELATED_TUTORIALS);

    if (relations.length === 0) {
      continue;
    }

    relatedTutorialsByEntityId.set(entity.id, relations);
    appendTutorialRelationSymbols(
      relatedSymbolsByTutorialSlug,
      entity,
      relations
    );
  }

  return {
    relatedSymbolsByTutorialSlug,
    relatedTutorialsByEntityId,
  };
};

const buildTutorialRelationIndex = async (): Promise<TutorialRelationIndex> => {
  const [tutorials, entities] = await Promise.all([
    getAllTutorialDocPages(),
    loadApiEntities(),
  ]);
  const preparedTutorials = tutorials.map(prepareTutorialDocument);
  const { relatedGuidesByTutorialSlug, relatedTutorialsByGuideResourceName } =
    await buildGuideTutorialMaps(preparedTutorials);
  const { relatedSymbolsByTutorialSlug, relatedTutorialsByEntityId } =
    buildEntityTutorialMaps(preparedTutorials, entities);

  return {
    relatedGuidesByTutorialSlug,
    relatedSymbolsByTutorialSlug,
    relatedTutorialsByEntityId,
    relatedTutorialsByGuideResourceName,
    tutorialSlugs: preparedTutorials
      .map((tutorial) => tutorial.slug)
      .toSorted((left, right) => left.localeCompare(right)),
    typeEntityIdByClass: buildTypeEntityIdByClass(entities),
  };
};

const getTutorialRelationIndex = async (): Promise<TutorialRelationIndex> => {
  const sha = await getLatestTutorialDocsSha().catch(() => null);
  if (!sha) {
    return EMPTY_TUTORIAL_RELATION_INDEX;
  }

  const cached = tutorialRelationIndexCache.get(sha);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    try {
      return await buildTutorialRelationIndex();
    } catch {
      return EMPTY_TUTORIAL_RELATION_INDEX;
    }
  })();
  tutorialRelationIndexCache.set(sha, promise);
  return promise;
};

const mergeRelatedTutorials = (
  directTutorials: RelatedTutorial[],
  declaringTypeTutorials: RelatedTutorial[],
  limit: number
): RelatedTutorial[] => {
  const tutorialsByResourceUri = new Map<string, RelatedTutorial>();

  for (const tutorial of [...directTutorials, ...declaringTypeTutorials]) {
    const existing = tutorialsByResourceUri.get(tutorial.resourceUri);
    if (!existing || tutorial.matchScore > existing.matchScore) {
      tutorialsByResourceUri.set(tutorial.resourceUri, tutorial);
    }
  }

  return [...tutorialsByResourceUri.values()]
    .toSorted((left, right) => {
      if (right.matchScore !== left.matchScore) {
        return right.matchScore - left.matchScore;
      }

      return left.title.localeCompare(right.title);
    })
    .slice(0, limit);
};

export const completeTutorialDocumentationResourceNames =
  completeTutorialResourceNames;

export const getTutorialRelatedSymbols = async (
  slug: string
): Promise<RelatedTutorialSymbol[]> => {
  const index = await getTutorialRelationIndex();
  return index.relatedSymbolsByTutorialSlug.get(slug) ?? [];
};

export const getTutorialRelatedGuides = async (
  slug: string
): Promise<RelatedTutorialGuide[]> => {
  const index = await getTutorialRelationIndex();
  const relations = index.relatedGuidesByTutorialSlug.get(slug) ?? [];

  const guides = await Promise.all(
    relations.map(async (relation) => {
      const page = await getOfficialDocPage(
        relation.resourceName === GUIDE_RESOURCE_INDEX_NAME
          ? []
          : relation.resourceName
              .split("/")
              .filter((segment) => segment.length > 0)
      );
      if (!page) {
        return null;
      }

      return {
        breadcrumbs: page.breadcrumbs,
        description: page.description,
        githubUrl: page.githubUrl,
        matchScore: relation.matchScore,
        matchedUrls: relation.matchedUrls,
        resourceUri: guideResourceUri(relation.resourceName),
        title: page.title,
        url: page.url,
      } satisfies RelatedTutorialGuide;
    })
  );

  return guides.flatMap((guide) => (guide ? [guide] : []));
};

export const getGuideRelatedTutorials = async (
  resourceName: string,
  limit = MAX_RELATED_TUTORIALS
): Promise<RelatedTutorial[]> => {
  const index = await getTutorialRelationIndex();

  return (index.relatedTutorialsByGuideResourceName.get(resourceName) ?? [])
    .map((relation) => toRelatedTutorial(relation, "guide_reference"))
    .slice(0, limit);
};

export const getRelatedTutorialsForEntity = async (
  entity: ApiEntity,
  limit = MAX_RELATED_TUTORIALS
): Promise<RelatedTutorial[]> => {
  const index = await getTutorialRelationIndex();
  const directTutorials = (
    index.relatedTutorialsByEntityId.get(entity.id) ?? []
  ).map((relation) => toRelatedTutorial(relation, "direct_symbol"));

  if (!MEMBER_ENTITY_KINDS.has(entity.entityKind)) {
    return directTutorials.slice(0, limit);
  }

  const typeEntityId = index.typeEntityIdByClass.get(entity.class);
  const declaringTypeTutorials = typeEntityId
    ? (index.relatedTutorialsByEntityId.get(typeEntityId) ?? []).map(
        (relation) => toRelatedTutorial(relation, "declaring_type", 0.65)
      )
    : [];

  return mergeRelatedTutorials(directTutorials, declaringTypeTutorials, limit);
};
