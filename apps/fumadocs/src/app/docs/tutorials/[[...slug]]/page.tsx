import { posix } from "node:path";

import { getTableOfContents } from "fumadocs-core/content/toc";
import { createMarkdownRenderer } from "fumadocs-core/content/md";
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import remarkGfm from "remark-gfm";

import {
  getTutorialRelatedGuides,
  getTutorialRelatedSymbols,
} from "@/features/api/v1/services/tutorial-relations";
import { DocsPageHeader } from "@/features/docs/components/docs-page-header";
import { getMDXComponents } from "@/features/docs/components/mdx-components";
import {
  LLMCopyButton,
  ViewOptions,
} from "@/features/docs/components/page-actions";
import {
  ReferencedApiSymbolsSection,
  RelatedGuidesSection,
} from "@/features/docs/components/reference-sections";
import {
  buildTutorialRawGithubUrl,
  getAllTutorialDocPages,
  getTutorialDocPage,
  TUTORIAL_DOCS_FOLDER_NAME,
  TUTORIAL_DOCS_FOLDER_URL,
  toTutorialDocsUrl,
} from "@/features/learn-docs/utils/source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface TutorialDocsPageProps {
  params: Promise<{
    slug?: string[];
  }>;
}

const LEARN_SITE_PREFIXES = [
  "https://sbox.game/learn/",
  `${TUTORIAL_DOCS_FOLDER_URL}/`,
  "/learn/",
] as const;
const GUIDE_SITE_PREFIXES = [
  "https://sbox.game/dev/doc/",
  "https://sbox.facepunch.com/docs/",
  "/dev/doc/",
  "/docs/official/",
] as const;
const MARKDOWN_EXTENSION_PATTERN = /\.md$/u;

const buildExternalRel = (rel: string | undefined): string => {
  const tokens = new Set([
    ...(rel ?? "").split(" ").filter((token) => token.length > 0),
    "noopener",
    "noreferrer",
  ]);

  return [...tokens].join(" ");
};

const splitHrefSuffix = (
  href: string
): {
  baseHref: string;
  suffix: string;
} => {
  const hashIndex = href.indexOf("#");
  const queryIndex = href.indexOf("?");
  const indexes = [hashIndex, queryIndex].filter((index) => index >= 0);
  const suffixStart = indexes.length > 0 ? Math.min(...indexes) : -1;

  if (suffixStart < 0) {
    return {
      baseHref: href,
      suffix: "",
    };
  }

  return {
    baseHref: href.slice(0, suffixStart),
    suffix: href.slice(suffixStart),
  };
};

const toTutorialSlugFromRepoPath = (repoPath: string): string =>
  repoPath.replace(/^docs\//u, "").replace(MARKDOWN_EXTENSION_PATTERN, "");

const rewritePrefixedHref = (
  href: string,
  prefixes: readonly string[],
  rewrite: (relativePath: string) => string
): string | null => {
  for (const prefix of prefixes) {
    if (!href.startsWith(prefix)) {
      continue;
    }

    const relativePath = href
      .slice(prefix.length)
      .replace(/[#?].*$/u, "")
      .replaceAll(/^\/+|\/+$/gu, "");

    return rewrite(relativePath);
  }

  return null;
};

const rewriteGuideHref = (href: string): string | null =>
  rewritePrefixedHref(href, GUIDE_SITE_PREFIXES, (relativePath) =>
    relativePath.length > 0 ? `/docs/official/${relativePath}` : "/docs/official"
  );

const rewriteTutorialHref = (href: string): string | null =>
  rewritePrefixedHref(href, LEARN_SITE_PREFIXES, (relativePath) =>
    toTutorialDocsUrl(relativePath)
  );

const resolveRelativeRepoPath = (
  currentRepoPath: string,
  href: string
): string => posix.normalize(posix.join(posix.dirname(currentRepoPath), href));

const resolveTutorialHref = (
  page: NonNullable<Awaited<ReturnType<typeof getTutorialDocPage>>>,
  href: string
): string => {
  if (href.startsWith("#")) {
    return href;
  }

  const { baseHref, suffix } = splitHrefSuffix(href);
  const tutorialHref = rewriteTutorialHref(baseHref);
  if (tutorialHref) {
    return `${tutorialHref}${suffix}`;
  }

  const guideHref = rewriteGuideHref(baseHref);
  if (guideHref) {
    return `${guideHref}${suffix}`;
  }

  if (
    baseHref.startsWith("http://") ||
    baseHref.startsWith("https://") ||
    baseHref.startsWith("mailto:") ||
    baseHref.startsWith("tel:") ||
    baseHref.startsWith("data:") ||
    baseHref.startsWith("/")
  ) {
    return href;
  }

  const resolvedRepoPath = resolveRelativeRepoPath(page.repoPath, baseHref);
  if (resolvedRepoPath.endsWith(".md")) {
    return `${toTutorialDocsUrl(toTutorialSlugFromRepoPath(resolvedRepoPath))}${suffix}`;
  }

  return `${buildTutorialRawGithubUrl(resolvedRepoPath, page.sha)}${suffix}`;
};

const resolveTutorialImageSrc = (
  page: NonNullable<Awaited<ReturnType<typeof getTutorialDocPage>>>,
  src: string
): string => {
  if (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("data:") ||
    src.startsWith("/")
  ) {
    return src;
  }

  return buildTutorialRawGithubUrl(
    resolveRelativeRepoPath(page.repoPath, src),
    page.sha
  );
};

const TutorialDocsAnchor = ({
  children,
  href,
  rel,
  target,
  tutorialPage,
  ...props
}: ComponentPropsWithoutRef<"a"> & {
  tutorialPage: NonNullable<Awaited<ReturnType<typeof getTutorialDocPage>>>;
}) => {
  if (typeof href !== "string") {
    return (
      <a href={href} rel={rel} target={target} {...props}>
        {children}
      </a>
    );
  }

  const resolvedHref = resolveTutorialHref(tutorialPage, href);
  const isInternalHref =
    resolvedHref.startsWith("/") && !resolvedHref.startsWith("//");

  if (isInternalHref) {
    return (
      <Link href={resolvedHref} target={target} {...props}>
        {children}
      </Link>
    );
  }

  const linkRel =
    target === "_blank" || resolvedHref.startsWith("http")
      ? buildExternalRel(rel)
      : rel;

  return (
    <a href={resolvedHref} rel={linkRel} target={target} {...props}>
      {children}
    </a>
  );
};

const TutorialDocsImage = ({
  alt,
  className,
  loading,
  src,
  tutorialPage,
  ...props
}: ComponentPropsWithoutRef<"img"> & {
  tutorialPage: NonNullable<Awaited<ReturnType<typeof getTutorialDocPage>>>;
}) => {
  const resolvedSrc =
    typeof src === "string" ? resolveTutorialImageSrc(tutorialPage, src) : src;

  return (
    <img
      alt={alt ?? ""}
      className={className}
      loading={loading ?? "lazy"}
      src={resolvedSrc}
      {...props}
    />
  );
};

const renderTutorialMarkdown = async (
  page: NonNullable<Awaited<ReturnType<typeof getTutorialDocPage>>>
): Promise<ReactNode> => {
  const renderer = createMarkdownRenderer({
    remarkPlugins: [remarkGfm],
  });

  return await renderer.MarkdownServer({
    children: page.markdown,
    components: getMDXComponents({
      a: (props) => <TutorialDocsAnchor tutorialPage={page} {...props} />,
      img: (props) => <TutorialDocsImage tutorialPage={page} {...props} />,
    }),
  });
};

const getTutorialMetadata = (
  page: NonNullable<Awaited<ReturnType<typeof getTutorialDocPage>>>
): ReactNode => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
    {page.author ? <span>By {page.author}</span> : null}
    {page.difficulty ? <span>{page.difficulty}</span> : null}
    {page.topic ? <span>{page.topic}</span> : null}
    <a
      className="underline underline-offset-4"
      href={page.url}
      rel="noreferrer noopener"
      target="_blank"
    >
      View on sbox.game/learn
    </a>
  </div>
);

const TutorialCard = ({
  page,
}: {
  page: Awaited<ReturnType<typeof getAllTutorialDocPages>>[number];
}) => (
  <Link
    className="group block rounded-xl border p-4 no-underline transition-colors hover:bg-muted/30"
    href={page.docsUrl}
  >
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {page.author ? <span>{page.author}</span> : null}
      {page.difficulty ? <span>{page.difficulty}</span> : null}
      {page.topic ? <span>{page.topic}</span> : null}
    </div>
    <div className="mt-2 font-medium text-foreground group-hover:underline">
      {page.title}
    </div>
    {page.summary ? (
      <p className="mt-1.5 line-clamp-3 text-sm leading-snug text-muted-foreground">
        {page.summary}
      </p>
    ) : null}
    {page.tags.length > 0 ? (
      <div className="mt-3 flex flex-wrap gap-1.5">
        {page.tags.slice(0, 4).map((tag) => (
          <span
            className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
            key={`${page.slug}-${tag}`}
          >
            {tag}
          </span>
        ))}
      </div>
    ) : null}
  </Link>
);

const TutorialIndexPage = async () => {
  const pages = (await getAllTutorialDocPages()).toSorted((left, right) =>
    left.title.localeCompare(right.title)
  );

  return (
    <DocsPage>
      <DocsPageHeader
        description="Community tutorials mirrored from sbox.game/learn and rendered directly in the docs site."
        metadata={<span>{pages.length} mirrored tutorials</span>}
        title={TUTORIAL_DOCS_FOLDER_NAME}
      />
      <DocsBody>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pages.map((page) => (
            <TutorialCard key={page.slug} page={page} />
          ))}
        </div>
      </DocsBody>
    </DocsPage>
  );
};

const TutorialDetailPage = async ({
  slug,
}: {
  slug: string;
}) => {
  const page = await getTutorialDocPage(slug);
  if (!page) {
    notFound();
  }

  const [relatedGuides, relatedSymbols, toc] = await Promise.all([
    getTutorialRelatedGuides(page.slug),
    getTutorialRelatedSymbols(page.slug),
    getTableOfContents(page.markdown, [remarkGfm]),
  ]);
  const renderedMarkdown = await renderTutorialMarkdown(page);
  const rawMarkdownUrl = `/api/tutorial-docs/raw?slug=${encodeURIComponent(page.slug)}`;

  return (
    <DocsPage toc={toc}>
      <DocsPageHeader
        actions={
          <>
            <LLMCopyButton markdownUrl={rawMarkdownUrl} />
            <ViewOptions githubUrl={page.githubUrl} markdownUrl={rawMarkdownUrl} />
          </>
        }
        description={page.summary}
        metadata={getTutorialMetadata(page)}
        title={page.title}
      />
      <DocsBody>
        {renderedMarkdown}
        <RelatedGuidesSection guides={relatedGuides} />
        <ReferencedApiSymbolsSection symbols={relatedSymbols} />
      </DocsBody>
    </DocsPage>
  );
};

export default async function TutorialDocsPage(props: TutorialDocsPageProps) {
  const params = await props.params;
  const slug = (params.slug ?? []).join("/").trim();

  return slug.length > 0 ? (
    <TutorialDetailPage slug={slug} />
  ) : (
    <TutorialIndexPage />
  );
}

export const generateMetadata = async (
  props: TutorialDocsPageProps
): Promise<Metadata> => {
  const params = await props.params;
  const slug = (params.slug ?? []).join("/").trim();
  if (slug.length === 0) {
    return {
      description:
        "Community tutorials mirrored from sbox.game/learn and rendered in the s&box docs site.",
      title: TUTORIAL_DOCS_FOLDER_NAME,
    };
  }

  const page = await getTutorialDocPage(slug);
  if (!page) {
    notFound();
  }

  return {
    description: page.summary,
    title: page.title,
  };
};
