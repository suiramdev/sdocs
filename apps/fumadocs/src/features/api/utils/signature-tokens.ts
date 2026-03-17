import { highlightText } from "@/features/code/utils/tree-sitter-highlight";

const IDENTIFIER_TOKEN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const SIGNATURE_TOKEN = /[A-Za-z_][A-Za-z0-9_]*|\s+|./gu;
const SIGNATURE_MODIFIERS = new Set([
  "abstract",
  "async",
  "const",
  "extern",
  "internal",
  "new",
  "override",
  "partial",
  "private",
  "protected",
  "public",
  "readonly",
  "sealed",
  "static",
  "unsafe",
  "virtual",
  "volatile",
]);
const SIGNATURE_KEYWORDS = new Set([
  "class",
  "enum",
  "event",
  "for",
  "foreach",
  "get",
  "if",
  "in",
  "interface",
  "namespace",
  "operator",
  "out",
  "params",
  "record",
  "ref",
  "return",
  "set",
  "struct",
  "using",
  "var",
  "where",
]);
const SIGNATURE_BUILTIN_TYPES = new Set([
  "bool",
  "byte",
  "char",
  "decimal",
  "double",
  "dynamic",
  "float",
  "int",
  "long",
  "nint",
  "nuint",
  "object",
  "sbyte",
  "short",
  "string",
  "uint",
  "ulong",
  "ushort",
  "void",
]);

export type SignatureTokenKind =
  | "default"
  | "generic"
  | "keyword"
  | "member"
  | "modifier"
  | "parameter"
  | "type";

export interface SignatureToken {
  kind: SignatureTokenKind;
  value: string;
}

export interface HighlightedSignatureToken extends SignatureToken {
  darkColor: string;
  lightColor: string;
}

const SIGNATURE_THEME_COLORS = {
  dark: "#E1E4E8",
  light: "#24292E",
} as const;

const CLR_BUILTIN_TYPE_ALIASES: Record<string, string> = {
  "System.Boolean": "bool",
  "System.Byte": "byte",
  "System.Char": "char",
  "System.Decimal": "decimal",
  "System.Double": "double",
  "System.Int16": "short",
  "System.Int32": "int",
  "System.Int64": "long",
  "System.Object": "object",
  "System.SByte": "sbyte",
  "System.Single": "float",
  "System.String": "string",
  "System.UInt16": "ushort",
  "System.UInt32": "uint",
  "System.UInt64": "ulong",
  "System.Void": "void",
};

const CLR_BUILTIN_TYPE_PATTERN = new RegExp(
  `\\b(?:${Object.keys(CLR_BUILTIN_TYPE_ALIASES)
    .map((typeName) => typeName.replaceAll(".", "\\."))
    .join("|")})\\b`,
  "gu"
);

function isIdentifierToken(value: string): boolean {
  return IDENTIFIER_TOKEN.test(value);
}

function findPreviousNonWhitespaceIndex(
  tokens: string[],
  from: number
): number {
  for (let index = from; index >= 0; index -= 1) {
    if (!/^\s+$/u.test(tokens[index])) {
      return index;
    }
  }

  return -1;
}

function findNextNonWhitespaceIndex(tokens: string[], from: number): number {
  for (let index = from; index < tokens.length; index += 1) {
    if (!/^\s+$/u.test(tokens[index])) {
      return index;
    }
  }

  return -1;
}

function findMemberNameTokenIndex(tokens: string[]): number {
  const openParenIndex = tokens.indexOf("(");
  const stopIndex =
    openParenIndex !== -1 ? openParenIndex - 1 : tokens.indexOf("{") - 1;

  if (stopIndex < 0) {
    return -1;
  }

  for (let index = stopIndex; index >= 0; index -= 1) {
    if (isIdentifierToken(tokens[index])) {
      return index;
    }
  }

  return -1;
}

function collectParameterNameIndexes(tokens: string[]): Set<number> {
  const indexes = new Set<number>();
  let parenDepth = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "(") {
      parenDepth += 1;
      continue;
    }

    if (token === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }

    if (parenDepth <= 0 || !isIdentifierToken(token)) {
      continue;
    }

    const nextIndex = findNextNonWhitespaceIndex(tokens, index + 1);
    if (nextIndex < 0) {
      continue;
    }

    const nextToken = tokens[nextIndex];
    if (nextToken !== "," && nextToken !== ")" && nextToken !== "=") {
      continue;
    }

    const previousIndex = findPreviousNonWhitespaceIndex(tokens, index - 1);
    if (previousIndex >= 0 && tokens[previousIndex] === ".") {
      continue;
    }

    indexes.add(index);
  }

  return indexes;
}

export function tokenizeSignature(signature: string): SignatureToken[] {
  const tokens = signature.match(SIGNATURE_TOKEN) ?? [signature];
  const memberNameIndex = findMemberNameTokenIndex(tokens);
  const parameterNameIndexes = collectParameterNameIndexes(tokens);
  const genericIndexes = new Set<number>();
  let genericDepth = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "<") {
      genericDepth += 1;
      continue;
    }
    if (token === ">") {
      genericDepth = Math.max(0, genericDepth - 1);
      continue;
    }
    if (genericDepth > 0 && isIdentifierToken(token)) {
      genericIndexes.add(index);
    }
  }

  return tokens.map((token, index) => {
    if (/^\s+$/u.test(token) || !isIdentifierToken(token)) {
      return { kind: "default" as const, value: token };
    }

    if (index === memberNameIndex) {
      return { kind: "member" as const, value: token };
    }

    if (parameterNameIndexes.has(index)) {
      return { kind: "parameter" as const, value: token };
    }

    if (SIGNATURE_MODIFIERS.has(token)) {
      return { kind: "modifier" as const, value: token };
    }

    if (SIGNATURE_KEYWORDS.has(token)) {
      return { kind: "keyword" as const, value: token };
    }

    if (SIGNATURE_BUILTIN_TYPES.has(token)) {
      return { kind: "type" as const, value: token };
    }

    if (genericIndexes.has(index)) {
      return { kind: "generic" as const, value: token };
    }

    if (/^[A-Z]/u.test(token)) {
      return { kind: "type" as const, value: token };
    }

    return { kind: "default" as const, value: token };
  });
}

const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export const normalizeSignatureForDisplay = (signature: string): string =>
  signature.replaceAll(
    CLR_BUILTIN_TYPE_PATTERN,
    (value) => CLR_BUILTIN_TYPE_ALIASES[value] ?? value
  );

const getColorStyle = ({
  darkColor,
  lightColor,
}: {
  darkColor: string;
  lightColor: string;
}) => `--syntax-dark:${darkColor};--syntax-light:${lightColor}`;

const getHighlightRanges = async (
  signature: string
): Promise<{ darkColor: string; end: number; lightColor: string }[]> => {
  const normalizedSignature = normalizeSignatureForDisplay(signature);
  const spans = await highlightText({
    isCSharpSignature: true,
    language: "csharp",
    source: normalizedSignature,
  });

  return spans.map((span) => ({
    darkColor: span.darkColor ?? SIGNATURE_THEME_COLORS.dark,
    end: span.end,
    lightColor: span.lightColor ?? SIGNATURE_THEME_COLORS.light,
  }));
};

export const highlightSignatureTokens = async (
  signature: string
): Promise<HighlightedSignatureToken[]> => {
  const normalizedSignature = normalizeSignatureForDisplay(signature);
  const tokens = tokenizeSignature(normalizedSignature);
  const colorRanges = await getHighlightRanges(signature);
  let offset = 0;
  let colorRangeIndex = 0;

  return tokens.map((token) => {
    while (
      colorRangeIndex < colorRanges.length - 1 &&
      offset >= colorRanges[colorRangeIndex].end
    ) {
      colorRangeIndex += 1;
    }

    offset += token.value.length;

    return {
      ...token,
      darkColor:
        colorRanges[colorRangeIndex]?.darkColor ?? SIGNATURE_THEME_COLORS.dark,
      lightColor:
        colorRanges[colorRangeIndex]?.lightColor ??
        SIGNATURE_THEME_COLORS.light,
    };
  });
};

/**
 * Renders a signature as HTML with Tailwind utility classes for search results.
 */
export async function signatureToHtml(
  displaySignature: string
): Promise<string> {
  const tokens = await highlightSignatureTokens(displaySignature);
  const parts = tokens.map(
    (token) =>
      `<span class="signature-token" style="${getColorStyle(token)}">${escapeHtml(token.value)}</span>`
  );
  return `<span class="inline whitespace-pre-wrap break-words font-mono text-sm leading-6 tracking-tight">${parts.join("")}</span>`;
}
