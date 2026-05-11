import { writeFile } from "node:fs/promises";

import {
  buildSourceVersion,
  hashContent,
  readApiReferenceState,
} from "./api-reference-state";

const DEFAULT_API_SCHEMA_PAGE_URL = "https://sbox.game/api/schema";

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

const getAttributeValue = (
  tag: string,
  attributeName: string
): string | null => {
  const attributePattern = new RegExp(
    `${attributeName}\\s*=\\s*(?:"([^"]+)"|'([^']+)')`,
    "i"
  );
  const match = attributePattern.exec(tag);
  return match?.[1] ?? match?.[2] ?? null;
};

const addDirectDownloadUrls = (
  urls: Set<string>,
  html: string,
  pageUrl: string
): void => {
  const directUrlPattern =
    /https:\/\/cdn\.sbox\.game\/[^\s"'<>]+?\.json(?:\?[^\s"'<>]+)?/gi;

  for (const [url] of html.matchAll(directUrlPattern)) {
    urls.add(normalizeUrl(url, pageUrl));
  }
};

const isDownloadTag = (tag: string): boolean => {
  const label = tag.toLowerCase();
  return (
    label.includes("download") ||
    label.includes("schema") ||
    label.includes(".json")
  );
};

const addTagDownloadUrls = (
  urls: Set<string>,
  tag: string,
  pageUrl: string
): void => {
  for (const attributeName of ["href", "data-href", "data-url"]) {
    const value = getAttributeValue(tag, attributeName);
    if (value && value !== "#") {
      urls.add(normalizeUrl(value, pageUrl));
    }
  }
};

const getCandidateDownloadUrls = (html: string, pageUrl: string): string[] => {
  const urls = new Set<string>();
  const tagPattern = /<(?:a|link|button)\b[^>]*>/gi;
  addDirectDownloadUrls(urls, html, pageUrl);

  for (const [tag] of html.matchAll(tagPattern)) {
    if (!isDownloadTag(tag)) {
      continue;
    }

    addTagDownloadUrls(urls, tag, pageUrl);
  }

  return [...urls];
};

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

const resolveJsonPageSource = async (
  pageUrl: string,
  targetPath: string,
  pageResponse: Response
): Promise<ApiSchemaSource> => {
  const payload = Buffer.from(await pageResponse.arrayBuffer());
  if (payload.byteLength === 0) {
    throw new Error(`API schema page response body is empty for ${pageUrl}`);
  }

  await writeFile(targetPath, payload);
  return buildLatestApiSchemaSource(pageUrl, targetPath, {
    contentHash: hashContent(payload.toString("utf8")),
    etag: pageResponse.headers.get("etag"),
    finalUrl: pageResponse.url,
    lastModified: pageResponse.headers.get("last-modified"),
    resolvedUrl: pageResponse.url,
  });
};

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

const buildCandidateFailureMessage = (
  pageUrl: string,
  failures: string[]
): string => {
  const failureDetails =
    failures.length > 0 ? ` Tried candidates: ${failures.join("; ")}` : "";
  return `Unable to find a direct API schema JSON download link on ${pageUrl}.${failureDetails} If the page only exposes the download through Blazor, set API_JSON_URL to a pinned schema JSON URL as an override.`;
};

const resolveHtmlPageSource = async (
  pageUrl: string,
  targetPath: string,
  timeoutMs: number,
  pageResponse: Response
): Promise<ApiSchemaSource> => {
  const html = await pageResponse.text();
  const candidateUrls = getCandidateDownloadUrls(html, pageResponse.url);
  const failures: string[] = [];

  for (const candidateUrl of candidateUrls) {
    try {
      return await resolveCandidateSource(
        candidateUrl,
        pageUrl,
        targetPath,
        timeoutMs
      );
    } catch (error: unknown) {
      failures.push(`${candidateUrl}: ${formatError(error)}`);
    }
  }

  throw new Error(buildCandidateFailureMessage(pageUrl, failures));
};

const resolveLatestSourceOnce = async (
  pageUrl: string,
  targetPath: string,
  timeoutMs: number
): Promise<ApiSchemaSource> => {
  const pageResponse = await fetchWithTimeout(pageUrl, timeoutMs);

  if (!pageResponse.ok) {
    throw new Error(
      `Failed to resolve API schema page ${pageUrl}: ${pageResponse.status} ${pageResponse.statusText}`
    );
  }

  if (isJsonResponse(pageResponse)) {
    return resolveJsonPageSource(pageUrl, targetPath, pageResponse);
  }

  return resolveHtmlPageSource(pageUrl, targetPath, timeoutMs, pageResponse);
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
      return await resolveLatestSourceOnce(
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
    `Latest API schema page could not expose a direct JSON link. Falling back to previous schema URL from manifest: ${fallbackUrl}\n`
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
