# Fumadocs API Platform

This app serves generated C# API docs with Meilisearch-backed natural language search and AI retrieval routes.

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
bun run api:generate --input /Users/nouchetm/Downloads/2026-03-02-20-41-10.zip.json
```

4. Index documents into Meilisearch:

```bash
bun run api:index --reset
```

5. Run the app:

```bash
bun run dev
```

If you hit `EMFILE: too many open files, watch` while developing with a fully generated API tree, increase your file descriptor limit before running dev:

```bash
ulimit -n 65536
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
