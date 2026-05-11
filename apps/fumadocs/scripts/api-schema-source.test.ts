import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { stateFile } from "./api-reference-state";
import { resolveApiSchemaSource } from "./api-schema-source";

const originalFetch = globalThis.fetch;
const originalApiJsonUrl = process.env.API_JSON_URL;
const originalApiSchemaPageUrl = process.env.API_SCHEMA_PAGE_URL;
const originalApiSchemaBrowserExecutablePath =
  process.env.API_SCHEMA_BROWSER_EXECUTABLE_PATH;
const originalStdoutWrite = process.stdout.write;
const SCHEMA_PAGE_URL = "https://docs.example.com/api/schema";
const MANIFEST_SCHEMA_URL =
  "https://cdn.example.com/releases/previous.zip.json";

const createResponse = (
  body: BodyInit,
  init: ResponseInit & { url: string }
): Response => {
  const response = new Response(body, init);
  Object.defineProperty(response, "url", {
    value: init.url,
  });

  return response;
};

const createTargetPath = async (): Promise<{
  cleanup: () => Promise<void>;
  targetPath: string;
}> => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "schema-source-test-"));

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    targetPath: path.join(tempDir, "api.json"),
  };
};

const noopRetryLogger = async (): Promise<void> => {
  await Bun.sleep(0);
};

const setLatestSchemaEnv = (): void => {
  delete process.env.API_JSON_URL;
  process.env.API_SCHEMA_PAGE_URL = SCHEMA_PAGE_URL;
  process.env.API_SCHEMA_BROWSER_EXECUTABLE_PATH = "/missing/chromium";
};

const restoreApiJsonUrl = (): void => {
  if (originalApiJsonUrl === undefined) {
    delete process.env.API_JSON_URL;
    return;
  }

  process.env.API_JSON_URL = originalApiJsonUrl;
};

const restoreApiSchemaPageUrl = (): void => {
  if (originalApiSchemaPageUrl === undefined) {
    delete process.env.API_SCHEMA_PAGE_URL;
    return;
  }

  process.env.API_SCHEMA_PAGE_URL = originalApiSchemaPageUrl;
};

const restoreApiSchemaBrowserExecutablePath = (): void => {
  if (originalApiSchemaBrowserExecutablePath === undefined) {
    delete process.env.API_SCHEMA_BROWSER_EXECUTABLE_PATH;
    return;
  }

  process.env.API_SCHEMA_BROWSER_EXECUTABLE_PATH =
    originalApiSchemaBrowserExecutablePath;
};

const createPreviousSchemaJsonResponse = (): Response =>
  createResponse('{"types":["previous"]}', {
    headers: {
      "content-type": "application/json",
      etag: '"schema-previous"',
    },
    status: 200,
    url: MANIFEST_SCHEMA_URL,
  });

const mockFetchResponses = (responses: Response[]): void => {
  const fetchMock = async (): Promise<Response> => {
    await Bun.sleep(0);
    return (
      responses.shift() ??
      createResponse("unexpected fetch", {
        status: 500,
        url: "https://unexpected.example.com",
      })
    );
  };

  globalThis.fetch = fetchMock as unknown as typeof fetch;
};

const writeManifestSource = async (url: string): Promise<void> => {
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(
    stateFile,
    JSON.stringify({
      schemaVersion: 1,
      source: {
        url,
        version: "previous.zip.json",
      },
    })
  );
};

const restoreManifest = async (
  originalManifest: string | null
): Promise<void> => {
  if (originalManifest) {
    await writeFile(stateFile, originalManifest);
    return;
  }

  await rm(stateFile, { force: true });
};

const resolveTestSource = (targetPath: string) =>
  resolveApiSchemaSource(
    targetPath,
    { maxAttempts: 1, timeoutMs: 1000 },
    noopRetryLogger
  );

const expectManifestFallbackSource = async (
  source: Awaited<ReturnType<typeof resolveTestSource>>,
  targetPath: string
): Promise<void> => {
  expect(source.mode).toBe("latest");
  expect(source.resolvedUrl).toBe(MANIFEST_SCHEMA_URL);
  expect(await readFile(targetPath, "utf8")).toBe('{"types":["previous"]}');
};

const prepareManifestFallbackTest = async (): Promise<{
  cleanup: () => Promise<void>;
  originalManifest: string | null;
  targetPath: string;
}> => {
  setLatestSchemaEnv();
  const target = await createTargetPath();
  const originalManifest = await readFile(stateFile, "utf8").catch(() => null);
  await writeManifestSource(MANIFEST_SCHEMA_URL);
  mockFetchResponses([createPreviousSchemaJsonResponse()]);

  return {
    cleanup: target.cleanup,
    originalManifest,
    targetPath: target.targetPath,
  };
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
  restoreApiJsonUrl();
  restoreApiSchemaPageUrl();
  restoreApiSchemaBrowserExecutablePath();
});

describe("resolveApiSchemaSource", () => {
  it("uses API_JSON_URL as an explicit override", async () => {
    process.env.API_JSON_URL = "https://cdn.example.com/releases/pinned.json";
    delete process.env.API_SCHEMA_PAGE_URL;

    const { cleanup, targetPath } = await createTargetPath();

    try {
      const source = await resolveTestSource(targetPath);

      expect(source).toEqual({
        mode: "explicit",
        resolvedUrl: "https://cdn.example.com/releases/pinned.json",
        url: "https://cdn.example.com/releases/pinned.json",
        version: "pinned.json",
      });
    } finally {
      await cleanup();
    }
  });

  it("rejects an explicitly empty API_JSON_URL", async () => {
    process.env.API_JSON_URL = " ";

    const { cleanup, targetPath } = await createTargetPath();

    try {
      await expect(resolveTestSource(targetPath)).rejects.toThrow(
        "API_JSON_URL is empty"
      );
    } finally {
      await cleanup();
    }
  });

  it("falls back to the previous manifest URL when rendered schema resolution fails", async () => {
    const { cleanup, originalManifest, targetPath } =
      await prepareManifestFallbackTest();

    try {
      const source = await resolveTestSource(targetPath);
      await expectManifestFallbackSource(source, targetPath);
    } finally {
      await restoreManifest(originalManifest);
      await cleanup();
    }
  });
});
