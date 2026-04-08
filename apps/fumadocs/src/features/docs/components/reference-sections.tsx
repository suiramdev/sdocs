import Link from "next/link";

import type {
  RelatedGuide,
  RelatedGuideSymbol,
} from "@/features/api/v1/services/guide-relations";

export const RelatedGuidesSection = ({
  guides,
}: {
  guides: RelatedGuide[];
}) => {
  if (guides.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="related-guides-heading" className="pt-0 mt-9">
      <div className="mb-4 grid gap-1">
        <h2 id="related-guides-heading">Related Guides</h2>
        <p className="max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
          Broader workflow and conceptual references connected to this API.
        </p>
      </div>
      <div className="grid gap-3">
        {guides.map((guide) => (
          <Link
            className="group block rounded-xl border p-4 no-underline transition-colors hover:bg-muted/30"
            href={guide.url}
            key={guide.resourceUri}
          >
            <div className="font-medium text-foreground group-hover:underline">
              {guide.title}
            </div>
            {guide.description ? (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
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
  symbols: RelatedGuideSymbol[];
}) => {
  if (symbols.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="referenced-api-heading" className="pt-0 mt-9">
      <div className="mb-4 grid gap-1">
        <h2 id="referenced-api-heading">Referenced API</h2>
        <p className="max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
          Canonical API pages mentioned in this guide.
        </p>
      </div>
      <div className="grid gap-3">
        {symbols.map((symbol) => (
          <Link
            className="group block rounded-xl border p-4 no-underline transition-colors hover:bg-muted/30"
            href={symbol.docsUrl}
            key={`${symbol.resourceUri}-${symbol.fullName}`}
          >
            <div className="font-medium text-foreground group-hover:underline">
              {symbol.fullName}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {symbol.summary}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
};
