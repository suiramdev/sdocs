---
name: search-sdk
description: "Use the SDK abstraction routes and tool schemas to retrieve exact SDK entities and signatures for RAG workflows."
---

# search_sdk

Use this skill when you need grounded SDK retrieval.

## Tool Definition

- Name: `search_sdk`
- Schema: `/apps/fumadocs/data/sdk/tools/search_sdk.json`
- Executor route: `POST /api/sdk/tools/search-sdk`
- Underlying abstraction: `GET|POST /api/search` and `GET|POST /api/sdk/search`

## Reliability Rules

- Never invent APIs not returned by search results.
- Preserve signatures exactly as `signature`/`sourceSignature` from results.
- If top results are ambiguous, ask for namespace/class/parameter refinement.

## Companion Routes

- `GET /api/sdk/describe?id=<id>`
- `GET /api/sdk/get-signature?id=<id>`
- `POST /api/sdk/ask` for retrieval-grounded Q&A.
