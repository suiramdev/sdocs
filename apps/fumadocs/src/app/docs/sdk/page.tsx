import { Callout } from "fumadocs-ui/components/callout";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";

import { loadSdkEntities } from "@/lib/sdk/data";

export default async function SdkIndexPage() {
  const entities = await loadSdkEntities();
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
      full
      tableOfContent={{ enabled: true }}
      toc={[
        { depth: 2, title: "Overview", url: "#overview" },
        { depth: 2, title: "Coverage", url: "#coverage" },
        { depth: 2, title: "Navigation", url: "#navigation" },
      ]}
    >
      <DocsTitle>SDK Reference</DocsTitle>
      <DocsDescription>
        Generated C# API reference with grouped type/member navigation and
        structured method documentation.
      </DocsDescription>
      <DocsBody className="sdk-reference">
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
          <table className="sdk-table">
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
            The global SDK sidebar stays high-level: namespace → class page.
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
      </DocsBody>
    </DocsPage>
  );
}
