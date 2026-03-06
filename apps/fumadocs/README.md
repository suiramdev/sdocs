# Fumadocs API Platform

This app serves generated C# API docs with Meilisearch-backed natural language search and AI retrieval routes.

## Local Setup

1. Start Meilisearch:

```bash
bun run meilisearch
```

Or with Docker directly:

```bash
docker compose -f infra/meilisearch/docker-compose.yml up -d
```

2. Copy environment defaults:

```bash
cp .env.example .env.local
```

3. (Optional) Generate docs + normalized index docs manually:

```bash
bun run api:generate --input /Users/nouchetm/Downloads/2026-03-02-20-41-10.zip.json
```

4. Start the app:

```bash
bun run start
```

At startup, the app automatically:

- Downloads the API dump from `API_JSON_URL`
- Regenerates API entities + API reference docs

5. Index documents into Meilisearch (if you use Meilisearch search):

```bash
bun run api:index --reset
```

To use Chutes instead of OpenAI for grounded answers and hybrid embeddings,
set `API_RAG_PROVIDER=chutes`, `MEILI_EMBEDDER_PROVIDER=chutes`,
`CHUTES_API_KEY`, `CHUTES_API_BASE_URL`, and a valid `API_RAG_MODEL`, then
re-run the indexer so Meilisearch rebuilds embeddings with the new provider.

If you hit `EMFILE: too many open files, watch` while developing with a fully generated API tree, increase your file descriptor limit before running dev:

```bash
ulimit -n 65536
```

For development with hot reload:

```bash
bun run dev
```

## API Service Layer

- `GET|POST /api/search`
- `GET|POST /api/api/search`
- `GET|POST /api/sbox/search`
- `GET /api/api/describe`
- `GET /api/api/get-signature`
- `GET /api/api/tools/definitions`
- `POST /api/api/tools/search-api`
- `POST /api/api/tools/search-sbox-docs`
- `POST /api/api/ask`

## Generation Outputs

- Docs (optional MDX output): `content/api-generated/...`
- Entities: `data/api/entities/latest.json`

All AI answers should be grounded in search results and return exact indexed signatures.

## Docker Deployment

From the repository root:

```bash
docker compose up -d --build
```

This starts:

- `fumadocs` on `http://localhost:4000`
- `meilisearch` on `http://localhost:7700`
- `fumadocs-indexer`, which bootstraps `API_JSON_URL` and rebuilds the
  Meilisearch index before `fumadocs` starts

If those ports are already used, override them:

```bash
FUMADOCS_PORT=4400 MEILI_PORT=7710 docker compose up -d --build
```

To manually rerun API indexing after deployment:

```bash
docker compose up --build fumadocs-indexer
```

The `fumadocs` service startup automatically downloads `API_JSON_URL` and regenerates API docs/entities before serving traffic. During Docker deployment, the separate `fumadocs-indexer` job also bootstraps the same API dump and resets the Meilisearch index so search stays aligned with the deployed API snapshot.
