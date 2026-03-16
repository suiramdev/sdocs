"use client";

import { useCopyButton } from "fumadocs-ui/utils/use-copy-button";
import { Check, Copy } from "lucide-react";
import type { ReactElement, SVGProps } from "react";

import { Button } from "@/components/ui/button";

const MCP_CONFIG = `{
  "mcpServers": {
    "sdocs": {
      "url": "https://sdocs.suiram.dev/api/v1/mcp",
      "type": "streamableHttp"
    }
  }
}`;

const CURSOR_INSTALL_LINK =
  "cursor://anysphere.cursor-deeplink/mcp/install?name=sdocs&config=eyJzZG9jcyI6eyJ0eXBlIjoic3NlIiwidXJsIjoiaHR0cHM6Ly9zZG9jcy5zdWlyYW0uZGV2L2FwaS92MS9tY3AifX0=";
const VSCODE_INSTALL_LINK =
  "vscode:mcp/install?%7B%22name%22%3A%22sdocs%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fsdocs.suiram.dev%2Fapi%2Fv1%2Fmcp%22%7D";

interface McpConfigCopyButtonProps {
  label?: string;
}

interface McpInstallButtonProps {
  href: string;
  label: string;
  Logo: (props: SVGProps<SVGSVGElement>) => ReactElement;
}

const CursorLogo = (props: SVGProps<SVGSVGElement>) => (
  <svg
    fill="currentColor"
    role="img"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Cursor</title>
    <path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" />
  </svg>
);

const VscodeLogo = (props: SVGProps<SVGSVGElement>) => (
  <svg
    fill="currentColor"
    role="img"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>Visual Studio Code</title>
    <path d="m21.29 4.1-4.12-2a1.36 1.36 0 0 0-.48-.1h-.08a1.18 1.18 0 0 0-.72.24l-.14.12-7.88 7.19L4.44 7a.83.83 0 0 0-.54-.17.88.88 0 0 0-.53.17l-1.1 1a.8.8 0 0 0-.27.61.84.84 0 0 0 .27.62l3 2.71-3 2.72a.84.84 0 0 0 0 1.23l1.1 1a.89.89 0 0 0 .6.22.93.93 0 0 0 .47-.17l3.43-2.61 7.88 7.19a1.2 1.2 0 0 0 .76.36h.17a1 1 0 0 0 .49-.12l4.12-2a1.25 1.25 0 0 0 .71-1.1V5.23a1.26 1.26 0 0 0-.71-1.13zM17 16.47l-6-4.53 6-4.53z" />
  </svg>
);

const McpInstallButton = ({ href, label, Logo }: McpInstallButtonProps) => (
  <Button asChild className="[&_svg]:size-4 [&_svg]:shrink-0" size="sm">
    <a href={href} rel="noreferrer noopener">
      <Logo aria-hidden="true" />
      {label}
    </a>
  </Button>
);

export const McpConfigCopyButton = ({ label }: McpConfigCopyButtonProps) => {
  const [checked, onClick] = useCopyButton(() =>
    navigator.clipboard.writeText(MCP_CONFIG)
  );

  return (
    <Button
      className="[&_svg]:size-3.5 [&_svg]:text-fd-muted-foreground"
      onClick={onClick}
      size="sm"
      variant="secondary"
    >
      {checked ? <Check /> : <Copy />}
      {label ?? "Copy MCP config"}
    </Button>
  );
};

export const McpCursorInstallButton = () => (
  <McpInstallButton
    href={CURSOR_INSTALL_LINK}
    label="Add to Cursor"
    Logo={CursorLogo}
  />
);

export const McpVscodeInstallButton = () => (
  <McpInstallButton
    href={VSCODE_INSTALL_LINK}
    label="Install in VS Code"
    Logo={VscodeLogo}
  />
);
