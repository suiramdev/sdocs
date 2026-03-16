import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const requireFromCurrentModule = createRequire(import.meta.url);
const WEB_TREE_SITTER_PACKAGE_NAME = "web-tree-sitter";

const C_SHARP_SIGNATURE_WRAPPER_PREFIX = "class SignatureWrapper { ";
const C_SHARP_SIGNATURE_WRAPPER_SUFFIX = " }";

const TREE_SITTER_DEFAULT_STYLE = {
  darkColor: "#E1E4E8",
  lightColor: "#24292E",
  priority: 0,
} as const;

const TREE_SITTER_THEME = {
  builtin: {
    darkColor: "#F97583",
    lightColor: "#D73A49",
    priority: 75,
  },
  comment: {
    darkColor: "#6A737D",
    lightColor: "#6A737D",
    priority: 20,
  },
  constant: {
    darkColor: "#79B8FF",
    lightColor: "#005CC5",
    priority: 55,
  },
  default: TREE_SITTER_DEFAULT_STYLE,
  function: {
    darkColor: "#79B8FF",
    lightColor: "#005CC5",
    priority: 85,
  },
  keyword: {
    darkColor: "#F97583",
    lightColor: "#D73A49",
    priority: 70,
  },
  member: {
    darkColor: "#79B8FF",
    lightColor: "#005CC5",
    priority: 80,
  },
  muted: {
    darkColor: "#9AA5B1",
    lightColor: "#586069",
    priority: 10,
  },
  namespace: {
    darkColor: "#B392F0",
    lightColor: "#6F42C1",
    priority: 78,
  },
  number: {
    darkColor: "#79B8FF",
    lightColor: "#005CC5",
    priority: 60,
  },
  parameter: {
    darkColor: "#FFAB70",
    lightColor: "#E36209",
    priority: 82,
  },
  string: {
    darkColor: "#9ECBFF",
    lightColor: "#032F62",
    priority: 50,
  },
  type: {
    darkColor: "#B392F0",
    lightColor: "#6F42C1",
    priority: 80,
  },
} as const;

const TREE_SITTER_THEME_KEYS = Object.keys(
  TREE_SITTER_THEME
) as (keyof typeof TREE_SITTER_THEME)[];

const TREE_SITTER_THEME_INDEX = new Map(
  TREE_SITTER_THEME_KEYS.map((key, index) => [key, index])
);

const TREE_SITTER_LANGUAGE_CONFIG = {
  bash: {
    packageName: "tree-sitter-bash",
    wasmFile: "tree-sitter-bash.wasm",
  },
  csharp: {
    packageName: "tree-sitter-c-sharp",
    wasmFile: "tree-sitter-c_sharp.wasm",
  },
  json: {
    packageName: "tree-sitter-json",
    wasmFile: "tree-sitter-json.wasm",
  },
} as const;

type TreeSitterPackageName =
  | typeof WEB_TREE_SITTER_PACKAGE_NAME
  | (typeof TREE_SITTER_LANGUAGE_CONFIG)[keyof typeof TREE_SITTER_LANGUAGE_CONFIG]["packageName"];

const TREE_SITTER_PACKAGE_ENTRY_PATHS = {
  "tree-sitter-bash": requireFromCurrentModule.resolve("tree-sitter-bash"),
  "tree-sitter-c-sharp": requireFromCurrentModule.resolve("tree-sitter-c-sharp"),
  "tree-sitter-json": requireFromCurrentModule.resolve("tree-sitter-json"),
  "web-tree-sitter": requireFromCurrentModule.resolve("web-tree-sitter"),
} as const satisfies Record<TreeSitterPackageName, string>;

const LANGUAGE_ALIASES = {
  bash: "bash",
  "c#": "csharp",
  cs: "csharp",
  csharp: "csharp",
  json: "json",
  jsonc: "json",
  plaintext: "text",
  sh: "bash",
  shell: "bash",
  text: "text",
  txt: "text",
  zsh: "bash",
} as const;

export type SupportedCodeLanguage =
  | keyof typeof TREE_SITTER_LANGUAGE_CONFIG
  | "text";

export interface HighlightedTextSpan {
  darkColor: string;
  end: number;
  lightColor: string;
  start: number;
  text: string;
}

export interface HighlightedLineSegment {
  darkColor: string;
  lightColor: string;
  text: string;
}

export interface HighlightedLine {
  segments: HighlightedLineSegment[];
}

interface LanguageAssets {
  language: TreeSitterLanguage;
  query: TreeSitterQuery;
}

interface ParseSource {
  source: string;
  startOffset: number;
}

interface HighlightRange {
  end: number;
  start: number;
  themeKey: keyof typeof TREE_SITTER_THEME;
}

type TreeSitterLanguage = object;

interface TreeSitterNodeCapture {
  name: string;
  node: {
    endIndex: number;
    startIndex: number;
    text: string;
  };
}

interface TreeSitterParserInstance {
  delete(): void;
  parse(source: string): { rootNode: any } | null;
  setLanguage(language: TreeSitterLanguage): TreeSitterParserInstance;
}

interface TreeSitterQuery {
  captures(node: unknown): TreeSitterNodeCapture[];
}

interface TreeSitterModule {
  Language: {
    load(path: string): Promise<TreeSitterLanguage>;
  };
  Parser: {
    init(moduleOptions?: {
      locateFile?: (scriptName: string, scriptDirectory: string) => string;
    }): Promise<void>;
    new (): TreeSitterParserInstance;
  };
  Query: new (language: TreeSitterLanguage, source: string) => TreeSitterQuery;
}

const findPackageDirectory = async (
  packageName: string,
  resolvedEntryPath: string
): Promise<string | null> => {
  let directory = dirname(resolvedEntryPath);

  while (true) {
    try {
      const packageJson = JSON.parse(
        await readFile(join(directory, "package.json"), "utf8")
      ) as {
        name?: string;
      };

      if (packageJson.name === packageName) {
        return directory;
      }
    } catch {
      // Keep walking upward until we reach the package root.
    }

    const parentDirectory = dirname(directory);
    if (parentDirectory === directory) {
      return null;
    }

    directory = parentDirectory;
  }
};

const treeSitterModulePromise = Promise.resolve(
  requireFromCurrentModule("web-tree-sitter") as TreeSitterModule
);
const dependencyStorePromise = (async () => {
  let directory = CURRENT_DIRECTORY;

  while (true) {
    const candidate = join(directory, "node_modules", ".bun");

    try {
      await readdir(candidate);
      return candidate;
    } catch {
      // Keep walking upward until we find the workspace dependency store.
    }

    const parentDirectory = dirname(directory);
    if (parentDirectory === directory) {
      throw new Error("Could not locate Bun dependency store.");
    }

    directory = parentDirectory;
  }
})();
const resolvePackageDirectoryFromBunStore = async (
  packageName: TreeSitterPackageName
): Promise<string> => {
  const dependencyStore = await dependencyStorePromise;
  const entries = await readdir(dependencyStore, {
    withFileTypes: true,
  });
  const directoryEntry = entries.find(
    (entry) => entry.isDirectory() && entry.name.startsWith(`${packageName}@`)
  );

  if (!directoryEntry) {
    throw new Error(`Could not resolve ${packageName}.`);
  }

  return join(dependencyStore, directoryEntry.name, "node_modules", packageName);
};
const resolvePackageDirectory = async (
  packageName: TreeSitterPackageName
): Promise<string> => {
  try {
    const resolvedEntryPath = TREE_SITTER_PACKAGE_ENTRY_PATHS[packageName];
    const packageDirectory = await findPackageDirectory(
      packageName,
      resolvedEntryPath
    );

    if (packageDirectory) {
      return packageDirectory;
    }
  } catch {
    // Fall back to Bun's install layout when standard package resolution fails.
  }

  return resolvePackageDirectoryFromBunStore(packageName);
};
const treeSitterCoreWasmPathPromise = (async () => {
  const packageDirectory = await resolvePackageDirectory(
    WEB_TREE_SITTER_PACKAGE_NAME
  );
  return join(packageDirectory, "tree-sitter.wasm");
})();
const parserReadyPromise = (async () => {
  const [{ Parser }, treeSitterCoreWasmPath] = await Promise.all([
    treeSitterModulePromise,
    treeSitterCoreWasmPathPromise,
  ]);

  await Parser.init({
    locateFile: (scriptName: string) =>
      scriptName === "tree-sitter.wasm" ? treeSitterCoreWasmPath : scriptName,
  });
})();
const languageAssetsCache = new Map<
  keyof typeof TREE_SITTER_LANGUAGE_CONFIG,
  Promise<LanguageAssets>
>();
const packageDirectoryCache = new Map<string, Promise<string>>();

const normalizeCodeLanguage = (
  language: string | null | undefined
): SupportedCodeLanguage => {
  if (!language) {
    return "text";
  }

  const normalized = language.toLowerCase();
  const alias = LANGUAGE_ALIASES[normalized as keyof typeof LANGUAGE_ALIASES];
  return alias ?? "text";
};

const shouldWrapCSharpSignature = (signature: string): boolean =>
  !/\b(class|enum|interface|record|struct)\b/u.test(signature);

const buildCSharpParseSource = (source: string, isSignature: boolean) => {
  if (!isSignature || !shouldWrapCSharpSignature(source)) {
    return {
      source,
      startOffset: 0,
    } satisfies ParseSource;
  }

  const trimmed = source.trimEnd();
  const needsTerminator =
    !trimmed.endsWith(";") &&
    !trimmed.endsWith("}") &&
    !trimmed.includes("{") &&
    !trimmed.includes("=>");
  const statement = needsTerminator ? `${source};` : source;

  return {
    source: `${C_SHARP_SIGNATURE_WRAPPER_PREFIX}${statement}${C_SHARP_SIGNATURE_WRAPPER_SUFFIX}`,
    startOffset: C_SHARP_SIGNATURE_WRAPPER_PREFIX.length,
  } satisfies ParseSource;
};

const resolveThemeKey = (
  captureName: string
): keyof typeof TREE_SITTER_THEME => {
  if (captureName.startsWith("comment")) {
    return "comment";
  }

  if (captureName === "string.special.key") {
    return "member";
  }

  if (captureName.startsWith("string")) {
    return "string";
  }

  if (
    captureName.startsWith("number") ||
    captureName.includes("numeric") ||
    captureName === "boolean"
  ) {
    return "number";
  }

  if (captureName === "type.builtin") {
    return "builtin";
  }

  if (captureName.startsWith("keyword") || captureName.startsWith("operator")) {
    return "keyword";
  }

  if (captureName.startsWith("function") || captureName === "constructor") {
    return "function";
  }

  if (
    captureName.startsWith("property") ||
    captureName.startsWith("field") ||
    captureName === "variable.member"
  ) {
    return "member";
  }

  if (captureName.startsWith("parameter")) {
    return "parameter";
  }

  if (captureName.startsWith("namespace")) {
    return "namespace";
  }

  if (captureName.startsWith("type")) {
    return "type";
  }

  if (captureName.startsWith("constant")) {
    return "constant";
  }

  if (captureName.startsWith("punctuation")) {
    return "muted";
  }

  return "default";
};

const pushSemanticRange = ({
  end,
  offset = 0,
  ranges,
  sourceLength,
  start,
  themeKey,
}: {
  end: number;
  offset?: number;
  ranges: HighlightRange[];
  sourceLength: number;
  start: number;
  themeKey: keyof typeof TREE_SITTER_THEME;
}) => {
  const adjustedStart = Math.max(start - offset, 0);
  const adjustedEnd = Math.min(end - offset, sourceLength);

  if (adjustedEnd <= adjustedStart) {
    return;
  }

  ranges.push({
    end: adjustedEnd,
    start: adjustedStart,
    themeKey,
  });
};

const captureQualifiedName = ({
  namespaceKey,
  node,
  offset,
  ranges,
  sourceLength,
  tailKey,
}: {
  namespaceKey: keyof typeof TREE_SITTER_THEME;
  node: any;
  offset: number;
  ranges: HighlightRange[];
  sourceLength: number;
  tailKey: keyof typeof TREE_SITTER_THEME;
}) => {
  const qualifier = node.childForFieldName("qualifier");
  const name = node.childForFieldName("name");

  if (qualifier) {
    if (qualifier.type === "qualified_name") {
      captureQualifiedName({
        namespaceKey,
        node: qualifier,
        offset,
        ranges,
        sourceLength,
        tailKey: namespaceKey,
      });
    } else {
      pushSemanticRange({
        end: qualifier.endIndex,
        offset,
        ranges,
        sourceLength,
        start: qualifier.startIndex,
        themeKey: namespaceKey,
      });
    }
  }

  if (name) {
    pushSemanticRange({
      end: name.endIndex,
      offset,
      ranges,
      sourceLength,
      start: name.startIndex,
      themeKey: tailKey,
    });
  }
};

const captureTypeReference = ({
  node,
  offset,
  ranges,
  sourceLength,
}: {
  node: any;
  offset: number;
  ranges: HighlightRange[];
  sourceLength: number;
}) => {
  switch (node.type) {
    case "alias_qualified_name": {
      const name = node.childForFieldName("name");
      if (name) {
        pushSemanticRange({
          end: name.endIndex,
          offset,
          ranges,
          sourceLength,
          start: name.startIndex,
          themeKey: "type",
        });
      }
      return;
    }
    case "generic_name": {
      const name = node.childForFieldName("name");
      if (name) {
        pushSemanticRange({
          end: name.endIndex,
          offset,
          ranges,
          sourceLength,
          start: name.startIndex,
          themeKey: "type",
        });
      }
      return;
    }
    case "identifier": {
      pushSemanticRange({
        end: node.endIndex,
        offset,
        ranges,
        sourceLength,
        start: node.startIndex,
        themeKey: "type",
      });
      return;
    }
    case "nullable_type": {
      for (const child of node.namedChildren) {
        captureTypeReference({
          node: child,
          offset,
          ranges,
          sourceLength,
        });
      }
      return;
    }
    case "predefined_type": {
      pushSemanticRange({
        end: node.endIndex,
        offset,
        ranges,
        sourceLength,
        start: node.startIndex,
        themeKey: "builtin",
      });
      return;
    }
    case "qualified_name": {
      captureQualifiedName({
        namespaceKey: "namespace",
        node,
        offset,
        ranges,
        sourceLength,
        tailKey: "type",
      });
      return;
    }
    default: {
      for (const child of node.namedChildren) {
        captureTypeReference({
          node: child,
          offset,
          ranges,
          sourceLength,
        });
      }
    }
  }
};

const collectCSharpSemanticRanges = ({
  node,
  offset,
  ranges,
  sourceLength,
}: {
  node: any;
  offset: number;
  ranges: HighlightRange[];
  sourceLength: number;
}) => {
  switch (node.type) {
    case "class_declaration":
    case "enum_declaration":
    case "interface_declaration":
    case "record_declaration":
    case "struct_declaration": {
      const name = node.childForFieldName("name");
      if (name) {
        pushSemanticRange({
          end: name.endIndex,
          offset,
          ranges,
          sourceLength,
          start: name.startIndex,
          themeKey: "type",
        });
      }
      break;
    }
    case "constructor_declaration":
    case "local_function_statement":
    case "method_declaration": {
      const name = node.childForFieldName("name");
      const returnType = node.childForFieldName("type");
      if (name) {
        pushSemanticRange({
          end: name.endIndex,
          offset,
          ranges,
          sourceLength,
          start: name.startIndex,
          themeKey: "function",
        });
      }
      if (returnType) {
        captureTypeReference({
          node: returnType,
          offset,
          ranges,
          sourceLength,
        });
      }
      break;
    }
    case "namespace_declaration":
    case "using_directive": {
      const name = node.childForFieldName("name");
      if (name) {
        if (name.type === "qualified_name") {
          captureQualifiedName({
            namespaceKey: "namespace",
            node: name,
            offset,
            ranges,
            sourceLength,
            tailKey: "namespace",
          });
        } else {
          pushSemanticRange({
            end: name.endIndex,
            offset,
            ranges,
            sourceLength,
            start: name.startIndex,
            themeKey: "namespace",
          });
        }
      }
      break;
    }
    case "parameter": {
      const name = node.childForFieldName("name");
      const type = node.childForFieldName("type");
      if (name) {
        pushSemanticRange({
          end: name.endIndex,
          offset,
          ranges,
          sourceLength,
          start: name.startIndex,
          themeKey: "parameter",
        });
      }
      if (type) {
        captureTypeReference({
          node: type,
          offset,
          ranges,
          sourceLength,
        });
      }
      break;
    }
    case "property_declaration": {
      const name = node.childForFieldName("name");
      const type = node.childForFieldName("type");
      if (name) {
        pushSemanticRange({
          end: name.endIndex,
          offset,
          ranges,
          sourceLength,
          start: name.startIndex,
          themeKey: "member",
        });
      }
      if (type) {
        captureTypeReference({
          node: type,
          offset,
          ranges,
          sourceLength,
        });
      }
      break;
    }
    case "explicit_interface_specifier": {
      const [typeReference] = node.namedChildren;
      if (typeReference) {
        captureTypeReference({
          node: typeReference,
          offset,
          ranges,
          sourceLength,
        });
      }
      break;
    }
    case "member_access_expression": {
      const name = node.childForFieldName("name");
      if (name) {
        pushSemanticRange({
          end: name.endIndex,
          offset,
          ranges,
          sourceLength,
          start: name.startIndex,
          themeKey: "member",
        });
      }
      break;
    }
    case "object_creation_expression": {
      const type = node.childForFieldName("type");
      if (type) {
        captureTypeReference({
          node: type,
          offset,
          ranges,
          sourceLength,
        });
      }
      break;
    }
  }

  for (const child of node.namedChildren) {
    collectCSharpSemanticRanges({
      node: child,
      offset,
      ranges,
      sourceLength,
    });
  }
};

const loadLanguageAssets = async (
  language: keyof typeof TREE_SITTER_LANGUAGE_CONFIG
): Promise<LanguageAssets> => {
  const cached = languageAssetsCache.get(language);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    await parserReadyPromise;
    const { Language, Query } = await treeSitterModulePromise;

    const config = TREE_SITTER_LANGUAGE_CONFIG[language];
    const packageDirectory = await (async () => {
      const cachedDirectory = packageDirectoryCache.get(config.packageName);
      if (cachedDirectory) {
        return cachedDirectory;
      }

      const directoryPromise = resolvePackageDirectory(config.packageName);

      packageDirectoryCache.set(config.packageName, directoryPromise);
      return directoryPromise;
    })();
    const [treeSitterLanguage, querySource] = await Promise.all([
      Language.load(join(packageDirectory, config.wasmFile)),
      readFile(join(packageDirectory, "queries", "highlights.scm"), "utf8"),
    ]);
    return {
      language: treeSitterLanguage,
      query: new Query(treeSitterLanguage, querySource),
    } satisfies LanguageAssets;
  })();

  languageAssetsCache.set(language, promise);
  return promise;
};

const getHighlightRanges = async ({
  isCSharpSignature = false,
  language,
  source,
}: {
  isCSharpSignature?: boolean;
  language: SupportedCodeLanguage;
  source: string;
}): Promise<HighlightRange[]> => {
  if (language === "text" || source.length === 0) {
    return [];
  }

  const { language: treeSitterLanguage, query } =
    await loadLanguageAssets(language);
  const parseSource =
    language === "csharp"
      ? buildCSharpParseSource(source, isCSharpSignature)
      : {
          source,
          startOffset: 0,
        };
  const { Parser } = await treeSitterModulePromise;
  const parser = new Parser();

  try {
    parser.setLanguage(treeSitterLanguage);
    const tree = parser.parse(parseSource.source);

    if (!tree) {
      return [];
    }

    const endOffset = parseSource.startOffset + source.length;
    const captures = query.captures(tree.rootNode);
    const ranges = captures.flatMap((capture) => {
      const start = Math.max(
        capture.node.startIndex - parseSource.startOffset,
        0
      );
      const end = Math.min(
        capture.node.endIndex - parseSource.startOffset,
        source.length
      );

      if (
        capture.node.text.length === 0 ||
        capture.node.endIndex <= parseSource.startOffset ||
        capture.node.startIndex >= endOffset ||
        end <= start
      ) {
        return [];
      }

      return {
        end,
        start,
        themeKey: resolveThemeKey(capture.name),
      } satisfies HighlightRange;
    });

    if (language === "csharp") {
      collectCSharpSemanticRanges({
        node: tree.rootNode,
        offset: parseSource.startOffset,
        ranges,
        sourceLength: source.length,
      });
    }

    return ranges;
  } finally {
    parser.delete();
  }
};

const getDefaultSpan = (source: string): HighlightedTextSpan[] => {
  if (source.length === 0) {
    return [];
  }

  return [
    {
      darkColor: TREE_SITTER_DEFAULT_STYLE.darkColor,
      end: source.length,
      lightColor: TREE_SITTER_DEFAULT_STYLE.lightColor,
      start: 0,
      text: source,
    },
  ];
};

export const highlightText = async ({
  isCSharpSignature = false,
  language,
  source,
}: {
  isCSharpSignature?: boolean;
  language: string | null | undefined;
  source: string;
}): Promise<HighlightedTextSpan[]> => {
  if (source.length === 0) {
    return [];
  }

  const normalizedLanguage = normalizeCodeLanguage(language);
  const styleIndexes = new Uint16Array(source.length);
  const priorities = new Int16Array(source.length);
  const highlightRanges = await getHighlightRanges({
    isCSharpSignature,
    language: normalizedLanguage,
    source,
  });

  if (highlightRanges.length === 0) {
    return getDefaultSpan(source);
  }

  const defaultIndex = TREE_SITTER_THEME_INDEX.get("default") ?? 0;
  styleIndexes.fill(defaultIndex);
  priorities.fill(TREE_SITTER_DEFAULT_STYLE.priority);

  for (const range of highlightRanges) {
    const themeStyle = TREE_SITTER_THEME[range.themeKey];
    const themeIndex =
      TREE_SITTER_THEME_INDEX.get(range.themeKey) ?? defaultIndex;

    for (let index = range.start; index < range.end; index += 1) {
      if (themeStyle.priority < priorities[index]) {
        continue;
      }

      priorities[index] = themeStyle.priority;
      styleIndexes[index] = themeIndex;
    }
  }

  const spans: HighlightedTextSpan[] = [];
  let spanStart = 0;

  for (let index = 1; index <= source.length; index += 1) {
    const currentThemeIndex = styleIndexes[spanStart];
    const nextThemeIndex =
      index < source.length ? styleIndexes[index] : Number.NaN;

    if (index < source.length && currentThemeIndex === nextThemeIndex) {
      continue;
    }

    const themeKey = TREE_SITTER_THEME_KEYS[currentThemeIndex] ?? "default";
    const themeStyle = TREE_SITTER_THEME[themeKey];

    spans.push({
      darkColor: themeStyle.darkColor,
      end: index,
      lightColor: themeStyle.lightColor,
      start: spanStart,
      text: source.slice(spanStart, index),
    });

    spanStart = index;
  }

  return spans;
};

export const highlightCode = async ({
  language,
  source,
}: {
  language: string | null | undefined;
  source: string;
}): Promise<HighlightedLine[]> => {
  const spans = await highlightText({ language, source });
  const lines: HighlightedLine[] = [{ segments: [] }];

  for (const span of spans) {
    const parts = span.text.split("\n");

    for (const [index, part] of parts.entries()) {
      if (part.length > 0) {
        lines.at(-1)?.segments.push({
          darkColor: span.darkColor,
          lightColor: span.lightColor,
          text: part,
        });
      }

      if (index < parts.length - 1) {
        lines.push({ segments: [] });
      }
    }
  }

  return lines;
};
