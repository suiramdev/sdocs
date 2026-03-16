export const runtime = "nodejs";

const MCP_BUNDLE_CONFIG = {
  $schema: "https://static.modelcontextprotocol.io/schemas/2025-09-16/mcpb.schema.json",
  description: "sdocs MCP server",
  name: "sdocs",
  packages: [
    {
      registryData: {
        "@sdocs/server": {
          version: "1.0.0",
        },
      },
      identifier: "@sdocs/server",
      registryType: "npm",
      runtimeHint: "node",
      transport: {
        type: "http",
        url: "https://sdocs.suiram.dev/api/v1/mcp",
      },
    },
  ],
} as const;

export const GET = () => {
  const body = `${JSON.stringify(MCP_BUNDLE_CONFIG, null, 2)}\n`;

  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": "attachment; filename=sdocs.mcpb",
      "Content-Type": "application/mcpb+json; charset=utf-8",
    },
  });
};
