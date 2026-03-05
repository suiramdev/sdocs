import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_API_JSON_URL =
  "https://cdn.sbox.game/releases/2026-03-05-14-31-39.zip.json";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const getApiJsonUrl = (): string => {
  const apiJsonUrl = (process.env.API_JSON_URL ?? DEFAULT_API_JSON_URL).trim();
  if (apiJsonUrl.length === 0) {
    throw new Error("API_JSON_URL is empty");
  }

  return apiJsonUrl;
};

const downloadApiDump = async (
  url: string,
  targetPath: string
): Promise<void> => {
  const response = await fetch(url, {
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download API JSON from ${url}: ${response.status} ${response.statusText}`
    );
  }

  if (!response.body) {
    throw new Error(`API JSON response body is empty for ${url}`);
  }

  await Bun.write(targetPath, response);
};

const runStep = async (command: string[], stepName: string): Promise<void> => {
  const processHandle = Bun.spawn({
    cmd: command,
    cwd: projectRoot,
    stderr: "inherit",
    stdout: "inherit",
  });

  const exitCode = await processHandle.exited;
  if (exitCode !== 0) {
    throw new Error(`${stepName} failed with exit code ${exitCode}`);
  }
};

const runGeneration = async (
  apiJsonUrl: string,
  downloadedJsonPath: string
): Promise<void> => {
  process.stdout.write(`Bootstrapping API reference from ${apiJsonUrl}...\n`);
  await downloadApiDump(apiJsonUrl, downloadedJsonPath);
  await runStep(
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
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`API bootstrap failed: ${message}\n`);
  process.exit(1);
}
