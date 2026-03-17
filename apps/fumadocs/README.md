# Fumadocs API Platform

This app serves generated C# API docs with Meilisearch-backed natural language search and AI retrieval routes.

## Local Setup

1. Start Meilisearch:

```bash
bun run meilisearch
```

If port `7700` is already taken, override the Docker bind port:

```bash
MEILI_PORT=7710 bun run meilisearch
```

Or with Docker directly:

```bash
docker compose -f infra/meilisearch/docker-compose.yml up -d
```

```bash
MEILI_PORT=7710 docker compose -f infra/meilisearch/docker-compose.yml up -d
```

2. Copy environment defaults:

```bash
cp .env.example .env.local
```

To enable Umami analytics, set `NEXT_PUBLIC_UMAMI_WEBSITE_ID` and
`NEXT_PUBLIC_UMAMI_SCRIPT_URL` in `apps/fumadocs/.env.local`. The app will
auto-track page visits and route changes through Umami, and it also sends
custom `docs_search` and `docs_search_result_click` events so you can inspect
popular searches and which results people open.

3. (Optional) Generate docs + normalized index docs manually:

```bash
bun run api:generate --input /Users/nouchetm/Downloads/2026-03-02-20-41-10.zip.json
```

4. Start the app:

```bash
bun run start
```

If port `4000` is already taken, override the app port:

```bash
FUMADOCS_PORT=4400 bun run start
```

For development with hot reload:

```bash
FUMADOCS_PORT=4400 bun run dev
```

If you changed the Docker bind port, set `MEILI_HOST` in
`apps/fumadocs/.env.local` to match it, for example
`MEILI_HOST=http://127.0.0.1:7710`.

For MCP install links and downloadable config files, set
`NEXT_PUBLIC_APP_BASE_URL` to the public origin that users should connect to.
The docs helper also falls back to `APP_BASE_URL` if the public variable is not
set, but Docker builds should pass both values so `next build` bakes the
correct URLs into generated docs. For local development that is usually
`http://localhost:4000`.

At startup, the app automatically:

- Downloads the API dump from `API_JSON_URL`
- Regenerates API entities + API reference docs

If `API_JSON_URL` still points at the same version and the generated outputs are
already present, bootstrap skips regeneration. The Meilisearch indexer also
skips re-indexing and re-embedding when the generated entities and embedder
configuration are unchanged.

5. Index documents into Meilisearch (if you use Meilisearch search):

```bash
bun run api:index --reset
```

To use Chutes instead of OpenAI for hybrid embeddings, set
`MEILI_EMBEDDER_PROVIDER=chutes`, `CHUTES_API_KEY`, and
`CHUTES_API_BASE_URL`, then re-run the indexer so Meilisearch rebuilds
embeddings with the new provider.

If you hit `EMFILE: too many open files, watch` while developing with a fully generated API tree, increase your file descriptor limit before running dev:

```bash
ulimit -n 65536
```

## API Service Layer

- `GET /api/search` for the site search dialog
- `GET /api/v1/tools`
- `POST /api/v1/tools/:toolName`
- `GET|POST /api/v1/search`
- `GET|POST /api/v1/mcp`
- `GET /api/v1/mcpb`
- `GET /api/v1/claude-desktop-config`
- `GET /api/v1/entities/:id`
- `GET /api/v1/entities/:id/signature`

## Generation Outputs

- Docs (optional MDX output): `content/api-generated/...`
- Entities: `data/api/entities/latest.json`

The documentation toolchain is exposed as a standardized SDK-style toolset:
`search_docs`, `resolve_symbol`, `get_symbol`, `get_type_members`,
`get_method_details`, `get_examples`, and `list_namespaces`.

## Docker Deployment

From the repository root:

```bash
docker compose up -d --build
```

This starts:

- `fumadocs` on `http://localhost:4000`
- `meilisearch` on `http://localhost:7700`
- `fumadocs-indexer`, which rebuilds the Meilisearch index in the background
  after `fumadocs` has started and become healthy

If those ports are already used, override them:

```bash
FUMADOCS_PORT=4400 MEILI_PORT=7710 docker compose up -d --build
```

With that override, the app is available on `http://localhost:4400`.

To manually rerun API indexing after deployment:

```bash
docker compose up --build fumadocs-indexer
```

The `fumadocs` service startup automatically downloads `API_JSON_URL` and regenerates API docs/entities before serving traffic. Regeneration is also triggered on redeploy when the repository example scraper inputs change, including updates to `data/api/example-repositories.json` and changes to the repository scraping scripts. During Docker deployment, the separate `fumadocs-indexer` job waits for the app to become healthy, then reuses the generated entities from the shared Docker volume and rebuilds the Meilisearch index only when the API version or embedder settings changed.
