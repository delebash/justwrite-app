// Every Lab sample the server holds, each held to its reply contract (contract.js) — promptfoo's
// tests from a file (https://www.promptfoo.dev/docs/configuration/test-cases/). The samples and
// their contracts come from the server (the kit's lab-samples.js), so a seeded sample is tested
// the moment it exists. 2026-10-16.

import { labSamples } from "../../just-llm-runner/scripts/evals/lab-samples.js";

export default async function tests() {
  return (await labSamples()).map((t) => ({ ...t, assert: [{ type: "javascript", value: "file://contract.js" }] }));
}
