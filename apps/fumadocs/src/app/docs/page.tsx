import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import Link from "next/link";

export default function DocsHomePage() {
  return (
    <DocsPage full>
      <DocsTitle>Documentation</DocsTitle>
      <DocsDescription>
        Documentation is split into curated guides and on-demand SDK reference
        pages for faster compilation.
      </DocsDescription>
      <DocsBody>
        <ul>
          <li>
            <Link href="/docs/sbox-ai-skill">s&box AI skill</Link>
          </li>
          <li>
            <Link href="/docs/test">General docs</Link>
          </li>
          <li>
            <Link href="/docs/sdk">SDK reference</Link>
          </li>
        </ul>
      </DocsBody>
    </DocsPage>
  );
}
