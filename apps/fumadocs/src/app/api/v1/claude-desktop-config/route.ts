import { CLAUDE_DESKTOP_MCP_CONFIG_JSON } from "@/features/docs/utils/mcp-install";

export const runtime = "nodejs";

export const GET = () =>
  new Response(CLAUDE_DESKTOP_MCP_CONFIG_JSON, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Disposition":
        "attachment; filename=sdocs.claude_desktop_config.json",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
