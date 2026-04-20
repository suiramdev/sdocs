import { decode } from "@toon-format/toon";

type JsonRpcId = number | string;

interface JsonRpcRequest {
  id: JsonRpcId;
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

interface JsonRpcError {
  code: number;
  message: string;
}

interface JsonRpcResponse {
  error?: JsonRpcError;
  id: JsonRpcId;
  jsonrpc: "2.0";
  result?: unknown;
}

interface BenchmarkCase {
  request: JsonRpcRequest;
  title: string;
}

interface BenchmarkResult {
  compactJsonBytes: number;
  compactJsonEstimatedTokens: number;
  compactJsonSavingsPercent: number;
  prettyJsonBytes: number;
  prettyJsonEstimatedTokens: number;
  prettyJsonSavingsPercent: number;
  title: string;
  toonBytes: number;
  toonEstimatedTokens: number;
}

interface CliOptions {
  iterations: number;
  url: string;
}

const DEFAULT_MCP_URL = "http://localhost:4000/api/v1/mcp";
const DEFAULT_ITERATIONS = 1;
const ESTIMATED_CHARS_PER_TOKEN = 4;
const PERCENT_MULTIPLIER = 100;
const TABLE_SEPARATOR = "  ";

const benchmarkCases: BenchmarkCase[] = [
  {
    request: {
      id: 101,
      jsonrpc: "2.0",
      method: "resources/read",
      params: {
        uri: "docs://schema",
      },
    },
    title: "resource: docs://schema",
  },
  {
    request: {
      id: 102,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {
          limit: 5,
          name: "Component",
        },
        name: "resolve_symbol",
      },
    },
    title: "tool: resolve_symbol(Component)",
  },
  {
    request: {
      id: 103,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {
          symbol: "Sandbox.Component",
        },
        name: "get_symbol",
      },
    },
    title: "tool: get_symbol(Sandbox.Component)",
  },
  {
    request: {
      id: 104,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {
          kind: "method",
          limit: 50,
          symbol: "Sandbox.Component",
        },
        name: "get_type_members",
      },
    },
    title: "tool: get_type_members(Sandbox.Component)",
  },
  {
    request: {
      id: 105,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {
          limit: 8,
          symbol: "Sandbox.Component",
        },
        name: "get_related_guides",
      },
    },
    title: "tool: get_related_guides(Sandbox.Component)",
  },
  {
    request: {
      id: 106,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {
          includeRelated: true,
          limit: 5,
          symbol: "Sandbox.Component.OnUpdate()",
        },
        name: "get_examples",
      },
    },
    title: "tool: get_examples(Component.OnUpdate)",
  },
];

const parsePositiveInteger = (
  rawValue: string | undefined,
  fallback: number
): number => {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseArgs = (argv: string[]): CliOptions => {
  const urlFlagIndex = argv.indexOf("--url");
  const iterationsFlagIndex = argv.indexOf("--iterations");

  return {
    iterations: parsePositiveInteger(
      iterationsFlagIndex === -1 ? undefined : argv[iterationsFlagIndex + 1],
      DEFAULT_ITERATIONS
    ),
    url:
      urlFlagIndex === -1
        ? (process.env.MCP_URL ?? DEFAULT_MCP_URL)
        : (argv[urlFlagIndex + 1] ?? DEFAULT_MCP_URL),
  };
};

const formatError = (error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Unknown error";
};

const byteLength = (value: string): number => Buffer.byteLength(value, "utf8");

const estimateTokens = (value: string): number =>
  Math.ceil(value.length / ESTIMATED_CHARS_PER_TOKEN);

const savingsPercent = (baselineBytes: number, toonBytes: number): number => {
  if (baselineBytes === 0) {
    return 0;
  }

  return ((baselineBytes - toonBytes) / baselineBytes) * PERCENT_MULTIPLIER;
};

const postJsonRpc = async (
  url: string,
  request: JsonRpcRequest
): Promise<JsonRpcResponse> => {
  const response = await fetch(url, {
    body: JSON.stringify(request),
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `MCP request ${request.method} failed: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as JsonRpcResponse;
};

const assertRecord = (
  value: unknown,
  label: string
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }

  return value as Record<string, unknown>;
};

const getArray = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} is not an array`);
  }

  return value;
};

const getFirstTextContent = (value: unknown, label: string): string => {
  const content = getArray(value, label);
  const firstContent = assertRecord(content[0], `first ${label}`);
  const { text } = firstContent;

  if (typeof text !== "string") {
    throw new TypeError(`first ${label} text is not a string`);
  }

  return text;
};

const getTextFromResult = (result: unknown): string => {
  const resultRecord = assertRecord(result, "JSON-RPC result");

  if ("content" in resultRecord) {
    return getFirstTextContent(resultRecord.content, "tool content");
  }

  if ("contents" in resultRecord) {
    return getFirstTextContent(resultRecord.contents, "resource contents");
  }

  throw new Error("JSON-RPC result does not contain MCP text content");
};

const runInitialize = async (url: string): Promise<void> => {
  await postJsonRpc(url, {
    id: "initialize",
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      capabilities: {},
      clientInfo: {
        name: "sdocs-mcp-format-benchmark",
        version: "1.0.0",
      },
      protocolVersion: "2025-06-18",
    },
  });
};

const toBenchmarkResult = (
  title: string,
  toonText: string
): BenchmarkResult => {
  const decodedPayload = decode(toonText);
  const compactJson = JSON.stringify(decodedPayload);
  const prettyJson = JSON.stringify(decodedPayload, null, 2);
  const toonBytes = byteLength(toonText);
  const compactJsonBytes = byteLength(compactJson);
  const prettyJsonBytes = byteLength(prettyJson);

  return {
    compactJsonBytes,
    compactJsonEstimatedTokens: estimateTokens(compactJson),
    compactJsonSavingsPercent: savingsPercent(compactJsonBytes, toonBytes),
    prettyJsonBytes,
    prettyJsonEstimatedTokens: estimateTokens(prettyJson),
    prettyJsonSavingsPercent: savingsPercent(prettyJsonBytes, toonBytes),
    title,
    toonBytes,
    toonEstimatedTokens: estimateTokens(toonText),
  };
};

const benchmarkCase = async (
  url: string,
  benchmark: BenchmarkCase
): Promise<BenchmarkResult> => {
  const response = await postJsonRpc(url, benchmark.request);

  if (response.error) {
    throw new Error(
      `${benchmark.title} returned JSON-RPC error ${response.error.code}: ${response.error.message}`
    );
  }

  const toonText = getTextFromResult(response.result);
  return toBenchmarkResult(benchmark.title, toonText);
};

const averageResults = (
  title: string,
  results: BenchmarkResult[]
): BenchmarkResult => {
  const count = results.length;
  const sum = (select: (result: BenchmarkResult) => number): number =>
    results.reduce((total, result) => total + select(result), 0);

  return {
    compactJsonBytes: sum((result) => result.compactJsonBytes) / count,
    compactJsonEstimatedTokens:
      sum((result) => result.compactJsonEstimatedTokens) / count,
    compactJsonSavingsPercent:
      sum((result) => result.compactJsonSavingsPercent) / count,
    prettyJsonBytes: sum((result) => result.prettyJsonBytes) / count,
    prettyJsonEstimatedTokens:
      sum((result) => result.prettyJsonEstimatedTokens) / count,
    prettyJsonSavingsPercent:
      sum((result) => result.prettyJsonSavingsPercent) / count,
    title,
    toonBytes: sum((result) => result.toonBytes) / count,
    toonEstimatedTokens: sum((result) => result.toonEstimatedTokens) / count,
  };
};

const formatNumber = (value: number): string =>
  value.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });

const formatPercent = (value: number): string =>
  `${value.toLocaleString("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })}%`;

const pad = (value: string, width: number): string => value.padEnd(width, " ");

const toTableRows = (results: BenchmarkResult[]): string[][] =>
  results.map((result) => [
    result.title,
    formatNumber(result.toonBytes),
    formatNumber(result.compactJsonBytes),
    formatPercent(result.compactJsonSavingsPercent),
    formatNumber(result.prettyJsonBytes),
    formatPercent(result.prettyJsonSavingsPercent),
    formatNumber(result.toonEstimatedTokens),
    formatNumber(result.prettyJsonEstimatedTokens),
  ]);

const tableHeaders = [
  "Case",
  "TOON bytes",
  "JSON min bytes",
  "Save vs min",
  "JSON pretty bytes",
  "Save vs pretty",
  "TOON est tok",
  "Pretty est tok",
] as const;

const getColumnWidths = (rows: string[][]): number[] =>
  tableHeaders.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0))
  );

const renderRow = (row: readonly string[], widths: number[]): string =>
  row.map((cell, index) => pad(cell, widths[index] ?? 0)).join(TABLE_SEPARATOR);

const printResults = (
  results: BenchmarkResult[],
  options: CliOptions
): void => {
  const rows = toTableRows(results);
  const widths = getColumnWidths(rows);

  process.stdout.write(`MCP URL: ${options.url}\n`);
  process.stdout.write(`Iterations per case: ${options.iterations}\n`);
  process.stdout.write(
    `Estimated token counts use ${ESTIMATED_CHARS_PER_TOKEN} chars/token.\n\n`
  );
  process.stdout.write(`${renderRow(tableHeaders, widths)}\n`);
  process.stdout.write(
    `${widths.map((width) => "-".repeat(width)).join(TABLE_SEPARATOR)}\n`
  );

  for (const row of rows) {
    process.stdout.write(`${renderRow(row, widths)}\n`);
  }
};

const runBenchmark = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2));
  await runInitialize(options.url);

  const results: BenchmarkResult[] = [];
  for (const benchmark of benchmarkCases) {
    const runs: BenchmarkResult[] = [];

    for (let iteration = 0; iteration < options.iterations; iteration += 1) {
      runs.push(await benchmarkCase(options.url, benchmark));
    }

    results.push(averageResults(benchmark.title, runs));
  }

  printResults(results, options);
};

try {
  await runBenchmark();
} catch (error: unknown) {
  process.stderr.write(`Benchmark failed: ${formatError(error)}\n`);
  process.stderr.write(
    `Start the docs app first, for example: PORT=4000 bun run --filter fumadocs dev\n`
  );
  process.exitCode = 1;
}
