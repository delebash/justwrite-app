# Engines → shared `llm-ui` cutover boundary (2026-06-20)

The **boundary map** the user asked for before any Phase-2 component build:
which provider/model surfaces move into the shared adapter-driven
`@delebash/llm-ui` consolidated view, and which stay native per app. Companion
to `2026-06-16-thread3-phase2-llm-ui.md` (the contract + adapters, mostly done);
this doc is the cutover decision layer. **Same file committed in both repos.**

Scope spans **both apps** (the components are shared):
- **JustVoice** — `views/EnginesView.vue` (+ `components/ProviderForm.vue`,
  `components/RecommendCard.vue`).
- **JustWrite** — `views/SettingsView.vue` "AI engines" section (+
  `views/SettingsProviderForm.vue`, `components/ProviderSelect.vue`,
  `components/ModelPicker.vue`, `stores/ai.js`).

---

## Grounding (read 2026-06-20, file:line — not from memory)

**Shared target — `just-llm-runner/ui` (`@delebash/llm-ui`):**
- Contract `ui/src/types.ts`: `Provider`, `ProviderDraft`, `FeaturePin`,
  `UsageRow`, `ModelEntry`, `DetectedLocalProvider`, `PingResult`, `TierKey`.
  **LLM + embedding only — "TTS lives in JustVoice, never in a provider here"**
  (types.ts header).
- `ui/src/adapters/ProviderBackend.ts`: 12-method adapter interface
  (list/add/update/remove, ping, fetchModels, detectLocal, classifyTier, usage,
  featurePins, setFeaturePin). Components never `fetch` directly.
- Components **TO BUILD** (P2.3): `LlmProviderForm`, `ModelPicker`,
  `ProviderSelect`, `QuickSetup`, `RecommendCard`, `UsageView`,
  `RunnerStatus`[new], `DownloadStrip`.

**Runner API — `just-llm-runner/llm_runner/api.py` (mountable router):**
`/v1/llm-runner/manifest`, `/hardware`, `/load` (download+spawn in ONE call,
`:48`), `/status` (`:56`), `/stop` (`:61`). Download progress is reported via
**`/status` polling**, NOT a `/v1/jobs/{id}` job. Core: `hardware/binary/
download/models/gguf/runner/lifecycle/manifest/schema.py`.

**JustVoice provider surface:**
- `EnginesView.vue` Online tab — `allProviders` merge `:990-1035`,
  `testProviderRow` `:1040-1064`, provider rows + Test/Edit `:1343-1378`, Add
  `:1316`, inline `ProviderForm` `:1335-1377`.
- `EnginesView.vue` Local tab — top tabs `:1084-1093`; hardware card
  `:1109-1120`; "Loaded now" rail (tts/stt/llm slots) `:1122-1137`; capability
  sections (`sectionData`, tts/stt/llm/embedding) `:1144-1293`; **TTS install/
  download strip `.jv-install-strip` `:1226-1281`**; shared-runtime note
  `:1302-1305`.
- `ProviderForm.vue` (585 ln) — LLM+embedding **AND TTS**: capability checkboxes
  `:343-346`, LLM row `:356-403`, **TTS row (model/voices/response_format)
  `:406-449`, voice chips `:453-462`**, presets `:58-65`, self-hosted toggle
  `:336-342`, hint band `:96-114/:350-354`, in-form Test `:243-279`. **No tier
  picker. No i18n.**
- `RecommendCard.vue` — suggests a **TTS engine** (Chatterbox) `:48-53` AND a
  detected **local LLM** `:40-42`. Mixed.

**JustWrite provider surface:**
- `SettingsView.vue` "AI engines" — `startNew` `:1082` (i18n key still
  `settings.audio.addProvider` — stale namespace), provider rows Test `:1192` /
  Edit `:1193`; `startEdit` `:316`, `addProvider` `:338`, `pingProvider` `:348`;
  **feature-pin UI (provider+model per feature) `:68-142`**.
- `SettingsProviderForm.vue` (179 ln) — LLM+embedding **only** (no audio; filters
  tts/whisper/speech out of the chat list `:47-50`). **Has a tier picker**
  (`JwSegmented` auto/pinned + clear, `:146-161`). i18n throughout. `openai-compat`
  / `ollama` only.
- `ProviderSelect.vue` (51) + `ModelPicker.vue` (58) — already extracted, enriched
  (quant/state labels via `modelMeta`), adapter-ready.
- `services/providerBackend.js` (67) — a **storage cache** (`/v1/llm-providers`
  GET/PUT, sync-read + debounced write), **NOT** the llm-ui `ProviderBackend`
  adapter. ⇒ **T3.4 (JW Pinia adapter) is genuinely still open.**
- `stores/ai.js` (411) — provider registry, feature pins, model tiers.

---

## Decision 1 — TTS download: SHARE the strip + progress logic, SEPARATE the catalog/fit/load  *(answers the user's question, recommended)*

The user's instinct ("it's still just downloading and managing models like the
llm runner") is right for the **download/progress** half and wrong for the
**model-management** half — they genuinely diverge:

| Layer | TTS (JustVoice engines) | LLM (just-llm-runner) | Verdict |
|---|---|---|---|
| Progress STRIP UI (phase·bytes·rate·ETA·Cancel·Dismiss) | `.jv-install-strip` `EnginesView:1226-1281` | renders `/status` | **SHARE** — `DownloadStrip`, presentational, payload-agnostic |
| Rate/ETA + poll LOGIC | `_rateFor`/poll `EnginesView:347-405` (has the rate/ETA bug) | EWMA over `/status` | **SHARE** — `useDownloadProgress` composable; **the rate/ETA bug gets fixed ONCE here** |
| Model CATALOG | per-engine variants (`size_mb`/`vram_mb` declared) | GGUF quants resolved from HF (`models.py`) | **SEPARATE** |
| FIT math | declared `vram_mb` vs detected VRAM (`fitFor`) | GGUF-header math → `-ngl`/`--n-cpu-moe` (`gguf.py`/`runner.py`) | **SEPARATE** |
| LOAD lifecycle | in-process load into a per-kind slot (`/v1/engines/{id}/load`) | spawn `llama-server` subprocess (`/v1/llm-runner/load`) | **SEPARATE** |
| Wire shape | `/v1/jobs/{id}` poll | `/v1/llm-runner/status` poll | **NORMALIZE at the adapter** (differ today) |

**Seam = the same pattern already locked for providers.** A small
download/model adapter (mirrors `ProviderBackend`): JV implements it over
`/v1/engines/*` + `/v1/jobs/*`; the runner over `/v1/llm-runner/{load,status}`.
The shared `DownloadStrip` + (later) a `ModelManager` render against it. Each
app's catalog/fit/load stays native behind the adapter.

**Why not fully separate:** duplicating the strip re-introduces the exact
rate/ETA-keyed-on-transient-object class of bug in a second place.
**Why not fully shared:** forcing TTS engine variants into the GGUF/llama-server
model is wrong — different runtimes (in-process pool vs subprocess server).

**Prereq P0:** normalize the progress shape to camelCase
`{ phase, bytesDownloaded, bytesTotal, currentFile, error }` at the adapter
boundary (the two wire shapes differ today — verified above).

## Decision 2 — `LlmProviderForm` is LLM+embedding only; JV's TTS half splits out  *(recommended)*

`ProviderForm.vue` is the only provider editor in either app that carries TTS
(`:406-462`). llm-ui is LLM+embedding by contract. So adopting the shared form
in JV requires **extracting the TTS half into a native "external TTS provider"
editor** (TTS model / voices / fetch-voices / response_format / chips), wired to
`settings.engines.external[]` as today. JW needs no such split (no audio).

---

## Boundary table — JV `EnginesView.vue`

| Surface | file:line | Verdict |
|---|---|---|
| Top tabs (Local / Online) | `:1084-1093` | **Native shell** (TTS lives under Local); Online-tab *content* → llm-ui |
| Online: provider rows + Test + Edit + Add + inline form | `:990-1064`, `:1308-1380` | **→ llm-ui** provider list + `LlmProviderForm` (via JV REST adapter, already built `services/llmBackend.js`) |
| Local: hardware card | `:1109-1120` | **Stay native** (also feeds TTS fit); may *source* GPU/VRAM from llm-ui `hardware`/`RunnerStatus` |
| Local: "Loaded now" rail (tts/stt/llm) | `:1122-1137` | **Native shell**; the LLM slot value can come from `RunnerStatus` |
| Local: TTS + STT sections (engine groups, model rows, load/unload/delete) | `:1144-1292` (tts/stt) | **Stay native** (TTS/STT engine pool) |
| Local: **LLM** section (engines-as-groups) | `sectionData` id=`llm` (`:856-890` / `:1144-1293`) | **→ llm-ui** `RunnerStatus` + `ModelPicker` + `DownloadStrip` (GGUF / llama-server) |
| Install/download strip `.jv-install-strip` | `:1226-1281` | **→ shared `DownloadStrip`** (Decision 1); **rate/ETA bug fixed here once** |
| `ProviderForm` LLM/embed half | `ProviderForm.vue:356-403` | **→ llm-ui** `LlmProviderForm` |
| `ProviderForm` TTS half | `ProviderForm.vue:343-346,406-462` | **Stay native** — new external-TTS editor (Decision 2) |
| `RecommendCard` | `RecommendCard.vue:40-53` | **Split** — local-LLM detect → llm-ui `RecommendCard`; TTS-engine (Chatterbox) suggestion stays native |
| Shared-runtime note, fit legend | `:1295-1305` | **Stay native** |

## Boundary table — JW `SettingsView.vue` "AI engines"

| Surface | file:line | Verdict |
|---|---|---|
| Provider list rows + Test + Edit + Add | `:1082`, `:1192-1193`; `startEdit:316`, `addProvider:338`, `pingProvider:348` | **→ llm-ui** provider list |
| `SettingsProviderForm` (LLM+embed **+ tier**) | `SettingsProviderForm.vue` (whole) | **→ llm-ui** `LlmProviderForm` (tier picker folds in — see Fork 4) |
| `ProviderSelect` | `ProviderSelect.vue` | **→ llm-ui** `ProviderSelect` |
| `ModelPicker` (enriched quant/state) | `ModelPicker.vue` | **→ llm-ui** `ModelPicker` |
| Feature-pin UI (provider+model per feature) | `:68-142` | **→ llm-ui** feature-pin UI (`setFeaturePin`) |
| `stores/ai.js` registry / tiers / pins | `stores/ai.js` | becomes the JW **`ProviderBackend` adapter** backing (**T3.4**) |

## Shared components (P2.3) → what each replaces

| llm-ui component | Replaces in JV | Replaces in JW |
|---|---|---|
| `LlmProviderForm` | `ProviderForm` (LLM half) | `SettingsProviderForm` |
| `ProviderSelect` | inline provider selects | `ProviderSelect` |
| `ModelPicker` | datalist combobox in `ProviderForm` | `ModelPicker` |
| `RunnerStatus`[new] | LLM section of Local tab | (new — llama-server status) |
| `DownloadStrip` | `.jv-install-strip` (TTS reuses it) | runner GGUF download |
| `RecommendCard` | LLM-detect half | (new) |
| `UsageView` | (sibling — `/v1/ai-usage`) | token/cost ledger |
| `QuickSetup` | first-run wizard | first-run wizard |

---

## Prerequisites / sequencing (before component build)

- **P0a** Normalize download-progress wire shape (camelCase) at the adapter
  boundary (Decision 1). Fix the rate/ETA bug in the shared `DownloadStrip`/
  `useDownloadProgress`, not in EnginesView.
- **P0b** Split TTS out of JV `ProviderForm` into a native external-TTS editor
  (Decision 2).
- **P0c** Fold the tier picker into the shared `LlmProviderForm` (JW has it, JV
  doesn't; the contract has `TierKey`).
- **P0d** i18n strategy for shared components (see Fork 1).
- **T3.4** Build the JW `ProviderBackend` adapter (current `providerBackend.js`
  is a storage cache, not the adapter). JV's REST adapter
  (`services/llmBackend.js`) is already done.
- Then P2.2 (`LlmProviderForm` first) → P2.3 (rest) → P2.4 (JW adopts) → P2.5
  (delete per-app source). JustVoice first each component.

## Open forks (genuine design decisions — user's call)

1. **i18n in shared components.** JW uses `$t` everywhere; JV uses plain English.
   Does llm-ui carry its own vue-i18n, or take host-supplied label maps / slots?
2. **JV external-TTS editor.** Keep a trimmed `ProviderForm` for external TTS, or
   move external-TTS-provider config under the TTS *engine* surface entirely?
3. **JV LLM section timing.** Convert JV's LLM-as-engine to the llama-server
   `RunnerStatus` model now, or keep JV's current LLM section until P1.5b
   auto-spawn lands? (Affects whether the LLM-section row in the JV table moves
   this pass or later.)
4. **Tier picker in JV.** Adopt JW's tier concept in JV too (JV has `pinned_tier`
   in data but no UI), or keep tier JW-only and make it optional in the shared
   form?

(EnginesView rate/ETA bug + dead-code findings: see
`2026-06-20-deep-audit.md` Batch 5 — the rate/ETA fix is folded into P0a here.)
