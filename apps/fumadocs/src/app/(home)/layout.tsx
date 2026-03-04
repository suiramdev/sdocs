import { HomeLayout } from "fumadocs-ui/layouts/home";

import { baseOptions } from "@/features/docs/utils/layout";

export default function Layout({ children }: LayoutProps<"/">) {
  return <HomeLayout {...baseOptions()}>{children}</HomeLayout>;
}
