import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

import {
  McpCursorInstallButton,
  McpVscodeInstallButton,
} from "./mcp-config-copy-button";

export const getMDXComponents = (
  components?: MDXComponents
): MDXComponents => ({
  Accordion,
  Accordions,
  McpCursorInstallButton,
  McpVscodeInstallButton,
  Tab,
  Tabs,
  ...defaultMdxComponents,
  ...components,
});
