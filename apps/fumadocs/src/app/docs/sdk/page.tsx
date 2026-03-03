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
    <DocsPage full>
      <DocsTitle>SDK Reference</DocsTitle>
      <DocsDescription>
        SDK entities are loaded from the imported JSON source and replaced
        entirely on every regeneration.
      </DocsDescription>
      <DocsBody>
        <ul>
          <li>Classes/Structs/Interfaces: {classCount}</li>
          <li>Enums: {enumCount}</li>
          <li>Methods: {methodCount}</li>
          <li>Properties: {propertyCount}</li>
          <li>Total indexed entities: {entities.length}</li>
        </ul>
        <p className="mt-6">
          Use the default docs sidebar to navigate namespaces, classes, and SDK
          methods. Use the default Fumadocs search in the header to find
          entities quickly.
        </p>
      </DocsBody>
    </DocsPage>
  );
}
