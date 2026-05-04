import type { InferPageType } from "fumadocs-core/source";

import { getPublicAppOrigin } from "@/app/api/utils/public-origin";
import { loadApiEntities } from "@/features/api/utils/data";
import { buildApiEntityAnchor } from "@/features/api/utils/reference";
import type { ApiEntity } from "@/features/api/utils/schemas";

import { getLLMText, source } from "./source";

const siteTitle = "s&box Documentation";
const siteSummary =
  "Enhanced s&box documentation with setup guides, generated C# API reference pages, and LLM-friendly markdown mirrors for agents that cannot use MCP.";
const apiIndexDescription =
  "Generated C# API reference index with counts and links to LLM-readable type pages.";
const docsBasePath = "/llms.mdx";

type DocsPage = InferPageType<typeof source>;

const isTypeEntity = (entity: ApiEntity): boolean =>
  entity.type === "class" || entity.type === "enum";

const sanitizeMarkdownText = (value: string): string =>
  value.replaceAll(/\s+/gu, " ").trim();

const sanitizeLinkTitle = (value: string): string =>
  sanitizeMarkdownText(value).replaceAll("[", "\\[").replaceAll("]", "\\]");

const absoluteUrl = (origin: string, path: string): string =>
  new URL(path, origin).toString();

const resolveDescription = (entity: ApiEntity): string =>
  sanitizeMarkdownText(
    entity.summary || entity.description || entity.displaySignature
  );

const compareApiEntities = (left: ApiEntity, right: ApiEntity): number => {
  const namespaceCompare = left.namespace.localeCompare(right.namespace);
  if (namespaceCompare === 0) {
    return left.name.localeCompare(right.name);
  }

  return namespaceCompare;
};

const compareMembers = (left: ApiEntity, right: ApiEntity): number => {
  const kindCompare = left.entityKind.localeCompare(right.entityKind);
  if (kindCompare === 0) {
    const nameCompare = left.name.localeCompare(right.name);
    if (nameCompare === 0) {
      return left.displaySignature.localeCompare(right.displaySignature);
    }

    return nameCompare;
  }

  return kindCompare;
};

const getDocsMarkdownUrl = (page: DocsPage): string =>
  `${docsBasePath}${page.url}`;

const getApiMarkdownUrl = (entity: ApiEntity): string =>
  `${docsBasePath}${entity.canonicalUrl || entity.url}`;

export const getGuideLLMText = (page: DocsPage): Promise<string> =>
  getLLMText(page);

export const getApiIndexLLMText = async (): Promise<string> => {
  const entities = await loadApiEntities();
  const types = entities.filter(isTypeEntity);
  const methods = entities.filter((entity) => entity.type === "method");
  const properties = entities.filter((entity) => entity.type === "property");

  return `# API Reference

${apiIndexDescription}

## Coverage

- Types: ${types.length}
- Methods and constructors: ${methods.length}
- Properties: ${properties.length}
- Total entities: ${entities.length}

## Type Pages

${types
  .toSorted(compareApiEntities)
  .map(
    (entity) =>
      `- [${sanitizeLinkTitle(entity.class)}](${getApiMarkdownUrl(entity)}): ${resolveDescription(entity)}`
  )
  .join("\n")}`;
};

const findTypeEntity = (
  entities: ApiEntity[],
  selectedEntity: ApiEntity
): ApiEntity | undefined => {
  if (isTypeEntity(selectedEntity)) {
    return selectedEntity;
  }

  return entities.find(
    (entity) =>
      isTypeEntity(entity) &&
      entity.namespace === selectedEntity.namespace &&
      entity.class === selectedEntity.class
  );
};

const getTypeMembers = (
  entities: ApiEntity[],
  typeEntity: ApiEntity
): ApiEntity[] =>
  entities
    .filter(
      (entity) =>
        entity.id !== typeEntity.id &&
        entity.namespace === typeEntity.namespace &&
        entity.class === typeEntity.class
    )
    .toSorted(compareMembers);

const getMemberLLMText = (member: ApiEntity, typeEntity: ApiEntity): string => {
  const description = resolveDescription(member);
  const anchor = buildApiEntityAnchor(member);

  return `### ${member.displaySignature}

Kind: ${member.entityKind}

Anchor: ${typeEntity.canonicalUrl || typeEntity.url}#${anchor}

\`\`\`csharp
${member.displaySignature}
\`\`\`

${description}`;
};

export const getApiEntityLLMText = async (
  selectedEntity: ApiEntity
): Promise<string> => {
  const entities = await loadApiEntities();
  const typeEntity = findTypeEntity(entities, selectedEntity);

  if (!typeEntity) {
    return `# ${selectedEntity.name}

\`\`\`csharp
${selectedEntity.displaySignature}
\`\`\`

${resolveDescription(selectedEntity)}`;
  }

  const members = getTypeMembers(entities, typeEntity);
  const summary = resolveDescription(typeEntity);
  const remarks = sanitizeMarkdownText(typeEntity.remarks);

  return `# ${typeEntity.class}

${summary}

\`\`\`csharp
${typeEntity.displaySignature}
\`\`\`

${remarks.length > 0 ? `## Remarks\n\n${remarks}\n\n` : ""}## Members

${members.map((member) => getMemberLLMText(member, typeEntity)).join("\n\n")}`;
};

export const getLLMSIndex = async (request: Request): Promise<string> => {
  const origin = getPublicAppOrigin(request);
  const docsPages = source.getPages();
  const entities = await loadApiEntities();
  const typeEntities = entities
    .filter(isTypeEntity)
    .toSorted(compareApiEntities);

  return `# ${siteTitle}

> ${siteSummary}

Use this file as the entry point for agents that can fetch web resources but do not support MCP. Prefer the markdown URLs under \`${docsBasePath}\` over the rendered HTML pages because they omit navigation chrome and preserve documentation content in a compact form.

When you need the entire documentation corpus in one request, use \`/llms-full.txt\`. When context is limited, start with the guide pages and fetch only the API type pages that match the task.

## Guides

${docsPages
  .map(
    (page) =>
      `- [${sanitizeLinkTitle(page.data.title)}](${absoluteUrl(origin, getDocsMarkdownUrl(page))}): ${sanitizeMarkdownText(page.data.description ?? "")}`
  )
  .join("\n")}

## API Reference

- [API Reference Index](${absoluteUrl(origin, `${docsBasePath}/docs/api`)}): ${apiIndexDescription}
${typeEntities
  .map(
    (entity) =>
      `- [${sanitizeLinkTitle(entity.class)}](${absoluteUrl(origin, getApiMarkdownUrl(entity))}): ${resolveDescription(entity)}`
  )
  .join("\n")}

## Optional

- [Full LLM Context](${absoluteUrl(origin, "/llms-full.txt")}): Complete guide and API markdown in a single text response for agents with large context windows.
- [MCP Setup](${absoluteUrl(origin, "/docs/mcp")}): Structured tool-based access for agents that support Model Context Protocol.`;
};

export const getFullLLMText = async (): Promise<string> => {
  const docsPages = await Promise.all(source.getPages().map(getGuideLLMText));
  const entities = await loadApiEntities();
  const apiPages = await Promise.all(
    entities
      .filter(isTypeEntity)
      .toSorted(compareApiEntities)
      .map(getApiEntityLLMText)
  );

  return [...docsPages, await getApiIndexLLMText(), ...apiPages].join("\n\n");
};
