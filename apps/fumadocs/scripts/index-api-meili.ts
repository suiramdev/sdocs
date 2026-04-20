import { readFile } from "node:fs/promises";

import {
  buildProviderUrl,
  getMeiliEmbedderProviderConfig,
} from "@/features/api/utils/ai-provider";
import type { ApiEntity } from "@/features/api/utils/schemas";

import {
  buildIndexCacheKey,
  entitiesFile,
  getIndexScriptHash,
  hashContent,
  readApiReferenceState,
  writeApiReferenceState,
} from "./api-reference-state";

type SearchIndexDocument = Omit<ApiEntity, "examples"> & {
  examples: string[];
};

interface CliOptions {
  reset: boolean;
}

interface IndexRuntimeConfig {
  apiKey: string;
  enableHybrid: boolean;
  host: string;
  indexName: string;
  taskPollIntervalMs: number;
  taskTimeoutMs: number;
}

interface ExperimentalFeaturesResponse {
  vectorStore?: boolean;
  vectorStoreSetting?: boolean;
}

interface IndexStatsResponse {
  numberOfDocuments?: number;
}

type VectorStoreFeatureKey = "vectorStore" | "vectorStoreSetting";

interface TaskRef {
  taskUid?: number;
}

interface MeiliTaskClient {
  waitForTask: (
    uid: number,
    options?: {
      interval?: number;
      timeout?: number;
    }
  ) => Promise<unknown>;
}

interface MeiliIndexWithEmbedders {
  updateEmbedders?: (embedders: unknown) => Promise<unknown>;
}

const indexSettings = {
  displayedAttributes: [
    "id",
    "meiliId",
    "docId",
    "name",
    "type",
    "entityKind",
    "namespace",
    "class",
    "signature",
    "displaySignature",
    "description",
    "url",
    "isObsolete",
    "obsoleteMessage",
  ],
  distinctAttribute: "meiliId",
  filterableAttributes: ["type", "namespace", "class", "entityKind"],
  rankingRules: [
    "words",
    "typo",
    "proximity",
    "attribute",
    "exactness",
    "sort",
  ],
  searchableAttributes: [
    "name",
    "signature",
    "displaySignature",
    "description",
    "class",
    "namespace",
    "examples",
  ],
  sortableAttributes: ["name"],
  typoTolerance: {
    enabled: true,
    minWordSizeForTypos: {
      oneTypo: 4,
      twoTypos: 8,
    },
  },
} as const;

const DEFAULT_TASK_POLL_INTERVAL_MS = 250;
const DEFAULT_TASK_TIMEOUT_MS = 30 * 60 * 1000;

const formatDuration = (durationMs: number): string => {
  if (durationMs < 1000) {
    return `${durationMs.toFixed(0)}ms`;
  }

  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toFixed(2)}s`;
  }

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = ((durationMs % 60_000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
};

const logIndexProgress = (message: string): void => {
  process.stdout.write(`[api-index] ${message}\n`);
};

const getNonNegativeInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const parseArgs = (argv: string[]): CliOptions => ({
  reset: argv.includes("--reset"),
});

const getIndexRuntimeConfig = (): IndexRuntimeConfig => ({
  apiKey: process.env.MEILI_API_KEY ?? "",
  enableHybrid: process.env.MEILI_ENABLE_HYBRID === "true",
  host: process.env.MEILI_HOST ?? "http://127.0.0.1:7700",
  indexName: process.env.MEILI_API_INDEX_NAME ?? "api_entities",
  taskPollIntervalMs: getNonNegativeInteger(
    process.env.MEILI_TASK_POLL_INTERVAL_MS,
    DEFAULT_TASK_POLL_INTERVAL_MS
  ),
  taskTimeoutMs: getNonNegativeInteger(
    process.env.MEILI_TASK_TIMEOUT_MS,
    DEFAULT_TASK_TIMEOUT_MS
  ),
});

const buildMeiliUrl = (
  runtimeConfig: IndexRuntimeConfig,
  pathname: string
): string => new URL(pathname, runtimeConfig.host).toString();

const buildMeiliHeaders = (runtimeConfig: IndexRuntimeConfig): HeadersInit => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (runtimeConfig.apiKey.trim().length > 0) {
    headers.Authorization = `Bearer ${runtimeConfig.apiKey}`;
  }

  return headers;
};

const readJson = async <T>(filePath: string): Promise<T | null> => {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
};

const chunkDocuments = <T>(items: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
};

const waitForTask = async (
  runtimeConfig: IndexRuntimeConfig,
  taskClient: MeiliTaskClient,
  task?: TaskRef
): Promise<void> => {
  if (!task?.taskUid) {
    return;
  }

  const taskResult = (await taskClient.waitForTask(task.taskUid, {
    interval: runtimeConfig.taskPollIntervalMs,
    timeout: runtimeConfig.taskTimeoutMs,
  })) as {
    error?: {
      message?: string;
    };
    status?: string;
  };

  if (taskResult.status === "failed") {
    const message = taskResult.error?.message ?? "Meilisearch task failed";
    throw new Error(message);
  }
};

const parseJsonResponse = async <T>(response: Response): Promise<T> => {
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Meilisearch request failed (${response.status} ${response.statusText}): ${bodyText || "empty response body"}`
    );
  }

  return JSON.parse(bodyText) as T;
};

const getExperimentalFeatures = async (
  runtimeConfig: IndexRuntimeConfig
): Promise<ExperimentalFeaturesResponse> => {
  const response = await fetch(
    buildMeiliUrl(runtimeConfig, "/experimental-features/"),
    {
      headers: buildMeiliHeaders(runtimeConfig),
      method: "GET",
    }
  );

  return parseJsonResponse<ExperimentalFeaturesResponse>(response);
};

const getIndexStats = async (
  runtimeConfig: IndexRuntimeConfig
): Promise<IndexStatsResponse | null> => {
  const response = await fetch(
    buildMeiliUrl(
      runtimeConfig,
      `/indexes/${encodeURIComponent(runtimeConfig.indexName)}/stats`
    ),
    {
      headers: buildMeiliHeaders(runtimeConfig),
      method: "GET",
    }
  );

  if (response.status === 404) {
    return null;
  }

  return parseJsonResponse<IndexStatsResponse>(response);
};

const getVectorStoreFeatureKey = (
  features: ExperimentalFeaturesResponse
): VectorStoreFeatureKey => {
  if (typeof features.vectorStoreSetting === "boolean") {
    return "vectorStoreSetting";
  }

  return "vectorStore";
};

const enableVectorStoreExperimentalFeature = async (
  runtimeConfig: IndexRuntimeConfig
): Promise<void> => {
  const features = await getExperimentalFeatures(runtimeConfig);
  const vectorStoreFeatureKey = getVectorStoreFeatureKey(features);
  if (features[vectorStoreFeatureKey] === true) {
    return;
  }

  const response = await fetch(
    buildMeiliUrl(runtimeConfig, "/experimental-features/"),
    {
      body: JSON.stringify({
        [vectorStoreFeatureKey]: true,
      }),
      headers: buildMeiliHeaders(runtimeConfig),
      method: "PATCH",
    }
  );

  await parseJsonResponse<ExperimentalFeaturesResponse>(response);
};

const getDocuments = async (): Promise<SearchIndexDocument[]> => {
  const entities = await readJson<ApiEntity[]>(entitiesFile);
  if (!entities || entities.length === 0) {
    throw new Error(
      "No generated API entities found at data/api/entities/latest.json. Run api:generate first."
    );
  }

  return entities.map((entity) => ({
    ...entity,
    examples: entity.examples.map((example) => example.code),
  }));
};

const buildMeiliEmbedders = (): Record<string, unknown> | null => {
  const providerConfig = getMeiliEmbedderProviderConfig();
  if (!providerConfig.apiKey) {
    return null;
  }

  const documentTemplate =
    "Entity {{doc.name}} ({{doc.type}}) in {{doc.namespace}}. Signature: {{doc.displaySignature}}. Description: {{doc.description}}.";
  const model = process.env.MEILI_EMBEDDER_MODEL ?? "text-embedding-3-small";

  if (providerConfig.provider === "chutes") {
    if (!providerConfig.baseUrl) {
      return null;
    }

    return {
      default: {
        apiKey: providerConfig.apiKey,
        documentTemplate,
        request: {
          input: ["{{text}}", "{{..}}"],
          model,
        },
        response: {
          data: [
            {
              embedding: "{{embedding}}",
            },
            "{{..}}",
          ],
        },
        source: "rest",
        url: buildProviderUrl(providerConfig.baseUrl, "embeddings"),
      },
    };
  }

  return {
    default: {
      apiKey: providerConfig.apiKey,
      documentTemplate,
      model,
      source: "openAi",
    },
  };
};

const buildIndexFingerprint = async (
  runtimeConfig: IndexRuntimeConfig
): Promise<string> => {
  const providerConfig = getMeiliEmbedderProviderConfig();
  const indexScriptHash = await getIndexScriptHash();

  return hashContent(
    JSON.stringify({
      embeddersEnabled:
        runtimeConfig.enableHybrid &&
        providerConfig.apiKey !== null &&
        providerConfig.baseUrl !== null,
      indexScriptHash,
      indexSettings,
      model: process.env.MEILI_EMBEDDER_MODEL ?? "text-embedding-3-small",
      provider: providerConfig.provider,
      providerBaseUrl: providerConfig.baseUrl,
      runtimeHybridEnabled: runtimeConfig.enableHybrid,
    })
  );
};

const resetIndexIfRequested = async (
  runtimeConfig: IndexRuntimeConfig,
  taskClient: MeiliTaskClient,
  index: {
    deleteAllDocuments: () => Promise<unknown>;
  },
  reset: boolean
): Promise<void> => {
  if (!reset) {
    return;
  }

  await waitForTask(
    runtimeConfig,
    taskClient,
    (await index.deleteAllDocuments()) as TaskRef
  );
};

const applyIndexSettings = async (
  runtimeConfig: IndexRuntimeConfig,
  taskClient: MeiliTaskClient,
  index: {
    updateSettings: (settings: unknown) => Promise<unknown>;
  }
): Promise<void> => {
  await waitForTask(
    runtimeConfig,
    taskClient,
    (await index.updateSettings(indexSettings)) as TaskRef
  );
};

const applyEmbeddersIfEnabled = async (
  runtimeConfig: IndexRuntimeConfig,
  taskClient: MeiliTaskClient,
  index: MeiliIndexWithEmbedders,
  enabled: boolean
): Promise<void> => {
  if (!enabled) {
    return;
  }

  const embedders = buildMeiliEmbedders();
  if (!embedders || typeof index.updateEmbedders !== "function") {
    return;
  }

  await enableVectorStoreExperimentalFeature(runtimeConfig);

  await waitForTask(
    runtimeConfig,
    taskClient,
    (await index.updateEmbedders(embedders)) as TaskRef
  );
};

const indexDocuments = async (
  runtimeConfig: IndexRuntimeConfig,
  taskClient: MeiliTaskClient,
  index: {
    addDocuments: (
      documents: SearchIndexDocument[],
      options: { primaryKey: string }
    ) => Promise<unknown>;
  },
  documents: SearchIndexDocument[]
): Promise<void> => {
  const chunks = chunkDocuments(documents, 1000);
  const indexingStart = performance.now();

  logIndexProgress(
    `indexing ${documents.length} documents in ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}`
  );

  for (const [chunkIndex, chunk] of chunks.entries()) {
    const chunkStart = performance.now();
    logIndexProgress(
      `chunk ${chunkIndex + 1}/${chunks.length}: sending ${chunk.length} document${chunk.length === 1 ? "" : "s"}`
    );
    await waitForTask(
      runtimeConfig,
      taskClient,
      (await index.addDocuments(chunk, { primaryKey: "meiliId" })) as TaskRef
    );

    logIndexProgress(
      `chunk ${chunkIndex + 1}/${chunks.length}: indexed ${chunk.length} document${chunk.length === 1 ? "" : "s"} in ${formatDuration(
        performance.now() - chunkStart
      )}; elapsed ${formatDuration(performance.now() - indexingStart)}`
    );
  }
};

const importMeiliSearchClient = async (runtimeConfig: IndexRuntimeConfig) => {
  const { Meilisearch } = await import("meilisearch");

  return new Meilisearch({
    apiKey: runtimeConfig.apiKey,
    host: runtimeConfig.host,
  });
};

const createClientAndIndex = async (
  runtimeConfig: IndexRuntimeConfig
): Promise<{
  client: Awaited<ReturnType<typeof importMeiliSearchClient>>;
  index: ReturnType<
    Awaited<ReturnType<typeof importMeiliSearchClient>>["index"]
  >;
}> => {
  const client = await importMeiliSearchClient(runtimeConfig);

  return {
    client,
    index: client.index<SearchIndexDocument>(runtimeConfig.indexName),
  };
};

const writeSummary = (
  runtimeConfig: IndexRuntimeConfig,
  documents: SearchIndexDocument[],
  skipped: boolean
): void => {
  process.stdout.write(
    `${JSON.stringify({
      documents: documents.length,
      host: runtimeConfig.host,
      hybrid: runtimeConfig.enableHybrid,
      index: runtimeConfig.indexName,
      skipped,
      source: entitiesFile,
    })}\n`
  );
};

const getExpectedIndexCacheKey = async (
  runtimeConfig: IndexRuntimeConfig,
  documentsHash: string
): Promise<string> => {
  const indexFingerprint = await buildIndexFingerprint(runtimeConfig);

  return buildIndexCacheKey({
    documentsHash,
    enableHybrid: runtimeConfig.enableHybrid,
    indexFingerprint,
    indexName: runtimeConfig.indexName,
  });
};

const isIndexStateCurrent = (input: {
  documentsHash: string;
  documentsLength: number;
  expectedCacheKey: string;
  indexStats: IndexStatsResponse | null;
  runtimeConfig: IndexRuntimeConfig;
  state: Awaited<ReturnType<typeof readApiReferenceState>>;
}): boolean => {
  const currentGeneration = input.state?.generation;
  const currentIndexing = input.state?.indexing;

  return (
    currentIndexing?.cacheKey === input.expectedCacheKey &&
    currentIndexing.documentsCount === input.documentsLength &&
    currentIndexing.indexName === input.runtimeConfig.indexName &&
    input.indexStats?.numberOfDocuments === input.documentsLength &&
    (!currentGeneration?.entitiesHash ||
      currentGeneration.entitiesHash === input.documentsHash)
  );
};

const shouldSkipIndexing = async (
  runtimeConfig: IndexRuntimeConfig,
  documents: SearchIndexDocument[],
  documentsHash: string
): Promise<boolean> => {
  const state = await readApiReferenceState();
  const indexStats = await getIndexStats(runtimeConfig);
  const expectedCacheKey = await getExpectedIndexCacheKey(
    runtimeConfig,
    documentsHash
  );

  return isIndexStateCurrent({
    documentsHash,
    documentsLength: documents.length,
    expectedCacheKey,
    indexStats,
    runtimeConfig,
    state,
  });
};

const updateIndexingState = async (
  runtimeConfig: IndexRuntimeConfig,
  documents: SearchIndexDocument[],
  documentsHash: string
): Promise<void> => {
  const currentState = await readApiReferenceState();

  await writeApiReferenceState({
    generation: currentState?.generation,
    indexing: {
      cacheKey: await getExpectedIndexCacheKey(runtimeConfig, documentsHash),
      documentsCount: documents.length,
      enableHybrid: runtimeConfig.enableHybrid,
      indexName: runtimeConfig.indexName,
      indexedAt: new Date().toISOString(),
    },
    schemaVersion: 1,
    source: currentState?.source,
  });
};

const getShouldResetIndex = (
  options: CliOptions,
  indexStats: IndexStatsResponse | null
): boolean =>
  (options.reset && indexStats !== null) ||
  (indexStats?.numberOfDocuments ?? 0) > 0;

const logReindexStart = (
  runtimeConfig: IndexRuntimeConfig,
  documents: SearchIndexDocument[]
): void => {
  logIndexProgress(
    `reindex started for ${documents.length} documents on ${runtimeConfig.indexName}`
  );
};

const logReindexCompleted = (startedAt: number): void => {
  logIndexProgress(
    `reindex completed in ${formatDuration(performance.now() - startedAt)}`
  );
};

const logResetState = (shouldReset: boolean): void => {
  logIndexProgress(
    shouldReset ? "existing index contents cleared" : "index reset skipped"
  );
};

const applyIndexConfiguration = async (
  runtimeConfig: IndexRuntimeConfig,
  taskClient: MeiliTaskClient,
  index: ReturnType<
    Awaited<ReturnType<typeof importMeiliSearchClient>>["index"]
  >,
  embedderIndex: MeiliIndexWithEmbedders
): Promise<void> => {
  await applyIndexSettings(
    runtimeConfig,
    taskClient,
    index as unknown as {
      updateSettings: (settings: unknown) => Promise<unknown>;
    }
  );
  logIndexProgress("index settings applied");
  await applyEmbeddersIfEnabled(
    runtimeConfig,
    taskClient,
    embedderIndex,
    runtimeConfig.enableHybrid
  );
  if (runtimeConfig.enableHybrid) {
    logIndexProgress("embedder configuration applied");
  }
};

const createReindexSession = async (
  runtimeConfig: IndexRuntimeConfig,
  options: CliOptions
): Promise<{
  client: Awaited<ReturnType<typeof importMeiliSearchClient>>;
  embedderIndex: MeiliIndexWithEmbedders;
  index: ReturnType<
    Awaited<ReturnType<typeof importMeiliSearchClient>>["index"]
  >;
  shouldReset: boolean;
}> => {
  const { client, index } = await createClientAndIndex(runtimeConfig);
  const indexStats = await getIndexStats(runtimeConfig);

  return {
    client,
    embedderIndex: index as unknown as MeiliIndexWithEmbedders,
    index,
    shouldReset: getShouldResetIndex(options, indexStats),
  };
};

const reindexDocuments = async (
  runtimeConfig: IndexRuntimeConfig,
  options: CliOptions,
  documents: SearchIndexDocument[],
  documentsHash: string
): Promise<void> => {
  const reindexStart = performance.now();
  const { client, embedderIndex, index, shouldReset } =
    await createReindexSession(runtimeConfig, options);

  logReindexStart(runtimeConfig, documents);
  await resetIndexIfRequested(runtimeConfig, client.tasks, index, shouldReset);
  logResetState(shouldReset);
  await applyIndexConfiguration(
    runtimeConfig,
    client.tasks,
    index,
    embedderIndex
  );
  await indexDocuments(runtimeConfig, client.tasks, index, documents);
  await updateIndexingState(runtimeConfig, documents, documentsHash);
  logReindexCompleted(reindexStart);
  writeSummary(runtimeConfig, documents, false);
};

const loadDocumentsForIndexing = async (
  runtimeConfig: IndexRuntimeConfig
): Promise<SearchIndexDocument[]> => {
  logIndexProgress(
    `loading documents from ${entitiesFile} for index ${runtimeConfig.indexName}`
  );
  const documents = await getDocuments();
  logIndexProgress(`loaded ${documents.length} documents`);
  return documents;
};

const shouldSkipCurrentRun = (input: {
  documents: SearchIndexDocument[];
  documentsHash: string;
  options: CliOptions;
  runtimeConfig: IndexRuntimeConfig;
}): Promise<boolean> => {
  if (input.options.reset) {
    return Promise.resolve(false);
  }

  return shouldSkipIndexing(
    input.runtimeConfig,
    input.documents,
    input.documentsHash
  );
};

const writeSkipSummary = (
  runtimeConfig: IndexRuntimeConfig,
  documents: SearchIndexDocument[]
): void => {
  process.stdout.write(
    `Meilisearch index ${runtimeConfig.indexName} is already current for ${documents.length} documents. Skipping reindex.\n`
  );
  writeSummary(runtimeConfig, documents, true);
};

const logRunCompleted = (startedAt: number): void => {
  logIndexProgress(
    `api index run finished in ${formatDuration(performance.now() - startedAt)}`
  );
};

const run = async (): Promise<void> => {
  const runStart = performance.now();
  const options = parseArgs(process.argv.slice(2));
  const runtimeConfig = getIndexRuntimeConfig();
  const documents = await loadDocumentsForIndexing(runtimeConfig);
  const documentsHash = hashContent(JSON.stringify(documents));

  if (
    await shouldSkipCurrentRun({
      documents,
      documentsHash,
      options,
      runtimeConfig,
    })
  ) {
    writeSkipSummary(runtimeConfig, documents);
    return;
  }

  await reindexDocuments(runtimeConfig, options, documents, documentsHash);
  logRunCompleted(runStart);
};

const main = async (): Promise<void> => {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    process.stderr.write(`Meilisearch indexing failed: ${message}\n`);
    process.exit(1);
  }
};

await main();
