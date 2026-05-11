import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveApiSchemaSource } from "./api-schema-source";

const originalFetch = globalThis.fetch;
const originalApiJsonUrl = process.env.API_JSON_URL;
const originalApiSchemaPageUrl = process.env.API_SCHEMA_PAGE_URL;
const SCHEMA_PAGE_URL = "https://docs.example.com/api/schema";
const SCHEMA_DOWNLOAD_URL = "https://cdn.example.com/releases/latest.zip.json";
const SCHEMA_PAGE_HTML = `<a href="${SCHEMA_DOWNLOAD_URL}">Download Api Schema</a>`;

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
};

const createSchemaPageResponse = (): Response =>
  createResponse(SCHEMA_PAGE_HTML, {
    headers: { "content-type": "text/html" },
    status: 200,
    url: SCHEMA_PAGE_URL,
  });

const createSchemaJsonResponse = (etag: string): Response =>
  createResponse('{"types":[]}', {
    headers: {
      "content-type": "application/json",
      etag,
    },
    status: 200,
    url: SCHEMA_DOWNLOAD_URL,
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

const resolveTestSource = (targetPath: string) =>
  resolveApiSchemaSource(
    targetPath,
    { maxAttempts: 1, timeoutMs: 1000 },
    noopRetryLogger
  );

const expectLatestSource = async (
  source: Awaited<ReturnType<typeof resolveTestSource>>,
  targetPath: string
): Promise<void> => {
  expect(source.mode).toBe("latest");
  expect(source.pageUrl).toBe(SCHEMA_PAGE_URL);
  expect(source.resolvedUrl).toBe(SCHEMA_DOWNLOAD_URL);
  expect(source.downloadedJsonPath).toBe(targetPath);
  expect(await readFile(targetPath, "utf8")).toBe('{"types":[]}');
};

afterEach(() => {
  globalThis.fetch = originalFetch;

  if (originalApiJsonUrl === undefined) {
    delete process.env.API_JSON_URL;
  } else {
    process.env.API_JSON_URL = originalApiJsonUrl;
  }

  if (originalApiSchemaPageUrl === undefined) {
    delete process.env.API_SCHEMA_PAGE_URL;
  } else {
    process.env.API_SCHEMA_PAGE_URL = originalApiSchemaPageUrl;
  }
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

  it("resolves the latest schema link from the configured schema page", async () => {
    setLatestSchemaEnv();
    const { cleanup, targetPath } = await createTargetPath();
    mockFetchResponses([
      createSchemaPageResponse(),
      createSchemaJsonResponse('"schema-a"'),
    ]);

    try {
      const source = await resolveTestSource(targetPath);
      await expectLatestSource(source, targetPath);
    } finally {
      await cleanup();
    }
  });

  it("changes the latest source version when response validators change", async () => {
    setLatestSchemaEnv();
    const firstTarget = await createTargetPath();
    const secondTarget = await createTargetPath();
    mockFetchResponses([
      createSchemaPageResponse(),
      createSchemaJsonResponse('"schema-a"'),
      createSchemaPageResponse(),
      createSchemaJsonResponse('"schema-b"'),
    ]);

    try {
      const firstSource = await resolveTestSource(firstTarget.targetPath);
      const secondSource = await resolveTestSource(secondTarget.targetPath);

      expect(firstSource.version).not.toBe(secondSource.version);
    } finally {
      await firstTarget.cleanup();
      await secondTarget.cleanup();
    }
  });
});
