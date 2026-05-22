import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { syncLockDir } from "./api-reference-state";

const DEFAULT_LOCK_RETRY_INTERVAL_MS = 2000;
const DEFAULT_LOCK_STALE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_LOCK_TIMEOUT_MS = 30 * 60 * 1000;

const formatDuration = (durationMs: number): string => {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = ((durationMs % 60_000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
};

const logSyncProgress = (message: string): void => {
  process.stdout.write(`[api-sync] ${message}\n`);
};

const getPositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getRuntimeConfig = () => ({
  lockRetryIntervalMs: getPositiveInteger(
    process.env.API_SYNC_LOCK_RETRY_INTERVAL_MS,
    DEFAULT_LOCK_RETRY_INTERVAL_MS
  ),
  lockStaleMs: getPositiveInteger(
    process.env.API_SYNC_LOCK_STALE_MS,
    DEFAULT_LOCK_STALE_MS
  ),
  lockTimeoutMs: getPositiveInteger(
    process.env.API_SYNC_LOCK_TIMEOUT_MS,
    DEFAULT_LOCK_TIMEOUT_MS
  ),
});

const formatError = (error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Unknown error";
};

const isAlreadyExistsError = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException)?.code === "EEXIST";

const runStep = (scriptName: string, stepName: string): void => {
  logSyncProgress(`Starting ${stepName}.`);
  const startedAt = Date.now();
  const result = Bun.spawnSync({
    cmd: ["bun", "run", scriptName],
    stderr: "inherit",
    stdout: "inherit",
  });

  if (result.exitCode !== 0) {
    throw new Error(`${stepName} failed with exit code ${result.exitCode}`);
  }

  logSyncProgress(
    `Completed ${stepName} in ${formatDuration(Date.now() - startedAt)}.`
  );
};

const getLockAgeMs = async (): Promise<number | null> => {
  try {
    const lockStats = await stat(syncLockDir);
    return Date.now() - lockStats.mtimeMs;
  } catch {
    return null;
  }
};

const removeStaleLock = async (lockAgeMs: number): Promise<void> => {
  logSyncProgress(
    `Removing stale sync lock after ${formatDuration(lockAgeMs)}.`
  );
  await rm(syncLockDir, {
    force: true,
    recursive: true,
  });
};

const writeLockMetadata = async (): Promise<void> => {
  await writeFile(
    `${syncLockDir}/owner.json`,
    JSON.stringify(
      {
        acquiredAt: new Date().toISOString(),
        hostname: process.env.HOSTNAME ?? hostname(),
        pid: process.pid,
      },
      null,
      2
    )
  );
};

const createSyncLock = async (): Promise<() => Promise<void>> => {
  await mkdir(syncLockDir);
  await writeLockMetadata();

  return async () => {
    await rm(syncLockDir, {
      force: true,
      recursive: true,
    });
  };
};

const waitForSyncLock = async (
  startedAt: number,
  lockRetryIntervalMs: number,
  lockStaleMs: number,
  lockTimeoutMs: number,
  error: unknown
): Promise<void> => {
  const lockAgeMs = await getLockAgeMs();
  if (lockAgeMs !== null && lockAgeMs >= lockStaleMs) {
    await removeStaleLock(lockAgeMs);
    return;
  }

  const waitTimeMs = Date.now() - startedAt;
  if (waitTimeMs >= lockTimeoutMs) {
    throw new Error(
      `Timed out waiting for api sync lock after ${formatDuration(waitTimeMs)}`,
      { cause: error }
    );
  }

  logSyncProgress(
    `Another sync is running; waiting ${formatDuration(lockRetryIntervalMs)} before retrying.`
  );
  await delay(lockRetryIntervalMs);
};

const acquireSyncLock = async (): Promise<() => Promise<void>> => {
  await mkdir(path.dirname(syncLockDir), { recursive: true });

  const startedAt = Date.now();
  const runtimeConfig = getRuntimeConfig();

  while (true) {
    try {
      return await createSyncLock();
    } catch (error: unknown) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }

      await waitForSyncLock(
        startedAt,
        runtimeConfig.lockRetryIntervalMs,
        runtimeConfig.lockStaleMs,
        runtimeConfig.lockTimeoutMs,
        error
      );
    }
  }
};

const main = async (): Promise<void> => {
  const releaseLock = await acquireSyncLock();
  logSyncProgress("Acquired sync lock.");

  try {
    runStep("api:bootstrap", "API bootstrap");
    runStep("api:index", "API indexing");
    logSyncProgress("API sync completed.");
  } finally {
    await releaseLock();
    logSyncProgress("Released sync lock.");
  }
};

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(`API sync failed: ${formatError(error)}\n`);
  process.exit(1);
}
