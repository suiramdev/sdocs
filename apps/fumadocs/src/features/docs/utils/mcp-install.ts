const DEFAULT_PUBLIC_APP_BASE_URL = "http://localhost:4000";

const normalizeBaseUrl = (value: string | undefined): string | undefined => {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return undefined;
  }

  return trimmedValue.replace(/\/+$/u, "");
};

const publicAppBaseUrl =
  normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_BASE_URL) ??
  normalizeBaseUrl(process.env.APP_BASE_URL) ??
  DEFAULT_PUBLIC_APP_BASE_URL;

const buildPublicUrl = (pathname: string): string =>
  new URL(pathname, `${publicAppBaseUrl}/`).toString();

const encodeBase64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }

  return btoa(binary);
};

export const SDOCS_MCP_URL = buildPublicUrl("/api/v1/mcp");

export const CLAUDE_DESKTOP_MCP_CONFIG = {
  mcpServers: {
    sdocs: {
      type: "http",
      url: SDOCS_MCP_URL,
    },
  },
} as const;

export const CLAUDE_DESKTOP_MCP_CONFIG_JSON = `${JSON.stringify(
  CLAUDE_DESKTOP_MCP_CONFIG,
  null,
  2
)}\n`;

export const MCPB_INSTALL_LINK = buildPublicUrl("/api/v1/mcpb");

export const CLAUDE_DESKTOP_CONFIG_DOWNLOAD_PATH = buildPublicUrl(
  "/api/v1/claude-desktop-config"
);

const cursorInstallConfig = {
  sdocs: {
    type: "sse",
    url: SDOCS_MCP_URL,
  },
} as const;

export const CURSOR_INSTALL_LINK = `cursor://anysphere.cursor-deeplink/mcp/install?name=sdocs&config=${encodeBase64(
  JSON.stringify(cursorInstallConfig)
)}`;

export const VSCODE_INSTALL_LINK = `vscode:mcp/install?${encodeURIComponent(
  JSON.stringify({
    name: "sdocs",
    type: "http",
    url: SDOCS_MCP_URL,
  })
)}`;
