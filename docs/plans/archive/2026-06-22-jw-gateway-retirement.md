> ⛔ **NOT THE CURRENT PLAN.** The ONE current plan is `just-llm-runner/docs/plans/2026-06-28-MASTER-PLAN.md` — everything is folded in there (✅ done + ⬜ outstanding, full detail). This doc is kept as **historical background only** (past plan / design / research / evidence). Read it for context; **plan from the master.**

# JW LLM-gateway retirement (#5) — migrate consumers to the shared stack, then delete `api/llm.py`

Goal: remove the legacy server-side gateway `server/justwrite_server/api/llm.py`
(`/v1/llm/*`) and the renderer client `services/openai-compat.js` (+ the dead
`services/providerBackend.js`), moving every consumer onto the shared
`just-llm-runner` endpoints. This finishes the AI-stack convergence backend.

## Consumers of the old gateway (renderer)
- `services/aiStream.js` — streaming writer actions (writerAI) — **chat**.
- `services/rag/chat.js` — manuscript "Ask the book" — **chat + embeddings**.
- `services/rag/characterChat.js` — talk-to-a-character — **chat + embeddings**.
- `services/rag/indexer.js` — RAG index build — **embeddings**.
- `composables/useModelList.js` — model discovery — **models**.
- `stores/ai.js` — provider **ping** + registry glue.
- `services/usageApi.js`, `main.js` — incidental refs.

## Shared replacements
- chat → `POST /v1/ai/stream` (`make_feature_router`, server builds the prompt
  from the `feature_prompts` DB + `variables`).
- embeddings → `POST /v1/ai/embeddings` (registry adapter `embed()`).
- models → `GET /v1/llm-providers/{id}/models` + `POST /v1/llm-providers/probe-models`.
- ping → `POST /v1/llm-providers/{id}/ping`.

## Phases
1. ✅ **Shared embeddings backend** (just-llm-runner) — `embed()` on the adapter
   contract + `OpenAICompatAdapter` (`/embeddings`) + `OllamaAdapter`
   (`/api/embed` w/ legacy fallback) + `POST /v1/ai/embeddings` + tests. The
   keystone the gateway-delete needs (the shared stack had no embeddings).
2. ⬜ **Model-discovery + ping → shared** (renderer, low-risk; endpoints already
   exist). Repoint `useModelList` at `/v1/llm-providers/{id}/models` (+
   `probe-models` for drafts) and `ai.ping` at `/v1/llm-providers/{id}/ping`.
   Drop `OpenAICompatClient.enrichedModels/ping` usage.
3. ⬜ **RAG embeddings → shared** (renderer, medium). `indexer.js` / `chat.js` /
   `characterChat.js` embed calls → `POST /v1/ai/embeddings` with the routing
   default embedding `providerId` + model. Remove the embed half of
   `openai-compat.js`.
4. ⬜ **Streaming chat → `/v1/ai/stream`** (renderer, HARD — the bulk). writerAI
   (`aiStream.js`), manuscript chat (`rag/chat.js`), character chat
   (`rag/characterChat.js`) currently build prompts CLIENT-side; move that into
   the server `feature_prompts` templates and have the client send `{action,
   variables}`. Per-feature: ensure the prompt is seeded (`seed_feature_prompts`),
   map the client's context assembly (writerAI voice-canon, RAG retrieved chunks)
   to template variables, and switch the client to `requestStream`.
5. ⬜ **Delete the gateway** — once 2–4 land: remove `api/llm.py` + its mount in
   `app.py`, delete `services/openai-compat.js` + `services/providerBackend.js` +
   `services/aiStream.js`, and the `stores/ai.js` dead `applyQuickSetupPreset` /
   `quickSetupTiers`. Verify: pytest + ruff + headless smoke.

## Risk / sequencing
Phases 2–3 are low/medium risk (isolated). Phase 4 is the risky one (live writer
actions + chat); do it feature-by-feature, verifying each against the same
prompt the client built before. Keep the gateway mounted until phase 5 so a
half-migrated state still works.
