import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ApiReferenceSourceState {
  url: string;
  version: string;
}

export interface ApiReferenceGenerationState {
  cacheKey: string;
  emitMdx: boolean;
  entitiesHash: string;
  entityCount: number;
  generatedAt: string;
  generatorHash: string;
  includeNonPublic: boolean;
  repositoryExamplesFingerprint?: string;
}

export interface ApiReferenceIndexingState {
  cacheKey: string;
  documentsCount: number;
  enableHybrid: boolean;
  indexName: string;
  indexedAt: string;
}

export interface ApiReferenceState {
  generation?: ApiReferenceGenerationState;
  indexing?: ApiReferenceIndexingState;
  schemaVersion: 1;
  source?: ApiReferenceSourceState;
}

const STATE_SCHEMA_VERSION = 1 as const;

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

export const apiDocsRoot = path.join(projectRoot, "content", "api-generated");
export const entitiesRoot = path.join(projectRoot, "data", "api", "entities");
export const entitiesFile = path.join(entitiesRoot, "latest.json");
export const stateFile = path.join(entitiesRoot, "manifest.json");

const generateScriptPath = path.join(
  projectRoot,
  "scripts",
  "generate-api-docs.ts"
);
const indexScriptPath = path.join(projectRoot, "scripts", "index-api-meili.ts");

export const hashContent = (value: string): string =>
  createHash("sha1").update(value).digest("hex");

const getFileHash = async (filePath: string): Promise<string> => {
  const content = await readFile(filePath, "utf8");
  return hashContent(content);
};

export const getGenerateScriptHash = (): Promise<string> =>
  getFileHash(generateScriptPath);

export const getIndexScriptHash = (): Promise<string> =>
  getFileHash(indexScriptPath);

export const buildSourceVersion = (source: string): string => {
  try {
    const url = new URL(source);
    const version = path.posix.basename(url.pathname);
    return version.length > 0 ? version : source;
  } catch {
    const version = path.basename(source);
    return version.length > 0 ? version : source;
  }
};

export const buildGenerationCacheKey = (input: {
  emitMdx: boolean;
  generatorHash: string;
  includeNonPublic: boolean;
  repositoryExamplesFingerprint?: string;
  sourceVersion: string;
}): string =>
  hashContent(
    JSON.stringify({
      emitMdx: input.emitMdx,
      generatorHash: input.generatorHash,
      includeNonPublic: input.includeNonPublic,
      repositoryExamplesFingerprint:
        input.repositoryExamplesFingerprint ?? null,
      sourceVersion: input.sourceVersion,
    })
  );

export const buildIndexCacheKey = (input: {
  documentsHash: string;
  enableHybrid: boolean;
  indexFingerprint: string;
  indexName: string;
}): string =>
  hashContent(
    JSON.stringify({
      documentsHash: input.documentsHash,
      enableHybrid: input.enableHybrid,
      indexFingerprint: input.indexFingerprint,
      indexName: input.indexName,
    })
  );

export const readApiReferenceState =
  async (): Promise<ApiReferenceState | null> => {
    try {
      const content = await readFile(stateFile, "utf8");
      const state = JSON.parse(content) as Partial<ApiReferenceState>;

      if (state.schemaVersion !== STATE_SCHEMA_VERSION) {
        return null;
      }

      return state as ApiReferenceState;
    } catch {
      return null;
    }
  };

export const writeApiReferenceState = async (
  state: ApiReferenceState
): Promise<void> => {
  await mkdir(entitiesRoot, { recursive: true });
  await writeFile(stateFile, JSON.stringify(state, null, 2));
};

export const generationOutputsExist = async (
  emitMdx: boolean
): Promise<boolean> => {
  try {
    await access(entitiesFile);
    if (emitMdx) {
      await access(path.join(apiDocsRoot, "index.mdx"));
    }

    return true;
  } catch {
    return false;
  }
};
