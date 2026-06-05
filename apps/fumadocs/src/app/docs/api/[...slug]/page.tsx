import type { TOCItemType } from "fumadocs-core/toc";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Callout } from "fumadocs-ui/components/callout";
import { DocsPage } from "fumadocs-ui/layouts/notebook/page";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import React from "react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { ImplementationExamples } from "@/features/api/components/implementation-examples";
import { MemberSectionSearch } from "@/features/api/components/member-section-search";
import { SignatureAnchorButton } from "@/features/api/components/signature-anchor-button";
import { SignatureText } from "@/features/api/components/signature-text";
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
import { getRelatedGuidesForEntity } from "@/features/api/v1/services/guide-relations";
import { TreeSitterCodeBlock } from "@/features/code/components/tree-sitter-code-block";
import { DocsPageHeader } from "@/features/docs/components/docs-page-header";
import { RelatedGuidesSection } from "@/features/docs/components/reference-sections";

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
  const title = isWarning ? "Warning" : (isPerformance ? "Performance" : "Note");

  return (
    <Callout title={title} type={isWarning ? "warning" : "info"}>
      <p>{remarks}</p>
    </Callout>
  );
}

function ParameterNotes({
  parameters,
  lookup,
}: {
  parameters: ApiParameter[];
  lookup: TypeLinkLookup;
}) {
  if (parameters.length === 0) {
    return null;
  }

  return (
    <table className="param-table">
      <thead>
        <tr>
          <th>Parameter</th>
          <th>Type</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {parameters.map((p) => (
          <tr key={`${p.name}-${p.type}`}>
            <td>
              {p.name}
              {p.defaultValue && (
                <span className="text-neutral-400 dark:text-neutral-500 font-mono text-xs">
                  {" "}
                  = {p.defaultValue}
                </span>
              )}
            </td>
            <td>
              <TypeExpression lookup={lookup} value={p.type} />
            </td>
            <td>{p.description || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReturnsNotes({
  description,
  returnType,
  lookup,
}: {
  description: string;
  returnType: string | null;
  lookup: TypeLinkLookup;
}) {
  const details = description.trim();
  if (details.length === 0 && !returnType) {
    return null;
  }

  return (
    <div className="text-sm leading-relaxed mt-2">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase mr-2">
        Returns:
      </span>
      {returnType && (
        <span className="font-mono text-xs text-primary font-semibold mr-2">
          <TypeExpression lookup={lookup} value={returnType} />
        </span>
      )}
      <span className="text-muted-foreground">{details || "—"}</span>
    </div>
  );
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
    <table className="param-table">
      <thead>
        <tr>
          <th>Exception</th>
          <th>Condition</th>
        </tr>
      </thead>
      <tbody>
        {exceptions.map((exception) => (
          <tr key={`${exception.type}-${exception.description ?? ""}`}>
            <td>
              <TypeExpression lookup={lookup} value={exception.type} />
            </td>
            <td>{exception.description?.trim() || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function buildExampleTitles(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`);
}

function buildImplementationQuery(entity: ApiEntity): string {
  if (entity.entityKind === "constructor") {
    return entity.class.split(".").at(-1) ?? entity.class;
  }

  return entity.name;
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
              <TreeSitterCodeBlock
                code={example.code}
                lang="csharp"
                title="Code"
              />
            </div>
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

function MemberHeader({
  anchor,
  lookup,
  title,
  isObsolete,
  obsoleteMessage,
  entity,
}: {
  anchor: string;
  lookup: TypeLinkLookup;
  title: string;
  isObsolete: boolean;
  obsoleteMessage: string;
  entity: ApiEntity;
}) {
  const badgeTitle = resolveObsoleteMessage(
    obsoleteMessage,
    "This API member is obsolete."
  );

  const chips: ReactNode[] = [];

  const sig = entity.signature || "";
  const displaySig = entity.displaySignature || "";

  // 1. Access level
  if (sig.includes("public ") || displaySig.includes("public ")) {
    chips.push(
      <Badge className="chip primary" key="public">
        PUBLIC
      </Badge>
    );
  } else if (sig.includes("protected ") || displaySig.includes("protected ")) {
    chips.push(
      <Badge className="chip warning" key="protected">
        PROTECTED
      </Badge>
    );
  } else if (sig.includes("private ") || displaySig.includes("private ")) {
    chips.push(
      <Badge className="chip" key="private">
        PRIVATE
      </Badge>
    );
  } else if (sig.includes("internal ") || displaySig.includes("internal ")) {
    chips.push(
      <Badge className="chip" key="internal">
        INTERNAL
      </Badge>
    );
  }

  // 2. Member nature
  if (entity.entityKind === "constructor") {
    chips.push(
      <Badge className="chip primary" key="constructor">
        CONSTRUCTOR
      </Badge>
    );
  }
  if (sig.includes("static ") || displaySig.includes("static ")) {
    chips.push(
      <Badge className="chip success" key="static">
        STATIC
      </Badge>
    );
  }
  if (sig.includes("virtual ") || displaySig.includes("virtual ")) {
    chips.push(
      <Badge className="chip" key="virtual">
        VIRTUAL
      </Badge>
    );
  }
  if (sig.includes("override ") || displaySig.includes("override ")) {
    chips.push(
      <Badge className="chip" key="override">
        OVERRIDE
      </Badge>
    );
  }
  if (sig.includes("abstract ") || displaySig.includes("abstract ")) {
    chips.push(
      <Badge className="chip" key="abstract">
        ABSTRACT
      </Badge>
    );
  }

  // 3. Property accessors
  if (entity.type === "property") {
    const hasGet = displaySig.includes("get;") || displaySig.includes("get ");
    const hasSet = displaySig.includes("set;") || displaySig.includes("set ");
    const hasInit =
      displaySig.includes("init;") || displaySig.includes("init ");
    if (hasGet) {
      chips.push(
        <Badge className="chip info" key="get">
          GET
        </Badge>
      );
    }
    if (hasSet) {
      chips.push(
        <Badge className="chip warning" key="set">
          SET
        </Badge>
      );
    }
    if (hasInit) {
      chips.push(
        <Badge className="chip" key="init">
          INIT
        </Badge>
      );
    }
  }

  // 4. Custom Metadata tags (lifecycle, per-frame, fixed, ingest)
  const nameLower = entity.name.toLowerCase();
  const summaryLower = (entity.summary || "").toLowerCase();
  const descriptionLower = (entity.description || "").toLowerCase();

  // Lifecycle methods
  if (
    nameLower.startsWith("on") &&
    (nameLower.includes("awake") ||
      nameLower.includes("start") ||
      nameLower.includes("enable") ||
      nameLower.includes("disable") ||
      nameLower.includes("destroy") ||
      summaryLower.includes("lifecycle") ||
      descriptionLower.includes("lifecycle"))
  ) {
    chips.push(
      <Badge className="chip lifecycle" key="lifecycle">
        LIFECYCLE
      </Badge>
    );
  }

  // Per-frame tick methods
  if (
    nameLower.includes("update") ||
    summaryLower.includes("per frame") ||
    summaryLower.includes("per-frame") ||
    descriptionLower.includes("per frame") ||
    descriptionLower.includes("per-frame")
  ) {
    if (nameLower.includes("fixed")) {
      chips.push(
        <Badge className="chip fixed" key="fixed">
          FIXED TICK
        </Badge>
      );
    } else {
      chips.push(
        <Badge className="chip per-frame" key="per-frame">
          PER-FRAME
        </Badge>
      );
    }
  }

  // Ingestion or input triggers
  if (
    nameLower.includes("input") ||
    nameLower.includes("ingest") ||
    summaryLower.includes("ingest") ||
    summaryLower.includes("input trigger") ||
    descriptionLower.includes("ingest") ||
    descriptionLower.includes("input trigger")
  ) {
    chips.push(
      <Badge className="chip ingest" key="ingest">
        INGEST
      </Badge>
    );
  }

  // 5. Obsolete
  if (isObsolete) {
    chips.push(
      <Badge
        className="chip"
        key="obsolete"
        style={{
          background: "rgba(207, 34, 46, 0.08)",
          borderColor: "rgba(207, 34, 46, 0.25)",
          color: "var(--danger)",
        }}
        title={badgeTitle}
      >
        OBSOLETE
      </Badge>
    );
  }

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
          {chips.length > 0 && (
            <span className="member-tags mr-2">{chips}</span>
          )}
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
      (parameter.defaultValue?.trim().length ?? 0) > 0 ||
      (parameter.type?.trim().length ?? 0) > 0
  );
  const hasReturnsSection =
    entity.returnsDescription.trim().length > 0 ||
    (entity.returnType && entity.returnType.trim().length > 0);
  const builtInExamples = entity.examples;

  return (
    <article
      className="member group/member"
      data-member-item=""
      data-member-search={buildMemberSearchText(entity)}
      id={anchor}
    >
      <header>
        <MemberHeader
          anchor={anchor}
          entity={entity}
          isObsolete={entity.isObsolete}
          lookup={lookup}
          obsoleteMessage={entity.obsoleteMessage}
          title={entity.displaySignature}
        />
        {summary.length > 0 ? (
          <p className="member-desc max-w-[85ch]">{summary}</p>
        ) : null}
        {entity.isObsolete ? (
          <p className="max-w-[85ch] text-sm leading-relaxed font-medium text-destructive mt-1">
            Obsolete: {obsoleteNotice}
          </p>
        ) : null}
      </header>

      {remarks.length > 0 ? (
        <section className="mt-2.5">
          <AdvisoryCallout remarks={remarks} />
        </section>
      ) : null}

      {hasParameterSection ? (
        <section aria-labelledby={`${anchor}-parameters`} className="mt-3">
          <ParameterNotes parameters={entity.parameters} lookup={lookup} />
        </section>
      ) : null}

      {hasReturnsSection ? (
        <section aria-labelledby={`${anchor}-returns`} className="mt-3">
          <ReturnsNotes
            description={entity.returnsDescription}
            returnType={entity.returnType}
            lookup={lookup}
          />
        </section>
      ) : null}

      {entity.exceptions.length > 0 ? (
        <section aria-labelledby={`${anchor}-exceptions`} className="mt-4">
          <h4
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase mb-1"
            id={`${anchor}-exceptions`}
          >
            Exceptions
          </h4>
          <ExceptionsTable exceptions={entity.exceptions} lookup={lookup} />
        </section>
      ) : null}

      {builtInExamples.length > 0 ? (
        <section aria-labelledby={`${anchor}-example`} className="mt-4">
          <h4
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase mb-1"
            id={`${anchor}-example`}
          >
            Example
          </h4>
          <ExamplesBlock examples={builtInExamples} />
        </section>
      ) : null}

      <ImplementationExamples
        anchor={anchor}
        query={buildImplementationQuery(entity)}
      />
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
  const relatedGuides = await getRelatedGuidesForEntity(typeEntity, 6).catch(
    () => []
  );

  const parseInheritanceList = (displaySignature: string): string[] => {
    const parts = displaySignature.split(":");
    if (parts.length <= 1) {
      return [];
    }
    return parts[1]
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  };

  const inheritanceList = parseInheritanceList(typeEntity.displaySignature);

  return (
    <DocsPage toc={toc}>
      <nav className="breadcrumb">
        <Link href="/docs/api">API Reference</Link>
        <span className="sep">/</span>
        <Link href={`/docs/api#${typeEntity.namespace}`}>
          {typeEntity.namespace}
        </Link>
        <span className="sep">/</span>
        <span className="current">{typeEntity.name}</span>
      </nav>

      <h1 className="page-title text-4xl font-bold tracking-tight mb-2 page-title-wrap">
        {typeEntity.name}
        <Badge className="kind">{typeEntity.entityKind}</Badge>
      </h1>

      {summary.summary && <p className="page-summary">{summary.summary}</p>}

      <div className="inheritance">
        <span className="crumb">object</span>
        {inheritanceList.map((inherited) => (
          <React.Fragment key={inherited}>
            <span className="arrow">→</span>
            <span className="crumb">
              <TypeExpression lookup={typeLookup} value={inherited} />
            </span>
          </React.Fragment>
        ))}
        {inheritanceList.length === 0 && (
          <>
            <span className="arrow">→</span>
            <span className="crumb cur">{typeEntity.name}</span>
          </>
        )}
        {inheritanceList.length > 0 && (
          <>
            <span className="arrow">→</span>
            <span className="crumb cur">{typeEntity.name}</span>
          </>
        )}
      </div>

      <dl className="meta-grid">
        <dt>Namespace</dt>
        <dd>{typeEntity.namespace}</dd>
        <dt>Assembly</dt>
        <dd>{typeEntity.assembly}</dd>
        <dt>Declaration</dt>
        <dd>
          <SignatureText
            getTokenHref={(token) =>
              resolveSignatureTokenHref(token, typeLookup)
            }
            value={typeEntity.displaySignature}
          />
        </dd>
      </dl>

      <div className="api-docs-body flex-1 min-w-0">
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
          <section id="methods">
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
          <section id="properties">
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

        <RelatedGuidesSection guides={relatedGuides} />
      </div>
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
