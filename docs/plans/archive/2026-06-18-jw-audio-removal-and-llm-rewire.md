> ⛔ **NOT THE CURRENT PLAN.** The ONE current plan is `just-llm-runner/docs/plans/2026-06-28-MASTER-PLAN.md` — everything is folded in there (✅ done + ⬜ outstanding, full detail). This doc is kept as **historical background only** (past plan / design / research / evidence). Read it for context; **plan from the master.**

# JW audio removal + renderer→gateway rewire (execution plan)

## Status (2026-06-18, admiring-galileo)

- **A — audio pipeline: DONE + verified** (commit `32a53b4`, −7097 lines).
  Deleted StudioView, SpeakerLabView, render/m4b/audioStore/tts/elevenlabs/
  speechify/voicebox/voiceGender services, the studio store, and the speaker-
  analysis/smart-cast LLM service (llm.js/speakerAttribution.js). Writing views
  degraded to the explicit scene→character links; Export drops M4B (keeps PDF/
  DOCX/EPUB) and the JustVoice handoff sends prose for JV to self-analyze.
  /studio + /speaker-lab routes + the SettingsView audio sections removed.
  build:vite clean; book-smoke + 25-route sweep pass, zero JS errors; all
  TTS-backend probes gone.
- **A — TTS provider list + Settings UI + nav: DONE + verified** (commits
  `8c054c9`, `f321848`). Seed `DEFAULT_PROVIDERS` is LLM/embedding-only; dead
  seed exports removed; SettingsView TTS UI (Voicebox card + lifecycle, default-
  TTS dropdown, voice-gender, render-preset/speaker-correction/production-config
  sections, Chatterbox/Dia/Edge notes) removed; Sidebar Audio/Speaker-Lab + the
  CommandPalette Studio command removed. build:vite clean; 25-route sweep zero
  JS errors. **All user-visible audio is gone.**
- **A — provider-EDITOR de-TTS + internal dead code: DONE + verified** (commit
  `3d548c3`, −1590 lines). `SettingsProviderForm` (kind selector + TTS model/
  voices/engine-params/voice-discovery fields gone; LLM+embedding fields always
  render), the TTS half of `openai-compat.js` (speech/voices/Chatterbox/Dia/
  CosyVoice/Speechmatics/Edge detectors + control-plane deleted), deleted
  `domain/providerParams.js`, the `ai` store TTS getters **and** the dead
  speaker-analysis/smart-cast lab-preset infra, `ProviderSelect`'s `kind==="tts"`
  branch, the SettingsView TTS provider-row fields + TTS bucketing/icons + the
  dead Speaker-Lab debug tool (its `/speaker-lab` route is gone) + stale TTS
  copy, ImportView's "Narrate as audiobook" intent (→ deleted Studio), the dead
  audio/voicebox/tts(edge) tauri-bridge methods, dead quickSetup feature keys,
  and dead TTS/studio/speakerLab i18n keys. **Verified:** build:vite clean;
  24-route sweep zero JS errors; provider editor **driven** (Add+Edit) shows
  LLM/embedding fields, zero TTS surface, save+edit work, zero JS errors; server
  pytest 41 pass.
- **A — (superseded note) TTS provider config plumbing: REMAINING.** The provider *list* still
  carries TTS entries (seed `DEFAULT_PROVIDERS`) and the config UI still has TTS
  surfaces, woven through `SettingsView`, `SettingsProviderForm`,
  `ProviderSelect`, `domain/providerParams.js`, the `ai` store TTS getters
  (`ttsProviders`/`defaultTtsId`/`useLlmVoiceGender`), and the TTS half of
  `openai-compat.js` (now dead). Plus dead nav links (CommandPalette `nav:studio`,
  sidebar Studio/Speaker-Lab). Removing these is mechanical but spans several big
  views — left as a focused next pass so it doesn't break the writing settings UI
  unverified. The app is coherent + working with them present (configurable but
  unused TTS fields). Dead seed exports DEFAULT_CAST/STARTER_RENDER_PRESETS/
  SCRIPT_CH7/RENDER_QUEUE have zero consumers and can go with it.
- **B — renderer→gateway rewire: DONE + verified (via mock upstreams).** The
  gateway gained provider-type-aware routing: Ollama providers translate to
  `/api/chat` (NDJSON→OpenAI-SSE, `think` lifted top-level, num_ctx 8192) +
  `/api/embed`; model discovery (LM Studio quant/state, `/v1/models`, Ollama
  `/api/tags`) moved server-side; a `POST /v1/llm/probe/models` endpoint serves
  the editor's UNSAVED-draft "Fetch models" (config in the body — no by-id row
  needed); a `GET /v1/llm/{id}/ping` does a real upstream reachability probe.
  `openai-compat.js` is now a thin gateway client (`/v1/llm/{id}/…`, no client
  key, one SSE parser; `probeModels` export for the editor). **Verified:** 13
  gateway pytest (Ollama translate/stream/embed, enrichment LM-Studio/OpenAI/
  tags, probe, ping, key injection) + an end-to-end harness driving the real
  renderer client → gateway → mock OpenAI **and** mock Ollama upstreams (chat
  stream "Hello world"/"Ollama!", usage normalized, embeddings, probe + by-id
  model lists, zero JS errors); build:vite + 24-route sweep clean. **Residual
  real-machine gap** (model behavior, not our code): whether a real Ollama
  honors `think:false` and real LM Studio quant field names — confirm on a box
  with those servers.

---


**2026-06-18.** The server-side architecture is built + verified (gateway,
provider list, runner lifecycle, decision doc). These two renderer-surgery
items finish realizing it in the running app. Both are scoped here precisely
because their **correctness needs runtime verification this sandbox can't give**
(no real LLM/TTS/GPU, no desktop shell) and both entangle with the core writing
app — executing them blind is the rushed-and-broken failure mode. Do them on a
real machine with the checks below.

## A. Remove all audio from JustWrite

JW becomes writing-only; JV owns all audio (JW drives JV via the contract).

**Delete outright** (pure audio/TTS, no writing use):
- Views/components: `views/StudioView.vue`, `components/RenderLabPanel.vue`,
  `components/RenderPresetsCard.vue`, `components/VoiceParamsModal.vue`.
- Services: `services/render.js`, `services/m4b.js`, `services/audioStore.js`,
  `services/tts.js`, `services/elevenlabs.js`, `services/speechify.js`,
  `services/voicebox.js`, `services/webSpeech.js`, `services/voiceGender.js`,
  `services/voiceFingerprint.js` (voice-canon fingerprint is audio-casting, not
  prose — confirm no writing-assist consumer first).
- `stores/studio.js` (cast / scripts / chapterAudio / render queue).

**Edit to remove audio refs:**
- `router/index.js` — drop the `/studio` route (+ any `/speaker-lab` audio bits;
  keep SpeakerLab only if its speaker data serves writing — see entanglement).
- `domain/seed.js` — remove every TTS provider from `DEFAULT_PROVIDERS`
  (kokoro, chatterbox, dia, edgeTts, voicebox, qwen3-tts, cosyvoice-3,
  elevenlabs, speechify, speechmatics) + `DEFAULT_CAST` / `STARTER_RENDER_PRESETS`
  / `SCRIPT_CH7` / `RENDER_QUEUE`. Keep LLM/embedding providers only.
- `domain/providerParams.js` — drop TTS knob tables.
- `stores/ai.js` — remove `ttsProvider`/`ttsProviders`/`readyTtsProviders`
  getters, `defaultTtsId`, `useLlmVoiceGender`; keep LLM/embedding.
- `services/openai-compat.js` — delete the TTS half (`speech`, all
  `_*Speech`, `voices`, `_*Voices`, `*SetModel`, `*ModelInfo`,
  `diaModelRegistry`, the `is*`/`*_MODELS`/`*_KNOBS` consts); keep chat/
  chatStream/ollama/models/enrichedModels/embed/ping (→ §B).
- `views/ExportView.vue` — remove the M4B/audio export; keep PDF/DOCX/EPUB.
- `views/SettingsView.vue` + `SettingsProviderForm.vue` — remove TTS provider
  rows/sections + the embedding/voice-gender toggles tied to audio.
- `components/CommandPalette.vue`, `components/ProviderSelect.vue` — drop
  Studio/TTS entries.

**Entanglement to resolve (the risk):** `studio.speakersByChapter` (derived from
LLM speaker analysis) is consumed by **Search** (folds speakers into chapter
body), **Outline** (speaker chips), **Analysis** (cast-presence heatmap), and
ChaptersView. Speaker *analysis* is a writing aid; speaker *casting/rendering*
is audio. Decision: keep a slim **`speakers` store** (per-chapter speaker sets
from the LLM Script analysis) for the writing views; move it out of `studio.js`
before deleting that store. Audit `AnalysisView`/`SearchView`/`ChaptersView`/
`SpeakerLabView` line-by-line and repoint them at the slim store.

**Verify (real machine):** `npm run build:vite` + the 27-route headless sweep
(zero JS errors, no `/studio`), `cargo check` in `src-tauri`, and manual: Search
speaker fold, Outline chips, Analysis heatmap still correct; Export produces
PDF/DOCX/EPUB; no dangling imports.

## B. Renderer → server LLM gateway

After §A the client (`openai-compat.js`) is LLM-only. Route its calls through
the gateway (`/v1/llm/{providerId}/...` on the JW server) so the server makes
the calls and holds the keys.

- `chat` / `chatStream` / `embed` / `models` / `enrichedModels`: target
  `serverUrl('/v1/llm/' + provider.id + '/...')`, **drop the client-side
  `Authorization`** (the gateway injects the server-held key). The provider id
  travels in the path; the body stays an OpenAI body.
- **Ollama `think:false` quirk:** the native `/api/chat` path can't go through
  the generic OpenAI proxy. Options: (1) teach the gateway provider-type-aware
  routing (proxy Ollama to `/api/chat`, lifting `think`), or (2) accept OpenAI-
  shape for Ollama (lose `think:false`; reasoning models stream a `reasoning`
  field). Pick (1) for parity — small server addition mirroring the renderer's
  `_buildOllamaBody`.
- `ping`: hit `GET /v1/llm/{id}/models` through the gateway (or a dedicated
  `/v1/llm/{id}/ping`).
- Keep the Tauri-bridge fetch wrapper for any remaining direct calls; gateway
  calls are same-origin to the JW server so they don't need it.

**Verify (real machine):** with a real provider configured (a cloud key or the
built-in runner), confirm Ask-the-book + character chat stream through
`/v1/llm/...` (server logs show the proxied call, no key in the renderer
request), RAG embedding builds an index, and Settings "fetch models" works.
`build:vite` + sweep only prove it compiles/boots — they cannot prove the call
path, which is why this is real-machine-gated.

## Update — both executed + verified (2026-06-18, admiring-galileo)
Both shipped. The verification gap the original scoping worried about was
closed by standing the stack up in-sandbox: `justwrite-server serve` (:17495)
+ `npm run dev:vite` (:1420) + Playwright/Chromium, driving the **real**
renderer against **mock upstreams** (an OpenAI-shaped server and an
Ollama-shaped server) — which exercises every line of our own code (gateway
routing/translation/enrichment + the renderer's SSE parse), not just a
build/sweep. What genuinely can't be reproduced without the real servers is
model *behavior* (does Ollama honor `think:false`; exact LM Studio quant field
names) — that residual is noted in the status above, and the porting matched
the renderer's previously-validated logic line-for-line.
