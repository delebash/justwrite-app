# 2026-07-18 — RAG/chat state + the entity-sweep & RAG queue (compact-safe record)

Written immediately before a session compact. This is THE resume point: everything
below is either SHIPPED (with commit ids) or QUEUED AWAITING THE USER'S GO — nothing
in the queue is started. Standing session law: **no work without the user's explicit
go, one-line "this changes X" before anything ships.**

## Shipped today (all pushed, branch `claude/admiring-galileo-il3q0o`)

justwrite-app:
- `27e2a3e` **Bible-only chat** — chat works with NO index (zero embed calls; pins
  only; banner + Build-index inline; characterChat mirrored; 5-case vitest).
- `a8abecb` **Character-card splitting + main-cast roster** (corpus fallback pins
  premise + roster; measured over the real Ninth Facet book).
- `33a691d` **Corpus fallback keys on the CURRENT question** (turn-2 fix).
- `3f8a71c` **rag-probe re-authored to The Ninth Facet — 18/18 green.** Anchors
  (verified unique in samples/the-ninth-facet/book.json): "lantern and a ledger"
  (ch2, Old Sedge origin) · "waiting to be chosen" (ch1, Slate board) · "Old Sedge"
  ch2+ch4 (E2) · alias "Sedge" (candle-scene E1 link). NOT an SDK regression — the
  2026-07-12 sample swap; adapter + /v1/ai/stream verified healthy en route.
- `37e419a` channel-mapper tests (kit factories).

just-llm-runner:
- `a83d20f` **Book-search step in the Set-as-default dialog** (LuBookSearchSetup):
  online provider w/ no embedding → recommend local setup (shared DownloadBars,
  cancel), Ollama offer, passive skip. Channel factories promoted into
  useDownloadTask.js (engineInstallChannel/modelLoadChannel/modelDownloadChannel);
  QuickSetup consumes them.
- Earlier: seed `p_chat` think OFF (universal; existing DBs flip in the Lab).

## Decisions taken (do NOT re-litigate)

- **Embed default stays Qwen3-4B** (user, 2026-07-18, re-affirming their 2026-07-12
  on-box A/B: 4B beats 0.6B on thematic retrieval; build-time cost accepted; seed
  comment in llm_runner/llm/seed.py is the record).
- **GraphRAG / LlamaIndex adoption REJECTED** (user reviewed the analysis): the
  author-maintained bible IS the property graph; LLM triple-extraction would be
  slower (per-chunk LLM calls at index time on local) and noisier than curated
  truth. Steal its two valid points as enrichments instead (queue below).
- Book chat defaults: think OFF; reasoning is per-user opt-in.

## QUEUE — awaiting the user's go (say which + order)

### Entity-sweep hardening (from the real 114-chapter import test; plan accepted in
chat but NOT green-lit item-by-item):
- **A. Per-chapter draft persistence + resume** (M): after each chapter, write
  results to a server-side draft keyed by project (`{chapterId: {status, proposals,
  textSha, reason}}`) — NOT into the book. Reopen → "Resume — N done · M failed ·
  K left"; only pending/failed/sha-changed chapters re-scan; review can open from
  drafts; drafts clear on accept or Start-over. Files: new draft store (server kv or
  table + API), `services/analysis/entitySweep.js` (write-after-chapter + resume
  filter), `EntitySweepModal.vue` (resume UI). Crash-proofs the sweep.
- **B. Per-chapter watchdog + Retry-failed** (S/M): timeout ≈ 3× rolling median
  (floor ~180 s) → row "error · timed out", worker freed; "Retry failed" re-queues
  only failures. Fixes the observed stuck-SCANNING ch47 (no timeout exists anywhere
  in the chain today — verified `entitySweep.js`/`entityExtraction.js`/kit).
- **C1. Small model for extraction** (user action now + seed decision): point
  `p_extract` at a small dense model instead of the 26B (entitySweep/reverseOutline/
  beatSheet/readerKnowledge/characterAudit/relationshipArc/foreshadowing all ride
  `p_extract` — seed_presets.py:168-176). Biggest speed lever. Making it the SEEDED
  default is a product decision needing an explicit yes.
- **C2. Local concurrency honesty** (S): pool=4 buys nothing against the single-slot
  built-in server (requests serialize server-side) — drop local to 1-2 OR enable
  llama-server parallel slots (-np) via the switches system (VRAM/ctx tradeoff).
- **Rejected**: capitalized-name prefilter to skip chapters (would miss lowercase
  entities — the Slate board proof).

### RAG enrichments (the "steal from GraphRAG" trio):
- **(a) Relation edges onto character cards** (S): cards omit the author's
  Relations-graph edges (verified — cards.js characterCards has no relationships
  section; app stores relationshipArcs). Closes multi-hop.
- **(b) Digest cards** (M): index reverse-outline chapter digests as cards →
  thematic/global questions retrieve mid-scale summaries.
- **(c) Scene splitting** (M): scenes are ONE chunk, excerpt-capped at 1200 chars —
  same disease character cards were cured of. Biggest remaining retrieval ceiling.
- Smaller queued: pin-all-parts for a named split entity · merge tiny tail parts ·
  lift profile.js's 800-char backstory cap · fabula+setting into the corpus-fallback
  pins (budget now has room: 741/4800 used).

### Other open flags
- Online-provider QuickSetup path: covered by the new Book-search dialog step; the
  broader "wizard confusion" thought the user parked ("hold this thought") remains
  theirs to reopen.
- Verify-think work (thoughtsTokenCount capture per provider) — handed to the
  reasoning session's territory earlier; status unknown post-merge.

## Environment notes (post-compact boot)
- Container wipes killed pip env earlier: reinstall `pip install -e
  /home/user/just-llm-runner -e /home/user/justwrite-app/server` + numpy +
  python-multipart if the JW server won't boot.
- Headless smoke needs a project seeded when the DB is fresh (book-smoke's PUT
  /v1/projects/{id}/book + settings PATCH recipe).
