import type { TOCItemType } from "fumadocs-core/toc";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Callout } from "fumadocs-ui/components/callout";
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page";
import { ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MemberSectionSearch } from "@/features/api/components/member-section-search";
import { SignatureAnchorButton } from "@/features/api/components/signature-anchor-button";
import { SignatureText } from "@/features/api/components/signature-text";
import { TreeSitterCodeBlock } from "@/features/code/components/tree-sitter-code-block";
import {
  getEntitiesByClass,
  getEntityByUrl,
  getTypeEntityByClass,
  loadApiEntities,
} from "@/features/api/utils/data";
import {
  buildApiEntityAnchor,
  safeAnchorSegment,
} from "@/features/api/utils/reference";
import type {
  ApiEntity,
  ApiExample,
  ApiException,
  ApiParameter,
} from "@/features/api/utils/schemas";
import type { SignatureToken } from "@/features/api/utils/signature-tokens";
import { DocsPageHeader } from "@/features/docs/components/docs-page-header";

interface ApiEntityPageProps {
  params: Promise<{
    slug: string[];
  }>;
}

interface SummaryParts {
  summary: string;
  remarks: string;
}

interface TypeLinkLookup {
  byFullName: Map<string, ApiEntity>;
  bySimpleName: Map<string, ApiEntity | null>;
}

type SectionFilterKey = "constructors" | "methods" | "properties";

interface MemberGroup {
  anchor: string;
  key: string;
  label: string;
  members: ApiEntity[];
}

const SYSTEM_TYPE_ALIASES: Record<string, string> = {
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

const WARNING_HINT = /\b(warning|obsolete|deprecated|breaking)\b/iu;
const PERFORMANCE_HINT =
  /\b(performance|allocation|allocates|expensive|slow|cache)\b/iu;
const TYPE_TOKEN = /[A-Za-z_][A-Za-z0-9_.`]*/gu;
function buildUrl(slug: string[]): string {
  return `/docs/api/${slug.join("/")}`;
}

function buildEntityAnchor(entity: ApiEntity): string {
  return buildApiEntityAnchor(entity);
}

function splitSummary(entity: ApiEntity): SummaryParts {
  if (entity.summary.length > 0 || entity.remarks.length > 0) {
    return {
      remarks: entity.remarks,
      summary: entity.summary || entity.description,
    };
  }

  if (entity.description.length === 0) {
    return {
      remarks: "",
      summary: "",
    };
  }

  const chunks = entity.description
    .split(/\n{2,}/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (chunks.length <= 1) {
    return {
      remarks: "",
      summary: entity.description,
    };
  }

  return {
    remarks: chunks.slice(1).join("\n\n"),
    summary: chunks[0],
  };
}

function resolveObsoleteMessage(
  obsoleteMessage: string,
  fallback: string
): string {
  const trimmed = obsoleteMessage.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }

  return fallback;
}

function compareEntities(left: ApiEntity, right: ApiEntity): number {
  const nameCompare = left.name.localeCompare(right.name);
  if (nameCompare !== 0) {
    return nameCompare;
  }

  return left.signature.localeCompare(right.signature);
}

function groupOverloads(
  members: ApiEntity[],
  typeEntity: ApiEntity
): MemberGroup[] {
  const grouped = new Map<string, ApiEntity[]>();

  for (const member of members.toSorted(compareEntities)) {
    const key = member.entityKind === "constructor" ? ".ctor" : member.name;
    const bucket = grouped.get(key) ?? [];
    bucket.push(member);
    grouped.set(key, bucket);
  }

  return [...grouped.entries()]
    .map(([key, groupedMembers]) => {
      const label =
        key === ".ctor"
          ? `${typeEntity.name} constructors`
          : `${key} overloads`;

      return {
        anchor: `${safeAnchorSegment(key)}-overloads-${buildEntityAnchor(typeEntity).slice(-4)}`,
        key,
        label,
        members: groupedMembers,
      };
    })
    .toSorted((left, right) => left.key.localeCompare(right.key));
}

function countMembers(groups: MemberGroup[]): number {
  let count = 0;

  for (const group of groups) {
    count += group.members.length;
  }

  return count;
}

function buildMemberSearchText(entity: ApiEntity): string {
  return [
    entity.name,
    entity.displaySignature,
    entity.signature,
    entity.summary,
    entity.description,
    entity.remarks,
    entity.returnsDescription,
    ...entity.parameters.map(
      (parameter) =>
        `${parameter.name} ${parameter.type} ${parameter.description ?? ""} ${parameter.defaultValue ?? ""}`
    ),
    ...entity.exceptions.map(
      (exception) => `${exception.type} ${exception.description ?? ""}`
    ),
  ]
    .join(" ")
    .toLocaleLowerCase();
}

function buildTypeLookup(entities: ApiEntity[]): TypeLinkLookup {
  const byFullName = new Map<string, ApiEntity>();
  const bySimpleName = new Map<string, ApiEntity | null>();

  for (const entity of entities) {
    if (entity.type !== "class" && entity.type !== "enum") {
      continue;
    }

    byFullName.set(entity.class, entity);

    const existing = bySimpleName.get(entity.name);
    if (!existing) {
      bySimpleName.set(entity.name, entity);
      continue;
    }

    if (existing.id !== entity.id) {
      bySimpleName.set(entity.name, null);
    }
  }

  return {
    byFullName,
    bySimpleName,
  };
}

function resolveTypeEntity(
  token: string,
  lookup: TypeLinkLookup
): ApiEntity | null {
  const withoutArity = token.replace(/`\d+$/u, "");

  const full = lookup.byFullName.get(withoutArity);
  if (full) {
    return full;
  }

  const simpleName = withoutArity.split(".").at(-1) ?? withoutArity;
  const simple = lookup.bySimpleName.get(simpleName);
  return simple ?? null;
}

function simplifyTypeToken(token: string): string {
  const withoutArity = token.replace(/`\d+$/u, "");
  const alias = SYSTEM_TYPE_ALIASES[withoutArity];

  if (alias) {
    return alias;
  }

  if (withoutArity.includes(".")) {
    return withoutArity.split(".").at(-1) ?? withoutArity;
  }

  return withoutArity;
}

function resolveSignatureTokenHref(
  token: SignatureToken,
  lookup: TypeLinkLookup
): string | null {
  if (
    token.kind !== "generic" &&
    token.kind !== "member" &&
    token.kind !== "type"
  ) {
    return null;
  }

  const target = resolveTypeEntity(token.value, lookup);
  return target?.url ?? null;
}

function TypeExpression({
  lookup,
  value,
}: {
  lookup: TypeLinkLookup;
  value: string;
}) {
  const chunks: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(TYPE_TOKEN)) {
    const token = match[0];
    const matchOffset = match.index ?? 0;

    if (matchOffset > lastIndex) {
      chunks.push(value.slice(lastIndex, matchOffset));
    }

    const target = resolveTypeEntity(token, lookup);
    const displayValue = simplifyTypeToken(token);

    if (target) {
      chunks.push(
        <Link
          className="text-primary underline underline-offset-2"
          href={target.url}
          key={`${token}-${matchOffset}`}
          prefetch={false}
          title={target.class}
        >
          {displayValue}
        </Link>
      );
    } else {
      chunks.push(
        <span
          key={`${token}-${matchOffset}`}
          title={token.includes(".") ? token : undefined}
        >
          {displayValue}
        </span>
      );
    }

    lastIndex = matchOffset + token.length;
  }

  if (lastIndex < value.length) {
    chunks.push(value.slice(lastIndex));
  }

  return <code className="text-sm whitespace-nowrap">{chunks}</code>;
}

function AdvisoryCallout({ remarks }: { remarks: string }) {
  if (remarks.length === 0) {
    return null;
  }

  const isWarning = WARNING_HINT.test(remarks);
  const isPerformance = PERFORMANCE_HINT.test(remarks);
  const title = isWarning ? "Warning" : isPerformance ? "Performance" : "Note";

  return (
    <Callout title={title} type={isWarning ? "warning" : "info"}>
      <p>{remarks}</p>
    </Callout>
  );
}

function ParameterNotes({ parameters }: { parameters: ApiParameter[] }) {
  if (parameters.length === 0) {
    return null;
  }

  const entries = parameters
    .map((parameter) => {
      const details = parameter.description?.trim();
      const detailsParts: string[] = [];

      if (details && details.length > 0) {
        detailsParts.push(details);
      }

      if (parameter.defaultValue) {
        detailsParts.push(`Default: ${parameter.defaultValue}`);
      }

      if (detailsParts.length === 0) {
        return null;
      }

      return {
        details: detailsParts.join(" "),
        key: `${parameter.name}-${parameter.type}`,
        name: parameter.name,
      };
    })
    .filter((entry) => entry !== null);

  if (entries.length === 0) {
    return null;
  }

  return (
    <ul className="grid list-disc gap-1 pl-5 text-sm leading-relaxed">
      {entries.map((entry) => (
        <li key={entry.key}>
          <code>{entry.name}</code>
          <span>{`: ${entry.details}`}</span>
        </li>
      ))}
    </ul>
  );
}

function ReturnsNotes({ description }: { description: string }) {
  const details = description.trim();
  if (details.length === 0) {
    return null;
  }

  return <p className="text-sm leading-relaxed">{details}</p>;
}

function ExceptionsTable({
  exceptions,
  lookup,
}: {
  exceptions: ApiException[];
  lookup: TypeLinkLookup;
}) {
  if (exceptions.length === 0) {
    return null;
  }

  return (
    <Table className="mt-2 border-y">
      <TableHeader>
        <TableRow>
          <TableHead>Exception</TableHead>
          <TableHead>Condition</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {exceptions.map((exception) => (
          <TableRow key={`${exception.type}-${exception.description ?? ""}`}>
            <TableCell>
              <TypeExpression lookup={lookup} value={exception.type} />
            </TableCell>
            <TableCell>{exception.description?.trim() ?? ""}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function buildExampleTitles(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`);
}

function formatExampleLineRange(example: ApiExample): string | null {
  if (
    example.lineStart &&
    example.lineEnd &&
    example.lineStart !== example.lineEnd
  ) {
    return `Lines ${example.lineStart}-${example.lineEnd}`;
  }

  if (example.lineStart) {
    return `Line ${example.lineStart}`;
  }

  return null;
}

function buildSourceExampleAccordionTitle(
  example: ApiExample,
  index: number
): ReactNode {
  const filePath = example.filePath?.trim();
  const repositoryName = example.repositoryName?.trim();
  const title =
    filePath && filePath.length > 0 ? filePath : `Implementation ${index + 1}`;

  return (
    <span className="grid gap-0.5">
      <span className="text-sm leading-6 font-semibold">{title}</span>
      {repositoryName ? (
        <span className="text-muted-foreground text-xs leading-5">
          {repositoryName}
        </span>
      ) : null}
    </span>
  );
}

function SourceExampleLink({ example }: { example: ApiExample }) {
  const href = example.fileUrl ?? example.repositoryUrl;

  if (!href) {
    return null;
  }

  return (
    <p className="m-0 flex items-center text-xs leading-6">
      <a
        className="inline-flex items-center gap-1.5 text-muted-foreground underline underline-offset-2"
        href={href}
        rel="noopener"
        target="_blank"
      >
        <span>Source</span>
        <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
      </a>
    </p>
  );
}

function BuiltInExampleAccordionList({ examples }: { examples: ApiExample[] }) {
  if (examples.length === 0) {
    return null;
  }

  const titles = buildExampleTitles("Example", examples.length);

  return (
    <Accordions className="-mt-0.5" defaultValue={[]} type="multiple">
      {examples.map((example, index) => (
        <Accordion
          id={`built-in-example-${index + 1}`}
          key={`${example.sourceKind}-${titles[index]}-${example.code.slice(0, 50)}`}
          title={titles[index]}
          value={`${example.sourceKind}-example-${index + 1}`}
        >
          <div className="grid gap-3 pt-1">
            <div className="overflow-hidden rounded-xl border bg-muted/20 [&_pre]:m-0 [&_pre]:rounded-none [&_pre]:text-sm [&_pre]:leading-relaxed">
              <TreeSitterCodeBlock code={example.code} lang="csharp" title="Code" />
            </div>
          </div>
        </Accordion>
      ))}
    </Accordions>
  );
}

function SourceExampleAccordionList({ examples }: { examples: ApiExample[] }) {
  if (examples.length === 0) {
    return null;
  }

  return (
    <Accordions className="-mt-0.5" defaultValue={[]} type="multiple">
      {examples.map((example, index) => (
        <Accordion
          id={`source-example-${index + 1}`}
          key={
            example.fileUrl ??
            `${example.sourceKind}-${index}-${example.code.slice(0, 50)}`
          }
          title={buildSourceExampleAccordionTitle(example, index)}
          value={
            example.fileUrl ??
            example.filePath ??
            `${example.sourceKind}-implementation-${index + 1}`
          }
        >
          <div className="grid gap-3 pt-1">
            <div className="overflow-hidden rounded-xl border bg-muted/20 [&_pre]:m-0 [&_pre]:rounded-none [&_pre]:text-sm [&_pre]:leading-relaxed">
              <TreeSitterCodeBlock code={example.code} lang="csharp" title="Code" />
            </div>
            <SourceExampleLink example={example} />
          </div>
        </Accordion>
      ))}
    </Accordions>
  );
}

function ExamplesBlock({ examples }: { examples: ApiExample[] }) {
  if (examples.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
        Built-in examples define the default contract and should be read first.
      </p>
      <BuiltInExampleAccordionList examples={examples} />
    </div>
  );
}

function ImplementationsBlock({
  examples,
  hasBuiltInExamples,
}: {
  examples: ApiExample[];
  hasBuiltInExamples: boolean;
}) {
  if (examples.length === 0) {
    return null;
  }

  return (
    <div>
      {hasBuiltInExamples ? (
        <p className="max-w-[68ch] text-sm leading-relaxed font-medium text-muted-foreground">
          Repository-derived implementations for comparison and real-world
          context.
        </p>
      ) : null}
      <SourceExampleAccordionList examples={examples} />
    </div>
  );
}

function MemberHeader({
  anchor,
  lookup,
  title,
  isObsolete,
  obsoleteMessage,
}: {
  anchor: string;
  lookup: TypeLinkLookup;
  title: string;
  isObsolete: boolean;
  obsoleteMessage: string;
}) {
  const badgeTitle = resolveObsoleteMessage(
    obsoleteMessage,
    "This API member is obsolete."
  );

  return (
    <h3 className="m-0 text-base leading-6" id={anchor}>
      <span className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <span className="min-w-0">
          <SignatureText
            getTokenHref={(token) => resolveSignatureTokenHref(token, lookup)}
            value={title}
          />
        </span>
        <span className="inline-flex items-center gap-2">
          {isObsolete ? (
            <Badge
              className="border-destructive/40 text-destructive"
              title={badgeTitle}
            >
              Obsolete
            </Badge>
          ) : null}
          <SignatureAnchorButton
            anchor={anchor}
            className="opacity-0 pointer-events-none transition-opacity group-hover/member:opacity-100 group-hover/member:pointer-events-auto group-focus-within/member:opacity-100 group-focus-within/member:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto"
            signature={title}
          />
        </span>
      </span>
    </h3>
  );
}

function MemberReference({
  entity,
  lookup,
}: {
  entity: ApiEntity;
  lookup: TypeLinkLookup;
}) {
  const anchor = buildEntityAnchor(entity);
  const { remarks, summary } = splitSummary(entity);
  const obsoleteNotice =
    entity.isObsolete === true
      ? resolveObsoleteMessage(
          entity.obsoleteMessage,
          "This API member is obsolete."
        )
      : "";
  const hasParameterSection = entity.parameters.some(
    (parameter) =>
      (parameter.description?.trim().length ?? 0) > 0 ||
      (parameter.defaultValue?.trim().length ?? 0) > 0
  );
  const hasReturnsSection = entity.returnsDescription.trim().length > 0;
  const builtInExamples = entity.examples.filter(
    (example) => example.sourceKind !== "repository"
  );
  const implementations = entity.examples.filter(
    (example) => example.sourceKind === "repository"
  );

  return (
    <article
      className="group/member"
      data-member-item=""
      data-member-search={buildMemberSearchText(entity)}
    >
      <header>
        <MemberHeader
          anchor={anchor}
          isObsolete={entity.isObsolete}
          lookup={lookup}
          obsoleteMessage={entity.obsoleteMessage}
          title={entity.displaySignature}
        />
        {summary.length > 0 ? (
          <p className="max-w-[85ch] text-sm leading-relaxed text-muted-foreground">
            {summary}
          </p>
        ) : null}
        {entity.isObsolete ? (
          <p className="max-w-[85ch] text-sm leading-relaxed font-medium text-destructive">
            Obsolete: {obsoleteNotice}
          </p>
        ) : null}
      </header>

      {remarks.length > 0 ? (
        <section>
          <AdvisoryCallout remarks={remarks} />
        </section>
      ) : null}

      {hasParameterSection ? (
        <section aria-labelledby={`${anchor}-parameters`}>
          <h4
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            id={`${anchor}-parameters`}
          >
            Parameters
          </h4>
          <ParameterNotes parameters={entity.parameters} />
        </section>
      ) : null}

      {hasReturnsSection ? (
        <section aria-labelledby={`${anchor}-returns`}>
          <h4
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            id={`${anchor}-returns`}
          >
            Returns
          </h4>
          <ReturnsNotes description={entity.returnsDescription} />
        </section>
      ) : null}

      {entity.exceptions.length > 0 ? (
        <section aria-labelledby={`${anchor}-exceptions`}>
          <h4
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            id={`${anchor}-exceptions`}
          >
            Exceptions
          </h4>
          <ExceptionsTable exceptions={entity.exceptions} lookup={lookup} />
        </section>
      ) : null}

      {builtInExamples.length > 0 ? (
        <section aria-labelledby={`${anchor}-example`}>
          <h4
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            id={`${anchor}-example`}
          >
            Example
          </h4>
          <ExamplesBlock examples={builtInExamples} />
        </section>
      ) : null}

      {implementations.length > 0 ? (
        <section aria-labelledby={`${anchor}-implementations`}>
          <h4
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            id={`${anchor}-implementations`}
          >
            Implementations
          </h4>
          <ImplementationsBlock
            examples={implementations}
            hasBuiltInExamples={builtInExamples.length > 0}
          />
        </section>
      ) : null}
    </article>
  );
}

function MemberGroups({
  emptyMessageId,
  groups,
  lookup,
  sectionId,
}: {
  emptyMessageId: string;
  groups: MemberGroup[];
  lookup: TypeLinkLookup;
  sectionId: string;
}) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <>
      <div className="grid gap-4" id={sectionId}>
        {groups.map((group) => {
          if (group.members.length === 1) {
            return (
              <div data-member-group="" key={group.members[0].id}>
                <MemberReference entity={group.members[0]} lookup={lookup} />
              </div>
            );
          }

          return (
            <div data-member-group="" key={group.key}>
              <Accordions className="my-4" defaultValue={[]} type="multiple">
                <Accordion
                  id={group.anchor}
                  title={`${group.label} (${group.members.length})`}
                >
                  <div className="grid gap-4 py-2">
                    {group.members.map((member) => (
                      <MemberReference
                        entity={member}
                        key={member.id}
                        lookup={lookup}
                      />
                    ))}
                  </div>
                </Accordion>
              </Accordions>
            </div>
          );
        })}
      </div>
      <p
        className="text-sm leading-relaxed text-muted-foreground"
        hidden={true}
        id={emptyMessageId}
      >
        No results match this filter.
      </p>
    </>
  );
}

function buildToc(
  constructorGroups: MemberGroup[],
  methodGroups: MemberGroup[],
  propertyGroups: MemberGroup[]
): TOCItemType[] {
  const items: TOCItemType[] = [];

  if (constructorGroups.length > 0) {
    items.push({
      depth: 2,
      title: "Constructors",
      url: "#constructors",
    });

    for (const group of constructorGroups) {
      for (const member of group.members) {
        items.push({
          depth: 3,
          title: member.displaySignature,
          url: `#${buildEntityAnchor(member)}`,
        });
      }
    }
  }

  if (methodGroups.length > 0) {
    items.push({
      depth: 2,
      title: "Methods",
      url: "#methods",
    });

    for (const group of methodGroups) {
      for (const member of group.members) {
        items.push({
          depth: 3,
          title: member.displaySignature,
          url: `#${buildEntityAnchor(member)}`,
        });
      }
    }
  }

  if (propertyGroups.length > 0) {
    items.push({
      depth: 2,
      title: "Properties",
      url: "#properties",
    });

    for (const group of propertyGroups) {
      for (const member of group.members) {
        items.push({
          depth: 3,
          title: member.displaySignature,
          url: `#${buildEntityAnchor(member)}`,
        });
      }
    }
  }

  items.push({
    depth: 2,
    title: "Metadata",
    url: "#metadata",
  });

  return items;
}

export default async function ApiEntityPage(props: ApiEntityPageProps) {
  const params = await props.params;
  const targetUrl = buildUrl(params.slug);
  const selectedEntity = await getEntityByUrl(targetUrl);

  if (!selectedEntity) {
    notFound();
  }

  const typeEntity =
    selectedEntity.type === "class" || selectedEntity.type === "enum"
      ? selectedEntity
      : await getTypeEntityByClass(
          selectedEntity.namespace,
          selectedEntity.class
        );

  if (!typeEntity) {
    notFound();
  }

  const canonicalTypeUrl = typeEntity.canonicalUrl || typeEntity.url;
  if (selectedEntity.id !== typeEntity.id && targetUrl !== canonicalTypeUrl) {
    redirect(`${canonicalTypeUrl}#${buildEntityAnchor(selectedEntity)}`);
  }

  const allTypeEntities = await getEntitiesByClass(
    typeEntity.namespace,
    typeEntity.class
  );
  const allEntities = await loadApiEntities();
  const typeLookup = buildTypeLookup(allEntities);

  const constructors = allTypeEntities.filter(
    (entity) => entity.type === "method" && entity.entityKind === "constructor"
  );
  const methods = allTypeEntities.filter(
    (entity) => entity.type === "method" && entity.entityKind !== "constructor"
  );
  const properties = allTypeEntities.filter(
    (entity) => entity.type === "property"
  );

  const constructorGroups = groupOverloads(constructors, typeEntity);
  const methodGroups = groupOverloads(methods, typeEntity);
  const propertyGroups = groupOverloads(properties, typeEntity);

  const summary = splitSummary(typeEntity);
  const typeObsoleteNotice =
    typeEntity.isObsolete === true
      ? resolveObsoleteMessage(
          typeEntity.obsoleteMessage,
          "This API type is obsolete."
        )
      : "";
  const toc = buildToc(constructorGroups, methodGroups, propertyGroups);
  const selectedAnchor = buildEntityAnchor(selectedEntity);

  return (
    <DocsPage toc={toc}>
      <DocsPageHeader
        description={summary.summary}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              <SignatureText
                className="text-[1em] leading-tight"
                getTokenHref={(token) =>
                  resolveSignatureTokenHref(token, typeLookup)
                }
                value={typeEntity.displaySignature}
              />
            </span>
            {typeEntity.isObsolete ? (
              <Badge
                className="border-destructive/40 text-destructive"
                title={typeObsoleteNotice}
              >
                Obsolete
              </Badge>
            ) : null}
          </span>
        }
        titleClassName="leading-tight"
      />
      <DocsBody>
        {selectedEntity.id !== typeEntity.id ? (
          <Callout title="Info" type="info">
            <p>
              Opened from member route <code>{selectedEntity.name}</code>. Jump
              to
              <a
                className="ms-1 underline underline-offset-2"
                href={`#${selectedAnchor}`}
              >
                selected member
              </a>
              .
            </p>
          </Callout>
        ) : null}
        {typeEntity.isObsolete ? (
          <Callout title="Obsolete" type="warning">
            <p>{typeObsoleteNotice}</p>
          </Callout>
        ) : null}

        {summary.remarks.length > 0 ? (
          <AdvisoryCallout remarks={summary.remarks} />
        ) : null}

        {constructorGroups.length > 0 ? (
          <section className="pt-0" id="constructors">
            <MemberSectionSearch
              describedBy="constructors-member-filter-status"
              emptyStateId="constructors-member-filter-empty"
              inputId="constructors-member-filter"
              sectionId="constructors-groups"
              title="Constructors"
              totalCount={countMembers(constructorGroups)}
            />
            <MemberGroups
              emptyMessageId="constructors-member-filter-empty"
              groups={constructorGroups}
              lookup={typeLookup}
              sectionId="constructors-groups"
            />
          </section>
        ) : null}

        {methodGroups.length > 0 ? (
          <section className="pt-0 mt-9" id="methods">
            <MemberSectionSearch
              describedBy="methods-member-filter-status"
              emptyStateId="methods-member-filter-empty"
              inputId="methods-member-filter"
              sectionId="methods-groups"
              title="Methods"
              totalCount={countMembers(methodGroups)}
            />
            <MemberGroups
              emptyMessageId="methods-member-filter-empty"
              groups={methodGroups}
              lookup={typeLookup}
              sectionId="methods-groups"
            />
          </section>
        ) : null}

        {propertyGroups.length > 0 ? (
          <section className="pt-0 mt-9" id="properties">
            <MemberSectionSearch
              describedBy="properties-member-filter-status"
              emptyStateId="properties-member-filter-empty"
              inputId="properties-member-filter"
              sectionId="properties-groups"
              title="Properties"
              totalCount={countMembers(propertyGroups)}
            />
            <MemberGroups
              emptyMessageId="properties-member-filter-empty"
              groups={propertyGroups}
              lookup={typeLookup}
              sectionId="properties-groups"
            />
          </section>
        ) : null}

        <section className="pt-0 mt-9" id="metadata">
          <h2>Metadata</h2>
          <Table className="mt-2 border-y">
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Namespace</TableCell>
                <TableCell>
                  <code>{typeEntity.namespace}</code>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell>
                  <code>{typeEntity.entityKind}</code>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Assembly</TableCell>
                <TableCell>
                  <code>{typeEntity.assembly}</code>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Doc ID</TableCell>
                <TableCell>
                  <code>{typeEntity.docId}</code>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>
      </DocsBody>
    </DocsPage>
  );
}

export async function generateMetadata(
  props: ApiEntityPageProps
): Promise<Metadata> {
  const params = await props.params;
  const targetUrl = buildUrl(params.slug);
  const selectedEntity = await getEntityByUrl(targetUrl);

  if (!selectedEntity) {
    return {
      title: "API entity not found",
    };
  }

  const typeEntity =
    selectedEntity.type === "class" || selectedEntity.type === "enum"
      ? selectedEntity
      : await getTypeEntityByClass(
          selectedEntity.namespace,
          selectedEntity.class
        );

  if (!typeEntity) {
    return {
      title: "API entity not found",
    };
  }

  const titleSuffix =
    selectedEntity.id === typeEntity.id
      ? `${typeEntity.name} (${typeEntity.entityKind})`
      : `${selectedEntity.name} - ${typeEntity.name}`;

  return {
    description: typeEntity.summary || typeEntity.description || undefined,
    title: titleSuffix,
  };
}
