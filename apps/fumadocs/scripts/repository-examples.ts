/* eslint-disable max-statements */

import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ApiEntity, ApiExample } from "@/features/api/utils/schemas";

interface ExampleRepositoryConfig {
  maxExamplesPerMember?: number;
  name: string;
  ref?: string;
  url: string;
}

interface ParsedClassDeclaration {
  baseTypeNames: string[];
  bodyEnd: number;
  bodyStart: number;
  filePath: string;
  name: string;
}

interface ParsedMemberDeclaration {
  code: string;
  filePath: string;
  fileUrl: string;
  lineEnd: number;
  lineStart: number;
  memberKind: "method" | "property";
  modifiers: Set<string>;
  name: string;
  parameterTypes: string[];
  qualifiedName: string;
  returnType: string | null;
  typeName: string;
}

interface ExampleMemberCandidate {
  declaringTypeKind: "class" | "enum" | "interface" | "struct";
  declaringTypeName: string;
  docId: string;
  entityKind: "method" | "property";
  name: string;
  parameterTypes: string[];
  returnType: string | null;
}

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspaceRoot = path.resolve(projectRoot, "..", "..");
const repositoryCacheRoot = path.join(
  workspaceRoot,
  ".cache",
  "api-example-repositories"
);
const exampleRepositoriesConfigPath = path.join(
  projectRoot,
  "data",
  "api",
  "example-repositories.json"
);

const CSHARP_EXTENSION = ".cs";
const DEFAULT_MAX_EXAMPLES_PER_MEMBER = 5;
const MAX_EXAMPLE_LINES = 80;
const CLASS_DECLARATION_REGEX =
  /(?:^|\n)\s*(?:(?:public|private|protected|internal|sealed|abstract|static|partial|new)\s+)*(?:class|record|struct)\s+([A-Za-z_][A-Za-z0-9_]*)(?:<[^>{;\n]+>)?\s*(?::([^\\{]+))?\s*\{/gmu;
const METHOD_DECLARATION_REGEX =
  /(?:^|\n)[ \t]*(?:\[[^\n]+\][ \t]*\n[ \t]*)*(?:(?:(?:public|private|protected|internal|static|virtual|override|sealed|async|new|partial|extern|unsafe|required)\s+)*)((?:global::)?[A-Za-z_(][A-Za-z0-9_<>[\].,? ()]*?)\s+((?:[A-Za-z_][A-Za-z0-9_]*\.)*[A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:where[^{=>\n]+)?(=>|\{)/gmu;
const PROPERTY_DECLARATION_REGEX =
  /(?:^|\n)[ \t]*(?:\[[^\n]+\][ \t]*\n[ \t]*)*(?:(?:(?:public|private|protected|internal|static|virtual|override|sealed|new|required)\s+)*)((?:global::)?[A-Za-z_(][A-Za-z0-9_<>[\].,? ()]*?)\s+((?:[A-Za-z_][A-Za-z0-9_]*\.)*[A-Za-z_][A-Za-z0-9_]*)\s*\{/gmu;
const MODIFIER_REGEX =
  /\b(?:async|extern|internal|new|override|partial|private|protected|public|required|sealed|static|unsafe|virtual)\b/gu;

const SYSTEM_TYPE_ALIASES: Record<string, string> = {
  bool: "bool",
  boolean: "bool",
  byte: "byte",
  char: "char",
  decimal: "decimal",
  double: "double",
  float: "float",
  int: "int",
  int16: "short",
  int32: "int",
  int64: "long",
  long: "long",
  object: "object",
  sbyte: "sbyte",
  short: "short",
  single: "float",
  string: "string",
  "system.boolean": "bool",
  "system.byte": "byte",
  "system.char": "char",
  "system.decimal": "decimal",
  "system.double": "double",
  "system.int16": "short",
  "system.int32": "int",
  "system.int64": "long",
  "system.object": "object",
  "system.sbyte": "sbyte",
  "system.single": "float",
  "system.string": "string",
  "system.uint16": "ushort",
  "system.uint32": "uint",
  "system.uint64": "ulong",
  "system.void": "void",
  uint: "uint",
  uint16: "ushort",
  uint32: "uint",
  uint64: "ulong",
  ulong: "ulong",
  ushort: "ushort",
  void: "void",
};

const hashValue = (value: string): string =>
  createHash("sha1").update(value).digest("hex");

const toCacheKey = (repositoryUrl: string): string =>
  hashValue(repositoryUrl).slice(0, 12);

const readJsonFile = async <T>(filePath: string): Promise<T | null> => {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
};

const runCommand = (
  cmd: string[],
  cwd?: string
): {
  exitCode: number;
  stderr: string;
  stdout: string;
} => {
  const result = Bun.spawnSync({
    cmd,
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });

  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString("utf8"),
    stdout: result.stdout.toString("utf8"),
  };
};

const ensureSuccess = (
  result: ReturnType<typeof runCommand>,
  command: string[]
): string => {
  if (result.exitCode === 0) {
    return result.stdout.trim();
  }

  const stderr = result.stderr.trim();
  throw new Error(
    `${command.join(" ")} failed${stderr.length > 0 ? `: ${stderr}` : ""}`
  );
};

const removeComments = (value: string): string =>
  value.replaceAll(/\/\*[\s\S]*?\*\//gu, " ").replaceAll(/\/\/.*$/gmu, " ");

const stripGenericArguments = (value: string): string => {
  let normalized = "";
  let depth = 0;

  for (const character of value) {
    if (character === "<") {
      depth += 1;
      continue;
    }

    if (character === ">") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (depth === 0) {
      normalized += character;
    }
  }

  return normalized;
};

const splitTopLevel = (value: string, separator: string): string[] => {
  const parts: string[] = [];
  let current = "";
  let angleDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;

  for (const character of value) {
    if (character === "<") {
      angleDepth += 1;
    } else if (character === ">") {
      angleDepth = Math.max(0, angleDepth - 1);
    } else if (character === "[") {
      bracketDepth += 1;
    } else if (character === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (character === "(") {
      parenDepth += 1;
    } else if (character === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
    }

    if (
      character === separator &&
      angleDepth === 0 &&
      bracketDepth === 0 &&
      parenDepth === 0
    ) {
      parts.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim().length > 0) {
    parts.push(current);
  }

  return parts;
};

const stripDefaultAssignment = (value: string): string => {
  let angleDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "<") {
      angleDepth += 1;
    } else if (character === ">") {
      angleDepth = Math.max(0, angleDepth - 1);
    } else if (character === "[") {
      bracketDepth += 1;
    } else if (character === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (character === "(") {
      parenDepth += 1;
    } else if (character === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
    }

    if (
      character === "=" &&
      angleDepth === 0 &&
      bracketDepth === 0 &&
      parenDepth === 0
    ) {
      return value.slice(0, index).trim();
    }
  }

  return value.trim();
};

const normalizeTypeName = (value: string): string => {
  const withoutComments = removeComments(value).trim();
  if (withoutComments.length === 0) {
    return "";
  }

  const withoutPrefix = withoutComments
    .replaceAll(/\b(?:in|out|params|ref|required|scoped|this)\b/gu, "")
    .replaceAll("?", "")
    .replaceAll(/\s+/gu, " ")
    .trim();
  const withoutGenerics = stripGenericArguments(withoutPrefix);
  const normalizedToken =
    withoutGenerics.split(/\s+/u).at(-1)?.trim() ?? withoutGenerics;

  if (normalizedToken.startsWith("(") && normalizedToken.endsWith(")")) {
    return normalizedToken
      .replaceAll(/\s+/gu, "")
      .replaceAll(/,\w+/gu, ",")
      .toLowerCase();
  }

  const simpleName = normalizedToken.split(".").at(-1) ?? normalizedToken;
  const aliasKey = normalizedToken.toLowerCase();
  const simpleAliasKey = simpleName.toLowerCase();

  return (
    SYSTEM_TYPE_ALIASES[aliasKey] ??
    SYSTEM_TYPE_ALIASES[simpleAliasKey] ??
    simpleName.toLowerCase()
  );
};

const extractParameterTypes = (parameterList: string): string[] =>
  splitTopLevel(parameterList, ",")
    .map((parameter) => stripDefaultAssignment(parameter))
    .map((parameter) => parameter.replaceAll(/\[[^\]]+\]\s*/gu, "").trim())
    .filter((parameter) => parameter.length > 0)
    .map((parameter) => {
      const segments = parameter.split(/\s+/u).filter(Boolean);

      if (segments.length <= 1) {
        return normalizeTypeName(parameter);
      }

      return normalizeTypeName(segments.slice(0, -1).join(" "));
    });

const getSimpleName = (value: string): string =>
  value.split(".").at(-1) ?? value;

const countLines = (value: string): number =>
  value.length === 0 ? 0 : value.split("\n").length;

const getLineNumberAt = (value: string, index: number): number =>
  value.slice(0, index).split("\n").length;

const findMatchingBrace = (
  value: string,
  openingBraceIndex: number
): number => {
  let depth = 0;
  let inBlockComment = false;
  let inLineComment = false;
  let inString = false;
  let stringDelimiter = "";
  let previousCharacter = "";

  for (let index = openingBraceIndex; index < value.length; index += 1) {
    const character = value[index];
    const nextCharacter = value[index + 1] ?? "";

    if (inLineComment) {
      if (character === "\n") {
        inLineComment = false;
      }
      previousCharacter = character;
      continue;
    }

    if (inBlockComment) {
      if (previousCharacter === "*" && character === "/") {
        inBlockComment = false;
      }
      previousCharacter = character;
      continue;
    }

    if (inString) {
      if (character === stringDelimiter && previousCharacter !== "\\") {
        inString = false;
      }
      previousCharacter = character;
      continue;
    }

    if (character === "/" && nextCharacter === "/") {
      inLineComment = true;
      previousCharacter = character;
      continue;
    }

    if (character === "/" && nextCharacter === "*") {
      inBlockComment = true;
      previousCharacter = character;
      continue;
    }

    if (character === '"' || character === "'") {
      inString = true;
      stringDelimiter = character;
      previousCharacter = character;
      continue;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }

    previousCharacter = character;
  }

  return -1;
};

const toGitHubBlobUrl = (input: {
  filePath: string;
  lineEnd: number;
  lineStart: number;
  repository: ExampleRepositoryConfig;
  repositoryRevision: string;
}): string => {
  const pathValue = input.filePath.split(path.sep).join("/");
  return `${input.repository.url}/blob/${input.repositoryRevision}/${pathValue}#L${input.lineStart}-L${input.lineEnd}`;
};

const getModifiers = (value: string): Set<string> => {
  const matches = value.match(MODIFIER_REGEX);
  return matches ? new Set(matches) : new Set();
};

const getExplicitContainerName = (value: string): string | null => {
  if (!value.includes(".")) {
    return null;
  }

  return value.split(".").slice(0, -1).join(".");
};

const extractDeclarationCode = (input: {
  content: string;
  declarationStart: number;
  filePath: string;
  repository: ExampleRepositoryConfig;
  repositoryRevision: string;
  terminator: "=>" | "{";
  terminatorIndex: number;
}): ParsedMemberDeclaration | null => {
  let declarationEnd = input.terminatorIndex;

  if (input.terminator === "{") {
    declarationEnd = findMatchingBrace(input.content, input.terminatorIndex);
    if (declarationEnd === -1) {
      return null;
    }
    declarationEnd += 1;
  } else {
    declarationEnd = input.content.indexOf(";", input.terminatorIndex);
    if (declarationEnd === -1) {
      return null;
    }
    declarationEnd += 1;
  }

  const code = input.content
    .slice(input.declarationStart, declarationEnd)
    .trim();
  const lineStart = getLineNumberAt(input.content, input.declarationStart);
  const lineEnd = getLineNumberAt(input.content, declarationEnd);

  if (countLines(code) > MAX_EXAMPLE_LINES) {
    return null;
  }

  return {
    code,
    filePath: input.filePath,
    fileUrl: toGitHubBlobUrl({
      filePath: input.filePath,
      lineEnd,
      lineStart,
      repository: input.repository,
      repositoryRevision: input.repositoryRevision,
    }),
    lineEnd,
    lineStart,
    memberKind: "method",
    modifiers: new Set(),
    name: "",
    parameterTypes: [],
    qualifiedName: "",
    returnType: null,
    typeName: "",
  };
};

const parseClassDeclarations = (
  content: string,
  filePath: string
): ParsedClassDeclaration[] => {
  const classes: ParsedClassDeclaration[] = [];

  for (const match of content.matchAll(CLASS_DECLARATION_REGEX)) {
    const [fullMatch] = match;
    const openingBraceOffset = fullMatch.lastIndexOf("{");
    const openingBraceIndex = (match.index ?? 0) + openingBraceOffset;
    const closingBraceIndex = findMatchingBrace(content, openingBraceIndex);
    if (closingBraceIndex === -1) {
      continue;
    }

    const baseTypeNames = splitTopLevel(match[2] ?? "", ",")
      .map((baseType) => baseType.trim())
      .filter((baseType) => baseType.length > 0)
      .map((baseType) => stripDefaultAssignment(baseType))
      .map((baseType) => stripGenericArguments(baseType))
      .map((baseType) => baseType.split(/\s+/u)[0] ?? baseType)
      .map((baseType) => getSimpleName(baseType))
      .filter((baseType) => baseType.length > 0);

    classes.push({
      baseTypeNames,
      bodyEnd: closingBraceIndex,
      bodyStart: openingBraceIndex + 1,
      filePath,
      name: match[1],
    });
  }

  return classes;
};

const parseMethodDeclarations = (input: {
  classBody: string;
  classBodyOffset: number;
  content: string;
  filePath: string;
  repository: ExampleRepositoryConfig;
  repositoryRevision: string;
  typeName: string;
}): ParsedMemberDeclaration[] => {
  const declarations: ParsedMemberDeclaration[] = [];

  for (const match of input.classBody.matchAll(METHOD_DECLARATION_REGEX)) {
    const [, returnType, qualifiedName, parameterList, terminatorValue] = match;
    const relativeMatchIndex = match.index ?? 0;
    const declarationStart = input.classBodyOffset + relativeMatchIndex;
    const terminator = terminatorValue as "=>" | "{";
    const terminatorIndex = declarationStart + match[0].lastIndexOf(terminator);
    const extracted = extractDeclarationCode({
      content: input.content,
      declarationStart,
      filePath: input.filePath,
      repository: input.repository,
      repositoryRevision: input.repositoryRevision,
      terminator,
      terminatorIndex,
    });

    if (!extracted) {
      continue;
    }

    extracted.memberKind = "method";
    extracted.modifiers = getModifiers(match[0]);
    extracted.name = getSimpleName(qualifiedName);
    extracted.parameterTypes = extractParameterTypes(parameterList ?? "");
    extracted.qualifiedName = qualifiedName;
    extracted.returnType = normalizeTypeName(returnType);
    extracted.typeName = input.typeName;
    declarations.push(extracted);
  }

  return declarations;
};

const parsePropertyDeclarations = (input: {
  classBody: string;
  classBodyOffset: number;
  content: string;
  filePath: string;
  repository: ExampleRepositoryConfig;
  repositoryRevision: string;
  typeName: string;
}): ParsedMemberDeclaration[] => {
  const declarations: ParsedMemberDeclaration[] = [];

  for (const match of input.classBody.matchAll(PROPERTY_DECLARATION_REGEX)) {
    const [, returnType, qualifiedName] = match;
    const relativeMatchIndex = match.index ?? 0;
    const declarationStart = input.classBodyOffset + relativeMatchIndex;
    const terminatorIndex = declarationStart + match[0].lastIndexOf("{");
    const extracted = extractDeclarationCode({
      content: input.content,
      declarationStart,
      filePath: input.filePath,
      repository: input.repository,
      repositoryRevision: input.repositoryRevision,
      terminator: "{",
      terminatorIndex,
    });

    if (!extracted) {
      continue;
    }

    if (!/\b(?:get|init|set)\b/gu.test(extracted.code)) {
      continue;
    }

    extracted.memberKind = "property";
    extracted.modifiers = getModifiers(match[0]);
    extracted.name = getSimpleName(qualifiedName);
    extracted.parameterTypes = [];
    extracted.qualifiedName = qualifiedName;
    extracted.returnType = normalizeTypeName(returnType);
    extracted.typeName = input.typeName;
    declarations.push(extracted);
  }

  return declarations;
};

const listCSharpFiles = async (directoryPath: string): Promise<string[]> => {
  const files: string[] = [];
  const entries = await readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".git") {
      continue;
    }

    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listCSharpFiles(absolutePath)));
      continue;
    }

    if (path.extname(entry.name) === CSHARP_EXTENSION) {
      files.push(absolutePath);
    }
  }

  return files;
};

const buildClassMap = (
  classDeclarations: ParsedClassDeclaration[]
): Map<string, ParsedClassDeclaration[]> => {
  const classMap = new Map<string, ParsedClassDeclaration[]>();

  for (const declaration of classDeclarations) {
    const existing = classMap.get(declaration.name) ?? [];
    existing.push(declaration);
    classMap.set(declaration.name, existing);
  }

  return classMap;
};

const resolveBaseTypeClosure = (
  className: string,
  classMap: Map<string, ParsedClassDeclaration[]>,
  cache: Map<string, Set<string>>,
  trail: Set<string>
): Set<string> => {
  const cached = cache.get(className);
  if (cached) {
    return cached;
  }

  if (trail.has(className)) {
    return new Set();
  }

  trail.add(className);
  const resolved = new Set<string>();

  for (const declaration of classMap.get(className) ?? []) {
    for (const baseTypeName of declaration.baseTypeNames) {
      resolved.add(baseTypeName);

      if (!classMap.has(baseTypeName)) {
        continue;
      }

      for (const inheritedTypeName of resolveBaseTypeClosure(
        baseTypeName,
        classMap,
        cache,
        trail
      )) {
        resolved.add(inheritedTypeName);
      }
    }
  }

  trail.delete(className);
  cache.set(className, resolved);
  return resolved;
};

const buildMemberCandidateIndex = (
  entities: ApiEntity[]
): Map<string, ExampleMemberCandidate[]> => {
  const typeKindByFullName = new Map<
    string,
    ExampleMemberCandidate["declaringTypeKind"]
  >();

  for (const entity of entities) {
    if (
      entity.entityKind === "class" ||
      entity.entityKind === "enum" ||
      entity.entityKind === "interface" ||
      entity.entityKind === "struct"
    ) {
      typeKindByFullName.set(entity.class, entity.entityKind);
    }
  }

  const candidateIndex = new Map<string, ExampleMemberCandidate[]>();

  for (const entity of entities) {
    if (entity.entityKind !== "method" && entity.entityKind !== "property") {
      continue;
    }

    const declaringTypeKind = typeKindByFullName.get(entity.class);
    if (!declaringTypeKind) {
      continue;
    }

    const isOverrideTarget =
      declaringTypeKind === "interface" ||
      /\b(?:abstract|override|virtual)\b/gu.test(entity.displaySignature);
    if (!isOverrideTarget) {
      continue;
    }

    const candidate: ExampleMemberCandidate = {
      declaringTypeKind,
      declaringTypeName: getSimpleName(entity.class),
      docId: entity.docId,
      entityKind: entity.entityKind,
      name: getSimpleName(entity.name),
      parameterTypes: entity.parameters.map((parameter) =>
        normalizeTypeName(parameter.type)
      ),
      returnType:
        entity.returnType === null
          ? null
          : normalizeTypeName(entity.returnType),
    };
    const existing = candidateIndex.get(candidate.name) ?? [];
    existing.push(candidate);
    candidateIndex.set(candidate.name, existing);
  }

  return candidateIndex;
};

const scoreCandidate = (input: {
  candidate: ExampleMemberCandidate;
  declaration: ParsedMemberDeclaration;
  explicitContainer: string | null;
  inheritedTypeNames: Set<string>;
}): number => {
  if (input.candidate.entityKind !== input.declaration.memberKind) {
    return -1;
  }

  if (
    input.candidate.parameterTypes.length !==
    input.declaration.parameterTypes.length
  ) {
    return -1;
  }

  let score = 0;
  const normalizedExplicitContainer =
    input.explicitContainer === null
      ? null
      : getSimpleName(stripGenericArguments(input.explicitContainer));

  if (
    normalizedExplicitContainer &&
    normalizeTypeName(normalizedExplicitContainer) ===
      normalizeTypeName(input.candidate.declaringTypeName)
  ) {
    score += 120;
  }

  if (input.inheritedTypeNames.has(input.candidate.declaringTypeName)) {
    score += 80;
  }

  if (
    input.declaration.modifiers.has("override") &&
    input.candidate.declaringTypeKind !== "interface"
  ) {
    score += 30;
  }

  if (
    !input.declaration.modifiers.has("override") &&
    input.candidate.declaringTypeKind === "interface"
  ) {
    score += 20;
  }

  if (input.candidate.returnType === input.declaration.returnType) {
    score += 15;
  }

  const parametersMatch = input.candidate.parameterTypes.every(
    (parameterType, index) =>
      parameterType === input.declaration.parameterTypes[index]
  );
  if (parametersMatch) {
    score += 25;
  }

  return score;
};

const toApiExample = (input: {
  declaration: ParsedMemberDeclaration;
  repository: ExampleRepositoryConfig;
  repositoryRevision: string;
}): ApiExample => ({
  code: input.declaration.code,
  filePath: input.declaration.filePath,
  fileUrl: input.declaration.fileUrl,
  lineEnd: input.declaration.lineEnd,
  lineStart: input.declaration.lineStart,
  repositoryName: input.repository.name,
  repositoryRef: input.repositoryRevision,
  repositoryUrl: input.repository.url,
  sourceKind: "repository",
});

const mergeExamples = (
  target: Map<string, ApiExample[]>,
  docId: string,
  example: ApiExample,
  maxExamplesPerMember: number
): void => {
  const existing = target.get(docId) ?? [];
  const alreadyExists = existing.some(
    (item) => item.code === example.code && item.fileUrl === example.fileUrl
  );
  if (alreadyExists || existing.length >= maxExamplesPerMember) {
    return;
  }

  existing.push(example);
  target.set(docId, existing);
};

const parseRepositoryDeclarations = async (input: {
  repository: ExampleRepositoryConfig;
  repositoryRevision: string;
  repositoryRoot: string;
}): Promise<{
  classDeclarations: ParsedClassDeclaration[];
  memberDeclarations: ParsedMemberDeclaration[];
}> => {
  const files = await listCSharpFiles(input.repositoryRoot);
  const classDeclarations: ParsedClassDeclaration[] = [];
  const memberDeclarations: ParsedMemberDeclaration[] = [];

  for (const absolutePath of files) {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      continue;
    }

    const content = await readFile(absolutePath, "utf8");
    const relativePath = path.relative(input.repositoryRoot, absolutePath);
    const fileClasses = parseClassDeclarations(content, relativePath);
    classDeclarations.push(...fileClasses);

    for (const classDeclaration of fileClasses) {
      const classBody = content.slice(
        classDeclaration.bodyStart,
        classDeclaration.bodyEnd
      );

      memberDeclarations.push(
        ...parseMethodDeclarations({
          classBody,
          classBodyOffset: classDeclaration.bodyStart,
          content,
          filePath: relativePath,
          repository: input.repository,
          repositoryRevision: input.repositoryRevision,
          typeName: classDeclaration.name,
        }),
        ...parsePropertyDeclarations({
          classBody,
          classBodyOffset: classDeclaration.bodyStart,
          content,
          filePath: relativePath,
          repository: input.repository,
          repositoryRevision: input.repositoryRevision,
          typeName: classDeclaration.name,
        })
      );
    }
  }

  return {
    classDeclarations,
    memberDeclarations,
  };
};

const ensureRepositoryCheckout = async (
  repository: ExampleRepositoryConfig
): Promise<string> => {
  await mkdir(repositoryCacheRoot, { recursive: true });
  const repositoryPath = path.join(
    repositoryCacheRoot,
    `${toCacheKey(repository.url)}-${repository.name.replaceAll("/", "-").toLowerCase()}`
  );
  const gitDirectory = path.join(repositoryPath, ".git");

  try {
    await access(gitDirectory);
    const pullResult = runCommand(["git", "pull", "--ff-only"], repositoryPath);
    if (pullResult.exitCode !== 0) {
      process.stdout.write(
        `Repository example sync skipped for ${repository.name}: ${pullResult.stderr.trim()}\n`
      );
    }
    return repositoryPath;
  } catch {
    const cloneCommand = [
      "git",
      "clone",
      "--depth",
      "1",
      repository.url,
      repositoryPath,
    ];
    ensureSuccess(runCommand(cloneCommand), cloneCommand);
    return repositoryPath;
  }
};

const getRepositoryHeadRevision = (repositoryPath: string): string => {
  const command = ["git", "rev-parse", "HEAD"];
  return ensureSuccess(runCommand(command, repositoryPath), command);
};

const getRemoteHeadRevision = (
  repository: ExampleRepositoryConfig
): string | null => {
  const targetRef = repository.ref?.trim() || "HEAD";
  const command = ["git", "ls-remote", repository.url, targetRef];
  const result = runCommand(command);
  if (result.exitCode !== 0) {
    return null;
  }

  const line = result.stdout
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);

  return line?.split(/\s+/u)[0] ?? null;
};

const toFingerprint = (repositories: ExampleRepositoryConfig[]): string =>
  hashValue(JSON.stringify(repositories));

const getInheritedTypeNames = (
  typeName: string,
  classMap: Map<string, ParsedClassDeclaration[]>,
  cache: Map<string, Set<string>>
): Set<string> => {
  const inheritedTypeNames = new Set<string>();
  for (const value of resolveBaseTypeClosure(
    typeName,
    classMap,
    cache,
    new Set()
  )) {
    inheritedTypeNames.add(value);
  }
  return inheritedTypeNames;
};

export const loadExampleRepositories = async (): Promise<
  ExampleRepositoryConfig[]
> => {
  const repositories =
    (await readJsonFile<ExampleRepositoryConfig[]>(
      exampleRepositoriesConfigPath
    )) ?? [];

  return repositories.filter(
    (repository) =>
      repository.name.trim().length > 0 && repository.url.trim().length > 0
  );
};

export const getExampleRepositoriesFingerprint = async (): Promise<string> => {
  const repositories = await loadExampleRepositories();
  if (repositories.length === 0) {
    return hashValue("none");
  }

  const revisions = repositories.map((repository) => ({
    name: repository.name,
    revision: getRemoteHeadRevision(repository),
    url: repository.url,
  }));

  return hashValue(
    JSON.stringify({
      config: toFingerprint(repositories),
      revisions,
    })
  );
};

export const buildRepositoryExamplesIndex = async (
  entities: ApiEntity[]
): Promise<Map<string, ApiExample[]>> => {
  const repositories = await loadExampleRepositories();
  if (repositories.length === 0) {
    return new Map();
  }

  const candidateIndex = buildMemberCandidateIndex(entities);
  if (candidateIndex.size === 0) {
    return new Map();
  }

  const examplesByDocId = new Map<string, ApiExample[]>();

  for (const repository of repositories) {
    process.stdout.write(
      `Scanning repository examples from ${repository.name}...\n`
    );
    const repositoryRoot = await ensureRepositoryCheckout(repository);
    const repositoryRevision = getRepositoryHeadRevision(repositoryRoot);
    const parsedRepository = await parseRepositoryDeclarations({
      repository,
      repositoryRevision,
      repositoryRoot,
    });
    const classMap = buildClassMap(parsedRepository.classDeclarations);
    const inheritanceCache = new Map<string, Set<string>>();
    const maxExamplesPerMember =
      repository.maxExamplesPerMember ?? DEFAULT_MAX_EXAMPLES_PER_MEMBER;

    for (const declaration of parsedRepository.memberDeclarations) {
      const candidates = candidateIndex.get(declaration.name) ?? [];
      if (candidates.length === 0) {
        continue;
      }

      const inheritedTypeNames = getInheritedTypeNames(
        declaration.typeName,
        classMap,
        inheritanceCache
      );
      const explicitContainer = getExplicitContainerName(
        declaration.qualifiedName
      );
      const scoredCandidates = candidates
        .map((candidate) => ({
          candidate,
          score: scoreCandidate({
            candidate,
            declaration,
            explicitContainer,
            inheritedTypeNames,
          }),
        }))
        .filter((item) => item.score >= 0)
        .toSorted((left, right) => right.score - left.score);

      if (scoredCandidates.length === 0) {
        continue;
      }

      const topScore = scoredCandidates[0].score;
      const topCandidates = scoredCandidates.filter(
        (item) => item.score === topScore
      );
      if (topScore < 80 || topCandidates.length !== 1) {
        continue;
      }

      mergeExamples(
        examplesByDocId,
        topCandidates[0].candidate.docId,
        toApiExample({
          declaration,
          repository,
          repositoryRevision,
        }),
        maxExamplesPerMember
      );
    }
  }

  return examplesByDocId;
};
