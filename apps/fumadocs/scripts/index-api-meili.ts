import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildProviderUrl,
  getMeiliEmbedderProviderConfig,
} from "@/features/api/utils/ai-provider";
import type { ApiEntity } from "@/features/api/utils/schemas";

interface CliOptions {
  reset: boolean;
}

interface IndexRuntimeConfig {
  apiKey: string;
  enableHybrid: boolean;
  host: string;
  indexName: string;
}

interface ExperimentalFeaturesResponse {
  vectorStore?: boolean;
  vectorStoreSetting?: boolean;
}

type VectorStoreFeatureKey = "vectorStore" | "vectorStoreSetting";

interface TaskRef {
  taskUid?: number;
}

interface MeiliTaskClient {
  waitForTask: (uid: number) => Promise<unknown>;
}

interface MeiliIndexWithEmbedders {
  updateEmbedders?: (embedders: unknown) => Promise<unknown>;
}

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const entitiesFile = path.join(
  projectRoot,
  "data",
  "api",
  "entities",
  "latest.json"
);

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

const parseArgs = (argv: string[]): CliOptions => ({
  reset: argv.includes("--reset"),
});

const getIndexRuntimeConfig = (): IndexRuntimeConfig => ({
  apiKey: process.env.MEILI_API_KEY ?? "",
  enableHybrid: process.env.MEILI_ENABLE_HYBRID === "true",
  host: process.env.MEILI_HOST ?? "http://127.0.0.1:7700",
  indexName: process.env.MEILI_API_INDEX_NAME ?? "api_entities",
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
  taskClient: MeiliTaskClient,
  task?: TaskRef
): Promise<void> => {
  if (!task?.taskUid) {
    return;
  }

  const taskResult = (await taskClient.waitForTask(task.taskUid)) as {
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

const getDocuments = async (): Promise<ApiEntity[]> => {
  const documents = await readJson<ApiEntity[]>(entitiesFile);
  if (!documents || documents.length === 0) {
    throw new Error(
      "No generated API entities found at data/api/entities/latest.json. Run api:generate first."
    );
  }

  return documents;
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

const resetIndexIfRequested = async (
  taskClient: MeiliTaskClient,
  index: {
    deleteAllDocuments: () => Promise<unknown>;
  },
  options: CliOptions
): Promise<void> => {
  if (!options.reset) {
    return;
  }

  await waitForTask(taskClient, (await index.deleteAllDocuments()) as TaskRef);
};

const applyIndexSettings = async (
  taskClient: MeiliTaskClient,
  index: {
    updateSettings: (settings: unknown) => Promise<unknown>;
  }
): Promise<void> => {
  await waitForTask(
    taskClient,
    (await index.updateSettings(indexSettings)) as TaskRef
  );
};

const applyEmbeddersIfEnabled = async (
  taskClient: MeiliTaskClient,
  index: MeiliIndexWithEmbedders,
  runtimeConfig: IndexRuntimeConfig,
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
    taskClient,
    (await index.updateEmbedders(embedders)) as TaskRef
  );
};

const indexDocuments = async (
  taskClient: MeiliTaskClient,
  index: {
    addDocuments: (
      documents: ApiEntity[],
      options: { primaryKey: string }
    ) => Promise<unknown>;
  },
  documents: ApiEntity[]
): Promise<void> => {
  const chunks = chunkDocuments(documents, 1000);

  for (const chunk of chunks) {
    await waitForTask(
      taskClient,
      (await index.addDocuments(chunk, { primaryKey: "meiliId" })) as TaskRef
    );
  }
};

const importMeiliSearchClient = async (runtimeConfig: IndexRuntimeConfig) => {
  const { MeiliSearch } = await import("meilisearch");

  return new MeiliSearch({
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
    index: client.index<ApiEntity>(runtimeConfig.indexName),
  };
};

const writeSummary = (
  runtimeConfig: IndexRuntimeConfig,
  documents: ApiEntity[]
): void => {
  process.stdout.write(
    `${JSON.stringify({
      documents: documents.length,
      host: runtimeConfig.host,
      hybrid: runtimeConfig.enableHybrid,
      index: runtimeConfig.indexName,
      source: entitiesFile,
    })}\n`
  );
};

const run = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2));
  const runtimeConfig = getIndexRuntimeConfig();
  const documents = await getDocuments();
  const { client, index } = await createClientAndIndex(runtimeConfig);
  const embedderIndex = index as unknown as MeiliIndexWithEmbedders;

  await resetIndexIfRequested(client.tasks, index, options);
  await applyIndexSettings(
    client.tasks,
    index as unknown as {
      updateSettings: (settings: unknown) => Promise<unknown>;
    }
  );
  await applyEmbeddersIfEnabled(
    client.tasks,
    embedderIndex,
    runtimeConfig,
    runtimeConfig.enableHybrid
  );
  await indexDocuments(client.tasks, index, documents);
  writeSummary(runtimeConfig, documents);
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
