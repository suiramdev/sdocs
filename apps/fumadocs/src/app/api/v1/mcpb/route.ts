import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { strToU8, zipSync } from "fflate";

import { getPublicAppOrigin } from "@/app/api/utils/public-origin";

export const runtime = "nodejs";

const bundledServerPath = path.join(
  process.cwd(),
  "generated",
  "mcpb",
  "server",
  "index.js"
);
const toolRegistryDir = path.join(process.cwd(), "data", "api", "tools");
const bundleEntrypointArgument = String.raw`\${__dirname}/server/index.js`;

interface ToolDescriptor {
  description?: string;
  name?: string;
}

const buildPublicUrl = (origin: string, pathname: string): string =>
  new URL(pathname, `${origin}/`).toString();

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

const buildManifest = async (origin: string) => ({
  author: {
    name: "sdocs",
    url: origin,
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
  documentation: buildPublicUrl(origin, "/docs/mcp"),
  homepage: buildPublicUrl(origin, "/docs/mcp"),
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
        SDOCS_MCP_URL: buildPublicUrl(origin, "/api/mcp"),
      },
    },
    type: "node",
  },
  support: buildPublicUrl(origin, "/docs/mcp"),
  tools: await readToolDescriptors(),
  version: "1.0.0",
});

export const GET = async (request: Request) => {
  try {
    const serverCode = await readFile(bundledServerPath);
    const manifestJson = `${JSON.stringify(
      await buildManifest(getPublicAppOrigin(request)),
      null,
      2
    )}\n`;
    const archive = zipSync(
      {
        "manifest.json": strToU8(manifestJson),
        "server/index.js": new Uint8Array(serverCode),
      },
      { level: 9 }
    );
    const body = Buffer.from(archive);

    return new Response(body, {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Content-Disposition": "attachment; filename=sdocs.mcpb",
        "Content-Type": "application/zip",
      },
    });
  } catch {
    return new Response("MCP bundle is not available yet.", { status: 503 });
  }
};
