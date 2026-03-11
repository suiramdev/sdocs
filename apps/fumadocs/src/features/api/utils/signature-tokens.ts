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

/**
 * Renders a signature as HTML with Tailwind utility classes for search results.
 */
export function signatureToHtml(displaySignature: string): string {
  const tokens = tokenizeSignature(displaySignature);
  const tokenClassNames: Record<SignatureTokenKind, string> = {
    default: "text-foreground/90",
    generic: "text-purple-700 dark:text-purple-300",
    keyword: "text-indigo-700 dark:text-indigo-300",
    member: "font-semibold text-foreground",
    modifier: "text-violet-700 dark:text-violet-300",
    parameter: "text-amber-700 dark:text-amber-300",
    type: "text-teal-700 dark:text-teal-300",
  };
  const parts = tokens.map(
    (token) =>
      `<span class="${tokenClassNames[token.kind]}">${escapeHtml(token.value)}</span>`
  );
  return `<span class="inline whitespace-pre-wrap break-words font-mono text-sm leading-6 tracking-tight">${parts.join("")}</span>`;
}
