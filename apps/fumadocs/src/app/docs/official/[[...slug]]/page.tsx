import { createMarkdownRenderer } from "fumadocs-core/content/md";
import { Callout } from "fumadocs-ui/components/callout";
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page";
import GithubSlugger from "github-slugger";
import type { Nodes } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { toString as hastToString } from "hast-util-to-string";
import type { MDXComponents } from "mdx/types";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, isValidElement } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import * as JsxRuntime from "react/jsx-runtime";
import rehypeRaw from "rehype-raw";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import { visit } from "unist-util-visit";

import { getGuideRelatedSymbols } from "@/features/api/v1/services/guide-relations";
import type { RelatedGuideSymbol } from "@/features/api/v1/services/guide-relations";
import { DocsPageHeader } from "@/features/docs/components/docs-page-header";
import { getMDXComponents } from "@/features/docs/components/mdx-components";
import {
  LLMCopyButton,
  ViewOptions,
} from "@/features/docs/components/page-actions";
import { ReferencedApiSymbolsSection } from "@/features/docs/components/reference-sections";
import {
  getOfficialDocPage,
  OFFICIAL_DOCS_FOLDER_URL,
  resolveOfficialDocsLink,
} from "@/features/official-docs/utils/source";
import type { OfficialDocPage } from "@/features/official-docs/utils/source";

export const dynamic = "force-dynamic";

interface OfficialDocsPageProps {
  params: Promise<{
    slug?: string[];
  }>;
}

interface MarkdownTreeNode {
  children?: MarkdownTreeNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
  tagName?: string;
  type: string;
  url?: string;
  value?: string;
}

interface HtmlElementNode {
  children?: HtmlElementNode[];
  properties?: Record<string, unknown>;
  tagName?: string;
  type: string;
}

type MarkdownBlockquoteNode = MarkdownTreeNode & {
  children: MarkdownTreeNode[];
  type: "blockquote";
};

type OfficialDocsCalloutType = "error" | "info" | "success" | "warning";

const OFFICIAL_DOCS_ADMONITION_TYPE_MAP = {
  danger: "error",
  info: "info",
  note: "info",
  success: "success",
  tip: "info",
  warn: "warning",
  warning: "warning",
} as const;

const ADMONITION_OPEN_PATTERN = /^(:{3,})([a-z]+)(?:\s+(.*))?$/;
const ADMONITION_CLOSE_PATTERN = /^(:{3,})$/;
const NORMALIZED_ADMONITION_PATTERN = /^\[!([A-Z]+)(?:\|([^\]]+))?\]\s*$/;
const TYPE_SYMBOL_KINDS = new Set(["class", "enum", "interface", "struct"]);

const buildExternalRel = (rel: string | undefined): string => {
  const tokens = new Set([
    ...(rel ?? "").split(" ").filter((token) => token.length > 0),
    "noopener",
    "noreferrer",
  ]);

  return [...tokens].join(" ");
};

const OfficialDocsAnchor = ({
  children,
  href,
  rel,
  target,
  ...props
}: ComponentPropsWithoutRef<"a">) => {
  if (typeof href !== "string") {
    return (
      <a href={href} rel={rel} target={target} {...props}>
        {children}
      </a>
    );
  }

  const isInternalHref = href.startsWith("/") && !href.startsWith("//");
  if (isInternalHref) {
    return (
      <Link href={href} target={target} {...props}>
        {children}
      </Link>
    );
  }

  const linkRel =
    target === "_blank" || href.startsWith("http")
      ? buildExternalRel(rel)
      : rel;

  return (
    <a href={href} rel={linkRel} target={target} {...props}>
      {children}
    </a>
  );
};

const OfficialDocsImage = ({
  alt,
  className,
  loading,
  src,
  ...props
}: ComponentPropsWithoutRef<"img">) => (
  <img
    alt={alt ?? ""}
    className={className}
    loading={loading ?? "lazy"}
    src={src}
    {...props}
  />
);

const normalizeCodeReference = (value: string): string =>
  value.trim().replace(/\(\)$/u, "").toLowerCase();

const getCodeText = (children: ReactNode): string | null =>
  typeof children === "string" || typeof children === "number"
    ? String(children)
    : null;

const getSimpleSymbolName = (symbol: RelatedGuideSymbol): string =>
  symbol.fullName.split(".").at(-1) ?? symbol.fullName;

const getSymbolCodeAliases = (symbol: RelatedGuideSymbol): string[] => [
  symbol.fullName,
  getSimpleSymbolName(symbol),
  ...symbol.matchedAliases,
];

const getAliasMatchScore = (
  normalizedCodeReference: string,
  normalizedAlias: string,
  symbol: RelatedGuideSymbol
): number => {
  if (normalizedCodeReference === normalizedAlias) {
    return 40;
  }

  if (normalizedCodeReference.startsWith(`${normalizedAlias}.`)) {
    return TYPE_SYMBOL_KINDS.has(symbol.kind) ? 35 : 20;
  }

  return 0;
};

const getSymbolAliasMatchScore = (
  normalizedCodeReference: string,
  symbol: RelatedGuideSymbol
): number => {
  let bestScore = 0;

  for (const alias of getSymbolCodeAliases(symbol)) {
    const normalizedAlias = normalizeCodeReference(alias);
    const aliasScore = getAliasMatchScore(
      normalizedCodeReference,
      normalizedAlias,
      symbol
    );
    bestScore = Math.max(bestScore, aliasScore);
  }

  return bestScore;
};

const getSymbolCodeReferenceScore = (
  codeReference: string,
  symbol: RelatedGuideSymbol
): number => {
  const normalizedCodeReference = normalizeCodeReference(codeReference);
  const aliasScore = getSymbolAliasMatchScore(normalizedCodeReference, symbol);

  return aliasScore === 0 ? 0 : aliasScore + symbol.matchScore;
};

const findApiSymbolForCodeReference = (
  codeReference: string,
  symbols: RelatedGuideSymbol[]
): RelatedGuideSymbol | null =>
  symbols
    .map((symbol) => ({
      score: getSymbolCodeReferenceScore(codeReference, symbol),
      symbol,
    }))
    .filter((match) => match.score > 0)
    .toSorted((left, right) => right.score - left.score)
    .at(0)?.symbol ?? null;

const createOfficialDocsCode =
  (symbols: RelatedGuideSymbol[]) =>
  ({ children, className, ...props }: ComponentPropsWithoutRef<"code">) => {
    const codeReference = getCodeText(children);
    const symbol = codeReference
      ? findApiSymbolForCodeReference(codeReference, symbols)
      : null;

    if (!symbol || className) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }

    return (
      <Link className="no-underline" href={symbol.docsUrl}>
        <code className={className} {...props}>
          {children}
        </code>
      </Link>
    );
  };

const OfficialDocsCallout = ({
  children,
  title,
  type = "info",
}: {
  children?: ReactNode;
  title?: string;
  type?: OfficialDocsCalloutType;
}) => (
  <Callout title={title} type={type}>
    {children}
  </Callout>
);

const createOfficialDocsLinkRewritePlugin =
  (page: OfficialDocPage) => () => (tree: MarkdownTreeNode) => {
    visit(tree, (node: MarkdownTreeNode) => {
      if (
        (node.type !== "image" && node.type !== "link") ||
        typeof node.url !== "string"
      ) {
        return;
      }

      const resolved = resolveOfficialDocsLink({
        currentRepoPath: page.repoPath,
        href: node.url,
        sourceSha: page.sha,
      });
      if (!resolved) {
        return;
      }

      node.url = resolved.href;
    });
  };

const createHeadingIdPlugin = () => () => (tree: HtmlElementNode) => {
  const slugger = new GithubSlugger();

  visit(tree, (node: HtmlElementNode) => {
    if (
      node.type !== "element" ||
      (node.tagName !== "h1" &&
        node.tagName !== "h2" &&
        node.tagName !== "h3" &&
        node.tagName !== "h4" &&
        node.tagName !== "h5" &&
        node.tagName !== "h6")
    ) {
      return;
    }

    const text = hastToString(node as Nodes).trim();
    if (text.length === 0) {
      return;
    }

    node.properties ??= {};
    if (typeof node.properties.id !== "string") {
      node.properties.id = slugger.slug(text);
    }
  });
};

const createRehypeReactPlugin = (options: { components?: MDXComponents }) =>
  function rehypeReactPlugin(this: unknown) {
    const processor = this as {
      compiler?: (tree: Nodes, file: { path?: string }) => ReactNode;
    };

    processor.compiler = (tree, file) =>
      toJsxRuntime(tree as Nodes, {
        ...JsxRuntime,
        ...options,
        development: false,
        filePath: file.path,
      });
  };

const getMarkdownNodeText = (node: MarkdownTreeNode): string => {
  if (typeof node.value === "string") {
    return node.value;
  }

  return node.children?.map(getMarkdownNodeText).join("") ?? "";
};

const quoteMarkdownLines = (lines: string[]): string[] =>
  lines.length === 0 ? [] : lines.map((line) => `> ${line}`);

const parseAdmonitionMeta = (
  meta: string | undefined
): {
  body?: string;
  title?: string;
} => {
  const trimmedMeta = meta?.trim();
  if (!trimmedMeta) {
    return {};
  }

  if (trimmedMeta.startsWith("[") && trimmedMeta.endsWith("]")) {
    return {
      title: trimmedMeta.slice(1, -1),
    };
  }

  return {
    body: trimmedMeta,
  };
};

const normalizeAdmonitionBlock = ({
  body,
  title,
  type,
}: {
  body?: string;
  title?: string;
  type: string;
}): string[] => {
  const output = [`> [!${type.toUpperCase()}${title ? `|${title}` : ""}]`];
  const inlineBodyLines = body ? [body] : [];

  if (inlineBodyLines.length > 0) {
    output.push(">");
    output.push(...quoteMarkdownLines(inlineBodyLines));
  }

  return output;
};

const readAdmonitionBodyLines = ({
  fence,
  lines,
  startIndex,
}: {
  fence: string;
  lines: string[];
  startIndex: number;
}): {
  bodyLines: string[];
  foundClose: boolean;
  nextIndex: number;
} => {
  const bodyLines: string[] = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const bodyLine = lines[index];
    const closeMatch = bodyLine.trim().match(ADMONITION_CLOSE_PATTERN);
    if (closeMatch?.[1] === fence) {
      return {
        bodyLines,
        foundClose: true,
        nextIndex: index,
      };
    }

    bodyLines.push(bodyLine);
  }

  return {
    bodyLines,
    foundClose: false,
    nextIndex: lines.length,
  };
};

const appendQuotedBodyLines = (output: string[], bodyLines: string[]): void => {
  if (bodyLines.length === 0) {
    return;
  }

  output.push(">");
  output.push(...quoteMarkdownLines(bodyLines));
};

const normalizeUnclosedAdmonition = ({
  body,
  startIndex,
  title,
  type,
}: {
  body?: string;
  startIndex: number;
  title?: string;
  type: string;
}): {
  nextIndex: number;
  normalizedLines: string[];
} | null => {
  if (!body || title) {
    return null;
  }

  return {
    nextIndex: startIndex,
    normalizedLines: normalizeAdmonitionBlock({ body, type }),
  };
};

const buildNormalizedAdmonition = ({
  lines,
  openMatch,
  startIndex,
}: {
  lines: string[];
  openMatch: RegExpMatchArray;
  startIndex: number;
}): {
  nextIndex: number;
  normalizedLines: string[];
} | null => {
  const [, fence, type, rawMeta] = openMatch;
  const { body, title } = parseAdmonitionMeta(rawMeta);
  const { bodyLines, foundClose, nextIndex } = readAdmonitionBodyLines({
    fence,
    lines,
    startIndex: startIndex + 1,
  });
  if (!foundClose) {
    return normalizeUnclosedAdmonition({
      body,
      startIndex,
      title,
      type,
    });
  }

  const normalizedLines = normalizeAdmonitionBlock({ body, title, type });
  appendQuotedBodyLines(normalizedLines, bodyLines);

  return {
    nextIndex,
    normalizedLines,
  };
};

const normalizeAdmonitionLine = ({
  line,
  lines,
  startIndex,
}: {
  line: string;
  lines: string[];
  startIndex: number;
}): {
  nextIndex: number;
  normalizedLines: string[];
} | null => {
  const openMatch = line.trim().match(ADMONITION_OPEN_PATTERN);
  return openMatch
    ? buildNormalizedAdmonition({ lines, openMatch, startIndex })
    : null;
};

const normalizeOfficialDocsAdmonitions = (markdown: string): string => {
  const lines = markdown.split(/\r?\n/u);
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const normalizedAdmonition = normalizeAdmonitionLine({
      line: lines[index],
      lines,
      startIndex: index,
    });
    if (!normalizedAdmonition) {
      output.push(lines[index]);
      continue;
    }

    output.push(...normalizedAdmonition.normalizedLines);
    index = normalizedAdmonition.nextIndex;
  }

  return output.join("\n");
};

const createCalloutNode = ({
  children,
  title,
  type,
}: {
  children: MarkdownTreeNode[];
  title?: string;
  type: OfficialDocsCalloutType;
}): MarkdownTreeNode => ({
  children,
  data: {
    hName: "OfficialDocsCallout",
    hProperties: {
      title,
      type,
    },
  },
  type: "blockquote",
});

const parseNormalizedCalloutMarker = (
  marker: string
): {
  rawType: string;
  title?: string;
} | null => {
  const match = marker.match(NORMALIZED_ADMONITION_PATTERN);
  if (!match) {
    return null;
  }

  const [, rawType, title] = match;
  return {
    rawType,
    title,
  };
};

const mapCalloutType = (rawType: string): OfficialDocsCalloutType | null =>
  OFFICIAL_DOCS_ADMONITION_TYPE_MAP[
    rawType.toLowerCase() as keyof typeof OFFICIAL_DOCS_ADMONITION_TYPE_MAP
  ] ?? null;

const getNormalizedCallout = (
  node: MarkdownBlockquoteNode
): {
  title?: string;
  type: OfficialDocsCalloutType;
} | null => {
  const [firstChild] = node.children;
  if (!firstChild) {
    return null;
  }

  const parsedMarker = parseNormalizedCalloutMarker(
    getMarkdownNodeText(firstChild).trim()
  );
  if (!parsedMarker) {
    return null;
  }

  const mappedType = mapCalloutType(parsedMarker.rawType);
  if (!mappedType) {
    return null;
  }

  return {
    title: parsedMarker.title,
    type: mappedType,
  };
};

const createOfficialDocsAdmonitionPlugin =
  () => () => (tree: MarkdownTreeNode) => {
    visit(tree, (node: MarkdownTreeNode) => {
      if (node.type !== "blockquote" || !Array.isArray(node.children)) {
        return;
      }

      const callout = getNormalizedCallout(node as MarkdownBlockquoteNode);
      if (!callout) {
        return;
      }

      node.children = node.children.slice(1);
      node.data = createCalloutNode({
        children: node.children,
        title: callout.title,
        type: callout.type,
      }).data;
    });
  };

const renderOfficialDocsMarkdown = async (
  page: OfficialDocPage,
  relatedSymbols: RelatedGuideSymbol[]
): Promise<ReactNode> => {
  const renderer = createMarkdownRenderer({
    rehypePlugins: [createHeadingIdPlugin()],
    remarkPlugins: [
      remarkGfm,
      createOfficialDocsAdmonitionPlugin(),
      createOfficialDocsLinkRewritePlugin(page),
    ],
  });

  return await renderer.MarkdownServer({
    children: normalizeOfficialDocsAdmonitions(page.markdown),
    components: getMDXComponents({
      OfficialDocsCallout,
      a: OfficialDocsAnchor,
      code: createOfficialDocsCode(relatedSymbols),
      img: OfficialDocsImage,
    }),
  });
};

const unwrapDescriptionParagraph = (description: ReactNode): ReactNode => {
  if (!isValidElement(description)) {
    return description;
  }

  const { children } = description.props as { children?: ReactNode };

  if (description.type === Fragment) {
    return unwrapDescriptionParagraph(children);
  }

  if (description.type === "p") {
    return children;
  }

  return description;
};

const renderOfficialDocsDescription = async (
  page: OfficialDocPage
): Promise<ReactNode | undefined> => {
  if (!page.descriptionSource) {
    return page.description;
  }

  const components = getMDXComponents({
    OfficialDocsCallout,
    a: OfficialDocsAnchor,
    img: OfficialDocsImage,
  });
  const processor = remark()
    .use(remarkGfm)
    .use(createOfficialDocsAdmonitionPlugin())
    .use(createOfficialDocsLinkRewritePlugin(page))
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(createRehypeReactPlugin({ components }));
  const renderedDescription = await processor.process(
    normalizeOfficialDocsAdmonitions(page.descriptionSource)
  );

  return unwrapDescriptionParagraph(renderedDescription.result as ReactNode);
};

const getRawMarkdownUrl = (page: OfficialDocPage): string => {
  const searchParams = new URLSearchParams();
  if (page.slugs.length > 0) {
    searchParams.set("slug", page.slugs.join("/"));
  }

  const query = searchParams.toString();
  return query.length > 0
    ? `/api/official-docs/raw?${query}`
    : "/api/official-docs/raw";
};

const getGuideResourceName = (page: OfficialDocPage): string => {
  const relativePath = page.url
    .slice(OFFICIAL_DOCS_FOLDER_URL.length)
    .replace(/^\/+/u, "");

  return relativePath.length > 0 ? relativePath : "index";
};

export default async function OfficialDocsPage(props: OfficialDocsPageProps) {
  const params = await props.params;
  const page = await getOfficialDocPage(params.slug ?? []);
  if (!page) {
    notFound();
  }

  const allRelatedSymbols = await getGuideRelatedSymbols(
    getGuideResourceName(page)
  );
  const description = await renderOfficialDocsDescription(page);
  const relatedSymbols = allRelatedSymbols.slice(0, 8);

  return (
    <DocsPage toc={page.toc}>
      <DocsPageHeader
        actions={
          <>
            <LLMCopyButton markdownUrl={getRawMarkdownUrl(page)} />
            <ViewOptions
              githubUrl={page.githubUrl}
              markdownUrl={getRawMarkdownUrl(page)}
            />
          </>
        }
        description={description}
        title={page.title}
      />
      <DocsBody>
        {await renderOfficialDocsMarkdown(page, allRelatedSymbols)}
        <ReferencedApiSymbolsSection symbols={relatedSymbols} />
      </DocsBody>
    </DocsPage>
  );
}

export const generateMetadata = async (
  props: OfficialDocsPageProps
): Promise<Metadata> => {
  const params = await props.params;
  const page = await getOfficialDocPage(params.slug ?? []);
  if (!page) {
    notFound();
  }

  return {
    description: page.description,
    title: page.title,
  };
};
