import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { baseOptions } from "@/features/docs/utils/layout";
import { source } from "@/features/docs/utils/source";
import { mergeApiMethodsTree } from "@/features/api/utils/sidebar-tree";

export default async function Layout({ children }: LayoutProps<"/docs">) {
  const tree = await mergeApiMethodsTree(source.getPageTree());

  return (
    <DocsLayout tree={tree} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}
