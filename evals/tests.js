// Every Lab sample the server holds, each held to its reply contract (contract.js) — promptfoo's
// tests from a file (https://www.promptfoo.dev/docs/configuration/test-cases/). The samples and
// their contracts come from the server (the kit's lab-samples.js), so a seeded sample is tested
// the moment it exists. 2026-10-16.
//
// Skipped, as the Lab hides them: a stored sample the seed has since moved off its action (its
// label is seeded, but no longer for that action — e.g. "Brainstorm seed" left brainstormPlot on
// 2026-10-16). Seeding only adds, so such rows stay in a database seeded before. A sample the
// writer made (a label the seed doesn't have) is tested.

import { labSamples } from "../../just-core/scripts/evals/lab-samples.js";
import { DEFAULT_TEST_SAMPLES } from "../server/src/seed_presets.js";

const seededLabels = new Set(DEFAULT_TEST_SAMPLES.map((s) => s.label));
const seededPairs = new Set(DEFAULT_TEST_SAMPLES.flatMap((s) => s.actions.map((a) => `${a}\u0000${s.label}`)));
const movedOff = (t) => seededLabels.has(t.metadata.label) && !seededPairs.has(`${t.metadata.action}\u0000${t.metadata.label}`);

export default async function tests() {
  return (await labSamples())
    .filter((t) => !movedOff(t))
    .map((t) => ({ ...t, assert: [{ type: "javascript", value: "file://contract.js" }] }));
}
