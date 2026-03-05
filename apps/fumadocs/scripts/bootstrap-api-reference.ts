import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_API_JSON_URL =
  "https://cdn.sbox.game/releases/2026-03-05-14-31-39.zip.json";
const DEFAULT_DOWNLOAD_ATTEMPTS = 3;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 45_000;

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const getPositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getApiJsonUrl = (): string => {
  const apiJsonUrl = (process.env.API_JSON_URL ?? DEFAULT_API_JSON_URL).trim();
  if (apiJsonUrl.length === 0) {
    throw new Error("API_JSON_URL is empty");
  }

  return apiJsonUrl;
};

const formatError = (error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Unknown error";
};

const getDownloadSettings = () => ({
  maxAttempts: getPositiveInteger(
    process.env.API_JSON_DOWNLOAD_ATTEMPTS,
    DEFAULT_DOWNLOAD_ATTEMPTS
  ),
  timeoutMs: getPositiveInteger(
    process.env.API_JSON_DOWNLOAD_TIMEOUT_MS,
    DEFAULT_DOWNLOAD_TIMEOUT_MS
  ),
});

const logRetry = async (
  attempt: number,
  error: unknown,
  maxAttempts: number
): Promise<void> => {
  process.stdout.write(
    `API JSON download attempt ${attempt}/${maxAttempts} failed: ${formatError(error)}. Retrying...\n`
  );
  await delay(1000 * attempt);
};

const downloadOnce = async (
  url: string,
  timeoutMs: number,
  targetPath: string
): Promise<void> => {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download API JSON from ${url}: ${response.status} ${response.statusText}`
    );
  }

  const payload = Buffer.from(await response.arrayBuffer());
  if (payload.byteLength === 0) {
    throw new Error(`API JSON response body is empty for ${url}`);
  }

  await writeFile(targetPath, payload);
};

const downloadWithRetries = async (
  url: string,
  targetPath: string,
  timeoutMs: number,
  maxAttempts: number,
  attempt: number
): Promise<void> => {
  try {
    await downloadOnce(url, timeoutMs, targetPath);
  } catch (error: unknown) {
    if (attempt >= maxAttempts) {
      throw new Error(
        `Unable to download API JSON after ${maxAttempts} attempts: ${formatError(error)}`,
        { cause: error }
      );
    }

    await logRetry(attempt, error, maxAttempts);
    await downloadWithRetries(
      url,
      targetPath,
      timeoutMs,
      maxAttempts,
      attempt + 1
    );
  }
};

const downloadApiDump = async (
  url: string,
  targetPath: string
): Promise<void> => {
  const { maxAttempts, timeoutMs } = getDownloadSettings();
  await downloadWithRetries(url, targetPath, timeoutMs, maxAttempts, 1);
};

const runStep = (command: string[], stepName: string): void => {
  const result = Bun.spawnSync({
    cmd: command,
    cwd: projectRoot,
    stderr: "inherit",
    stdout: "inherit",
  });

  if (result.exitCode !== 0) {
    throw new Error(`${stepName} failed with exit code ${result.exitCode}`);
  }
};

const runGeneration = async (
  apiJsonUrl: string,
  downloadedJsonPath: string
): Promise<void> => {
  process.stdout.write(`Bootstrapping API reference from ${apiJsonUrl}...\n`);
  await downloadApiDump(apiJsonUrl, downloadedJsonPath);
  process.stdout.write("API JSON downloaded, starting docs generation...\n");
  runStep(
    [
      "bun",
      "run",
      "scripts/generate-api-docs.ts",
      "--input",
      downloadedJsonPath,
      "--emit-mdx",
      "true",
    ],
    "API docs generation"
  );
  process.stdout.write("API docs generation completed.\n");
  process.stdout.write("API reference bootstrap completed.\n");
};

const withTemporaryInputFile = async (
  run: (downloadedJsonPath: string) => Promise<void>
): Promise<void> => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "fumadocs-api-"));
  const downloadedJsonPath = path.join(tempDir, "api-reference.zip.json");

  try {
    await run(downloadedJsonPath);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
};

const main = async (): Promise<void> => {
  const apiJsonUrl = getApiJsonUrl();
  await withTemporaryInputFile(async (downloadedJsonPath) => {
    await runGeneration(apiJsonUrl, downloadedJsonPath);
  });
};

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(`API bootstrap failed: ${formatError(error)}\n`);
  process.exit(1);
}
