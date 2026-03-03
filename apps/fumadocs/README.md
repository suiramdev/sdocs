# Fumadocs SDK Platform

This app serves generated C# SDK docs with Meilisearch-backed natural language search and AI retrieval routes.

## Local Setup

1. Start Meilisearch:

```bash
docker compose -f infra/meilisearch/docker-compose.yml up -d
```

2. Copy environment defaults:

```bash
cp .env.example .env.local
```

3. Generate docs + normalized index docs (latest only):

```bash
bun run sdk:generate --input /Users/nouchetm/Downloads/2026-03-02-20-41-10.zip.json
```

4. Index documents into Meilisearch:

```bash
bun run sdk:index --reset
```

5. Run the app:

```bash
bun run dev
```

If you hit `EMFILE: too many open files, watch` while developing with a fully generated SDK tree, increase your file descriptor limit before running dev:

```bash
ulimit -n 65536
```

## SDK Service Layer

- `GET|POST /api/search`
- `GET|POST /api/sdk/search`
- `GET /api/sdk/describe`
- `GET /api/sdk/get-signature`
- `GET /api/sdk/tools/definitions`
- `POST /api/sdk/tools/search-sdk`
- `POST /api/sdk/ask`

## Generation Outputs

- Docs (optional MDX output): `content/sdk-generated/...`
- Entities: `data/sdk/entities/latest.json`

All AI answers should be grounded in search results and return exact indexed signatures.
