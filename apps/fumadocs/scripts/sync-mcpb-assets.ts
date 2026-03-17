import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { strToU8, zipSync } from "fflate";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const projectRoot = path.resolve(appRoot, "..", "..");
const bundleEntryPoint = path.join(
  appRoot,
  "src",
  "features",
  "mcpb",
  "server",
  "index.ts"
);
const generatedDir = path.join(appRoot, "generated", "mcpb");
const generatedServerDir = path.join(generatedDir, "server");
const bundledServerPath = path.join(generatedServerDir, "index.js");
const outputBundlePath = path.join(generatedDir, "sdocs.mcpb");
const toolRegistryDir = path.join(appRoot, "data", "api", "tools");
const defaultPublicAppBaseUrl = "http://localhost:4000";

interface ToolDescriptor {
  description?: string;
  name?: string;
}

const bundleEntrypointArgument = String.raw`\${__dirname}/server/index.js`;

const normalizeBaseUrl = (value: string | undefined): string | undefined => {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return undefined;
  }

  return trimmedValue.replace(/\/+$/u, "");
};

const publicAppBaseUrl =
  normalizeBaseUrl(process.env.APP_BASE_URL) ??
  normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_BASE_URL) ??
  defaultPublicAppBaseUrl;

const buildPublicUrl = (pathname: string): string =>
  new URL(pathname, `${publicAppBaseUrl}/`).toString();

const readToolDescriptors = async () => {
  const directoryEntries = await readdir(toolRegistryDir);
  const fileNames = directoryEntries
    .filter((fileName) => fileName.endsWith(".json"))
    .toSorted();

  const tools = await Promise.all(
    fileNames.map(async (fileName) => {
      const filePath = path.join(toolRegistryDir, fileName);
      const raw = await readFile(filePath, "utf8");
      const tool = JSON.parse(raw) as ToolDescriptor;

      if (!tool.name || !tool.description) {
        return null;
      }

      return {
        description: tool.description,
        name: tool.name,
      };
    })
  );

  return tools.filter((tool) => tool !== null);
};

const manifest = async () => ({
  author: {
    name: "sdocs",
    url: publicAppBaseUrl,
  },
  compatibility: {
    claude_desktop: ">=1.0.0",
    platforms: ["darwin", "win32", "linux"],
    runtimes: {
      node: ">=18.0.0",
    },
  },
  description: "Browse the s&box API reference from Claude Desktop.",
  display_name: "sdocs MCP Server",
  documentation: buildPublicUrl("/docs/mcp"),
  homepage: buildPublicUrl("/docs/mcp"),
  keywords: ["mcp", "docs", "sbox", "sandbox", "api"],
  long_description:
    "Install the sdocs MCP server in Claude Desktop. The bundled local proxy forwards MCP requests to the hosted sdocs API reference server over HTTP.",
  manifest_version: "0.3",
  name: "sdocs",
  server: {
    entry_point: "server/index.js",
    mcp_config: {
      args: [bundleEntrypointArgument],
      command: "node",
      env: {
        SDOCS_MCP_URL: buildPublicUrl("/api/v1/mcp"),
      },
    },
    type: "node",
  },
  support: buildPublicUrl("/docs/mcp"),
  tools: await readToolDescriptors(),
  version: "1.0.0",
});

const buildBundledServer = async () => {
  await rm(generatedDir, { force: true, recursive: true });
  await mkdir(generatedServerDir, { recursive: true });

  const build = Bun.spawnSync({
    cmd: [
      "bun",
      "build",
      bundleEntryPoint,
      "--format=cjs",
      "--outfile",
      bundledServerPath,
      "--sourcemap=none",
      "--target=node",
    ],
    cwd: appRoot,
    stderr: "pipe",
    stdout: "pipe",
  });

  if (build.exitCode !== 0) {
    const stderr = new TextDecoder().decode(build.stderr);
    throw new Error(`Failed to bundle MCPB proxy server.\n${stderr}`);
  }
};

const writeBundle = async () => {
  const serverCode = await readFile(bundledServerPath);
  const manifestJson = `${JSON.stringify(await manifest(), null, 2)}\n`;
  const archive = zipSync(
    {
      "manifest.json": strToU8(manifestJson),
      "server/index.js": new Uint8Array(serverCode),
    },
    { level: 9 }
  );

  await writeFile(outputBundlePath, archive);
};

const main = async () => {
  process.chdir(projectRoot);
  await buildBundledServer();
  await writeBundle();
  console.log(`Generated ${path.relative(appRoot, outputBundlePath)}`);
};

const run = async (): Promise<void> => {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

run();
