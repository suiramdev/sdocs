"use client";

import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { useCopyButton } from "fumadocs-ui/utils/use-copy-button";
import { Check, Copy } from "lucide-react";

import { cn } from "@/shared/utils/cn";

const MCP_CONFIG = `{
  "mcpServers": {
    "sdocs": {
      "url": "https://sdocs.suiram.dev/api/v1/mcp"
    }
  }
}`;

const CURSOR_INSTALL_LINK =
  "cursor://anysphere.cursor-deeplink/mcp/install?name=sdocs&config=eyJzZG9jcyI6eyJ0eXBlIjoic3NlIiwidXJsIjoiaHR0cHM6Ly9zZG9jcy5zdWlyYW0uZGV2L2FwaS92MS9tY3AifX0=";

interface McpConfigCopyButtonProps {
  label?: string;
}

export function McpConfigCopyButton({ label }: McpConfigCopyButtonProps) {
  const [checked, onClick] = useCopyButton(async () =>
    navigator.clipboard.writeText(MCP_CONFIG)
  );

  return (
    <button
      type="button"
      className={cn(
        buttonVariants({
          className: "gap-2 [&_svg]:size-3.5 [&_svg]:text-fd-muted-foreground",
          color: "secondary",
          size: "sm",
        })
      )}
      onClick={onClick}
    >
      {checked ? <Check /> : <Copy />}
      {label ?? "Copy MCP config"}
    </button>
  );
}

export function McpCursorInstallButton() {
  return (
    <a href={CURSOR_INSTALL_LINK} rel="noreferrer noopener">
      <img
        src="https://cursor.com/deeplink/mcp-install-dark.svg"
        alt="Add to Cursor in Cursor IDE"
        className="h-7"
      />
    </a>
  );
}
