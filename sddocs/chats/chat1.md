# S&box Documentation Platform

_Started 2026-05-22 10:13 UTC_

---

## User

A landing page and a documentation site. The documentation site helps in navigating through the API references from s&box game engine, C# but also users hand-written tutorials or documentation. The landing page must be centered on plugging-in the documentation to AI agents through a MCP (with CTA buttons to add to VsCode or other IDEs). The primary color must be #3273EB.

## Assistant

_[tool: list_files]_

_[tool: questions_v2]_

## User

Questions answered:

- scope: Docs site first, then landing
- fidelity: Clickable prototype with realistic interactions
- aesthetic: Explore a few options
- landing_sections: Decide for me
- docs_layout: Algolia-style search-first with command palette
- docs_content_type: C# API reference (classes, methods, properties), Hand-written tutorials / guides, Code samples with syntax highlighting, Search / command palette (Cmd+K)
- api_example: Sandbox.Component
- variations: 2 variations
- tweaks: Light/dark toggle
- tone: Technical precise ("MCP server for s&box API reference.")
- logo: Use "s&box docs" as-is

## Assistant

_[tool: update_todos]_

_[tool: copy_starter_component]_

_[tool: write_file]_

_[tool: write_file]_

Now the docs page. I'll build it as a React prototype with a sidebar tree, content for Sandbox.Component, a tutorial route, a right-rail TOC, and a Cmd+K command palette.

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: str_replace_edit]_

I need to fix the CodeBlock to render HTML strings properly, and clean up the Member component.

_[tool: str_replace_edit]_

Now the main app file — sidebar, topbar, command palette, theme toggle, routing.

_[tool: write_file]_

_[tool: show_html]_

_[tool: show_html]_

_[tool: get_webview_logs]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: str_replace_edit]_

The docs are rendering. Let me fix the brand wrapping and check more of the page, then move to the landing.

_[tool: write_file]_

Now the landing page. Let me build it.

_[tool: write_file]_

_[tool: read_file]_

_[tool: write_file]_

_[tool: show_html]_

_[tool: sleep]_

_[tool: get_webview_logs]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: save_screenshot]_

Some polish needed. Let me capture more of the page first.

_[tool: view_image]_

_[tool: view_image]_

_[tool: view_image]_

_[tool: str_replace_edit]_

_[tool: read_file]_

I need to move the `.brand` styles into the shared stylesheet — they're only in docs.css right now and not applying to the landing page.

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: grep]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: str_replace_edit]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: save_screenshot]_

Looks much better. Let me check the rest and the split variation.

_[tool: view_image]_

_[tool: view_image]_

_[tool: view_image]_

_[tool: save_screenshot]_

Let me check the split layout variation.

_[tool: grep]_

_[tool: str_replace_edit]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: show_html]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: eval_js]_

_[tool: save_screenshot]_

_[tool: view_image]_

_[tool: multi_screenshot]_

_[tool: eval_js]_

_[tool: save_screenshot]_

The Cmd+K palette works (confirmed via DOM inspection — html-to-image just doesn't capture overlays well). Let me do one more thing — make sure the docs sidebar shows the API tree expanded so users can see member-level nav, then ship.

_[tool: view_image]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: update_todos]_

Everything works. Let me update todos and ship.

_[tool: done]_

_[tool: fork_verifier_agent]_

Built two pages wired together:

**`docs.html`** — docs site (you're looking at it)

- `Sandbox.Component` API reference: properties, methods, events, inheritance ribbon, code example
- Hand-written tutorial route (`Tutorials → Writing a Component`)
- Sidebar tree with kind chips (C/P/M/S/A) — click any item to navigate; the API tree drills into individual members
- **Cmd+K command palette** with fuzzy search across classes, members, and tutorials
- Right-rail TOC with scrollspy
- Theme toggle in the top right (persists)

**`index.html`** — MCP landing

- Centered hero with IDE quick-add buttons (VS Code, Cursor, Claude Desktop, Zed) + `npx` fallback
- Animated terminal showing an AI calling MCP tools
- "How it works" (3 steps with code), feature grid (6 cards), tool contract (5 tools), final CTA with all 6 IDE buttons, footer
- **Tweaks panel** toggles between `centered` and `split` hero layouts, and dark/light theme

Both pages share `styles.css` (design tokens — primary `#3273EB`, Geist + Geist Mono) and a synced theme via `localStorage`.

Next steps if you want them: real IDE deeplinks (`vscode:mcp/install?...`), a Tools page with full JSON schemas, more API class stubs to fill out the sidebar, copy-button wiring on the code blocks.
