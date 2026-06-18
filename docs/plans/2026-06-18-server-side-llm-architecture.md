# Server-side LLM architecture — JW + JV symmetry (decision)

**2026-06-18.** Settled in conversation after several wrong turns on my part.
This is the authoritative model; read it before touching the AI/LLM/provider
path in either app.

## The one rule

**Calls run server-side; the client is a GUI that hits the server API.** A
desktop renderer and a future phone app are both just clients. The server
hosts/runs (or routes to) the models. This is why the APIs are shaped the way
they are — so a thin phone client works with zero extra logic.

Earlier I claimed "JW is client-side, JV is server-side, they're different."
**That was wrong.** Both apps run models server-side; only the *catalog* of
what they can run differs.

## The shared mechanism (both apps)

```
query catalog ─▶ choose ─▶ load on demand (download if needed) ─▶ use
  (available +     (GUI)     ("built-in" = in the catalog,         (server runs it,
   downloaded/                 NOT pre-installed)                    client sends text+params)
   running)
```

- **"Built-in" ≠ pre-installed.** It means "in the catalog you may pick from."
  Selecting one triggers the download/load. (Exactly how the llm-runner
  manifest already works: it lists available models; you pick; it downloads.)
- The **common `just-llm-runner`** is the shared, server-side LLM engine for
  **both** apps. It already has the lifecycle internally (`acquire_binary`,
  `acquire_model`, `compute_fit`, `start_runner` → spawns llama-server,
  OpenAI-compatible, with OOM back-off). Today only `manifest` + `hardware`
  are exposed; load/status/stop get added.

## What each app is

- **JustWrite = pure writing app.** LLM + embeddings only (chat / RAG /
  writing assists), run server-side via the common runner or proxied to a
  cloud key held on the server. **No audio at all** — the Studio
  (Cast/Script/Render), `render.js`, `m4b.js`, audio/`.m4b` export, and every
  TTS provider are being **removed** from JW. When a user wants an audiobook,
  JW hands the manuscript + cast to **JV over the HTTP contract**.
- **JustVoice = voice production.** Same shared runner for its LLM work, **plus**
  its own voice-engine catalog (TTS — same query→choose→load→use shape) + the
  audio pipeline (in-process PyTorch/ONNX engines, mastering, effects, export).
  Audio lives **only** here. JV is also a headless backend other programs
  (Unreal, MCP) consume — which is *why* its calls are server-side, not because
  the work couldn't be client-side (JW's old Studio proved it could).

**The only real difference: JW has no audio; JV is the audio app.** The LLM
mechanism is identical and shared.

## The pieces (this is what gets built)

1. **Runner lifecycle endpoints** (shared `just-llm-runner`, both apps inherit):
   `POST /v1/llm-runner/load {modelId}` · `GET /v1/llm-runner/status` ·
   `POST /v1/llm-runner/stop` — wrap the existing `acquire_*`/`start_runner`.
   Plus `GET /v1/llm-runner/manifest` (available) + `/hardware` (already shipped).
2. **Server LLM gateway** (per app, JW first): `POST /v1/llm/{providerId}/chat/
   completions` + `/embeddings` — the server is the LLM client. Looks the
   provider up in the server's provider list; for the local runner it routes to
   the running llama-server, for a cloud provider it proxies to its baseUrl with
   the **server-held key**; streams SSE straight back. The renderer sends the
   provider id + an OpenAI body and **never holds keys or calls providers
   directly.**
3. **Provider list = server table** (`/v1/llm-providers`, done in P5) — the
   gateway routes off it. JW's list is **LLM + embedding only** (TTS providers
   stripped from the seed).
4. **Renderer → gateway**: `OpenAICompatClient` points at `/v1/llm/{id}` on the
   JW server instead of the provider directly. Same for RAG embedding.
5. **JW audio removal**: delete Studio view + `render.js`/`m4b.js` + studio
   store + TTS providers + audio export.

## Sandbox-verification honesty

The runner's *actual* binary/GGUF download + llama-server spawn can't run in
this container (no GPU, network policy, no model). Those paths are built on the
existing runner functions and unit-tested via the runner's injection points
(`_popen`/`_health`); the gateway's routing + key injection + streaming are
tested with a mock provider. Full model-download E2E is deferred to a real
machine and called out as such — not faked green.
