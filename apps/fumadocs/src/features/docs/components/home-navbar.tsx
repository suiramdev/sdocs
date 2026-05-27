"use client";

import { useI18n } from "fumadocs-ui/contexts/i18n";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { Search, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useLayoutEffect, useState } from "react";

import { McpButtonGroup } from "@/features/docs/components/mcp-button-group";
import { gitConfig } from "@/features/docs/utils/layout";
import { cn } from "@/shared/utils/cn";

const GitHubIcon = () => (
  <svg role="img" viewBox="0 0 24 24" fill="currentColor" className="size-4">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

function NavLargeSearch() {
  const { enabled, hotKey, setOpenSearch } = useSearchContext();
  const { text } = useI18n();
  if (!enabled) {
    return null;
  }
  return (
    <button
      type="button"
      data-search-full=""
      className="inline-flex items-center gap-2 rounded-xl border bg-fd-secondary/50 p-1.5 ps-2 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground w-full my-auto max-md:hidden max-w-sm ps-2.5"
      onClick={() => setOpenSearch(true)}
    >
      <Search className="size-4" />
      {text.search}
      <div className="ms-auto inline-flex gap-0.5">
        {hotKey.map((k, i) => (
          <kbd key={i} className="rounded-md border bg-fd-background px-1.5">
            {k.display}
          </kbd>
        ))}
      </div>
    </button>
  );
}

function NavSearchToggle() {
  const { enabled, setOpenSearch } = useSearchContext();
  if (!enabled) {
    return null;
  }
  return (
    <button
      type="button"
      data-search=""
      aria-label="Open Search"
      className="inline-flex size-7 items-center justify-center rounded-md p-1.5 text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground"
      onClick={() => setOpenSearch(true)}
    >
      <Search className="size-4" />
    </button>
  );
}

function NavThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => setMounted(true), []);
  const isDark = mounted ? resolvedTheme === "dark" : false;
  return (
    <button
      type="button"
      aria-label="Toggle Theme"
      data-theme-toggle=""
      className="inline-flex items-center rounded-full border p-1"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <Sun
        fill="currentColor"
        className={cn(
          "size-4 rounded-full p-0.5",
          !isDark && "bg-fd-accent text-fd-accent-foreground"
        )}
      />
      <Moon
        fill="currentColor"
        className={cn(
          "size-4 rounded-full p-0.5",
          isDark && "bg-fd-accent text-fd-accent-foreground"
        )}
      />
    </button>
  );
}

export function HomeNavbar() {
  return (
    <header
      id="nd-subnav"
      className="fixed flex flex-col top-(--fd-banner-height) left-0 right-(--removed-body-scroll-bar-size,0) z-10 h-14 backdrop-blur-sm transition-colors bg-fd-background/80"
    >
      <div className="flex border-b px-4 gap-2 flex-1 md:px-6 ps-7">
        <div className="flex flex-1 items-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 font-semibold"
          >
            s&box docs
          </Link>
        </div>

        <NavLargeSearch />

        <div className="flex flex-1 items-center justify-end md:gap-2">
          <div className="flex items-center gap-6 empty:hidden max-lg:hidden">
            <McpButtonGroup />
          </div>

          <a
            href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="inline-flex size-7 items-center justify-center rounded-md text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground max-lg:hidden"
          >
            <GitHubIcon />
          </a>

          <div className="flex items-center md:hidden">
            <NavSearchToggle />
          </div>

          <div className="flex items-center gap-2 max-md:hidden">
            <NavThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
