import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Callout } from "fumadocs-ui/components/callout";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

import { McpCursorInstallButton } from "./mcp-config-copy-button";

export const getMDXComponents = (
  components?: MDXComponents
): MDXComponents => ({
  Accordion,
  Accordions,
  Callout,
  McpCursorInstallButton,
  Tab,
  Tabs,
  ...defaultMdxComponents,
  ...components,
});
