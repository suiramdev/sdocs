"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "fumadocs-ui/components/ui/popover";
import {
  ChevronDown,
  Check,
  Download,
  Copy,
  Wind,
  RefreshCw,
  Bot,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  CURSOR_INSTALL_LINK,
  VSCODE_INSTALL_LINK,
  CLAUDE_DESKTOP_CONFIG_DOWNLOAD_PATH,
  CLAUDE_DESKTOP_MCP_CONFIG_JSON,
} from "@/features/docs/utils/mcp-install";
import { cn } from "@/shared/utils/cn";

// Cursor SVG Icon
const CursorIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    fill="currentColor"
    role="img"
    viewBox="0 0 24 24"
    className={props.className}
    {...props}
  >
    <title>Cursor</title>
    <path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" />
  </svg>
);

// VS Code SVG Icon
const VscodeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    fill="currentColor"
    role="img"
    viewBox="0 0 24 24"
    className={props.className}
    {...props}
  >
    <title>Visual Studio Code</title>
    <path d="m21.29 4.1-4.12-2a1.36 1.36 0 0 0-.48-.1h-.08a1.18 1.18 0 0 0-.72.24l-.14.12-7.88 7.19L4.44 7a.83.83 0 0 0-.54-.17.88.88 0 0 0-.53.17l-1.1 1a.8.8 0 0 0-.27.61.84.84 0 0 0 .27.62l3 2.71-3 2.72a.84.84 0 0 0 0 1.23l1.1 1a.89.89 0 0 0 .6.22.93.93 0 0 0 .47-.17l3.43-2.61 7.88 7.19a1.2 1.2 0 0 0 .76.36h.17a1 1 0 0 0 .49-.12l4.12-2a1.25 1.25 0 0 0 .71-1.1V5.23a1.26 1.26 0 0 0-.71-1.13zM17 16.47l-6-4.53 6-4.53z" />
  </svg>
);

const IDES = [
  {
    actionType: "link" as const,
    actionValue: CURSOR_INSTALL_LINK,
    hint: "One-click install",
    icon: CursorIcon,
    id: "cursor",
    name: "Cursor",
  },
  {
    actionType: "link" as const,
    actionValue: VSCODE_INSTALL_LINK,
    hint: "One-click install",
    icon: VscodeIcon,
    id: "vscode",
    name: "VS Code",
  },
  {
    actionType: "link" as const,
    actionValue: CLAUDE_DESKTOP_CONFIG_DOWNLOAD_PATH,
    hint: "Download config.json",
    icon: Download,
    id: "claude",
    name: "Claude Desktop",
  },
  {
    actionType: "copy" as const,
    actionValue: CLAUDE_DESKTOP_MCP_CONFIG_JSON,
    hint: "Copy settings JSON",
    icon: Wind,
    id: "windsurf",
    name: "Windsurf",
  },
  {
    actionType: "copy" as const,
    actionValue: CLAUDE_DESKTOP_MCP_CONFIG_JSON,
    hint: "Copy settings JSON",
    icon: Copy,
    id: "zed",
    name: "Zed",
  },
  {
    actionType: "copy" as const,
    actionValue: CLAUDE_DESKTOP_MCP_CONFIG_JSON,
    hint: "Copy settings JSON",
    icon: RefreshCw,
    id: "continue",
    name: "Continue",
  },
  {
    actionType: "copy" as const,
    actionValue: CLAUDE_DESKTOP_MCP_CONFIG_JSON,
    hint: "Copy settings JSON",
    icon: Bot,
    id: "cline",
    name: "Cline / Roo Code",
  },
];

export const McpButtonGroup = () => {
  const [selectedIde, setSelectedIde] = useState(IDES[0]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const executeAction = async (ide: (typeof IDES)[number]) => {
    if (ide.actionType === "link") {
      window.open(ide.actionValue, "_self");
    } else if (ide.actionType === "copy") {
      try {
        await navigator.clipboard.writeText(ide.actionValue);
      } catch (error) {
        console.warn("Clipboard access failed:", error);
      }
      setCopiedId(ide.id);
      setTimeout(() => {
        setCopiedId(null);
      }, 2000);
    }
  };

  const handleMainClick = () => {
    executeAction(selectedIde);
  };

  const handleSelectIde = (ide: (typeof IDES)[number]) => {
    setSelectedIde(ide);
    executeAction(ide);
    setIsOpen(false);
  };

  const ActiveIcon = selectedIde.icon;

  return (
    <div className="inline-flex items-center">
      <Button
        onClick={handleMainClick}
        variant="secondary"
        size="default"
        className="rounded-r-none border-r border-r-border gap-2 font-medium hover:bg-accent/80 transition-colors"
      >
        {copiedId === selectedIde.id ? (
          <Check className="size-3.5 text-emerald-500 animate-in fade-in zoom-in-75 duration-100" />
        ) : (
          <ActiveIcon className="size-3.5 shrink-0" />
        )}
        <span>
          {copiedId === selectedIde.id
            ? "Copied!"
            : `Add to ${selectedIde.name}`}
        </span>
      </Button>

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            size="default"
            className="rounded-l-none px-2 hover:bg-accent/80 transition-colors"
            aria-label="Select IDE"
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform duration-200",
                isOpen && "rotate-180"
              )}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="flex flex-col p-1 w-[220px] max-h-[350px] overflow-y-auto bg-background border border-border shadow-lg rounded-lg gap-0.5 z-50"
        >
          <div className="px-2.5 py-1.5 text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border mb-1">
            Choose IDE
          </div>
          {IDES.map((ide) => {
            const Icon = ide.icon;
            const isSelected = ide.id === selectedIde.id;
            const isCopied = copiedId === ide.id;

            return (
              <button
                key={ide.id}
                onClick={() => handleSelectIde(ide)}
                className={cn(
                  "flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs rounded-md transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer",
                  isSelected && "bg-accent/40 font-medium"
                )}
              >
                {isCopied ? (
                  <Check className="size-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <Icon className="size-3.5 text-muted-foreground shrink-0" />
                )}
                <div className="flex flex-col">
                  <span className="text-[12px] font-medium">{ide.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {ide.hint}
                  </span>
                </div>
                {isSelected && !isCopied && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
    </div>
  );
};
