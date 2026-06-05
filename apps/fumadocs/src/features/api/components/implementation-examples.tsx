"use client";

import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import { ExternalLinkIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const FETCH_TAKE = 3;
const OBSERVER_ROOT_MARGIN = "300px";

interface ImplementationExample {
  code: string;
  fileName: string;
  filePath: string;
  packageIdent: string;
  packageUrl?: string;
}

interface CodeSearchEnvelope {
  data?: {
    examples?: ImplementationExample[];
  };
}

type FetchState = "idle" | "loading" | "loaded" | "error";

interface ImplementationExamplesProps {
  anchor: string;
  query: string;
}

const fetchImplementationExamples = async (
  query: string,
  signal: AbortSignal
): Promise<ImplementationExample[]> => {
  const params = new URLSearchParams({
    q: query,
    take: String(FETCH_TAKE),
  });
  const response = await fetch(`/api/v1/code-search?${params}`, { signal });

  if (!response.ok) {
    throw new Error(
      `Code search request failed with status ${response.status}.`
    );
  }

  const payload = (await response.json()) as CodeSearchEnvelope;
  return payload.data?.examples ?? [];
};

const ExampleSourceLink = ({ example }: { example: ImplementationExample }) => {
  if (!example.packageUrl) {
    return null;
  }

  return (
    <p className="m-0 flex items-center text-xs leading-6">
      <a
        className="inline-flex items-center gap-1.5 text-muted-foreground underline underline-offset-2"
        href={example.packageUrl}
        rel="noopener"
        target="_blank"
      >
        <span>{example.packageIdent} on sbox.game</span>
        <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
      </a>
    </p>
  );
};

const ExampleAccordionTitle = ({
  example,
}: {
  example: ImplementationExample;
}) => (
  <span className="grid gap-0.5">
    <span className="text-sm leading-6 font-semibold">{example.filePath}</span>
    <span className="text-muted-foreground text-xs leading-5">
      {example.packageIdent}
    </span>
  </span>
);

export const ImplementationExamples = ({
  anchor,
  query,
}: ImplementationExamplesProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const [state, setState] = useState<FetchState>("idle");
  const [examples, setExamples] = useState<ImplementationExample[]>([]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const abortController = new AbortController();

    const loadExamples = async () => {
      setState("loading");

      try {
        const loaded = await fetchImplementationExamples(
          query,
          abortController.signal
        );
        setExamples(loaded);
        setState("loaded");
      } catch {
        if (!abortController.signal.aborted) {
          setState("error");
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (startedRef.current) {
          return;
        }

        if (entries.some((entry) => entry.isIntersecting)) {
          startedRef.current = true;
          observer.disconnect();
          loadExamples();
        }
      },
      { rootMargin: OBSERVER_ROOT_MARGIN }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
      abortController.abort();
    };
  }, [query]);

  return (
    <div ref={containerRef}>
      {state === "loaded" && examples.length > 0 ? (
        <section aria-labelledby={`${anchor}-implementations`} className="mt-4">
          <h4
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase mb-1"
            id={`${anchor}-implementations`}
          >
            Implementations
          </h4>
          <p className="max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
            Real-world usage from published sbox.game packages.
          </p>
          <Accordions className="-mt-0.5" defaultValue={[]} type="multiple">
            {examples.map((example, index) => (
              <Accordion
                id={`${anchor}-implementation-${index + 1}`}
                key={`${example.packageIdent}-${example.filePath}`}
                title={<ExampleAccordionTitle example={example} />}
                value={`${example.packageIdent}-${example.filePath}`}
              >
                <div className="grid gap-3 pt-1">
                  <div className="overflow-hidden rounded-xl border bg-muted/20 [&_pre]:m-0 [&_pre]:rounded-none [&_pre]:text-sm [&_pre]:leading-relaxed">
                    <DynamicCodeBlock code={example.code} lang="csharp" />
                  </div>
                  <ExampleSourceLink example={example} />
                </div>
              </Accordion>
            ))}
          </Accordions>
        </section>
      ) : null}
    </div>
  );
};
