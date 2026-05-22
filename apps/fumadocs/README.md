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

Server-side MCP analytics use the same Umami site by default. Set
`UMAMI_WEBSITE_ID` and `UMAMI_HOST_URL` if the server should use separate
values from the browser script. MCP events are sent as `mcp_request` and
`mcp_tool_call`, including the MCP method, tool name, transport, latency,
success state, client user agent, and non-sensitive input metadata such as
query length or target kind. Set `UMAMI_MCP_ID_SALT` to add a stable hashed
`actor_id` for repeat MCP callers without storing raw IP addresses.

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

By default `API_SCHEMA_PAGE_URL` is `https://sbox.game/api/schema`, where s&box
publishes the latest staging API schema. Set `API_JSON_URL` only when you need
to pin a known schema JSON URL or temporarily work around an upstream download
page issue. Bootstrap renders the schema page with Chromium and reads the
rendered download link. Set `API_SCHEMA_BROWSER_EXECUTABLE_PATH` to use a
non-default Chromium path. If the resolved schema fingerprint still matches the
generated outputs, bootstrap skips regeneration. The Meilisearch indexer also
skips re-indexing and re-embedding when the generated entities and embedder
configuration are unchanged.

5. Sync the latest API docs and index state:

```bash
bun run api:sync
```

To use Chutes instead of OpenAI for hybrid embeddings, set
`MEILI_EMBEDDER_PROVIDER=chutes`, `CHUTES_API_KEY`, and
`CHUTES_API_BASE_URL`, then re-run the sync job so Meilisearch rebuilds
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
`search_docs` for discovery across guides and API symbols, `search_tutorials`
for community learn content mirrored from `sbox.game/learn`, then `read_doc`
for iterative deep reads on returned handles and references across
`docs://type/...`, `docs://member/...`, `docs://guide/...`, and
`docs://tutorial/...`.

## Docker Deployment

From the repository root:

```bash
docker compose up -d --build
```

This starts:

- `fumadocs` on `http://localhost:4000`
- `meilisearch` on `http://localhost:7700`
- `fumadocs-indexer`, a one-shot sync job that bootstraps API docs/entities and
  rebuilds the Meilisearch index in the shared Docker volumes
- `fumadocs-schema-refresher`, which periodically checks the latest schema,
  regenerates API docs/entities when it changes, and refreshes the Meilisearch
  index only when needed

If those ports are already used, override them:

```bash
FUMADOCS_PORT=4400 MEILI_PORT=7710 docker compose up -d --build
```

With that override, the app is available on `http://localhost:4400`.

To manually rerun the bootstrap + indexing sync job after deployment:

```bash
docker compose up --build fumadocs-indexer
```

The `fumadocs` service now starts HTTP immediately and does not block on API
bootstrap. Initial generation and re-indexing run in the separate
`fumadocs-indexer` sync job, which reuses the shared generated-asset volumes and
skips work when the API version, scraper inputs, or embedder settings have not
changed. That removes long schema/bootstrap work from the web container health
path and avoids false unhealthy deploys while the sync work is still running.

Long-running Docker deployments also run `fumadocs-schema-refresher`. It shares
the generated docs/entities volumes, runs the same `api:sync` pipeline behind a
filesystem lock after each `API_SCHEMA_CHECK_INTERVAL_SECONDS` sleep interval.
The default interval is `3600`.
Use `API_JSON_URL` as an explicit override only when you need to pin a specific
schema JSON artifact; otherwise leave it unset so the latest schema is resolved
automatically.

Community tutorials are pulled from the upstream
`coffeegrind123/sbox-learn-docs` mirror at request time. Tutorial search and
relation indexes are cached by the latest upstream commit SHA, so any new
mirror commit automatically invalidates the in-memory tutorial corpus, rebuilds
its search index, and refreshes API/guide/tutorial backlinks without a manual
sync step in this repo.

For platform deployments such as Dokploy, prefer the dedicated health endpoint
`/api/health` instead of `/`. The home page redirects to `/docs/get-started`,
while `/api/health` returns a plain `200 OK` JSON response and avoids false
negatives in health probes. The runtime also honors `PORT` when the platform
injects it.
