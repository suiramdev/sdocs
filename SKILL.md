---
name: sbox
description: "Use SDK abstraction routes and tool schemas to retrieve exact SDK entities/signatures, including s&box gameplay/modding APIs."
---

# search_sdk

Use this skill when you need grounded SDK retrieval.

## Tool Definition

- Name: `search_sdk`
- Schema: `apps/fumadocs/data/sdk/tools/search_sdk.json`
- Executor route: `POST /api/sdk/tools/search-sdk`
- Underlying abstraction: `GET|POST /api/search` and `GET|POST /api/sdk/search`

## s&box Modding Search

For s&box gameplay/entity/system tasks, prefer the s&box-specific retrieval
tool and endpoint:

- Name: `search_sbox_docs`
- Schema: `apps/fumadocs/data/sdk/tools/search_sbox_docs.json`
- Executor route: `POST /api/sdk/tools/search-sbox-docs`
- Underlying abstraction: `GET|POST /api/sbox/search`

## Reliability Rules

- Never invent APIs not returned by search results.
- Preserve signatures exactly as `signature`/`sourceSignature` from results.
- If top results are ambiguous, ask for namespace/class/parameter refinement.
- For gameplay or mod code, always query docs before proposing or writing code.
- Prefer `search_sbox_docs` results when they are available because they include
  `methodName`, `description`, `parameters`, `returnType`, and `exampleUsage`.

## Companion Routes

- `GET /api/sdk/describe?id=<id>`
- `GET /api/sdk/get-signature?id=<id>`
- `POST /api/sdk/ask` for retrieval-grounded Q&A.
