import { HomeLayout } from "fumadocs-ui/layouts/home";

import { HomeNavbar } from "@/features/docs/components/home-navbar";
import { baseOptions } from "@/features/docs/utils/layout";

export default function Layout({ children }: LayoutProps<"/">) {
  const base = baseOptions();

  return (
    <HomeLayout {...base} nav={{ ...base.nav, component: <HomeNavbar /> }}>
      {children}
    </HomeLayout>
  );
}
