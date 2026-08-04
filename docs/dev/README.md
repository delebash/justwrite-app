# Dev docs — start here (JustWrite)

New to the codebase? Read in this order; each doc is small and current on purpose
(the docs campaign 2026-08-04 distilled everything else into these — closed history
lives in `../plans/archive/`).

1. **`../../CLAUDE.md`** — the working rules, the thin-client/server split, the
   "Don't" list, and the Where-to-look table. Read it before touching renderer code.
2. **`TASKS.md`** — the live open-work tracker (close = delete; a line is a claim,
   not evidence). **`IDEAS.md`** — the unscheduled backlog.
3. **`ARCHITECTURE.md`** — why there is a Python server (headless is a product
   requirement), the storage policy (drop-and-reseed, no migrations), what shipped,
   release/e2e wiring.
4. **`architecture-notes.md`** — the invariants in detail: IPC bridge, the
   monolithic project store + snapshot undo (domains, coalescing, the editor-echo
   law), soft deletes + the toast law, the AI stack's current shape, i18n rules.
5. **`ui-kit.md`** — the shared `@delebash/llm-ui` kit contract (one `intent` prop,
   kit-first, no local primitives). The kit itself lives in
   `../../../just-llm-runner/ui/` — its family standard is
   `../../../just-llm-runner/docs/app-structure.md`.
6. **Design records**: `measured-performance.md` (every tuning/boot/band number
   that justifies today's defaults) · `rag-design.md` (cards, pinning, embed
   templates — the why behind `src/services/rag/`) · `bench.md` (the LLM bench
   harness) · `ai-features-roadmap.md` + `potential-roadmap.md` (shipped/won't-ship
   history).
7. **The family docs convention** — `../../../just-llm-runner/docs/app-structure.md`
   §13: trackers, placement rule, plans/ holds only live work.

User-facing docs are `../*.md` (the in-app Help corpus, indexed by `../toc.json`) —
update them in the SAME change that alters anything a user sees.
