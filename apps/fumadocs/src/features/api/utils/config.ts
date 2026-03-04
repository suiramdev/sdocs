import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const appRootDir = path.resolve(moduleDir, "../../../..");

export const apiConfig = {
  app: {
    baseUrl: process.env.APP_BASE_URL ?? "http://localhost:4000",
  },
  data: {
    entitiesDir: path.join(appRootDir, "data", "api", "entities"),
    entitiesFile: path.join(
      appRootDir,
      "data",
      "api",
      "entities",
      "latest.json"
    ),
    rootDir: path.join(appRootDir, "data", "api"),
  },
  docsBaseUrl: "/docs/api",
  meilisearch: {
    apiKey: process.env.MEILI_API_KEY ?? "api-dev-master-key",
    defaultSemanticRatio: Number.parseFloat(
      process.env.MEILI_SEMANTIC_RATIO ?? "0.35"
    ),
    enableHybrid: process.env.MEILI_ENABLE_HYBRID === "true",
    host: process.env.MEILI_HOST ?? "http://127.0.0.1:7700",
    indexName: process.env.MEILI_API_INDEX_NAME ?? "api_entities",
  },
} as const;

export const clampSemanticRatio = (value: number | undefined): number => {
  if (value === undefined || Number.isNaN(value)) {
    return apiConfig.meilisearch.defaultSemanticRatio;
  }

  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }

  return value;
};
