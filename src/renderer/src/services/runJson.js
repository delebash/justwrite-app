// One seam for the "run an LLM feature whose reply is JSON, then parse it"
// idiom that was copy-pasted across 15 call sites in 14 analysis/service
// modules (each did `runAiFeature(...)` immediately followed by
// `parseJsonLoose(result.content) || {}`). Centralizing it means a future
// cross-cutting concern — a structured-output mode, a reparse-on-failure
// retry, per-run telemetry — lands in ONE place instead of fifteen.
//
// Returns the raw runAiFeature result (model, content, cost, usage) next to
// the parsed value. `parsed` defaults to {} (never null) — the exact guard
// all 15 call sites already applied with `|| {}`, so every caller's
// `parsed.<field>` access stays safe on a malformed model reply.

import { runAiFeature } from "@delebash/llm-ui";
import { parseJsonLoose } from "./llmText.js";

export async function runJsonAnalysis(opts) {
  const result = await runAiFeature(opts);
  return { result, parsed: parseJsonLoose(result.content) || {} };
}
