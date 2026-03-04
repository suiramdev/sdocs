import { apiConfig } from "@/features/api/utils/config";
import { loadApiEntities } from "@/features/api/utils/data";
import type {
  ApiEntity,
  ApiSearchRequest,
  ApiSearchResult,
} from "@/features/api/utils/schemas";

export interface ApiSearchResponse {
  query: string;
  results: ApiSearchResult[];
  source: "meilisearch" | "local-fallback";
  total: number;
}

interface MeiliHit {
  _rankingScore?: number;
  class: string;
  description: string;
  displaySignature: string;
  id: string;
  isObsolete?: boolean;
  name: string;
  namespace: string;
  obsoleteMessage?: string;
  signature: string;
  type: ApiSearchResult["type"];
  url: string;
}

const escapeFilterValue = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

const toSearchResult = (hit: {
  class: string;
  description: string;
  displaySignature: string;
  id: string;
  isObsolete?: boolean;
  name: string;
  namespace: string;
  obsoleteMessage?: string;
  score?: number;
  signature: string;
  type: ApiSearchResult["type"];
  url: string;
}): ApiSearchResult => ({
  class: hit.class,
  description: hit.description,
  displaySignature: hit.displaySignature,
  id: hit.id,
  isObsolete: hit.isObsolete,
  name: hit.name,
  namespace: hit.namespace,
  obsoleteMessage: hit.obsoleteMessage,
  score: hit.score,
  signature: hit.signature,
  type: hit.type,
  url: hit.url,
});

const buildFilter = (request: ApiSearchRequest): string[] => {
  const filters: string[] = [];

  if (request.type) {
    filters.push(`type = "${escapeFilterValue(request.type)}"`);
  }

  if (request.namespace) {
    filters.push(`namespace = "${escapeFilterValue(request.namespace)}"`);
  }

  if (request.className) {
    filters.push(`class = "${escapeFilterValue(request.className)}"`);
  }

  return filters;
};

const searchWithMeilisearch = async (request: ApiSearchRequest) => {
  const { MeiliSearch } = await import("meilisearch");
  const client = new MeiliSearch({
    apiKey: apiConfig.meilisearch.apiKey,
    host: apiConfig.meilisearch.host,
  });

  const index = client.index<MeiliHit>(apiConfig.meilisearch.indexName);
  const hasHybrid =
    apiConfig.meilisearch.enableHybrid || request.useHybrid === true;

  const hybridConfig = hasHybrid
    ? {
        embedder: "default",
        semanticRatio: apiConfig.meilisearch.defaultSemanticRatio,
      }
    : undefined;

  const searchResponse = await index.search(request.query, {
    attributesToHighlight: ["displaySignature", "description", "name"],
    attributesToRetrieve: [
      "id",
      "name",
      "type",
      "namespace",
      "class",
      "signature",
      "displaySignature",
      "description",
      "url",
      "isObsolete",
      "obsoleteMessage",
    ],
    filter: buildFilter(request),
    hybrid: hybridConfig,
    limit: request.limit,
    showRankingScore: true,
  } as never);

  const total =
    (
      searchResponse as {
        estimatedTotalHits?: number;
      }
    ).estimatedTotalHits ?? searchResponse.hits.length;

  return {
    results: searchResponse.hits.map((hit) =>
      toSearchResult({
        class: hit.class,
        description: hit.description,
        displaySignature: hit.displaySignature,
        id: hit.id,
        isObsolete: hit.isObsolete,
        name: hit.name,
        namespace: hit.namespace,
        obsoleteMessage: hit.obsoleteMessage,
        score: hit._rankingScore,
        signature: hit.signature,
        type: hit.type,
        url: hit.url,
      })
    ),
    total,
  };
};

const tokenize = (query: string): string[] =>
  query
    .toLowerCase()
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

const scoreContains = (value: string, query: string, points: number): number =>
  value.includes(query) ? points : 0;

const scoreTerms = (value: string, terms: string[], points: number): number =>
  terms.reduce((acc, term) => acc + (value.includes(term) ? points : 0), 0);

const scoreEntity = (
  entity: ApiEntity,
  query: string,
  terms: string[]
): number => {
  const className = entity.class.toLowerCase();
  const description = entity.description.toLowerCase();
  const name = entity.name.toLowerCase();
  const namespace = entity.namespace.toLowerCase();
  const signature = entity.displaySignature.toLowerCase();

  const directMatchScore =
    scoreContains(signature, query, 45) +
    scoreContains(name, query, 32) +
    scoreContains(description, query, 18) +
    scoreContains(namespace, query, 10) +
    scoreContains(className, query, 10);

  const tokenMatchScore =
    scoreTerms(name, terms, 12) +
    scoreTerms(signature, terms, 10) +
    scoreTerms(description, terms, 5) +
    scoreTerms(namespace, terms, 4) +
    scoreTerms(className, terms, 4);
  const textScore = directMatchScore + tokenMatchScore;

  if (textScore === 0) {
    return 0;
  }

  return textScore;
};

const matchesRequestFilters = (
  entity: ApiEntity,
  request: ApiSearchRequest
): boolean => {
  if (request.type && entity.type !== request.type) {
    return false;
  }

  if (request.namespace && entity.namespace !== request.namespace) {
    return false;
  }

  if (request.className && entity.class !== request.className) {
    return false;
  }

  return true;
};

const searchLocally = async (request: ApiSearchRequest) => {
  const entities = await loadApiEntities();
  const terms = tokenize(request.query);

  const ranked = entities
    .filter((entity) => matchesRequestFilters(entity, request))
    .map((entity) => ({
      entity,
      score: scoreEntity(entity, request.query, terms),
    }))
    .filter((item) => item.score > 0)
    .toSorted((a, b) => b.score - a.score);

  return {
    results: ranked.slice(0, request.limit).map((item) =>
      toSearchResult({
        class: item.entity.class,
        description: item.entity.description,
        displaySignature: item.entity.displaySignature,
        id: item.entity.id,
        isObsolete: item.entity.isObsolete,
        name: item.entity.name,
        namespace: item.entity.namespace,
        obsoleteMessage: item.entity.obsoleteMessage,
        score: item.score,
        signature: item.entity.signature,
        type: item.entity.type,
        url: item.entity.url,
      })
    ),
    total: ranked.length,
  };
};

export const searchApi = async (
  request: ApiSearchRequest
): Promise<ApiSearchResponse> => {
  try {
    const meili = await searchWithMeilisearch(request);

    return {
      query: request.query,
      results: meili.results,
      source: "meilisearch",
      total: meili.total,
    };
  } catch {
    const local = await searchLocally(request);

    return {
      query: request.query,
      results: local.results,
      source: "local-fallback",
      total: local.total,
    };
  }
};
