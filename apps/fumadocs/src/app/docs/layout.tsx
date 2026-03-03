import { DocsLayout } from "fumadocs-ui/layouts/docs";

import { baseOptions } from "@/lib/layout.shared";
import { mergeSdkMethodsTree } from "@/lib/sdk/sidebar-tree";
import { source } from "@/lib/source";

export default async function Layout({ children }: LayoutProps<"/docs">) {
  const tree = await mergeSdkMethodsTree(source.getPageTree());

  return (
    <DocsLayout tree={tree} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}
