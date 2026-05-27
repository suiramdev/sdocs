import Link from "next/link";

interface GuideSectionItem {
  description?: string;
  resourceUri: string;
  title: string;
  url: string;
}

interface ReferencedApiSymbolItem {
  docsUrl: string;
  fullName: string;
  resourceUri: string;
  summary: string;
}

export const RelatedGuidesSection = ({
  guides,
}: {
  guides: GuideSectionItem[];
}) => {
  if (guides.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="related-guides-heading"
      className="pt-0 mt-12 border-t"
    >
      <div className="mb-2 mt-4 grid gap-0.5">
        <h3
          className="m-0 text-sm font-semibold tracking-wide text-muted-foreground uppercase"
          id="related-guides-heading"
        >
          Related Guides
        </h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {guides.map((guide) => (
          <Link
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-3 py-1 text-xs font-mono text-muted-foreground no-underline transition-colors hover:bg-bg-hover hover:text-text"
            href={guide.url}
            key={guide.resourceUri}
          >
            <span>→</span>
            <span className="font-semibold text-text">{guide.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
};

export const ReferencedApiSymbolsSection = ({
  symbols,
}: {
  symbols: ReferencedApiSymbolItem[];
}) => {
  if (symbols.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="referenced-api-heading"
      className="pt-0 mt-12 border-t"
    >
      <div className="mb-2 mt-4 grid gap-0.5">
        <h3
          className="m-0 text-sm font-semibold tracking-wide text-muted-foreground uppercase"
          id="referenced-api-heading"
        >
          Referenced API
        </h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {symbols.map((symbol) => (
          <Link
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-3 py-1 text-xs font-mono text-muted-foreground no-underline transition-colors hover:bg-bg-hover hover:text-text"
            href={symbol.docsUrl}
            key={`${symbol.resourceUri}-${symbol.fullName}`}
          >
            <span>{symbol.fullName.split(".").at(-1) || symbol.fullName}</span>
          </Link>
        ))}
      </div>
    </section>
  );
};
