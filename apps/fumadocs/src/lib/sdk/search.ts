import { sdkConfig } from "@/lib/sdk/config";
import { loadSdkEntities } from "@/lib/sdk/data";
import type {
  SdkEntity,
  SdkSearchRequest,
  SdkSearchResult,
} from "@/lib/sdk/schemas";

export interface SdkSearchResponse {
  query: string;
  results: SdkSearchResult[];
  source: "meilisearch" | "local-fallback";
  total: number;
}

interface MeiliHit {
  _rankingScore?: number;
  class: string;
  description: string;
  displaySignature: string;
  id: string;
  name: string;
  namespace: string;
  signature: string;
  type: SdkSearchResult["type"];
  url: string;
}

const escapeFilterValue = (value: string): string =>
  value.replaceAll(/\\/gu, "\\\\").replaceAll(/"/gu, '\\"');

const toSearchResult = (hit: {
  class: string;
  description: string;
  displaySignature: string;
  id: string;
  name: string;
  namespace: string;
  score?: number;
  signature: string;
  type: SdkSearchResult["type"];
  url: string;
}): SdkSearchResult => ({
  class: hit.class,
  description: hit.description,
  displaySignature: hit.displaySignature,
  id: hit.id,
  name: hit.name,
  namespace: hit.namespace,
  score: hit.score,
  signature: hit.signature,
  type: hit.type,
  url: hit.url,
});

const buildFilter = (request: SdkSearchRequest): string[] => {
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

const searchWithMeilisearch = async (request: SdkSearchRequest) => {
  const { MeiliSearch } = await import("meilisearch");
  const client = new MeiliSearch({
    apiKey: sdkConfig.meilisearch.apiKey,
    host: sdkConfig.meilisearch.host,
  });

  const index = client.index<MeiliHit>(sdkConfig.meilisearch.indexName);
  const hasHybrid =
    sdkConfig.meilisearch.enableHybrid || request.useHybrid === true;

  const hybridConfig = hasHybrid
    ? {
        embedder: "default",
        semanticRatio: sdkConfig.meilisearch.defaultSemanticRatio,
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
        name: hit.name,
        namespace: hit.namespace,
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

const scoreEntity = (entity: SdkEntity, query: string, terms: string[]): number => {
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
  entity: SdkEntity,
  request: SdkSearchRequest
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

const searchLocally = async (request: SdkSearchRequest) => {
  const entities = await loadSdkEntities();
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
        name: item.entity.name,
        namespace: item.entity.namespace,
        score: item.score,
        signature: item.entity.signature,
        type: item.entity.type,
        url: item.entity.url,
      })
    ),
    total: ranked.length,
  };
};

export const searchSdk = async (
  request: SdkSearchRequest
): Promise<SdkSearchResponse> => {
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
