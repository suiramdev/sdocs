import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSdkEntityAnchor } from "@/lib/sdk/reference";
import type { SdkEntity, SdkException, SdkParameter } from "@/lib/sdk/schemas";

interface CliOptions {
  input: string;
  clean: boolean;
  emitMdx: boolean;
  includeNonPublic: boolean;
}

interface RawDocumentation {
  Summary?: string;
  Return?: string;
  Remarks?: string;
  Params?: Record<string, string>;
  Examples?: string[];
  Exceptions?:
    | Array<{
        Cref?: string;
        Type?: string;
        Name?: string;
        Description?: string;
        Value?: string;
      }>
    | Record<string, string>;
}

interface NormalizedDocumentation {
  summary: string;
  remarks: string;
  returnsDescription: string;
  examples: string[];
  exceptions: SdkException[];
}

interface RawParameter {
  Name?: string;
  Type?: string;
  Default?: string;
}

interface RawMethod {
  Name?: string;
  FullName?: string;
  DocId?: string;
  DeclaringType?: string;
  ReturnType?: string;
  Parameters?: RawParameter[];
  Documentation?: RawDocumentation;
  IsPublic?: boolean;
  IsProtected?: boolean;
  IsStatic?: boolean;
  IsVirtual?: boolean;
  IsSealed?: boolean;
  IsOverride?: boolean;
}

interface RawProperty {
  Name?: string;
  FullName?: string;
  DocId?: string;
  PropertyType?: string;
  Documentation?: RawDocumentation;
  IsPublic?: boolean;
  IsProtected?: boolean;
  IsStatic?: boolean;
  IsVirtual?: boolean;
  IsSealed?: boolean;
}

interface RawType {
  Name?: string;
  FullName?: string;
  Namespace?: string;
  Group?: string;
  Assembly?: string;
  DocId?: string;
  BaseType?: string;
  Documentation?: RawDocumentation;
  Constructors?: RawMethod[];
  Methods?: RawMethod[];
  Properties?: RawProperty[];
  IsPublic?: boolean;
  IsClass?: boolean;
  IsEnum?: boolean;
  IsValueType?: boolean;
  IsInterface?: boolean;
  IsAbstract?: boolean;
  IsStatic?: boolean;
  IsSealed?: boolean;
}

interface RawSdkDump {
  Types?: RawType[];
}

interface NamespaceStats {
  classes: number;
  enums: number;
  methods: number;
  properties: number;
}

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const sdkDocsRoot = path.join(projectRoot, "content", "sdk-generated");
const sdkDataRoot = path.join(projectRoot, "data", "sdk");
const entitiesRoot = path.join(sdkDataRoot, "entities");

function parseArgs(argv: string[]): CliOptions {
  const args = new Map<string, string | true>();

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const maybeValue = argv[index + 1];
    if (!maybeValue || maybeValue.startsWith("--")) {
      args.set(key, true);
      continue;
    }

    args.set(key, maybeValue);
    index += 1;
  }

  const input = args.get("input");
  if (typeof input !== "string") {
    throw new TypeError(
      "Missing --input. Example: bun run scripts/generate-sdk-docs.ts --input /path/to/sdk.json"
    );
  }

  const emitMdxArg = args.get("emit-mdx");

  return {
    clean: args.get("clean") !== "false",
    emitMdx: emitMdxArg === true || emitMdxArg === "true",
    includeNonPublic: args.get("include-non-public") === true,
    input,
  };
}

function quoteYaml(value: string): string {
  return JSON.stringify(value);
}

function safeSlug(value: string): string {
  const normalized = value
    .replaceAll(/[`'"<>()[\]{}]/gu, "-")
    .replaceAll(/[^A-Za-z0-9._-]+/gu, "-")
    .replaceAll(/-+/gu, "-")
    .replaceAll(/^[-.]+|[-.]+$/gu, "")
    .toLowerCase();

  return normalized.length > 0 ? normalized : "item";
}

function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 8);
}

function toNamespace(value?: string): string {
  if (!value || value.trim().length === 0) {
    return "global";
  }

  return value;
}

function toNamespaceSegments(namespaceName: string): string[] {
  return namespaceName.split(".").map((segment) => safeSlug(segment));
}

function withFallback(value: string | undefined, fallback: string): string {
  if (!value || value.trim().length === 0) {
    return fallback;
  }

  return value;
}

function stripCData(value: string): string {
  const match = /^<!\[CDATA\[([\s\S]*)\]\]>$/u.exec(value.trim());
  return match?.[1] ?? value;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ");
}

function cleanCrefValue(value: string): string {
  const withoutPrefix = value.replace(/^[A-Z]:/u, "");

  return withoutPrefix
    .replaceAll(/\{([^{}]+)\}/gu, "<$1>")
    .replaceAll(/`\d+/gu, "")
    .trim();
}

function cleanXmlText(value: string): string {
  return value
    .replaceAll(
      /<see cref="([^"]+)"\s*\/>/gu,
      (_, cref: string) => `\`${cleanCrefValue(cref)}\``
    )
    .replaceAll(/<paramref name="([^"]+)"\s*\/>/gu, "`$1`")
    .replaceAll(/<c>([\s\S]*?)<\/c>/gu, "`$1`")
    .replaceAll(/<code>([\s\S]*?)<\/code>/gu, "$1")
    .replaceAll(/<para>([\s\S]*?)<\/para>/gu, "$1")
    .replaceAll(/<[^>]+>/gu, "")
    .replaceAll("\r\n", "\n")
    .replaceAll(/[ \t]+\n/gu, "\n")
    .replaceAll(/\n[ \t]+/gu, "\n")
    .replaceAll(/\n{3,}/gu, "\n\n")
    .trim();
}

function sanitizeText(value?: string): string {
  if (!value) {
    return "";
  }

  return cleanXmlText(decodeHtmlEntities(stripCData(value)));
}

function sanitizeExamples(doc: RawDocumentation | undefined): string[] {
  const examples = doc?.Examples ?? [];

  return examples
    .map((example) => sanitizeText(example))
    .filter((example) => example.length > 0);
}

function sanitizeExceptions(doc: RawDocumentation | undefined): SdkException[] {
  const rawExceptions = doc?.Exceptions;
  if (!rawExceptions) {
    return [];
  }

  if (Array.isArray(rawExceptions)) {
    const exceptions: SdkException[] = [];

    for (const entry of rawExceptions) {
      const type = sanitizeText(entry.Cref ?? entry.Type ?? entry.Name);
      if (type.length === 0) {
        continue;
      }

      exceptions.push({
        description: sanitizeText(entry.Description ?? entry.Value),
        type: cleanCrefValue(type),
      });
    }

    return exceptions;
  }

  return Object.entries(rawExceptions)
    .map(([type, description]) => ({
      description: sanitizeText(description),
      type: cleanCrefValue(sanitizeText(type)),
    }))
    .filter((item) => item.type.length > 0);
}

function normalizeDocumentation(
  documentation: RawDocumentation | undefined
): NormalizedDocumentation {
  return {
    examples: sanitizeExamples(documentation),
    exceptions: sanitizeExceptions(documentation),
    remarks: sanitizeText(documentation?.Remarks),
    returnsDescription: sanitizeText(documentation?.Return),
    summary: sanitizeText(documentation?.Summary),
  };
}

function signatureFromDocId(docId: string, fallback: string): string {
  const match = /^[A-Z]:(.+)$/u.exec(docId);
  return match?.[1] ?? fallback;
}

function visibilityModifier(member: {
  IsPublic?: boolean;
  IsProtected?: boolean;
}): string {
  if (member.IsPublic) {
    return "public";
  }

  if (member.IsProtected) {
    return "protected";
  }

  return "internal";
}

function collectTypeModifiers(type: RawType): string[] {
  const modifiers = [visibilityModifier(type)];

  if (type.IsStatic) {
    modifiers.push("static");
  }
  if (type.IsAbstract) {
    modifiers.push("abstract");
  }
  if (type.IsSealed) {
    modifiers.push("sealed");
  }

  return modifiers;
}

function renderParameter(param: RawParameter): string {
  const paramName = withFallback(param.Name, "arg");
  const paramType = withFallback(param.Type, "object");
  const defaultPart = param.Default ? ` = ${param.Default}` : "";

  return `${paramType} ${paramName}${defaultPart}`;
}

function buildTypeDisplaySignature(type: RawType): string {
  const modifiers = collectTypeModifiers(type).join(" ");
  const kind = type.IsEnum
    ? "enum"
    : type.IsInterface
      ? "interface"
      : type.IsValueType
        ? "struct"
        : "class";
  const baseType = type.BaseType ? ` : ${type.BaseType}` : "";

  return `${modifiers} ${kind} ${withFallback(type.FullName, withFallback(type.Name, "Unknown"))}${baseType}`;
}

function buildMethodDisplaySignature(type: RawType, method: RawMethod): string {
  const methodName =
    method.Name === ".ctor"
      ? withFallback(type.Name, "Ctor")
      : withFallback(method.Name, "Method");
  const params = (method.Parameters ?? [])
    .map((param) => renderParameter(param))
    .join(", ");
  const modifiers: string[] = [visibilityModifier(method)];

  if (method.IsStatic) {
    modifiers.push("static");
  }
  if (method.IsVirtual) {
    modifiers.push("virtual");
  }
  if (method.IsOverride) {
    modifiers.push("override");
  }
  if (method.IsSealed) {
    modifiers.push("sealed");
  }

  if (method.Name === ".ctor") {
    return `${modifiers.join(" ")} ${methodName}(${params})`;
  }

  return `${modifiers.join(" ")} ${withFallback(method.ReturnType, "void")} ${methodName}(${params})`;
}

function buildPropertyDisplaySignature(property: RawProperty): string {
  const modifiers: string[] = [visibilityModifier(property)];

  if (property.IsStatic) {
    modifiers.push("static");
  }
  if (property.IsVirtual) {
    modifiers.push("virtual");
  }
  if (property.IsSealed) {
    modifiers.push("sealed");
  }

  return `${modifiers.join(" ")} ${withFallback(property.PropertyType, "object")} ${withFallback(property.FullName, withFallback(property.Name, "Property"))} { get; set; }`;
}

function ensureDocId(
  prefix: string,
  fallback: string,
  maybeDocId?: string
): string {
  return maybeDocId && maybeDocId.trim().length > 0
    ? maybeDocId
    : `${prefix}:${fallback}`;
}

function buildDescription(doc: NormalizedDocumentation): string {
  const { summary } = doc;
  const { remarks } = doc;

  if (summary.length > 0 && remarks.length > 0) {
    return `${summary}\n\n${remarks}`;
  }

  return summary.length > 0 ? summary : remarks;
}

function descriptionForFrontmatter(value: string): string {
  return value.length > 180 ? `${value.slice(0, 177)}...` : value;
}

function getTypeEntityKind(type: RawType): "class" | "enum" {
  return type.IsEnum ? "enum" : "class";
}

function buildEntityId(docId: string): string {
  return docId;
}

function buildMeiliId(entityId: string, sequence: number): string {
  return `sdk_${sequence}_${shortHash(entityId)}`;
}

function toDocUrl(filePath: string): { pathValue: string; url: string } {
  const relativeToSdkRoot = path
    .relative(sdkDocsRoot, filePath)
    .replaceAll("\\", "/");
  const pathWithoutExtension = relativeToSdkRoot
    .replace(/\/index\.mdx$/u, "")
    .replace(/\.mdx$/u, "");

  return {
    pathValue: `sdk/${relativeToSdkRoot}`,
    url: `/docs/sdk/${pathWithoutExtension}`,
  };
}

function inlineCode(value: string): string {
  const maxTickRun = Math.max(
    1,
    ...[...value.matchAll(/`+/gu)].map((match) => match[0].length)
  );
  const fence = "`".repeat(maxTickRun + 1);
  return `${fence}${value}${fence}`;
}

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll(/\n+/gu, " ").trim();
}

function renderParameterSection(parameters: SdkParameter[]): string {
  if (parameters.length === 0) {
    return "";
  }

  const rows = parameters
    .map((param) => {
      const details: string[] = [];
      const description = param.description?.trim() ?? "";
      if (description.length > 0) {
        details.push(description);
      }
      if (param.defaultValue) {
        details.push(`Default: ${param.defaultValue}.`);
      }
      const detailsValue = details.join(" ");

      return `| ${inlineCode(param.name)} | ${inlineCode(param.type)} | ${escapeTableCell(detailsValue)} |`;
    })
    .join("\n");

  return `| Name | Type | Description |
| --- | --- | --- |
${rows}`;
}

function renderReturnSection(entity: SdkEntity): string {
  const hasReturnType = (entity.returnType ?? "").length > 0;
  const hasDescription = entity.returnsDescription.length > 0;

  if (!hasReturnType && !hasDescription) {
    return "";
  }

  const returnType = entity.returnType ?? "";
  const description = entity.returnsDescription;

  if (hasReturnType && hasDescription) {
    return `| Type | Description |
| --- | --- |
| ${inlineCode(returnType)} | ${escapeTableCell(description)} |`;
  }

  if (hasReturnType) {
    return `| Type |
| --- |
| ${inlineCode(returnType)} |`;
  }

  return `| Description |
| --- |
| ${escapeTableCell(description)} |`;
}

function renderExceptionsSection(exceptions: SdkException[]): string {
  if (exceptions.length === 0) {
    return "";
  }

  const rows = exceptions
    .map((item) => {
      const condition = item.description?.trim() ?? "";

      return `| ${inlineCode(item.type)} | ${escapeTableCell(condition)} |`;
    })
    .join("\n");

  return `| Exception | Condition |
| --- | --- |
${rows}`;
}

function renderExamplesSection(examples: string[]): string {
  if (examples.length === 0) {
    return "";
  }

  if (examples.length === 1) {
    return `\`\`\`csharp\n${examples[0]}\n\`\`\``;
  }

  const labels = examples.map((_, index) => {
    if (index === 0) {
      return "Basic Example";
    }

    if (index === 1) {
      return "Advanced Example";
    }

    return `Example ${index + 1}`;
  });

  const tabs = examples
    .map(
      (example, index) => `<Tab value=${quoteYaml(labels[index])}>

\`\`\`csharp
${example}
\`\`\`

</Tab>`
    )
    .join("\n\n");

  const items = labels.map((label) => quoteYaml(label)).join(", ");

  return `<Tabs items={[${items}]}>

${tabs}

</Tabs>`;
}

function renderRemarksSection(entity: SdkEntity): string {
  if (entity.remarks.length === 0) {
    return "";
  }

  const isWarning = /\b(warning|obsolete|deprecated|breaking)\b/iu.test(
    entity.remarks
  );
  const title = isWarning ? "Warning" : "Note";
  const type = isWarning ? "warning" : "info";

  return `<Callout type=${quoteYaml(type)} title=${quoteYaml(title)}>
${entity.remarks}
</Callout>`;
}

function renderMdxPage(entity: SdkEntity): string {
  const summary =
    entity.summary.length > 0 ? entity.summary : entity.description;
  const remarksSection = renderRemarksSection(entity);
  const parametersSection = renderParameterSection(entity.parameters);
  const returnsSection = renderReturnSection(entity);
  const exceptionsSection = renderExceptionsSection(entity.exceptions);
  const examplesSection = renderExamplesSection(entity.examples);

  const sections: string[] = [];

  if (summary.length > 0) {
    sections.push(`## Summary

${summary}`);
  }

  if (remarksSection.length > 0) {
    sections.push(remarksSection);
  }

  sections.push(`## Signature

\`\`\`csharp
${entity.displaySignature}
\`\`\``);

  if (parametersSection.length > 0) {
    sections.push(`## Parameters

${parametersSection}`);
  }

  if (returnsSection.length > 0) {
    sections.push(`## Returns

${returnsSection}`);
  }

  if (exceptionsSection.length > 0) {
    sections.push(`## Exceptions

${exceptionsSection}`);
  }

  if (examplesSection.length > 0) {
    sections.push(`## Example

${examplesSection}`);
  }

  sections.push(`## Metadata

| Field | Value |
| --- | --- |
| Name | ${inlineCode(entity.name)} |
| Kind | ${inlineCode(entity.entityKind)} |
| Namespace | ${inlineCode(entity.namespace)} |
| Type | ${inlineCode(entity.class)} |
| Assembly | ${inlineCode(entity.assembly)} |
| Source Signature | ${inlineCode(entity.signature)} |
| Doc ID | ${inlineCode(entity.docId)} |`);

  return `---
title: ${quoteYaml(entity.name)}
description: ${quoteYaml(descriptionForFrontmatter(entity.description || summary))}
---

${sections.join("\n\n")}
`;
}

async function writeTextFile(target: string, content: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function loadJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const rawContent = await readFile(options.input, "utf8");
  const rawDump = JSON.parse(rawContent) as RawSdkDump;
  const rawTypes = rawDump.Types ?? [];

  if (rawTypes.length === 0) {
    throw new Error("The input JSON does not contain any types");
  }

  const versionRoot = sdkDocsRoot;

  if (options.clean && options.emitMdx) {
    await rm(versionRoot, { force: true, recursive: true });
  }

  if (options.emitMdx) {
    await mkdir(versionRoot, { recursive: true });
  }
  await mkdir(entitiesRoot, { recursive: true });

  const namespaceStats = new Map<string, NamespaceStats>();
  const entities: SdkEntity[] = [];
  let entitySequence = 0;

  const types = rawTypes
    .filter((type) => options.includeNonPublic || type.IsPublic !== false)
    .toSorted((a, b) =>
      withFallback(a.FullName, "").localeCompare(withFallback(b.FullName, ""))
    );

  const now = new Date().toISOString();

  for (const rawType of types) {
    const typeFullName = withFallback(
      rawType.FullName,
      withFallback(rawType.Name, "UnknownType")
    );
    const typeName = withFallback(
      rawType.Name,
      typeFullName.split(".").at(-1) ?? typeFullName
    );
    const namespaceName = toNamespace(rawType.Namespace);
    const namespacePath = path.join(...toNamespaceSegments(namespaceName));

    if (!namespaceStats.has(namespaceName)) {
      namespaceStats.set(namespaceName, {
        classes: 0,
        enums: 0,
        methods: 0,
        properties: 0,
      });
    }

    const namespaceBucket = namespaceStats.get(namespaceName);
    if (!namespaceBucket) {
      continue;
    }

    const typeDocId = ensureDocId("T", typeFullName, rawType.DocId);
    const typeSlug = `${safeSlug(typeName)}-${shortHash(typeFullName)}`;
    const typeKind = getTypeEntityKind(rawType);
    const typeFolder = typeKind === "enum" ? "enums" : "types";
    const typePagePath = path.join(
      versionRoot,
      namespacePath,
      typeFolder,
      typeSlug,
      "index.mdx"
    );

    const typeDocs = normalizeDocumentation(rawType.Documentation);
    const typeDescription = buildDescription(typeDocs);
    const typeEntityId = buildEntityId(typeDocId);
    entitySequence += 1;
    const typeEntity: SdkEntity = {
      anchor: "type-overview",
      assembly: withFallback(rawType.Assembly, "Unknown Assembly"),
      canonicalUrl: "",
      class: typeFullName,
      description: typeDescription,
      displaySignature: buildTypeDisplaySignature(rawType),
      docId: typeDocId,
      entityKind: rawType.IsEnum
        ? "enum"
        : rawType.IsInterface
          ? "interface"
          : rawType.IsValueType
            ? "struct"
            : "class",
      examples: typeDocs.examples,
      exceptions: typeDocs.exceptions,
      id: typeEntityId,
      meiliId: buildMeiliId(typeEntityId, entitySequence),
      name: typeName,
      namespace: namespaceName,
      parameters: [],
      path: "",
      remarks: typeDocs.remarks,
      returnType: null,
      returnsDescription: typeDocs.returnsDescription,
      signature: signatureFromDocId(typeDocId, typeFullName),
      sourceSignature: typeDocId,
      summary: typeDocs.summary,
      type: typeKind,
      url: "",
    };

    const typeDocLocation = toDocUrl(typePagePath);
    typeEntity.path = typeDocLocation.pathValue;
    typeEntity.url = typeDocLocation.url;
    typeEntity.canonicalUrl = typeDocLocation.url;

    if (options.emitMdx) {
      await writeTextFile(typePagePath, renderMdxPage(typeEntity));
    }
    entities.push(typeEntity);

    if (typeEntity.type === "enum") {
      namespaceBucket.enums += 1;
    } else {
      namespaceBucket.classes += 1;
    }

    const constructors = (rawType.Constructors ?? []).filter(
      (method) => options.includeNonPublic || method.IsPublic !== false
    );
    const methods = (rawType.Methods ?? []).filter(
      (method) => options.includeNonPublic || method.IsPublic !== false
    );

    for (const method of [...constructors, ...methods]) {
      const methodName = withFallback(method.Name, "Method");
      const fallbackMethodDoc = `${typeFullName}.${methodName}`;
      const methodDocId = ensureDocId("M", fallbackMethodDoc, method.DocId);
      const methodSlug = `${safeSlug(methodName === ".ctor" ? `${typeName}-ctor` : methodName)}-${shortHash(methodDocId)}`;
      const methodPath = path.join(
        versionRoot,
        namespacePath,
        typeFolder,
        typeSlug,
        "methods",
        `${methodSlug}.mdx`
      );

      const methodDocs = normalizeDocumentation(method.Documentation);
      const methodParameters = (method.Parameters ?? []).map((param) => ({
        defaultValue: param.Default,
        description: sanitizeText(
          method.Documentation?.Params?.[withFallback(param.Name, "arg")]
        ),
        name: withFallback(param.Name, "arg"),
        type: withFallback(param.Type, "object"),
      }));

      const methodDescription = buildDescription(methodDocs);
      const methodEntityId = buildEntityId(methodDocId);
      entitySequence += 1;
      const methodEntity: SdkEntity = {
        anchor: "",
        assembly: withFallback(rawType.Assembly, "Unknown Assembly"),
        canonicalUrl: typeEntity.url,
        class: typeFullName,
        description: methodDescription,
        displaySignature: buildMethodDisplaySignature(rawType, method),
        docId: methodDocId,
        entityKind: methodName === ".ctor" ? "constructor" : "method",
        examples: methodDocs.examples,
        exceptions: methodDocs.exceptions,
        id: methodEntityId,
        meiliId: buildMeiliId(methodEntityId, entitySequence),
        name: methodName === ".ctor" ? `${typeName}.ctor` : methodName,
        namespace: namespaceName,
        parameters: methodParameters,
        path: "",
        remarks: methodDocs.remarks,
        returnType:
          methodName === ".ctor"
            ? null
            : withFallback(method.ReturnType, "void"),
        returnsDescription: methodDocs.returnsDescription,
        signature: signatureFromDocId(methodDocId, fallbackMethodDoc),
        sourceSignature: methodDocId,
        summary: methodDocs.summary,
        type: "method",
        url: "",
      };

      const methodDocLocation = toDocUrl(methodPath);
      methodEntity.path = methodDocLocation.pathValue;
      methodEntity.url = methodDocLocation.url;
      methodEntity.anchor = buildSdkEntityAnchor(methodEntity);

      if (options.emitMdx) {
        await writeTextFile(methodPath, renderMdxPage(methodEntity));
      }
      entities.push(methodEntity);
      namespaceBucket.methods += 1;
    }

    const properties = (rawType.Properties ?? []).filter(
      (property) => options.includeNonPublic || property.IsPublic !== false
    );

    for (const property of properties) {
      const propertyName = withFallback(property.Name, "Property");
      const propertyDocs = normalizeDocumentation(property.Documentation);
      const fallbackPropertyDoc = `${typeFullName}.${propertyName}`;
      const propertyDocId = ensureDocId(
        "P",
        fallbackPropertyDoc,
        property.DocId
      );
      const propertySlug = `${safeSlug(propertyName)}-${shortHash(propertyDocId)}`;
      const propertyPath = path.join(
        versionRoot,
        namespacePath,
        typeFolder,
        typeSlug,
        "properties",
        `${propertySlug}.mdx`
      );

      const propertyEntityId = buildEntityId(propertyDocId);
      entitySequence += 1;
      const propertyEntity: SdkEntity = {
        anchor: "",
        assembly: withFallback(rawType.Assembly, "Unknown Assembly"),
        canonicalUrl: typeEntity.url,
        class: typeFullName,
        description: buildDescription(propertyDocs),
        displaySignature: buildPropertyDisplaySignature(property),
        docId: propertyDocId,
        entityKind: "property",
        examples: propertyDocs.examples,
        exceptions: propertyDocs.exceptions,
        id: propertyEntityId,
        meiliId: buildMeiliId(propertyEntityId, entitySequence),
        name: propertyName,
        namespace: namespaceName,
        parameters: [],
        path: "",
        remarks: propertyDocs.remarks,
        returnType: withFallback(property.PropertyType, "object"),
        returnsDescription: propertyDocs.returnsDescription,
        signature: signatureFromDocId(propertyDocId, fallbackPropertyDoc),
        sourceSignature: propertyDocId,
        summary: propertyDocs.summary,
        type: "property",
        url: "",
      };

      const propertyDocLocation = toDocUrl(propertyPath);
      propertyEntity.path = propertyDocLocation.pathValue;
      propertyEntity.url = propertyDocLocation.url;
      propertyEntity.anchor = buildSdkEntityAnchor(propertyEntity);

      if (options.emitMdx) {
        await writeTextFile(propertyPath, renderMdxPage(propertyEntity));
      }
      entities.push(propertyEntity);
      namespaceBucket.properties += 1;
    }
  }

  const namespaceItems = [...namespaceStats.entries()].toSorted((a, b) =>
    a[0].localeCompare(b[0])
  );

  if (options.emitMdx) {
    for (const [namespaceName, counts] of namespaceItems) {
      const namespacePath = path.join(...toNamespaceSegments(namespaceName));
      const namespaceRoot = path.join(versionRoot, namespacePath);

      await writeTextFile(
        path.join(namespaceRoot, "index.mdx"),
        `---
title: ${quoteYaml(namespaceName)}
description: ${quoteYaml(`SDK namespace ${namespaceName}`)}
---

## Namespace Summary

- **Namespace:** \`${namespaceName}\`
- **Classes/Structs/Interfaces:** ${counts.classes}
- **Enums:** ${counts.enums}
- **Methods:** ${counts.methods}
- **Properties:** ${counts.properties}
`
      );

      await writeTextFile(
        path.join(namespaceRoot, "meta.json"),
        JSON.stringify(
          {
            title: namespaceName,
          },
          null,
          2
        )
      );
    }
  }

  const versionStats = {
    classes: entities.filter((entity) => entity.type === "class").length,
    enums: entities.filter((entity) => entity.type === "enum").length,
    methods: entities.filter((entity) => entity.type === "method").length,
    properties: entities.filter((entity) => entity.type === "property").length,
  };

  if (options.emitMdx) {
    await writeTextFile(
      path.join(versionRoot, "index.mdx"),
      `---
title: "SDK"
description: "Generated SDK docs from latest imported JSON."
---

## SDK Summary

- **Generated:** \`${now}\`
- **Classes/Structs/Interfaces:** ${versionStats.classes}
- **Enums:** ${versionStats.enums}
- **Methods (including constructors):** ${versionStats.methods}
- **Properties:** ${versionStats.properties}
- **Total indexed entities:** ${entities.length}
`
    );

    await writeTextFile(
      path.join(versionRoot, "meta.json"),
      JSON.stringify(
        {
          title: "SDK",
        },
        null,
        2
      )
    );
  }

  await writeTextFile(
    path.join(entitiesRoot, "latest.json"),
    JSON.stringify(entities, null, 2)
  );

  if (options.emitMdx) {
    const sdkMetaPath = path.join(sdkDocsRoot, "meta.json");
    const existingSdkMeta =
      (await loadJsonFile<Record<string, unknown>>(sdkMetaPath)) ?? {};
    if (!("title" in existingSdkMeta)) {
      await writeTextFile(
        sdkMetaPath,
        JSON.stringify(
          {
            title: "SDK",
          },
          null,
          2
        )
      );
    }

    const rootStat = await stat(path.join(sdkDocsRoot, "index.mdx")).catch(
      () => null
    );
    if (!rootStat) {
      await writeTextFile(
        path.join(sdkDocsRoot, "index.mdx"),
        `---
title: SDK Search Platform
description: Generated SDK documentation and AI search routes
---

SDK MDX files are generated for offline/reference output under content/sdk-generated.
`
      );
    }
  }

  process.stdout.write(
    `${JSON.stringify({
      emitMdx: options.emitMdx,
      entities: entities.length,
      indexedOutput: path.join(entitiesRoot, "latest.json"),
      namespaces: namespaceItems.length,
      output: versionRoot,
    })}\n`
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`SDK generation failed: ${message}\n`);
  process.exit(1);
});
