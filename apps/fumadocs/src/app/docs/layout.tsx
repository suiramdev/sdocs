export const dynamic = "force-dynamic";

import { DocsLayout } from "fumadocs-ui/layouts/notebook";

import { mergeDocsTree } from "@/features/api/utils/sidebar-tree";
import { McpButtonGroup } from "@/features/docs/components/mcp-button-group";
import { baseOptions } from "@/features/docs/utils/layout";
import { source } from "@/features/docs/utils/source";

export default async function Layout({ children }: LayoutProps<"/docs">) {
  const tree = await mergeDocsTree(source.getPageTree());
  const base = baseOptions();

  return (
    <DocsLayout
      tree={tree}
      nav={{
        ...base.nav,
        mode: "top",
      }}
      links={[
        {
          children: <McpButtonGroup />,
          secondary: true,
          type: "custom",
        },
      ]}
      containerProps={{
        className:
          "md:[--fd-sidebar-width:248px] lg:[--fd-sidebar-width:256px]",
      }}
      githubUrl={base.githubUrl}
    >
      {children}
    </DocsLayout>
  );
}
