import { initSimpleSearch } from "fumadocs-core/search/server";
import type { SearchServer } from "fumadocs-core/search/server";
import "server-only";
import { load as loadYaml } from "js-yaml";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_BRANCH = "master";
const GITHUB_OWNER = "coffeegrind123";
const GITHUB_REPOSITORY = "sbox-learn-docs";
const HEAD_CACHE_TTL_MS = 60_000;
const TUTORIAL_DOCS_ROOT = "docs";
const TUTORIAL_RESOURCE_PREFIX = "docs://tutorial/";
const TUTORIAL_SITE_URL_PREFIX = "https://sbox.game/learn/";
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u;

interface GitHubRefResponse {
  object?: {
    sha?: string;
  };
}

interface GitHubTreeEntry {
  path: string;
  type: "blob" | "commit" | "tree";
}

interface GitHubTreeResponse {
  tree?: GitHubTreeEntry[];
}

interface TutorialFrontmatterData {
  author?: string;
  author_slug?: string;
  content_type?: string;
  difficulty?: string;
  slug?: string;
  summary?: string;
  tags?: unknown;
  title?: string;
  topic?: string;
  url?: string;
}

interface TutorialSearchIndexEntry {
  author?: string;
  content: string;
  description?: string;
  difficulty?: string;
  keywords?: string;
  path: string;
  tags?: string[];
  title: string;
  topic?: string;
  url: string;
}

export interface TutorialDocPage {
  author?: string;
  authorSlug?: string;
  contentType?: string;
  difficulty?: string;
  githubUrl: string;
  markdown: string;
  rawMarkdown: string;
  repoPath: string;
  resourceUri: string;
  sha: string;
  slug: string;
  summary?: string;
  tags: string[];
  title: string;
  topic?: string;
  url: string;
}

let latestHeadCache: {
  checkedAt: number;
  sha: string;
} | null = null;

const tutorialsTreeCache = new Map<
  string,
  Promise<ReadonlyMap<string, GitHubTreeEntry>>
>();
const tutorialDocPageCache = new Map<string, Promise<TutorialDocPage | null>>();
const tutorialDocRawCache = new Map<string, Promise<string>>();
const tutorialDocsPagesCache = new Map<string, Promise<TutorialDocPage[]>>();
const tutorialDocsSearchCache = new Map<string, Promise<SearchServer>>();

const buildGitHubApiUrl = (pathname: string): string =>
  `${GITHUB_API_BASE_URL}/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}${pathname}`;

const buildRawGithubUrl = (repoPath: string, ref: string): string =>
  `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/${ref}/${repoPath}`;

const buildGitHubBlobUrl = (repoPath: string): string =>
  `https://github.com/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/blob/${GITHUB_BRANCH}/${repoPath}`;

const getCachedPromise = <T>(
  cache: Map<string, Promise<T>>,
  key: string,
  createPromise: () => Promise<T>
): Promise<T> => {
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    try {
      return await createPromise();
    } catch (error) {
      cache.delete(key);
      throw error;
    }
  })();

  cache.set(key, promise);
  return promise;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const requestGitHubJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub request failed for ${url}: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as T;
};

const requestText = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Request failed for ${url}: ${response.status} ${response.statusText}`
    );
  }

  return await response.text();
};

const requestLatestTutorialDocsSha = async (): Promise<string> => {
  const response = await requestGitHubJson<GitHubRefResponse>(
    buildGitHubApiUrl(`/git/ref/heads/${GITHUB_BRANCH}`)
  );
  const sha = response.object?.sha?.trim();

  if (!sha) {
    throw new Error("Tutorial docs repo HEAD SHA was missing.");
  }

  return sha;
};

export const getLatestTutorialDocsSha = async (): Promise<string> => {
  const now = Date.now();
  if (latestHeadCache && now - latestHeadCache.checkedAt < HEAD_CACHE_TTL_MS) {
    return latestHeadCache.sha;
  }

  try {
    const sha = await requestLatestTutorialDocsSha();
    latestHeadCache = {
      checkedAt: now,
      sha,
    };
    return sha;
  } catch (error) {
    if (latestHeadCache) {
      return latestHeadCache.sha;
    }

    throw error;
  }
};

const getTutorialDocsTree = (
  sha: string
): Promise<ReadonlyMap<string, GitHubTreeEntry>> =>
  getCachedPromise(tutorialsTreeCache, sha, async () => {
    const response = await requestGitHubJson<GitHubTreeResponse>(
      buildGitHubApiUrl(`/git/trees/${sha}?recursive=1`)
    );

    return new Map(
      (response.tree ?? [])
        .filter((entry) => entry.path.startsWith(`${TUTORIAL_DOCS_ROOT}/`))
        .map((entry) => [entry.path, entry] as const)
    );
  });

const getTutorialDocRaw = (repoPath: string, sha: string): Promise<string> =>
  getCachedPromise(tutorialDocRawCache, `${sha}:${repoPath}`, () =>
    requestText(buildRawGithubUrl(repoPath, sha))
  );

const toTutorialTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((item) => (typeof item === "string" ? [item.trim()] : []))
    .filter((tag) => tag.length > 0);
};

const parseTutorialMarkdown = (
  rawMarkdown: string
): {
  frontmatter: TutorialFrontmatterData;
  markdown: string;
} => {
  const match = rawMarkdown.match(FRONTMATTER_PATTERN);
  if (!match) {
    return {
      frontmatter: {},
      markdown: rawMarkdown.trim(),
    };
  }

  const parsed = loadYaml(match[1] ?? "");
  return {
    frontmatter: isRecord(parsed)
      ? (parsed as TutorialFrontmatterData)
      : ({} as TutorialFrontmatterData),
    markdown: rawMarkdown.slice(match[0].length).trim(),
  };
};

const stripMarkdownDecorators = (value: string): string =>
  value
    .replaceAll(/^#+\s+/gmu, "")
    .replaceAll(/^>\s?/gmu, "")
    .replaceAll(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replaceAll(/[`*_~]/gu, "")
    .replaceAll(/\s+/gu, " ")
    .trim();

const buildTutorialSummary = (
  frontmatter: TutorialFrontmatterData,
  markdown: string
): string | undefined => {
  const summary = frontmatter.summary?.trim();
  if (summary && summary.length > 0) {
    return summary;
  }

  const firstParagraph = markdown
    .split(/\n\s*\n/gu)
    .map((paragraph) => stripMarkdownDecorators(paragraph))
    .find((paragraph) => paragraph.length > 0);

  return firstParagraph;
};

const toTutorialSlug = (repoPath: string, frontmatterSlug?: string): string => {
  const normalizedFrontmatterSlug = frontmatterSlug?.trim();
  if (normalizedFrontmatterSlug && normalizedFrontmatterSlug.length > 0) {
    return normalizedFrontmatterSlug.replaceAll(/^\/+|\/+$/gu, "");
  }

  return repoPath
    .replace(new RegExp(`^${TUTORIAL_DOCS_ROOT}/`, "u"), "")
    .replace(/\.md$/u, "");
};

const buildTutorialDocPage = async (
  repoPath: string,
  sha: string
): Promise<TutorialDocPage> => {
  const rawMarkdown = await getTutorialDocRaw(repoPath, sha);
  const { frontmatter, markdown } = parseTutorialMarkdown(rawMarkdown);
  const slug = toTutorialSlug(repoPath, frontmatter.slug);
  const title = frontmatter.title?.trim() || slug.split("/").at(-1) || slug;

  return {
    author: frontmatter.author?.trim(),
    authorSlug: frontmatter.author_slug?.trim(),
    contentType: frontmatter.content_type?.trim(),
    difficulty: frontmatter.difficulty?.trim(),
    githubUrl: buildGitHubBlobUrl(repoPath),
    markdown,
    rawMarkdown,
    repoPath,
    resourceUri: `${TUTORIAL_RESOURCE_PREFIX}${slug}`,
    sha,
    slug,
    summary: buildTutorialSummary(frontmatter, markdown),
    tags: toTutorialTags(frontmatter.tags),
    title,
    topic: frontmatter.topic?.trim(),
    url: frontmatter.url?.trim() || `${TUTORIAL_SITE_URL_PREFIX}${slug}`,
  };
};

const listTutorialMarkdownPaths = async (sha: string): Promise<string[]> => {
  const tree = await getTutorialDocsTree(sha);

  return [...tree.values()]
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.path)
    .filter(
      (repoPath) =>
        repoPath.endsWith(".md") &&
        repoPath !== `${TUTORIAL_DOCS_ROOT}/_manifest.json`
    )
    .toSorted((left, right) => left.localeCompare(right));
};

export const getAllTutorialDocPages = async (): Promise<TutorialDocPage[]> => {
  const sha = await getLatestTutorialDocsSha();
  return getCachedPromise(tutorialDocsPagesCache, sha, async () => {
    const repoPaths = await listTutorialMarkdownPaths(sha);
    const pages = await Promise.all(
      repoPaths.map((repoPath) => buildTutorialDocPage(repoPath, sha))
    );

    return pages;
  });
};

export const getTutorialDocPage = async (
  slug: string
): Promise<TutorialDocPage | null> => {
  const normalizedSlug = slug.trim().replaceAll(/^\/+|\/+$/gu, "");
  const sha = await getLatestTutorialDocsSha();
  const cacheKey = `${sha}:${normalizedSlug}`;

  return getCachedPromise(tutorialDocPageCache, cacheKey, async () => {
    const repoPath = `${TUTORIAL_DOCS_ROOT}/${normalizedSlug}.md`;
    const tree = await getTutorialDocsTree(sha);
    if (!tree.has(repoPath)) {
      return null;
    }

    return await buildTutorialDocPage(repoPath, sha);
  });
};

const buildTutorialSearchIndexEntry = (
  page: TutorialDocPage
): TutorialSearchIndexEntry => ({
  author: page.author,
  content: page.markdown,
  description: page.summary,
  difficulty: page.difficulty,
  keywords: [
    page.slug,
    page.title,
    page.author,
    page.topic,
    page.difficulty,
    page.contentType,
    ...page.tags,
  ]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join(" "),
  path: page.slug,
  tags: page.tags,
  title: page.title,
  topic: page.topic,
  url: page.url,
});

export const getTutorialDocsSearch = async (): Promise<SearchServer> => {
  const sha = await getLatestTutorialDocsSha();
  return getCachedPromise(tutorialDocsSearchCache, sha, async () => {
    const pages = await getAllTutorialDocPages();

    return initSimpleSearch({
      indexes: pages.map(buildTutorialSearchIndexEntry),
    });
  });
};

export const completeTutorialResourceNames = async (
  prefix: string
): Promise<string[]> => {
  const normalizedPrefix = prefix.trim().toLowerCase();
  const pages = await getAllTutorialDocPages();
  const candidates = pages
    .map((page) => page.slug)
    .filter((slug) =>
      normalizedPrefix.length === 0
        ? true
        : slug.toLowerCase().includes(normalizedPrefix)
    );

  return candidates.slice(0, 50);
};
