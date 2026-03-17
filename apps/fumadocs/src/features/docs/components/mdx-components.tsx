import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

import {
  McpClaudeDesktopConfigDownloadButton,
  McpConfigCopyButton,
  McpCursorInstallButton,
  McpMcpbInstallButton,
  McpVscodeInstallButton,
} from "./mcp-config-copy-button";
import {
  McpCursorConfigSnippet,
  McpOtherToolConfigSnippet,
  McpRemoteUrlSnippet,
  McpVscodeConfigSnippet,
} from "./mcp-doc-snippets";
import { TreeSitterPre } from "./tree-sitter-pre";

export const getMDXComponents = (
  components?: MDXComponents
): MDXComponents => ({
  Accordion,
  Accordions,
  McpClaudeDesktopConfigDownloadButton,
  McpConfigCopyButton,
  McpCursorConfigSnippet,
  McpCursorInstallButton,
  McpMcpbInstallButton,
  McpOtherToolConfigSnippet,
  McpRemoteUrlSnippet,
  McpVscodeConfigSnippet,
  McpVscodeInstallButton,
  Tab,
  Tabs,
  ...defaultMdxComponents,
  pre: TreeSitterPre,
  ...components,
});
