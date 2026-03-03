import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";

import { getEntityByUrl } from "@/lib/sdk/data";

interface SdkEntityPageProps {
  params: Promise<{
    slug: string[];
  }>;
}

function buildUrl(slug: string[]): string {
  return `/docs/sdk/${slug.join("/")}`;
}

export default async function SdkEntityPage(props: SdkEntityPageProps) {
  const params = await props.params;
  const targetUrl = buildUrl(params.slug);
  const entity = await getEntityByUrl(targetUrl);

  if (!entity) {
    notFound();
  }

  return (
    <DocsPage full>
      <DocsTitle>{entity.name}</DocsTitle>
      <DocsDescription>{entity.description || "No description."}</DocsDescription>
      <DocsBody>
        <h2>Entity</h2>
        <ul>
          <li>
            <strong>Type:</strong> <code>{entity.type}</code>
          </li>
          <li>
            <strong>Namespace:</strong> <code>{entity.namespace}</code>
          </li>
          <li>
            <strong>Class:</strong> <code>{entity.class}</code>
          </li>
          <li>
            <strong>ID:</strong> <code>{entity.id}</code>
          </li>
        </ul>

        <h2>Signature</h2>
        <pre>
          <code>{entity.displaySignature}</code>
        </pre>

        <h2>Source Signature</h2>
        <pre>
          <code>{entity.signature}</code>
        </pre>

        <h2>Parameters</h2>
        {entity.parameters.length === 0 ? (
          <p>None.</p>
        ) : (
          <ul>
            {entity.parameters.map((parameter) => (
              <li key={parameter.name}>
                <code>{parameter.name}</code> (<code>{parameter.type}</code>)
                {parameter.defaultValue ? (
                  <>
                    {" "}
                    default: <code>{parameter.defaultValue}</code>
                  </>
                ) : null}
                {parameter.description ? ` - ${parameter.description}` : ""}
              </li>
            ))}
          </ul>
        )}

        <h2>Return Type</h2>
        <p>{entity.returnType ? <code>{entity.returnType}</code> : "N/A"}</p>

        <h2>Examples</h2>
        {entity.examples.length === 0 ? (
          <p>No documented examples in source JSON.</p>
        ) : (
          entity.examples.map((example) => (
            <pre key={example.slice(0, 64)}>
              <code>{example}</code>
            </pre>
          ))
        )}

        <h2>Metadata</h2>
        <ul>
          <li>
            <strong>Assembly:</strong> <code>{entity.assembly}</code>
          </li>
          <li>
            <strong>Doc ID:</strong> <code>{entity.docId}</code>
          </li>
        </ul>
      </DocsBody>
    </DocsPage>
  );
}

export async function generateMetadata(
  props: SdkEntityPageProps
): Promise<Metadata> {
  const params = await props.params;
  const targetUrl = buildUrl(params.slug);
  const entity = await getEntityByUrl(targetUrl);

  if (!entity) {
    return {
      title: "SDK entity not found",
    };
  }

  return {
    description: entity.description || `SDK ${entity.type} in ${entity.namespace}`,
    title: `${entity.name} (${entity.type})`,
  };
}
