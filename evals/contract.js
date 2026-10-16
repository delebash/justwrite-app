// The reply contract every Lab sample is held to on a real model (promptfoo's JavaScript assertion,
// https://www.promptfoo.dev/docs/configuration/expected-outputs/javascript/; 2026-10-16). It
// passes what the app itself would use, read with the app's own parsers:
//   · a JSON action (the stored prompt's jsonMode): JSON the app can read (parseJsonLoose — what
//     runJsonAnalysis uses); the keys a sample lists under FIELDS TO DRAFT, every one present;
//     a schema's required keys present;
//   · Brainstorm's list actions: at least five ideas, one per line (parseBrainstormLines);
//   · prose: something written;
// and never a reply cut off by the token cap or a full context. Whether the content is GOOD is
// read, not asserted — the run's summary lists every reply.

import { parseBrainstormLines } from "../src/services/brainstorm.js";
import { parseJsonLoose } from "../src/services/llmText.js";

const LIST_ACTIONS = new Set(["brainstorm", "brainstormPlot"]);
const MIN_IDEAS = 5;

const verdict = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason });

/** The keys a sheet or section draft asks for: its FIELDS TO DRAFT lines, "- key — Label: hint". */
function fieldsToDraft(variables) {
  const text = String(variables?.user_content || "");
  const at = text.indexOf("FIELDS TO DRAFT\n");
  if (at < 0) return null;
  const keys = [];
  for (const line of text.slice(at + "FIELDS TO DRAFT\n".length).split("\n")) {
    const m = /^- ([A-Za-z0-9_.]+) — /.exec(line);
    if (!m) break;
    keys.push(m[1]);
  }
  return keys.length ? keys : null;
}

export default function contract(output, context) {
  const meta = context?.test?.metadata || {};
  const run = context?.providerResponse?.metadata || {};
  if (run.finishReason === "length") return verdict(false, "Cut off: the reply hit the token cap or a full context.");
  const text = String(output || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (!text) return verdict(false, "Empty reply.");

  if (meta.jsonMode) {
    const parsed = parseJsonLoose(text);
    if (parsed == null) return verdict(false, "No JSON the app can read.");
    const want = fieldsToDraft(context?.vars?.variables) || meta.jsonSchema?.required || [];
    const missing = Array.isArray(parsed) ? [] : want.filter((k) => !(k in parsed));
    if (missing.length) return verdict(false, `JSON lacks ${missing.join(", ")}.`);
    return verdict(true, `JSON${want.length ? ` with ${want.join(", ")}` : ""}.`);
  }
  if (LIST_ACTIONS.has(meta.action)) {
    const n = parseBrainstormLines(text).length;
    return verdict(n >= MIN_IDEAS, `${n} ideas${n >= MIN_IDEAS ? "" : ` (fewer than ${MIN_IDEAS})`}.`);
  }
  return verdict(true, `${text.length} characters.`);
}
