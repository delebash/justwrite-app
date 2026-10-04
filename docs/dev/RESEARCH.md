<!-- SPDX-License-Identifier: MIT -->
# Research register — what we already know, and where the proof is (JustWrite)

**Read the section for your subject before researching anything** — before reading code to
answer a question, before measuring, before briefing an agent. Then grep `docs/plans` for
anything newer. The shared AI stack's facts (the kit, llama.cpp, the memory arbiter) are in
[the kit's register](../../../just-llm-runner/docs/dev/RESEARCH.md).

## The rule (family-wide, decided 2026-10-04)

The user: *"why do we keep re researching stuff, we need a primary research doc that we point to
so we dont keep duplicating or forgeting what we have done in the past"* — approved "your rec on
all go". The kit's register carries the rule in full; in short:

- **Before research:** read the subject's section here and grep `docs/plans`. An agent's brief
  carries that section and the line *"don't re-derive these; re-check one only if the code it
  cites changed after its date"*.
- **After research:** its facts land here in the same change. A research doc with no entry here
  is not done. The family guard (`../just-llm-runner/scripts/check-family.mjs`, check 15) fails
  any `docs/plans/YYYY-MM-DD-*.md` dated 2026-10-04 or later that this page does not link, and
  any link here that points nowhere.
- **Filled as each subject comes up.** Until then a subject's records are indexed below, so
  they can at least be found.
- One fact per bullet, then *how it was checked and when* (measured · code · web · git · record
  · agent), then where the proof is. A fact that turns out wrong is rewritten, ending "(was: …
  until <date>)".

No subject has been distilled here yet.

---

## Records not yet distilled

Indexed by subject so they can be found; their facts move into a section above when work next
touches the subject. History in [`../plans/archive/`](../plans/archive/) is not listed.

**The writer's editor** —
[`2026-07-26-writers-editor-gap-research.md`](../plans/2026-07-26-writers-editor-gap-research.md) ·
[`2026-07-26-editor-expansion-executor-plan.md`](../plans/2026-07-26-editor-expansion-executor-plan.md).

**Single-source text and translation** —
[`2026-07-26-i18n-single-source-research.md`](../plans/2026-07-26-i18n-single-source-research.md).

**Performance** — [`measured-performance.md`](measured-performance.md) (distilled evidence) ·
[`bench.md`](bench.md) (the LLM bench harness).

**Story-bible retrieval** — [`rag-design.md`](rag-design.md) (distilled decisions).

**Roadmaps** — [`ai-features-roadmap.md`](ai-features-roadmap.md) ·
[`potential-roadmap.md`](potential-roadmap.md) (research-driven candidates).

**Family parity** — [`2026-08-05-family-parity-batch.md`](../plans/2026-08-05-family-parity-batch.md).

**Docs** — [`2026-08-04-docs-coverage-worklist.md`](../plans/2026-08-04-docs-coverage-worklist.md).
