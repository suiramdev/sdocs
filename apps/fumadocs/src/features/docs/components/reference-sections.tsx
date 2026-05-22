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
    <section aria-labelledby="related-guides-heading" className="pt-0 mt-7">
      <div className="mb-3 grid gap-0.5">
        <h2 id="related-guides-heading">Related Guides</h2>
        <p className="max-w-[72ch] text-sm leading-snug text-muted-foreground">
          Broader workflow and conceptual references connected to this API.
        </p>
      </div>
      <div className="grid gap-2">
        {guides.map((guide) => (
          <Link
            className="group block rounded-lg border px-3 py-2.5 no-underline transition-colors hover:bg-muted/30"
            href={guide.url}
            key={guide.resourceUri}
          >
            <div className="text-sm font-medium text-foreground group-hover:underline">
              {guide.title}
            </div>
            {guide.description ? (
              <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-muted-foreground">
                {guide.description}
              </p>
            ) : null}
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
    <section aria-labelledby="referenced-api-heading" className="pt-0 mt-7">
      <div className="mb-3 grid gap-0.5">
        <h2 id="referenced-api-heading">Referenced API</h2>
        <p className="max-w-[72ch] text-sm leading-snug text-muted-foreground">
          Canonical API pages mentioned in this guide.
        </p>
      </div>
      <div className="grid gap-2">
        {symbols.map((symbol) => (
          <Link
            className="group block rounded-lg border px-3 py-2.5 no-underline transition-colors hover:bg-muted/30"
            href={symbol.docsUrl}
            key={`${symbol.resourceUri}-${symbol.fullName}`}
          >
            <div className="text-sm font-medium text-foreground group-hover:underline">
              {symbol.fullName}
            </div>
            <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-muted-foreground">
              {symbol.summary}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
};
