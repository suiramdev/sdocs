import { posix } from "node:path";

import { getTableOfContents } from "fumadocs-core/content/toc";
import type { Folder, Item, Node } from "fumadocs-core/page-tree";
import { initSimpleSearch } from "fumadocs-core/search/server";
import type { SearchServer } from "fumadocs-core/search/server";
import "server-only";
import { load as loadYaml } from "js-yaml";
import remarkGfm from "remark-gfm";

const DOCS_ROOT = "docs";
const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_BRANCH = "master";
const GITHUB_OWNER = "Facepunch";
const GITHUB_REPOSITORY = "sbox-docs";
const HEAD_CACHE_TTL_MS = 60_000;
const OFFICIAL_DOCS_BASE_URL = "/docs/official";

export const OFFICIAL_DOCS_FOLDER_NAME = "Guides";
export const OFFICIAL_DOCS_FOLDER_URL = OFFICIAL_DOCS_BASE_URL;

interface GitHubRefResponse {
  object?: {
    sha?: string;
  };
}

interface GitHubTreeEntry {
  path: string;
  sha: string;
  type: "blob" | "commit" | "tree";
}

interface GitHubTreeResponse {
  tree?: GitHubTreeEntry[];
}

interface FrontmatterData {
  created?: string;
  description?: string;
  icon?: string;
  title?: string;
  updated?: string;
}

interface TocEntry {
  href: string;
  name: string;
}

interface TocFile {
  items: TocEntry[];
}

interface TreeCacheEntry {
  breadcrumbsByUrl: ReadonlyMap<string, string[]>;
  folder: Folder;
}

interface SearchIndexEntry {
  breadcrumbs?: string[];
  content: string;
  description?: string;
  keywords?: string;
  title: string;
  url: string;
}

export interface OfficialDocPage {
  breadcrumbs: string[];
  description?: string;
  descriptionSource?: string;
  githubUrl: string;
  markdown: string;
  rawMarkdown: string;
  repoPath: string;
  sha: string;
  slugs: string[];
  title: string;
  toc: Awaited<ReturnType<typeof getTableOfContents>>;
  url: string;
}

export interface ResolveOfficialDocsLinkInput {
  currentRepoPath: string;
  href: string;
  sourceSha: string;
}

export type ResolvedOfficialDocsLink =
  | {
      href: string;
      kind: "anchor" | "external" | "page";
    }
  | {
      href: string;
      kind: "asset";
      repoPath: string;
    };

let latestHeadCache: {
  checkedAt: number;
  sha: string;
} | null = null;

const docsTreeCache = new Map<
  string,
  Promise<ReadonlyMap<string, GitHubTreeEntry>>
>();
const officialDocPageCache = new Map<string, Promise<OfficialDocPage | null>>();
const officialDocRawCache = new Map<string, Promise<string>>();
const officialDocsSearchCache = new Map<string, Promise<SearchServer>>();
const officialDocsTreeCache = new Map<string, Promise<TreeCacheEntry>>();

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u;
const MARKDOWN_EXTENSION_PATTERN = /\.md$/u;
const ROOT_TOC_PATH = `${DOCS_ROOT}/toc.yml`;
const ROOT_INDEX_PATH = `${DOCS_ROOT}/index.md`;
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/gu;
const HEADING_LINE_PATTERN = /^#{1,6}\s+.*$/gmu;
const IMAGE_ONLY_LINE_PATTERN = /^!\[[^\]]*\]\([^)]+\)\s*$/gmu;
const THEMATIC_BREAK_PATTERN = /^\s*([-*_])(?:\s*\1){2,}\s*$/gmu;
const ADMONITION_FENCE_PATTERN = /^:{3,}.*$/gmu;
const DESCRIPTION_ADMONITION_OPEN_PATTERN =
  /^:{3,}[a-z]+(?:\s+\[([^\]]+)\])?\s*/gmu;
const DESCRIPTION_ADMONITION_CLOSE_PATTERN = /^:{3,}\s*$/gmu;

const buildGitHubApiUrl = (pathname: string): string =>
  `${GITHUB_API_BASE_URL}/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}${pathname}`;

const buildRawGithubUrl = (repoPath: string, ref: string): string =>
  `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/${ref}/${repoPath}`;

const buildGitHubBlobUrl = (repoPath: string): string =>
  `https://github.com/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/blob/${GITHUB_BRANCH}/${repoPath}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeTitleText = (value: string): string =>
  value
    .trim()
    .replaceAll(/[`*_~]/gu, "")
    .replaceAll(/\s+/gu, " ")
    .toLowerCase();

const stripLeadingTitleHeading = (content: string, title: string): string => {
  const contentWithoutLeadingWhitespace = content.trimStart();
  const headingMatch =
    contentWithoutLeadingWhitespace.match(/^#\s+(.+?)\r?\n+/u);
  if (!headingMatch) {
    return content;
  }

  const [fullHeading, headingText] = headingMatch;
  if (
    typeof headingText === "string" &&
    normalizeTitleText(headingText) === normalizeTitleText(title)
  ) {
    return contentWithoutLeadingWhitespace
      .slice(fullHeading.length)
      .trimStart();
  }

  return content;
};

const humanizeSegment = (value: string): string =>
  value
    .split("-")
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const [firstCharacter = "", ...rest] = segment;
      return `${firstCharacter.toUpperCase()}${rest.join("")}`;
    })
    .join(" ");

const toSiteSlugs = (repoPath: string): string[] => {
  const relativePath = repoPath
    .replace(new RegExp(`^${DOCS_ROOT}/`, "u"), "")
    .replace(MARKDOWN_EXTENSION_PATTERN, "");

  if (relativePath === "index") {
    return [];
  }

  const segments = relativePath.split("/");
  if (segments.at(-1) === "index") {
    segments.pop();
  }

  return segments.filter((segment) => segment.length > 0);
};

const toOfficialDocUrl = (repoPath: string): string => {
  const slugs = toSiteSlugs(repoPath);
  if (slugs.length === 0) {
    return OFFICIAL_DOCS_BASE_URL;
  }

  return `${OFFICIAL_DOCS_BASE_URL}/${slugs.join("/")}`;
};

const normalizeRequestedSlugs = (slugs: string[]): string[] =>
  slugs
    .map((slug) => slug.trim())
    .filter((slug) => slug.length > 0)
    .map((slug) => slug.replace(MARKDOWN_EXTENSION_PATTERN, ""));

const createFallbackBreadcrumbs = (repoPath: string): string[] => {
  const slugs = toSiteSlugs(repoPath);
  if (slugs.length === 0) {
    return [];
  }

  const parentSegments = slugs.slice(0, -1);
  if (parentSegments.length === 0) {
    return [OFFICIAL_DOCS_FOLDER_NAME];
  }

  return [OFFICIAL_DOCS_FOLDER_NAME, ...parentSegments.map(humanizeSegment)];
};

const extractFirstHeading = (content: string): string | undefined => {
  const headingMatch = content.match(/^#\s+(.+?)\s*$/mu);
  const heading = headingMatch?.[1]?.trim();
  if (!heading || heading.length === 0) {
    return undefined;
  }

  return heading;
};

const extractFirstParagraph = (content: string): string | undefined => {
  for (const block of content.split(/\r?\n\r?\n/gu)) {
    const paragraph = block
      .trim()
      .replaceAll(/\r?\n/gu, " ")
      .replaceAll(/\s+/gu, " ");

    if (
      paragraph.length === 0 ||
      paragraph.startsWith("#") ||
      paragraph.startsWith("```") ||
      paragraph.startsWith("![](") ||
      paragraph.startsWith("![")
    ) {
      continue;
    }

    return paragraph;
  }

  return undefined;
};

const normalizeDescriptionText = (value: string): string =>
  value
    .replaceAll(
      DESCRIPTION_ADMONITION_OPEN_PATTERN,
      (_match, title: string | undefined) => (title ? `${title}: ` : "")
    )
    .replaceAll(DESCRIPTION_ADMONITION_CLOSE_PATTERN, "")
    .replaceAll(/!\[([^\]]*)\]\([^)]+\)/gu, "$1")
    .replaceAll(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replaceAll(/[`*_~]/gu, "")
    .replaceAll(/\s+/gu, " ")
    .trim();

const normalizeDescriptionSource = (value: string): string =>
  value.replaceAll("\\r\\n", "\n").replaceAll("\\n", "\n").trim();

const readFrontmatterString = (
  parsedYaml: unknown,
  key: keyof FrontmatterData
): string | undefined => {
  if (!isRecord(parsedYaml)) {
    return undefined;
  }

  const value = parsedYaml[key];
  return typeof value === "string" ? value : undefined;
};

const toFrontmatterData = (parsedYaml: unknown): FrontmatterData => ({
  created: readFrontmatterString(parsedYaml, "created"),
  description: readFrontmatterString(parsedYaml, "description"),
  icon: readFrontmatterString(parsedYaml, "icon"),
  title: readFrontmatterString(parsedYaml, "title"),
  updated: readFrontmatterString(parsedYaml, "updated"),
});

const parseFrontmatter = (
  rawMarkdown: string
): {
  content: string;
  data: FrontmatterData;
} => {
  const frontmatterMatch = rawMarkdown.match(FRONTMATTER_PATTERN);
  if (!frontmatterMatch) {
    return {
      content: rawMarkdown,
      data: {},
    };
  }

  const [, yamlBlock = ""] = frontmatterMatch;

  return {
    content: rawMarkdown.slice(frontmatterMatch[0].length),
    data: toFrontmatterData(loadYaml(yamlBlock)),
  };
};

const requestGitHubJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "sdocs-official-docs",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub request failed (${response.status}) while fetching ${url}`
    );
  }

  return (await response.json()) as T;
};

const requestText = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent": "sdocs-official-docs",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Upstream document request failed (${response.status}) while fetching ${url}`
    );
  }

  return response.text();
};

export const getLatestOfficialDocsSha = async (): Promise<string> => {
  const now = Date.now();
  if (latestHeadCache && now - latestHeadCache.checkedAt < HEAD_CACHE_TTL_MS) {
    return latestHeadCache.sha;
  }

  const response = await requestGitHubJson<GitHubRefResponse>(
    buildGitHubApiUrl(`/git/ref/heads/${GITHUB_BRANCH}`)
  );
  const sha = response.object?.sha;
  if (!sha) {
    throw new Error("GitHub ref response did not include a commit SHA");
  }

  latestHeadCache = {
    checkedAt: now,
    sha,
  };
  return sha;
};

const toDocsTreeMap = (
  response: GitHubTreeResponse
): ReadonlyMap<string, GitHubTreeEntry> => {
  const entries = response.tree ?? [];
  return new Map(
    entries
      .filter((entry) => entry.path.startsWith(`${DOCS_ROOT}/`))
      .map((entry) => [entry.path, entry] as const)
  );
};

const getOfficialDocsTree = (
  sha: string
): Promise<ReadonlyMap<string, GitHubTreeEntry>> => {
  const cached = docsTreeCache.get(sha);
  if (cached) {
    return cached;
  }

  const promise = (async () =>
    toDocsTreeMap(
      await requestGitHubJson<GitHubTreeResponse>(
        buildGitHubApiUrl(`/git/trees/${sha}?recursive=1`)
      )
    ))();

  docsTreeCache.set(sha, promise);
  return promise;
};

const getOfficialDocRaw = (repoPath: string, sha: string): Promise<string> => {
  const cacheKey = `${sha}:${repoPath}`;
  const cached = officialDocRawCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = requestText(buildRawGithubUrl(repoPath, sha));
  officialDocRawCache.set(cacheKey, promise);
  return promise;
};

const createDocRepoPathCandidates = (slugs: string[]): string[] => {
  if (slugs.length === 0) {
    return [ROOT_INDEX_PATH];
  }

  const relativePath = slugs.join("/");
  return [
    `${DOCS_ROOT}/${relativePath}.md`,
    `${DOCS_ROOT}/${relativePath}/index.md`,
  ];
};

const resolveOfficialDocRepoPath = async (
  slugs: string[],
  sha: string
): Promise<string | null> => {
  const tree = await getOfficialDocsTree(sha);
  for (const candidate of createDocRepoPathCandidates(slugs)) {
    if (tree.has(candidate)) {
      return candidate;
    }
  }

  return null;
};

const toTocEntries = (parsedYaml: unknown): TocEntry[] => {
  if (!isRecord(parsedYaml) || !Array.isArray(parsedYaml.items)) {
    return [];
  }

  const items: TocEntry[] = [];
  for (const item of parsedYaml.items) {
    if (!isRecord(item)) {
      continue;
    }

    if (typeof item.href === "string" && typeof item.name === "string") {
      items.push({
        href: item.href,
        name: item.name,
      });
    }
  }

  return items;
};

const parseTocFile = async (
  repoPath: string,
  sha: string
): Promise<TocFile> => {
  const rawYaml = await getOfficialDocRaw(repoPath, sha);
  return { items: toTocEntries(loadYaml(rawYaml)) };
};

const resolveTocHref = (directoryPath: string, href: string): string => {
  if (href.startsWith("/")) {
    return posix.normalize(posix.join(DOCS_ROOT, href.slice(1)));
  }

  return posix.normalize(posix.join(directoryPath, href));
};

const filterPresentNodes = (nodes: (Node | null)[]): Node[] =>
  nodes.filter((node): node is Node => node !== null);

const normalizeMeaningfulBodyText = (value: string): string =>
  value
    .replaceAll(HTML_COMMENT_PATTERN, "")
    .replaceAll(HEADING_LINE_PATTERN, "")
    .replaceAll(IMAGE_ONLY_LINE_PATTERN, "")
    .replaceAll(THEMATIC_BREAK_PATTERN, "")
    .replaceAll(ADMONITION_FENCE_PATTERN, "")
    .replaceAll(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replaceAll(/[`*_~]/gu, "")
    .replaceAll(/\s+/gu, "")
    .trim();

const hasMeaningfulBodyContent = (markdown: string): boolean =>
  normalizeMeaningfulBodyText(markdown).length > 0;

const hasMeaningfulIndexPage = async (
  repoPath: string,
  sha: string
): Promise<boolean> => {
  const rawMarkdown = await getOfficialDocRaw(repoPath, sha);
  const { content, data } = parseFrontmatter(rawMarkdown);
  const fallbackTitle =
    extractFirstHeading(content) ??
    humanizeSegment(
      toSiteSlugs(repoPath).at(-1) ??
        repoPath.split("/").at(-1)?.replace(MARKDOWN_EXTENSION_PATTERN, "") ??
        "Official Docs"
    );
  const title = data.title?.trim() || fallbackTitle;
  const markdown = stripLeadingTitleHeading(content, title);

  return hasMeaningfulBodyContent(markdown);
};

const createOfficialFolderNode = async (
  childItems: Node[],
  indexPath: string,
  item: TocEntry,
  sha: string,
  tree: ReadonlyMap<string, GitHubTreeEntry>
): Promise<Folder> => {
  const folder: Folder = {
    children: childItems,
    collapsible: true,
    defaultOpen: false,
    name: item.name,
    type: "folder",
  };

  if (tree.has(indexPath) && (await hasMeaningfulIndexPage(indexPath, sha))) {
    folder.index = {
      name: item.name,
      type: "page",
      url: toOfficialDocUrl(indexPath),
    };
  }

  return folder;
};

const buildOfficialPageNode = (
  resolvedPath: string,
  item: TocEntry,
  tree: ReadonlyMap<string, GitHubTreeEntry>
): Item | null => {
  if (!tree.has(resolvedPath)) {
    return null;
  }

  return {
    name: item.name,
    type: "page",
    url: toOfficialDocUrl(resolvedPath),
  };
};

const buildOfficialDocTreeNode = async (
  directoryPath: string,
  item: TocEntry,
  sha: string,
  tree: ReadonlyMap<string, GitHubTreeEntry>
): Promise<Node | null> => {
  const resolvedPath = resolveTocHref(directoryPath, item.href);
  if (item.href.endsWith("/")) {
    const childDirectoryPath = resolvedPath.replace(/\/$/u, "");
    const indexPath = `${childDirectoryPath}/index.md`;
    const tocPath = `${childDirectoryPath}/toc.yml`;
    const tocFile = tree.has(tocPath)
      ? await parseTocFile(tocPath, sha)
      : { items: [] };
    const childNodes = await Promise.all(
      tocFile.items.map((childItem) =>
        buildOfficialDocTreeNode(childDirectoryPath, childItem, sha, tree)
      )
    );

    return createOfficialFolderNode(
      filterPresentNodes(childNodes),
      indexPath,
      item,
      sha,
      tree
    );
  }

  return buildOfficialPageNode(resolvedPath, item, tree);
};

const buildOfficialDocTreeNodes = async (
  directoryPath: string,
  items: TocEntry[],
  sha: string,
  tree: ReadonlyMap<string, GitHubTreeEntry>
): Promise<Node[]> =>
  filterPresentNodes(
    await Promise.all(
      items.map((item) =>
        buildOfficialDocTreeNode(directoryPath, item, sha, tree)
      )
    )
  );

const collectBreadcrumbs = (
  folder: Folder,
  parentBreadcrumbs: string[],
  map: Map<string, string[]>
) => {
  if (folder.index) {
    map.set(folder.index.url, [...parentBreadcrumbs]);
  }

  const nextBreadcrumbs = [...parentBreadcrumbs, String(folder.name)];
  for (const child of folder.children) {
    if (child.type === "page") {
      map.set(child.url, [...nextBreadcrumbs]);
      continue;
    }

    if (child.type === "folder") {
      collectBreadcrumbs(child, nextBreadcrumbs, map);
    }
  }
};

const buildOfficialDocFallbackTitle = (
  normalizedSlugs: string[],
  repoPath: string,
  content: string
): string =>
  extractFirstHeading(content) ??
  humanizeSegment(
    normalizedSlugs.at(-1) ??
      repoPath.split("/").at(-1)?.replace(MARKDOWN_EXTENSION_PATTERN, "") ??
      "Official Docs"
  );

const getOfficialDocDescriptionSource = (
  data: FrontmatterData,
  markdown: string
): string | undefined =>
  normalizeDescriptionSource(
    data.description?.trim() || extractFirstParagraph(markdown) || ""
  ) || undefined;

const buildOfficialDocDescription = (
  data: FrontmatterData,
  markdown: string
): string | undefined =>
  normalizeDescriptionText(
    getOfficialDocDescriptionSource(data, markdown) || ""
  ) || undefined;

interface OfficialDocContent {
  data: FrontmatterData;
  markdown: string;
  rawMarkdown: string;
  title: string;
}

const getOfficialDocContent = async (
  normalizedSlugs: string[],
  repoPath: string,
  sha: string
): Promise<OfficialDocContent> => {
  const rawMarkdown = await getOfficialDocRaw(repoPath, sha);
  const { content, data } = parseFrontmatter(rawMarkdown);
  const fallbackTitle = buildOfficialDocFallbackTitle(
    normalizedSlugs,
    repoPath,
    content
  );
  const title = data.title?.trim() || fallbackTitle;

  return {
    data,
    markdown: stripLeadingTitleHeading(content, title),
    rawMarkdown,
    title,
  };
};

const buildOfficialDocsSectionTree = async (
  sha: string
): Promise<TreeCacheEntry> => {
  const tree = await getOfficialDocsTree(sha);
  const rootToc = tree.has(ROOT_TOC_PATH)
    ? await parseTocFile(ROOT_TOC_PATH, sha)
    : { items: [] };
  const children = await buildOfficialDocTreeNodes(
    DOCS_ROOT,
    rootToc.items,
    sha,
    tree
  );

  const folder: Folder = {
    children,
    collapsible: true,
    defaultOpen: false,
    index: {
      name: OFFICIAL_DOCS_FOLDER_NAME,
      type: "page",
      url: OFFICIAL_DOCS_BASE_URL,
    },
    name: OFFICIAL_DOCS_FOLDER_NAME,
    type: "folder",
  };

  const breadcrumbsByUrl = new Map<string, string[]>();
  collectBreadcrumbs(folder, [], breadcrumbsByUrl);

  return {
    breadcrumbsByUrl,
    folder,
  };
};

const getOfficialDocsSectionTreeBySha = (
  sha: string
): Promise<TreeCacheEntry> => {
  const cached = officialDocsTreeCache.get(sha);
  if (cached) {
    return cached;
  }

  const promise = buildOfficialDocsSectionTree(sha);
  officialDocsTreeCache.set(sha, promise);
  return promise;
};

const buildOfficialDocPage = async (
  normalizedSlugs: string[],
  sha: string
): Promise<OfficialDocPage | null> => {
  const repoPath = await resolveOfficialDocRepoPath(normalizedSlugs, sha);
  if (!repoPath) {
    return null;
  }

  const { data, markdown, rawMarkdown, title } = await getOfficialDocContent(
    normalizedSlugs,
    repoPath,
    sha
  );
  const url = toOfficialDocUrl(repoPath);
  const treeData = await getOfficialDocsSectionTreeBySha(sha);
  const breadcrumbs =
    treeData.breadcrumbsByUrl.get(url) ?? createFallbackBreadcrumbs(repoPath);

  return {
    breadcrumbs,
    description: buildOfficialDocDescription(data, markdown),
    descriptionSource: getOfficialDocDescriptionSource(data, markdown),
    githubUrl: buildGitHubBlobUrl(repoPath),
    markdown,
    rawMarkdown,
    repoPath,
    sha,
    slugs: normalizedSlugs,
    title,
    toc: await getTableOfContents(markdown, [remarkGfm]),
    url,
  };
};

const buildOfficialDocsSearchServer = async (
  sha: string
): Promise<SearchServer> => {
  const tree = await getOfficialDocsTree(sha);
  const treeData = await getOfficialDocsSectionTreeBySha(sha);
  const markdownPaths = [...tree.keys()].filter(
    (repoPath) =>
      repoPath.endsWith(".md") && repoPath.startsWith(`${DOCS_ROOT}/`)
  );

  const indexes: SearchIndexEntry[] = [];
  const batchSize = 10;

  for (let index = 0; index < markdownPaths.length; index += batchSize) {
    const batch = markdownPaths.slice(index, index + batchSize);
    const batchEntries = await Promise.all(
      batch.map(async (repoPath) => {
        const rawMarkdown = await getOfficialDocRaw(repoPath, sha);
        const { content, data } = parseFrontmatter(rawMarkdown);
        const fallbackTitle =
          extractFirstHeading(content) ??
          humanizeSegment(
            toSiteSlugs(repoPath).at(-1) ??
              repoPath
                .split("/")
                .at(-1)
                ?.replace(MARKDOWN_EXTENSION_PATTERN, "") ??
              "Official Docs"
          );
        const title = data.title?.trim() || fallbackTitle;
        const markdown = stripLeadingTitleHeading(content, title);
        const url = toOfficialDocUrl(repoPath);
        const breadcrumbs =
          treeData.breadcrumbsByUrl.get(url) ??
          createFallbackBreadcrumbs(repoPath);

        return {
          breadcrumbs,
          content: markdown,
          description: buildOfficialDocDescription(data, markdown),
          keywords: [...toSiteSlugs(repoPath), title, ...breadcrumbs].join(" "),
          title,
          url,
        } satisfies SearchIndexEntry;
      })
    );

    indexes.push(...batchEntries);
  }

  return initSimpleSearch({
    indexes,
  });
};

export const getOfficialDocsSectionTree = async (): Promise<Folder> => {
  const sha = await getLatestOfficialDocsSha();
  const tree = await getOfficialDocsSectionTreeBySha(sha);
  return tree.folder;
};

export const getOfficialDocPage = async (
  slugs: string[] = []
): Promise<OfficialDocPage | null> => {
  const sha = await getLatestOfficialDocsSha();
  const normalizedSlugs = normalizeRequestedSlugs(slugs);
  const cacheKey = `${sha}:${normalizedSlugs.join("/")}`;
  const cached = officialDocPageCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = buildOfficialDocPage(normalizedSlugs, sha);
  officialDocPageCache.set(cacheKey, promise);
  return promise;
};

export const getOfficialDocsSearch = async (): Promise<SearchServer> => {
  const sha = await getLatestOfficialDocsSha();
  const cached = officialDocsSearchCache.get(sha);
  if (cached) {
    return cached;
  }

  const promise = buildOfficialDocsSearchServer(sha);
  officialDocsSearchCache.set(sha, promise);
  return promise;
};

const isHttpUrl = (value: string): boolean =>
  value.startsWith("http://") || value.startsWith("https://");

const isExternalProtocol = (value: string): boolean =>
  value.startsWith("mailto:") ||
  value.startsWith("tel:") ||
  value.startsWith("data:");

const splitHrefSuffix = (
  href: string
): {
  baseHref: string;
  suffix: string;
} => {
  const hashIndex = href.indexOf("#");
  const queryIndex = href.indexOf("?");
  const positiveIndexes = [hashIndex, queryIndex].filter((index) => index >= 0);
  const firstSuffixIndex =
    positiveIndexes.length > 0 ? Math.min(...positiveIndexes) : -1;

  if (firstSuffixIndex < 0) {
    return {
      baseHref: href,
      suffix: "",
    };
  }

  return {
    baseHref: href.slice(0, firstSuffixIndex),
    suffix: href.slice(firstSuffixIndex),
  };
};

const resolveRepositoryPathFromHref = (
  currentRepoPath: string,
  href: string
): string => {
  if (href.startsWith("/")) {
    return posix.normalize(posix.join(DOCS_ROOT, href.slice(1)));
  }

  return posix.normalize(posix.join(posix.dirname(currentRepoPath), href));
};

const normalizeLegacyOfficialHref = (href: string): string =>
  href.startsWith("/dev/doc/") ? `/${href.slice("/dev/doc/".length)}` : href;

const toSboxOfficialPageHref = (officialPath: string): string => {
  const pageHref = `${OFFICIAL_DOCS_BASE_URL}/${officialPath
    .replace(MARKDOWN_EXTENSION_PATTERN, "")
    .replace(/\/index$/u, "")}`;

  return pageHref.endsWith("/") ? pageHref.slice(0, -1) : pageHref;
};

const resolveSboxDocsUrl = (url: URL): ResolvedOfficialDocsLink | null => {
  if (url.hostname !== "sbox.game" || !url.pathname.startsWith("/dev/doc/")) {
    return null;
  }

  const officialPath = url.pathname.slice("/dev/doc/".length);
  return {
    href: `${toSboxOfficialPageHref(officialPath)}${url.search}${url.hash}`,
    kind: "page",
  };
};

const resolveRepoPathHref = (
  repoPath: string,
  sourceSha: string,
  suffix: string
): ResolvedOfficialDocsLink => {
  const extension = posix.extname(repoPath).toLowerCase();
  if (extension === ".md" || extension.length === 0) {
    const pageHref =
      extension === ".md"
        ? toOfficialDocUrl(repoPath)
        : toSboxOfficialPageHref(
            repoPath.replace(new RegExp(`^${DOCS_ROOT}/`, "u"), "")
          );

    return {
      href: `${pageHref}${suffix}`,
      kind: "page",
    };
  }

  if (extension === ".yml" || extension === ".yaml") {
    return {
      href: `${buildRawGithubUrl(repoPath, sourceSha)}${suffix}`,
      kind: "external",
    };
  }

  return {
    href: `${buildRawGithubUrl(repoPath, sourceSha)}${suffix}`,
    kind: "asset",
    repoPath,
  };
};

const resolveKnownExternalOfficialDocsLink = (
  trimmedHref: string
): ResolvedOfficialDocsLink | null => {
  if (trimmedHref.startsWith("#")) {
    return {
      href: trimmedHref,
      kind: "anchor",
    };
  }

  if (isExternalProtocol(trimmedHref)) {
    return {
      href: trimmedHref,
      kind: "external",
    };
  }

  if (!isHttpUrl(trimmedHref)) {
    return null;
  }

  const url = new URL(trimmedHref);
  return resolveSboxDocsUrl(url) ?? { href: trimmedHref, kind: "external" };
};

const resolveTrimmedOfficialDocsLink = ({
  currentRepoPath,
  sourceSha,
  trimmedHref,
}: {
  currentRepoPath: string;
  sourceSha: string;
  trimmedHref: string;
}): ResolvedOfficialDocsLink => {
  const externalHref = resolveKnownExternalOfficialDocsLink(trimmedHref);
  if (externalHref) {
    return externalHref;
  }

  const normalizedHref = normalizeLegacyOfficialHref(trimmedHref);
  const { baseHref, suffix } = splitHrefSuffix(normalizedHref);
  const repoPath = resolveRepositoryPathFromHref(currentRepoPath, baseHref);
  return resolveRepoPathHref(repoPath, sourceSha, suffix);
};

export const resolveOfficialDocsLink = ({
  currentRepoPath,
  href,
  sourceSha,
}: ResolveOfficialDocsLinkInput): ResolvedOfficialDocsLink | null => {
  const trimmedHref = href.trim();
  if (trimmedHref.length === 0) {
    return null;
  }

  return resolveTrimmedOfficialDocsLink({
    currentRepoPath,
    sourceSha,
    trimmedHref,
  });
};
