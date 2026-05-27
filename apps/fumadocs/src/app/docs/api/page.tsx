import { Callout } from "fumadocs-ui/components/callout";
import { DocsPage } from "fumadocs-ui/layouts/notebook/page";
import type { Metadata } from "next";

import { loadApiEntities } from "@/features/api/utils/data";
import { DocsPageHeader } from "@/features/docs/components/docs-page-header";

const apiReferenceDescription =
  "Generated C# API reference with grouped type/member navigation and structured method documentation.";

export const metadata: Metadata = {
  description: apiReferenceDescription,
  title: "API Reference",
};

export default async function ApiIndexPage() {
  const entities = await loadApiEntities();
  const classCount = entities.filter(
    (entity) => entity.type === "class"
  ).length;
  const enumCount = entities.filter((entity) => entity.type === "enum").length;
  const methodCount = entities.filter(
    (entity) => entity.type === "method"
  ).length;
  const propertyCount = entities.filter(
    (entity) => entity.type === "property"
  ).length;

  return (
    <DocsPage
      toc={[
        { depth: 2, title: "Overview", url: "#overview" },
        { depth: 2, title: "Coverage", url: "#coverage" },
        { depth: 2, title: "Navigation", url: "#navigation" },
      ]}
    >
      <DocsPageHeader
        description={apiReferenceDescription}
        title="API Reference"
      />
      <div className="api-docs-body flex-1 min-w-0">
        <section id="overview">
          <h2>Overview</h2>
          <Callout title="Note" type="info">
            <p>
              API pages are generated from XML documentation and JSON reflection
              dumps. Signatures and member contracts are preserved exactly from
              source metadata.
            </p>
          </Callout>
        </section>

        <section id="coverage">
          <h2>Coverage</h2>
          <table className="param-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Classes / Structs / Interfaces</td>
                <td>{classCount}</td>
              </tr>
              <tr>
                <td>Enums</td>
                <td>{enumCount}</td>
              </tr>
              <tr>
                <td>Methods (incl. constructors)</td>
                <td>{methodCount}</td>
              </tr>
              <tr>
                <td>Properties</td>
                <td>{propertyCount}</td>
              </tr>
              <tr>
                <td>Total entities</td>
                <td>{entities.length}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section id="navigation">
          <h2>Navigation</h2>
          <p>
            The global API sidebar stays high-level: namespace → class page.
            Member-level details are intentionally omitted from this main
            navigation to keep scanning concise.
          </p>
          <p>
            Inside each class page, related links are organized in context under
            sections like Constructors, Methods, and Properties, with member
            links jumping to exact anchors.
          </p>
          <p>
            Use the global search to jump to signatures by method name, type, or
            natural language queries.
          </p>
        </section>
      </div>
    </DocsPage>
  );
}
