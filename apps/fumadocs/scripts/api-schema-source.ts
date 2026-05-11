import { writeFile } from "node:fs/promises";

import {
  buildSourceVersion,
  hashContent,
  readApiReferenceState,
} from "./api-reference-state";

const DEFAULT_API_SCHEMA_PAGE_URL = "https://sbox.game/api/schema";
const DEFAULT_BROWSER_EXECUTABLE_PATH = "/usr/bin/chromium";
const RENDERED_SCHEMA_LINK_SELECTOR =
  'a[download][href$=".json"], a[href*="cdn.sbox.game"][href$=".json"]';

const JSON_CONTENT_TYPES = [
  "application/json",
  "application/octet-stream",
  "binary/octet-stream",
] as const;

export interface DownloadSettings {
  maxAttempts: number;
  timeoutMs: number;
}

export interface ApiSchemaSource {
  downloadedJsonPath?: string;
  mode: "explicit" | "latest";
  pageUrl?: string;
  resolvedUrl: string;
  url: string;
  version: string;
}

interface DownloadedSchema {
  contentHash: string;
  etag: string | null;
  finalUrl: string;
  lastModified: string | null;
  resolvedUrl: string;
}

const formatError = (error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Unknown error";
};

const fetchWithTimeout = (url: string, timeoutMs: number): Promise<Response> =>
  fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });

const isJsonResponse = (response: Response): boolean => {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return JSON_CONTENT_TYPES.some((jsonContentType) =>
    contentType.includes(jsonContentType)
  );
};

const normalizeUrl = (url: string, baseUrl: string): string =>
  new URL(url.replaceAll("&amp;", "&"), baseUrl).toString();

const downloadSchema = async (
  url: string,
  targetPath: string,
  timeoutMs: number
): Promise<DownloadedSchema> => {
  const response = await fetchWithTimeout(url, timeoutMs);

  if (!response.ok) {
    throw new Error(
      `Failed to download API JSON from ${url}: ${response.status} ${response.statusText}`
    );
  }

  if (!isJsonResponse(response)) {
    throw new Error(
      `API JSON download from ${url} returned ${response.headers.get("content-type") ?? "unknown content type"}`
    );
  }

  const payload = Buffer.from(await response.arrayBuffer());
  if (payload.byteLength === 0) {
    throw new Error(`API JSON response body is empty for ${url}`);
  }

  await writeFile(targetPath, payload);

  return {
    contentHash: hashContent(payload.toString("utf8")),
    etag: response.headers.get("etag"),
    finalUrl: response.url,
    lastModified: response.headers.get("last-modified"),
    resolvedUrl: url,
  };
};

const buildLatestSourceVersion = (
  pageUrl: string,
  downloadedSchema: DownloadedSchema
): string =>
  hashContent(
    JSON.stringify({
      contentHash: downloadedSchema.contentHash,
      etag: downloadedSchema.etag,
      finalUrl: downloadedSchema.finalUrl,
      lastModified: downloadedSchema.lastModified,
      pageUrl,
      resolvedUrl: downloadedSchema.resolvedUrl,
    })
  );

const buildLatestApiSchemaSource = (
  pageUrl: string,
  targetPath: string,
  downloadedSchema: DownloadedSchema
): ApiSchemaSource => ({
  downloadedJsonPath: targetPath,
  mode: "latest",
  pageUrl,
  resolvedUrl: downloadedSchema.finalUrl,
  url: downloadedSchema.finalUrl,
  version: buildLatestSourceVersion(pageUrl, downloadedSchema),
});

const resolveCandidateSource = async (
  candidateUrl: string,
  pageUrl: string,
  targetPath: string,
  timeoutMs: number
): Promise<ApiSchemaSource> => {
  const downloadedSchema = await downloadSchema(
    candidateUrl,
    targetPath,
    timeoutMs
  );
  return buildLatestApiSchemaSource(pageUrl, targetPath, downloadedSchema);
};

const getBrowserExecutablePath = (): string =>
  (
    process.env.API_SCHEMA_BROWSER_EXECUTABLE_PATH ??
    DEFAULT_BROWSER_EXECUTABLE_PATH
  ).trim();

const launchSchemaBrowser = async () => {
  const { chromium } = await import("playwright-core");
  return await chromium.launch({
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
    executablePath: getBrowserExecutablePath(),
    headless: true,
  });
};

const getRenderedLinkHref = async (
  pageUrl: string,
  timeoutMs: number,
  browser: Awaited<ReturnType<typeof launchSchemaBrowser>>
): Promise<string> => {
  const page = await browser.newPage();
  await page.goto(pageUrl, {
    timeout: timeoutMs,
    waitUntil: "domcontentloaded",
  });
  const link = page.locator(RENDERED_SCHEMA_LINK_SELECTOR).first();
  await link.waitFor({ state: "attached", timeout: timeoutMs });
  const href = await link.getAttribute("href");

  if (!href) {
    throw new Error("Rendered API schema download link has no href");
  }

  return normalizeUrl(href, page.url());
};

const getRenderedSchemaUrl = async (
  pageUrl: string,
  timeoutMs: number
): Promise<string> => {
  const browser = await launchSchemaBrowser();

  try {
    return await getRenderedLinkHref(pageUrl, timeoutMs, browser);
  } finally {
    await browser.close();
  }
};

const resolveRenderedPageSource = async (
  pageUrl: string,
  targetPath: string,
  timeoutMs: number
): Promise<ApiSchemaSource> => {
  const renderedSchemaUrl = await getRenderedSchemaUrl(pageUrl, timeoutMs);
  process.stdout.write(
    `Resolved rendered API schema download link: ${renderedSchemaUrl}\n`
  );
  return await resolveCandidateSource(
    renderedSchemaUrl,
    pageUrl,
    targetPath,
    timeoutMs
  );
};

const getExplicitApiSchemaSource = (): ApiSchemaSource | null => {
  const explicitApiJsonUrl = process.env.API_JSON_URL;
  if (explicitApiJsonUrl === undefined) {
    return null;
  }

  const apiJsonUrl = explicitApiJsonUrl.trim();
  if (apiJsonUrl.length === 0) {
    throw new Error("API_JSON_URL is empty");
  }

  return {
    mode: "explicit",
    resolvedUrl: apiJsonUrl,
    url: apiJsonUrl,
    version: buildSourceVersion(apiJsonUrl),
  };
};

const getLatestSchemaPageUrl = (): string => {
  const pageUrl = (
    process.env.API_SCHEMA_PAGE_URL ?? DEFAULT_API_SCHEMA_PAGE_URL
  ).trim();
  if (pageUrl.length === 0) {
    throw new Error("API_SCHEMA_PAGE_URL is empty");
  }

  return pageUrl;
};

const resolveLatestWithRetries = async (
  pageUrl: string,
  targetPath: string,
  settings: DownloadSettings,
  logRetry: (
    attempt: number,
    error: unknown,
    maxAttempts: number
  ) => Promise<void>
): Promise<ApiSchemaSource> => {
  for (let attempt = 1; attempt <= settings.maxAttempts; attempt += 1) {
    try {
      return await resolveRenderedPageSource(
        pageUrl,
        targetPath,
        settings.timeoutMs
      );
    } catch (error: unknown) {
      if (attempt >= settings.maxAttempts) {
        throw new Error(
          `Unable to resolve latest API schema after ${settings.maxAttempts} attempts: ${formatError(error)}`,
          { cause: error }
        );
      }

      await logRetry(attempt, error, settings.maxAttempts);
    }
  }

  throw new Error("Unable to resolve latest API schema");
};

const getManifestFallbackUrl = async (): Promise<string | null> => {
  const state = await readApiReferenceState();
  return state?.source?.resolvedUrl ?? state?.source?.url ?? null;
};

const resolveManifestFallbackSource = async (
  pageUrl: string,
  targetPath: string,
  timeoutMs: number,
  error: unknown
): Promise<ApiSchemaSource> => {
  const fallbackUrl = await getManifestFallbackUrl();
  if (!fallbackUrl) {
    throw error;
  }

  process.stdout.write(
    `Rendered latest API schema page could not resolve a JSON link. Falling back to previous schema URL from manifest: ${fallbackUrl}\n`
  );

  return await resolveCandidateSource(
    fallbackUrl,
    pageUrl,
    targetPath,
    timeoutMs
  );
};

const resolveLatestSource = async (
  targetPath: string,
  settings: DownloadSettings,
  logRetry: (
    attempt: number,
    error: unknown,
    maxAttempts: number
  ) => Promise<void>
): Promise<ApiSchemaSource> => {
  const pageUrl = getLatestSchemaPageUrl();

  try {
    return await resolveLatestWithRetries(
      pageUrl,
      targetPath,
      settings,
      logRetry
    );
  } catch (error: unknown) {
    return await resolveManifestFallbackSource(
      pageUrl,
      targetPath,
      settings.timeoutMs,
      error
    );
  }
};

export const resolveApiSchemaSource = async (
  targetPath: string,
  settings: DownloadSettings,
  logRetry: (
    attempt: number,
    error: unknown,
    maxAttempts: number
  ) => Promise<void>
): Promise<ApiSchemaSource> => {
  const explicitSource = getExplicitApiSchemaSource();
  if (explicitSource) {
    return explicitSource;
  }

  return await resolveLatestSource(targetPath, settings, logRetry);
};
