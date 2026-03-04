import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { mergeApiMethodsTree } from "@/features/api/utils/sidebar-tree";
import { baseOptions } from "@/features/docs/utils/layout";
import { source } from "@/features/docs/utils/source";

export default async function Layout({ children }: LayoutProps<"/docs">) {
  const tree = await mergeApiMethodsTree(source.getPageTree());

  return (
    <DocsLayout tree={tree} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}
