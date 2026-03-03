interface SdkLogPayload {
  route: string;
  action: string;
  durationMs?: number;
  status?: number;
  query?: string;
  details?: Record<string, string | number | boolean | null | undefined>;
}

function writeLog(
  level: "info" | "error",
  payload: SdkLogPayload,
  error?: unknown
) {
  if (process.env.SDK_API_LOGGING !== "true") {
    return;
  }

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    ...payload,
    error: error instanceof Error ? error.message : undefined,
  });

  if (level === "error") {
    process.stderr.write(`${line}\n`);
    return;
  }

  process.stdout.write(`${line}\n`);
}

export function logSdkInfo(payload: SdkLogPayload) {
  writeLog("info", payload);
}

export function logSdkError(payload: SdkLogPayload, error: unknown) {
  writeLog("error", payload, error);
}
