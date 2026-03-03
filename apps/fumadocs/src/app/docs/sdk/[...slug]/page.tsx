import type { TOCItemType } from "fumadocs-core/toc";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Callout } from "fumadocs-ui/components/callout";
import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { SdkSignatureText } from "@/components/sdk-signature-text";
import {
  getEntitiesByClass,
  getEntityByUrl,
  getTypeEntityByClass,
  loadSdkEntities,
} from "@/lib/sdk/data";
import { buildSdkEntityAnchor, safeAnchorSegment } from "@/lib/sdk/reference";
import type { SdkEntity, SdkException, SdkParameter } from "@/lib/sdk/schemas";

interface SdkEntityPageProps {
  params: Promise<{
    slug: string[];
  }>;
}

interface SummaryParts {
  summary: string;
  remarks: string;
}

interface TypeLinkLookup {
  byFullName: Map<string, SdkEntity>;
  bySimpleName: Map<string, SdkEntity | null>;
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
  return `/docs/sdk/${slug.join("/")}`;
}

function buildEntityAnchor(entity: SdkEntity): string {
  return buildSdkEntityAnchor(entity);
}

function splitSummary(entity: SdkEntity): SummaryParts {
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

function compareEntities(left: SdkEntity, right: SdkEntity): number {
  const nameCompare = left.name.localeCompare(right.name);
  if (nameCompare !== 0) {
    return nameCompare;
  }

  return left.signature.localeCompare(right.signature);
}

function groupOverloads(
  members: SdkEntity[],
  typeEntity: SdkEntity
): Array<{
  anchor: string;
  key: string;
  label: string;
  members: SdkEntity[];
}> {
  const grouped = new Map<string, SdkEntity[]>();

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

function buildTypeLookup(entities: SdkEntity[]): TypeLinkLookup {
  const byFullName = new Map<string, SdkEntity>();
  const bySimpleName = new Map<string, SdkEntity | null>();

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
): SdkEntity | null {
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
    const index = match.index ?? 0;

    if (index > lastIndex) {
      chunks.push(value.slice(lastIndex, index));
    }

    const target = resolveTypeEntity(token, lookup);
    const displayValue = simplifyTypeToken(token);

    if (target) {
      chunks.push(
        <Link
          className="sdk-type-link"
          href={target.url}
          key={`${token}-${index}`}
          prefetch={false}
          title={target.class}
        >
          {displayValue}
        </Link>
      );
    } else {
      chunks.push(
        <span
          key={`${token}-${index}`}
          title={token.includes(".") ? token : undefined}
        >
          {displayValue}
        </span>
      );
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < value.length) {
    chunks.push(value.slice(lastIndex));
  }

  return <code className="sdk-inline-type">{chunks}</code>;
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

function ParametersTable({
  lookup,
  parameters,
}: {
  lookup: TypeLinkLookup;
  parameters: SdkParameter[];
}) {
  if (parameters.length === 0) {
    return null;
  }

  return (
    <table className="sdk-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {parameters.map((parameter) => {
          const details = parameter.description?.trim();
          const detailsParts: string[] = [];
          if (details && details.length > 0) {
            detailsParts.push(details);
          }
          if (parameter.defaultValue) {
            detailsParts.push(`Default: ${parameter.defaultValue}`);
          }

          return (
            <tr key={`${parameter.name}-${parameter.type}`}>
              <td>
                <code>{parameter.name}</code>
              </td>
              <td>
                <TypeExpression lookup={lookup} value={parameter.type} />
              </td>
              <td>{detailsParts.join(" ")}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ReturnsTable({
  entity,
  lookup,
}: {
  entity: SdkEntity;
  lookup: TypeLinkLookup;
}) {
  const hasReturnType = (entity.returnType ?? "").length > 0;
  const hasDescription = entity.returnsDescription.length > 0;

  if (!hasReturnType && !hasDescription) {
    return null;
  }

  if (hasReturnType && hasDescription) {
    return (
      <table className="sdk-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <TypeExpression lookup={lookup} value={entity.returnType ?? ""} />
            </td>
            <td>{entity.returnsDescription}</td>
          </tr>
        </tbody>
      </table>
    );
  }

  if (hasReturnType) {
    return (
      <table className="sdk-table">
        <thead>
          <tr>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <TypeExpression lookup={lookup} value={entity.returnType ?? ""} />
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <table className="sdk-table">
      <thead>
        <tr>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{entity.returnsDescription}</td>
        </tr>
      </tbody>
    </table>
  );
}

function ExceptionsTable({
  exceptions,
  lookup,
}: {
  exceptions: SdkException[];
  lookup: TypeLinkLookup;
}) {
  if (exceptions.length === 0) {
    return null;
  }

  return (
    <table className="sdk-table">
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
            <td>{exception.description?.trim() ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ExamplesBlock({ examples }: { examples: string[] }) {
  if (examples.length === 0) {
    return null;
  }

  if (examples.length === 1) {
    return (
      <DynamicCodeBlock
        code={examples[0]}
        codeblock={{ title: "Example" }}
        lang="csharp"
      />
    );
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

  return (
    <Tabs items={labels}>
      {examples.map((example, index) => (
        <Tab key={`${example.slice(0, 50)}-${index}`}>
          <DynamicCodeBlock
            code={example}
            codeblock={{ title: labels[index] }}
            lang="csharp"
          />
        </Tab>
      ))}
    </Tabs>
  );
}

function MemberHeader({ anchor, title }: { anchor: string; title: string }) {
  return (
    <h3 className="sdk-member-title" id={anchor}>
      <a aria-label={`Anchor for ${title}`} href={`#${anchor}`}>
        <SdkSignatureText value={title} />
      </a>
    </h3>
  );
}

function MemberReference({
  entity,
  lookup,
}: {
  entity: SdkEntity;
  lookup: TypeLinkLookup;
}) {
  const anchor = buildEntityAnchor(entity);
  const { remarks, summary } = splitSummary(entity);
  const hasReturnsSection =
    (entity.returnType ?? "").length > 0 ||
    entity.returnsDescription.length > 0;

  return (
    <article className="sdk-member-card">
      <header className="sdk-member-header">
        <MemberHeader anchor={anchor} title={entity.displaySignature} />
        {summary.length > 0 ? (
          <p className="sdk-member-summary">{summary}</p>
        ) : null}
      </header>

      {remarks.length > 0 ? (
        <section className="sdk-subsection">
          <AdvisoryCallout remarks={remarks} />
        </section>
      ) : null}

      {entity.parameters.length > 0 ? (
        <section
          aria-labelledby={`${anchor}-parameters`}
          className="sdk-subsection"
        >
          <h4 id={`${anchor}-parameters`}>Parameters</h4>
          <ParametersTable lookup={lookup} parameters={entity.parameters} />
        </section>
      ) : null}

      {hasReturnsSection ? (
        <section
          aria-labelledby={`${anchor}-returns`}
          className="sdk-subsection"
        >
          <h4 id={`${anchor}-returns`}>Returns</h4>
          <ReturnsTable entity={entity} lookup={lookup} />
        </section>
      ) : null}

      {entity.exceptions.length > 0 ? (
        <section
          aria-labelledby={`${anchor}-exceptions`}
          className="sdk-subsection"
        >
          <h4 id={`${anchor}-exceptions`}>Exceptions</h4>
          <ExceptionsTable exceptions={entity.exceptions} lookup={lookup} />
        </section>
      ) : null}

      {entity.examples.length > 0 ? (
        <section
          aria-labelledby={`${anchor}-example`}
          className="sdk-subsection"
        >
          <h4 id={`${anchor}-example`}>Example</h4>
          <ExamplesBlock examples={entity.examples} />
        </section>
      ) : null}
    </article>
  );
}

function MemberGroups({
  groups,
  lookup,
  sectionId,
}: {
  groups: Array<{
    anchor: string;
    key: string;
    label: string;
    members: SdkEntity[];
  }>;
  lookup: TypeLinkLookup;
  sectionId: string;
}) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="sdk-member-groups" id={sectionId}>
      {groups.map((group) => {
        if (group.members.length === 1) {
          return (
            <MemberReference
              entity={group.members[0]}
              key={group.members[0].id}
              lookup={lookup}
            />
          );
        }

        return (
          <Accordions
            className="my-4"
            defaultValue={[]}
            key={group.key}
            type="multiple"
          >
            <Accordion
              id={group.anchor}
              title={`${group.label} (${group.members.length})`}
            >
              <div className="sdk-member-overloads">
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
        );
      })}
    </div>
  );
}

function buildToc(
  constructorGroups: Array<{
    anchor: string;
    members: SdkEntity[];
  }>,
  methodGroups: Array<{
    anchor: string;
    members: SdkEntity[];
  }>,
  propertyGroups: Array<{
    anchor: string;
    members: SdkEntity[];
  }>
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

export default async function SdkEntityPage(props: SdkEntityPageProps) {
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
  const allEntities = await loadSdkEntities();
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
  const toc = buildToc(constructorGroups, methodGroups, propertyGroups);
  const selectedAnchor = buildEntityAnchor(selectedEntity);

  return (
    <DocsPage full tableOfContent={{ enabled: true }} toc={toc}>
      <DocsTitle>
        <span className="sdk-page-signature">
          <SdkSignatureText value={typeEntity.displaySignature} />
        </span>
      </DocsTitle>
      {summary.summary.length > 0 ? (
        <DocsDescription>{summary.summary}</DocsDescription>
      ) : null}
      <DocsBody className="sdk-reference">
        {selectedEntity.id !== typeEntity.id ? (
          <Callout title="Info" type="info">
            <p>
              Opened from member route <code>{selectedEntity.name}</code>. Jump
              to
              <a className="ms-1 sdk-inline-link" href={`#${selectedAnchor}`}>
                selected member
              </a>
              .
            </p>
          </Callout>
        ) : null}

        {summary.remarks.length > 0 ? (
          <AdvisoryCallout remarks={summary.remarks} />
        ) : null}

        {constructorGroups.length > 0 ? (
          <section id="constructors">
            <h2>Constructors</h2>
            <MemberGroups
              groups={constructorGroups}
              lookup={typeLookup}
              sectionId="constructors-groups"
            />
          </section>
        ) : null}

        {methodGroups.length > 0 ? (
          <section id="methods">
            <h2>Methods</h2>
            <MemberGroups
              groups={methodGroups}
              lookup={typeLookup}
              sectionId="methods-groups"
            />
          </section>
        ) : null}

        {propertyGroups.length > 0 ? (
          <section id="properties">
            <h2>Properties</h2>
            <MemberGroups
              groups={propertyGroups}
              lookup={typeLookup}
              sectionId="properties-groups"
            />
          </section>
        ) : null}

        <section id="metadata">
          <h2>Metadata</h2>
          <table className="sdk-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Namespace</td>
                <td>
                  <code>{typeEntity.namespace}</code>
                </td>
              </tr>
              <tr>
                <td>Type</td>
                <td>
                  <code>{typeEntity.entityKind}</code>
                </td>
              </tr>
              <tr>
                <td>Assembly</td>
                <td>
                  <code>{typeEntity.assembly}</code>
                </td>
              </tr>
              <tr>
                <td>Doc ID</td>
                <td>
                  <code>{typeEntity.docId}</code>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </DocsBody>
    </DocsPage>
  );
}

export async function generateMetadata(
  props: SdkEntityPageProps
): Promise<Metadata> {
  const params = await props.params;
  const targetUrl = buildUrl(params.slug);
  const selectedEntity = await getEntityByUrl(targetUrl);

  if (!selectedEntity) {
    return {
      title: "SDK entity not found",
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
      title: "SDK entity not found",
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
