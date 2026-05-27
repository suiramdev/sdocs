import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { McpButtonGroup } from "@/features/docs/components/mcp-button-group";

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[var(--bg)] text-[var(--text)] flex flex-col items-center justify-center font-sans select-none overflow-x-hidden p-6 relative">
      <section className="relative z-10 max-w-[800px] w-full mx-auto text-center flex flex-col items-center">
        {/* Title */}
        <h1 className="text-[clamp(40px,5vw,64px)] font-bold tracking-tight leading-[1.1] text-foreground mb-4 text-balance">
          s&box docs
        </h1>

        {/* Brief Description */}
        <p className="text-[16px] md:text-[18px] leading-[1.6] text-muted-foreground max-w-[56ch] mx-auto mb-8 text-pretty">
          The complete C# API reference, hand-written guides, and community
          tutorials for s&box. Connected directly to your local development
          agents.
        </p>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button asChild>
            <Link href="/docs">
              Browse Documentation
              <ArrowRight className="size-4 shrink-0" />
            </Link>
          </Button>
          <McpButtonGroup />
        </div>
      </section>
    </div>
  );
}
