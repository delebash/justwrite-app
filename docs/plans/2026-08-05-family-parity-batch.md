# The family parity batch — THE approved plan (2026-08-05, verbatim decisions)

> **THE MASTER RECORD for the cross-app parity build.** Approved by the user
> 2026-08-05 (late session) after six think-passes + code verification; this doc
> is written so a fresh session builds from HERE with zero re-derivation. The
> tracker line pointing here lives in each repo's `docs/dev/TASKS.md`. Rule:
> read this WHOLE doc before coding any slice.
>
> **Provenance of the decisions:** every ruling below was made explicitly in
> chat. Three items rode the user's final "ok" over my presented recs and are
> marked [ok-rec]: the audio-toggle keep, and UiTable + e2e-harness staying out
> as follow-ups.

## The governing principle (user's words, now law — goes into §11)

**Same function ⇒ same kit surface and mechanism, in every app — including
JustWrite.** The DATA each app feeds the mechanism (model catalogs, presets,
prompt rows, per-app options, app-specific settings sections) is per-app BY
DESIGN. Parity of surface is mandatory; parity of content is wrong. (The
shared default catalog stays writing-curated FOR JW — user: "these are
different apps, one is a creative writing app"; JV/docgen feed their own.)

**No escape valves.** Three former "verify at build, else fall back" clauses
are commitments: (1) SettingsShell — JW+JV adopt it; if its API can't host an
app's sections, THE KIT GROWS until it can; bespoke is not an outcome. (2)
Updates — the kit UpdatesPanel is the surface in JV; the panel gains what's
missing or JV's updater conforms; bespoke card is not an outcome. (3) JW tray
localization SHIPS; feasibility only picks the mechanism (renderer-fed strings
vs Rust locale lookup), never whether. (User: "don't take the quick way out
like you did with JW adoption.")

## The decided board (all of it)

- **① Audio-in-backup toggle: KEEP** [ok-rec] — via a NEW kit per-app options
  seam on DataManagement (mechanism shared, option per-app; 50 GB audio is a
  real reason to skip audio in a backup).
- **② NO old-zip compat shim** — "not production, don't care about anything
  previous." No pre-migration safety backup step either, same ruling.
- **③ JW's full kit adoption is IN THE BATCH** (user reversed my defer-rec).
- **④ Shared default catalog UNTOUCHED today** (StyleTune/uncensored/12B/E4B
  are JW's writing data — user rejected my drop-rec) **+ APPROVED refactor**:
  the writing rows MOVE into JW's own seed (`model_catalog_extra` +
  `seed_default_model_catalog=False`, ids identical so existing JW DBs keep
  everything via insert-if-missing); the shared `DEFAULT_CATALOG` empties
  (mechanism only, no app's data); the class-tune seed moves per-app with it
  (this closes the runner-TASKS "class tunes match no model" noise item); the
  kit QuickSetup gets a DEFINED empty-catalog state ("no curated models — add
  one or connect a provider") + test, since the shared seed no longer
  guarantees non-empty.
- **⑤ The engines tab is named "Speech engines"** (it holds TTS *and* STT/
  Whisper — speaking and listening; the wizard keeps its decided name "Voice
  engine setup" because it only installs the speaking engines).
- **Sequencing frame (user's own):** this batch runs FIRST; the exhaustive
  option-2 deep read of all three apps runs AFTER the batch (his message: "all
  the stuff you have found to do BEFORE we do the deep audit").
- Copy law: **every label/description speaks outcomes in the user's words —
  internal vocabulary (tier/action/preset/row/pipeline/variant) never reaches
  the screen.** The register was approved on the 13-row drafts below.

## Slice order (the build checklist — commit per working state, JV workflows
## check before any JV push, docs updated per slice, suites per slice)

### 0. This record (done) + tracker pointers in all four repos.

### 1. KIT slice (all kit deltas land together, then every app consumes one
### stable kit state)
- **Multi host tabs** on AiModelsArea: tab array + per-tab labels + deep-link/
  default-tab (`?tab=`) + lazy mount. Single-tab `appTabLabel` API stays
  back-compatible (JW/docgen unaffected until they opt in).
- **Lab adapter seam, three parts, per feature key**: `run` override (the
  feature's Lab runs call an APP endpoint instead of /v1/ai/run), `render`
  (result component receiving ALL columns' outputs — cross-column compare/
  disagreement needs them), `configExtra` (per-column app controls, e.g.
  attribution's tier + confidence floor). Registered via installLlmUi or a
  `labAdapters` config.
- **DataManagement per-app options seam** (the include-audio toggle rides it;
  JW/docgen pass nothing and look unchanged).
- **familyContract `settingsSections` gains `backups` + `updates`** (+ JW
  en/es keys + both contract tests).
- **Guard-message fix**: `dispatch.py:225` hardcodes "Run Quick Setup
  (Settings → AI)" — "Settings → AI" exists in NO app now. Neutral wording
  ("Set up a model on the AI page") + a hook so JV's labels say "LLM engine
  setup". Update any tests pinning the string.
- **Catalog-per-app refactor** (decision ④ above): DEFAULT_CATALOG → empty;
  writing rows + class tunes move to JW's seed; empty-catalog QuickSetup
  state + test; JV/docgen's now-dead `seed_default_model_catalog=False` flags
  removed.
- Gates: runner suite; JW/docgen/JV suites + builds.

### 2. Breakages
- JW dev is DEAD: duplicate `get` import — SettingsView.vue:7 (`…, get, put`)
  + :25 (`get, post, fmtBytes, refreshRunnerModels`), both from
  @delebash/llm-ui → merge into one import. (Already tracked in JW TASKS.)
- (JV catalog slice: DONE + committed `255ee1e` — one-row 26B catalog,
  defaults suppressed + retired one-time; tests green at
  /v1/ai/model-catalog key `rows`.)

### 3. JW slice
- **Full kit adoption**: `installLlmUi` (replacing the hand-wired configure*
  calls; JW's resolver/ports), `<LlmUiHosts/>` (replacing hand-mounted
  Toast+AppDialog at App.vue:215-216), once-ever `AiSetupOffer` at JW's
  first-contact moment (its R3 semantics), AI-tasks nav row via
  `useAiTasksNav`.
- **Tray localization ships** (hardcoded-English tray in an es-localized app).
- **JW settings slice** (one rebuild of its SettingsView): kit
  **SettingsShell** + canon sections. JW's REAL order Project·Appearance·
  General·Backups·Storage·Logs·Updates·About is CORRECT — canon = the family
  sections in fixed order RELATIVE TO EACH OTHER; app sections (Project) may
  lead/interleave. JW ADDS the **Server** section (its scattered auth/token
  rows move in; the /v1/server-auth-vs-generic-rows decision on JW's tracker
  rides this).
- Every new JW-visible word gets en+es keys (enumerate at build).

### 4. JV settings slice (one rebuild of SettingsView)
- Kit **SettingsShell** + canon order: General · Appearance · **Backups** ·
  Storage · Server · Logs · **Updates** · About + JV lane (Mastering ·
  Generation · Capture · MCP · GPU · Cache · Channels · Webhooks). Deep-link
  ids stay stable.
- **Backups** = kit DataManagement + the include-audio toggle via the kit seam;
  backup/restore leaves Storage (Storage = data location + disk only).
- **Updates** = kit UpdatesPanel (no-valve commitment above); Changelog name
  dies.
- General remnants re-homed (it goes thin after Connection/Lifecycle/
  Server-bind moved to Server earlier + default-engine dropdown dies in
  slice 7).
- **Inline-style purge of the whole SettingsView** (~100 inline styles → the
  standard classes/tokens).

### 5. JV server: shared /v1/data adoption
- `make_data_router(metadata=[Base, LlmBase], asset_dirs=…, run_reset=…,
  on_replaced=…)`.
- **asset_dirs = the SIX content roots** (paths.py-verified): voices_root,
  personas_root, lexicons_root, projects_root, generations_root,
  training_root. (models/storage/cache roots stay excluded — downloads
  re-fetch.) Captures-audio home: verify at build whether it lives under
  generations or DB; include if a separate root exists.
- `run_reset` = the existing factory-reset body (file-store wipes + engine
  teardown + `reseed_shared_llm` — dual seed sets) so reset stays ONE
  implementation; `on_replaced` = stop the LLM runner AND unload loaded TTS
  engines.
- Bespoke `/v1/backup`, `/v1/restore`, `/v1/admin/factory-reset` RETIRE (no
  zip compat — decision ②).

### 6. docgen slice
- Mount shared `/v1/data` + its reset hook (its recorded parity item).
- Settings gains **Backups** (DataManagement) + **Updates** (UpdatesPanel).
- **PaneHeader on the five remaining views**.

### 7. JV AI console (the Speech-engines rebuild)
- Tab strip: **LLM providers · TTS providers · Speech engines · LLM models ·
  Routing by feature · Usage · AI engine console.** Providers/models tabs
  relabeled JV-only via the labels feed (two provider kinds need naming);
  strip WRAPS per the fit rule, never clips.
- **Speech engines host tab** = the managed-engine catalog (TTS + STT), with
  the LLM-runner interaction grammar: install/download/load through the kit
  `createDownloadTask` over a `ttsJobChannel` adapter (JV's POST → job_id →
  GET /v1/jobs/{id} → DELETE /v1/jobs/{id} is exactly the channel contract);
  **kit DownloadBar replaces the whole bespoke C3 strip** (the ~70 lines of
  hand EWMA/ETA/bytes at EnginesView:345-418 die); the voice wizard's
  hand-rolled `pollJob` rides the same adapter.
- **Set as default (engine)** = row action writing
  `settings.engines.default_tts_engine`; the Settings→General dropdown
  (SettingsView:1375) dies — one source.
- **Set as default (variant)** = row action; `EngineOverrides` gains
  `default_variant` (a USER override layered over the manifest's existing
  `default_variant_id` — manager.py:240 resolves it).
- **TTS providers host tab** = the external-TTS provider CRUD (the old
  `topTab=online` TTS half).
- **LLM residue dies**: the LLM kind-tab, the registered-LLM-providers
  section, `ProviderForm` + `RecommendCard` (NOTE: RecommendCard calls the
  llm-roles route DELETED in F1 — a LIVE dead panel on the current build,
  expected until this slice), the Embeddings kind-tab (JV has none), the
  stray direct fetch (EnginesView:677).
- **The Voice engines sidebar page dies**; `#engines` deep links, the topbar
  engine pill, VoicesView's "Load Chatterbox" banner → the Speech engines tab.
- Docs sweep INCLUDING my own day-old docs that say "Voice engines page"
  (quick-setup.md etc.).

### 8. Speaker Lab reunification (the kit Lab IS the Speaker Lab's descendant —
### user: "the speaker lab is what we originally used to design the feature lab")
- JV registers the attribution **lab adapter**: `run` →
  `/v1/extraction/analyze-text` (real pipeline: segmentation, [D#], anchors,
  floors — NEVER the generic /v1/ai/run), `render` → the table speaker · the
  line · confidence % · reassign dropdown, reassign writes CORRECTION MEMORY
  exactly as Studio does; `configExtra` → the tier control in human words
  ("Auto (matched to the model)" / "With examples" / "Rules only" / "Rules +
  thinking") + confidence-floor override.
- **The 12-point capability inventory = the acceptance checklist** (user QC
  walks it): (1) tier control first-class per column, (2) provider/model per
  column [kit-native], (3) temperature/samplers per column [kit-native],
  (4) prompt editing vs real defaults with edited-state [kit-native],
  (5) runs through the real pipeline, (6) the results table + corrections
  write-back, (7) side-by-side compare WITH disagreement highlighting,
  (8) floor override + floored-from display, (9) saved named setups — carry/
  migrate the server-pref key `speakerLabPresets`, (10) corrections card
  beside the results, (11) raw model output viewable, (12) the pipeline
  explainer note.
- "Speech AI" tab + SpeechAiSettings.vue die HERE (corrections move with the
  renderer — never homeless mid-batch). The old SpeakerLabView retires;
  `#speakerlab` → the AI console's Lab with attribution focused. Labs page
  keeps train/render-lab/audio (TTS domain).

### 9. Copy
- The 13 row labels/descriptions land EXACTLY as approved (verbatim):
  - Speaker attribution: "Reading instructions (with examples)" — *What the AI
    is told when it reads your chapter. This version includes worked examples —
    used automatically when a smaller model is doing the reading, because
    small models need to be shown.* · "Reading instructions (rules only)" —
    *The same job without the examples — used automatically with larger
    models. JustVoice picks between these two for you.* · "Find new speakers"
    — *Behind Discover speakers: lists characters who talk in the text but
    aren't in your cast yet.*
  - Smart assign: *Matches each character to a voice from your library,
    judging age, gender and tone — the Smart-assign button on the Cast tab.*
  - Render preset suggestion: *Reads a chapter's mood and picks which of your
    render presets fits it — the 💡 Suggest button.*
  - Show notes: *Writes podcast show notes from your episode: a summary,
    chapter list, and pull quotes.*
  - Compose: *Writes a fresh line the character would actually say, from the
    persona's personality — the 🎲 button.*
  - Persona rewrite: *Rewrites your line the way the character would say it.
    You see the result first and keep it or toss it.*
  - Voice gender guess: *Labels voices male or female when the name alone
    doesn't tell you — runs only when you click the ✨ button on Voices.*
  - Dictation cleanup: "The ground rules" — *Fix punctuation, never answer
    back, never add words you didn't say.* · "Remove filler" — *Drops the ums,
    uhs and "you know"s, adds sentence punctuation.* · "Take your corrections"
    — *Say "no wait — make that Tuesday" and only Tuesday survives.* · "Keep
    technical words" — *"index dot tsx" comes out as index.tsx, exactly as
    spoken.*
- END-of-batch copy sweep of every surface (incl. what F1 shipped: catalog
  hints, wizard voice, feature hints) under the copy law.
- Known limit, recorded: prompt-row labels live in DB seeds — vue-i18n cannot
  reach them; row-label localization is a future family design.

### 10. CSS fit
- Kill `.jv-sidebar__label { white-space:nowrap; max-width:54px; ellipsis }` +
  the 64px lane-header width — labels wrap, the rail sizes from content
  (normal flex/column, no hardcoded widths). Sweep the F1-added surfaces'
  inline styles (SettingsView covered by slice 4's purge; SpeechAiSettings
  dies in slice 8).

### 11. Guards
- **§11 rewritten from code**: the Settings canon (relative order, app
  sections may lead), the AI-console canon, the governing principle verbatim
  (kit=standard incl. JW; mechanism vs data), the copy law.
- **Contract test per app**: Settings sections asserted against the canon.
- **Boot smokes in ALL THREE apps** (vitest mounts App — kills the TDZ crash
  class; JV's caught live 2026-08-05).
- **JV `scripts/py.js`** + missing npm scripts (`lint`, `test:server`,
  `test`) — the family-contract gap closes.

### 12. End gates
- All suites, all builds, cargo check; real-server boots on real data dirs
  (JV + docgen + JW); **docgen's real-webview screenshots smoke** (the
  family's only true e2e — it exists exactly to catch kit regressions);
  then the user's QC walk with the acceptance checklists.
- Expected-behavior note for QC: the once-ever AI setup offer WILL pop once
  on the real JV install at first project-open (no default model after the
  clean drop) — that's it working.

## After the batch (recorded, in order)
1. **JV UiTable convergence** — 19 views use bespoke `jv-table`; per-view
   checklist; first follow-up [ok-rec: stayed out for size — "19 data-grid
   rebuilds inside this batch is where rushed mistakes breed"].
2. **JV real-webview e2e harness** (docgen's harness is the donor) [ok-rec].
3. Remaining views' inline-style purge (rides UiTable follow-up).
4. **THE DEEP EXHAUSTIVE AUDIT** — the option-2 full read (every view + route
   of all three apps, same/common judgment per surface, user rulings at the
   edges) — runs AFTER this batch per the user's own sequencing.
5. Product decisions (naming, signing, v1 scope) — the user's.

## Coverage honesty (what the pre-batch audit actually was)
A targeted, code-grounded survey — NOT an exhaustive read: kit export
inventory + 29-component adoption matrix ×3 apps; deep reads of EnginesView,
backup internals ×3, settings arrays ×3, data router + JW wiring, sidebar CSS
to the exact rule, dispatch guard message, manifests' default_variant_id,
speakerLabPresets persistence; fork-signal greps (tables/progress/banners/
empties/widths/fetches) + route mount lists ×3. Six thin spots carry
verify-at-build flags: captures-audio root · docgen server-auth mount ·
JW's three bespoke progress surfaces (HomeShelf/RichEditor/VariationsModal —
likely domain-legit) · docgen HomeView progress · TTS-provider CRUD lift
shape · RecommendCard's exact dead call.

## BUILD LOG — deviations + findings (2026-08-06, all twelve slices shipped)

Everything below is what execution ADDED to or AMENDED in the approved text —
the approved decisions themselves shipped as written. Commits: kit `39ee8e1 →
51648df` · JW `ff2c597 → b766c53` · JV `3868a17 → 1edd69c` · docgen `42ff9ad
→ f1c0eb7` (+ each repo's slice-9/10 commits between).

**Resolved premise-vs-code contradictions / entailed calls:**
- "LLM models = the kit Models tab relabeled" became the OPT-IN `modelsTab`
  split (slice 1's own siblings-unchanged commitment forced it; JV opts in,
  JW/docgen strips are untouched).
- Decision ④'s data move ENTAILED the measured class tunes traveling with
  the catalog rows: the flagship's 6 measured tunes ride JV's and docgen's
  seeds (identity-bound to docgen's `-xl` id) so fresh installs keep the
  measured launch configs.
- JW's Settings "General" WAS the server section mislabeled (its label
  already read "Server") — renamed id + position, `/settings/general` alias
  kept.
- JV's include-audio toggle had been sending `include_audio` to a route that
  read `include_generations` — a silently-ignored toggle; the kit options
  seam (`?exclude=`) replaced the whole wire.
- SpeechAiSettings' all-projects corrections table collapsed into the Lab
  renderer's ACTIVE-project card (clear another project's memory by opening
  it) — "corrections move with the renderer" as approved.

**Mechanisms the batch grew that the plan didn't spell out:**
- Kit deep-link focus seam: AiModelsArea `initialFeatureAction` →
  FeatureWorkbench `initialAction` (JV's `#speakerlab` redirect rides it).
- `record_correction` — THE one correction writer (Studio block-PATCH + the
  Lab's new reassign-teaches door `POST /v1/projects/{id}/corrections`).
  The old SpeakerLab had NO reassign; the teach-door is NEW capability. Its
  test round found the FK truth (character_id → personas): the reassign
  dropdown offers the ACTIVE project's REAL cast, never the typed lab cast's
  synthetic ids; the route 404s unknown personas.
- `/v1/extraction/discover-speakers` — the ad-hoc identify twin of
  analyze-text (the scene-scoped route can't serve a Lab passage); column
  pins thread through run_fn.
- Kit prompt reseed grew an EMPTY-ONLY nav-metadata backfill so the 13
  approved row texts land on EXISTING data dirs (insert-if-missing alone
  only reached fresh installs) — verified live on JV's real DB at the end
  gate.
- `python-multipart` declared at the kit (data_api restore imported it
  undeclared — surfaced by docgen's venv).

**Real bugs the batch's own guards caught (all fixed in-batch):**
- JV 200-cap drift (pre-existing): SessionLocal runs autoflush=False, so
  record_correction's overflow query never saw the pending insert —
  db.flush() fixes; test pins it.
- JW ChaptersView `addSceneToChapter`: `const t` (trimmed title) shadowed
  the i18n `t` for the whole function — the dialog's t() calls hit the TDZ
  and adding a scene CRASHED. Caught by JW's brand-new lint gate.
- JW + docgen tray listeners were NOT the claimed browser no-op: the dynamic
  import bundles fine and every `listen()` rejects on the missing Tauri
  internals — three unhandled rejections per browser boot. Now gated on
  `window.__TAURI_INTERNALS__` (JV's was already guarded). Caught by the
  new boot smokes.
- JV AudioKeepAlive assumed `play()` returns a promise (undefined is
  spec-legal in older engines) — boot died in the mounted hook. Caught by
  JV's boot smoke.
- The copy law caught its own slice: the Lab renderer printed `tier_used`
  raw ("guided instructions") — now the approved human words; the voice
  wizard's "Tier"/"Auto-tier" row became "Hardware fit"/"Suggested"; one
  missed pins-era line in its install step rewritten.
- Doc rot fixed on the way: providers.md still described the dead combined
  provider form + tier picker (slice-7 miss); JW's `settings.providerForm` +
  `settings.preferences` i18n groups were dead (removed en+es); JV's
  `sidebar.ai`/`sidebar.labs` keys were missing (warned every boot).

**End gates (2026-08-06):** pytest — runner 766 (the lspci case is the known
Windows env failure) · JV 389 · JW 122 · docgen 148; vitest — JW 571 · JV 3 ·
docgen 3 (each incl. the new canon + boot-smoke guards); vite build + biome
clean ×3 (JW's lint script is NEW — first run caught the ChaptersView crash);
cargo check ×3 clean (docgen's via the release build); REAL-server boots on
real data dirs ×3 green (JW 37 prompt rows · JV 13 rows serving the approved
labels + 3 tiers · docgen health/logs/disk); docgen real-webview screenshots
smoke run at the gate. QC note stands: the once-ever AI setup offer WILL pop
once on the real JV install at first project-open — that's it working.
