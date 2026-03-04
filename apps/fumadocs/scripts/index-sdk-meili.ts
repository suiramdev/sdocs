import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { SdkEntity } from "../src/features/sdk/utils/schemas";

interface CliOptions {
  reset: boolean;
}

interface TaskRef {
  taskUid?: number;
}

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const entitiesFile = path.join(
  projectRoot,
  "data",
  "sdk",
  "entities",
  "latest.json"
);

function parseArgs(argv: string[]): CliOptions {
  return {
    reset: argv.includes("--reset"),
  };
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function chunkDocuments<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

async function waitForTask(
  taskClient: { waitForTask: (uid: number) => Promise<unknown> },
  task?: TaskRef
) {
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
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { MeiliSearch } = await import("meilisearch");

  const host = process.env.MEILI_HOST ?? "http://127.0.0.1:7700";
  const apiKey = process.env.MEILI_API_KEY ?? "";
  const indexName = process.env.MEILI_SDK_INDEX_NAME ?? "sdk_entities";
  const enableHybrid = process.env.MEILI_ENABLE_HYBRID === "true";

  const documents = await readJson<SdkEntity[]>(entitiesFile);
  if (!documents || documents.length === 0) {
    throw new Error(
      "No generated SDK entities found at data/sdk/entities/latest.json. Run sdk:generate first."
    );
  }

  const client = new MeiliSearch({
    apiKey,
    host,
  });

  const index = client.index<SdkEntity>(indexName);

  if (options.reset) {
    await waitForTask(
      client.tasks,
      (await index.deleteAllDocuments()) as TaskRef
    );
  }

  await waitForTask(
    client.tasks,
    (await index.updateSettings({
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
    })) as TaskRef
  );

  if (enableHybrid) {
    const embedderKey = process.env.OPENAI_API_KEY;
    const maybeIndex = index as unknown as {
      updateEmbedders?: (embedders: unknown) => Promise<TaskRef>;
    };

    if (embedderKey && typeof maybeIndex.updateEmbedders === "function") {
      await waitForTask(
        client.tasks,
        await maybeIndex.updateEmbedders({
          default: {
            apiKey: embedderKey,
            documentTemplate:
              "Entity {{name}} ({{type}}) in {{namespace}} class {{class}}. Signature: {{displaySignature}}. Description: {{description}}.",
            model: process.env.MEILI_EMBEDDER_MODEL ?? "text-embedding-3-small",
            source: "openAi",
          },
        })
      );
    }
  }

  const chunks = chunkDocuments(documents, 1000);

  for (const chunk of chunks) {
    await waitForTask(
      client.tasks,
      (await index.addDocuments(chunk, { primaryKey: "meiliId" })) as TaskRef
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      documents: documents.length,
      host,
      hybrid: enableHybrid,
      index: indexName,
      source: entitiesFile,
    })}\n`
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`Meilisearch indexing failed: ${message}\n`);
  process.exit(1);
});
