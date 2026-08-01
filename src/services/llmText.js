// Shared LLM-response text helpers — parse model output (often wrapped in
// ```json fences and, for reasoning models, <think>…</think> blocks) into JSON.
//
// These were copy-pasted into ~14 services/analysis modules and drifted into
// variants — one (entityExtraction) silently dropped the <think> strip and used
// a greedy regex, so entity extraction failed on reasoning models while the rest
// worked. Single source of truth here; import instead of redefining.

// Scan `s` for the first BALANCED open…close pair (brace/bracket aware of
// JSON strings + escapes), so trailing prose after the JSON doesn't break the
// parse. Returns the slice (inclusive) or null.
export function extractBalanced(s, open, close) {
  for (let start = s.indexOf(open); start !== -1; start = s.indexOf(open, start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
  }
  return null;
}

// Parse loose JSON from an LLM reply: strip ```json fences and <think>…</think>
// reasoning, then extract the first balanced object OR array (whichever appears
// first). Returns the parsed value or null.
export function parseJsonLoose(text) {
  if (!text) return null;
  const s = text.replace(/```(?:json)?/gi, "").replace(/<think>[\s\S]*?<\/think>/gi, "");
  const objIdx = s.indexOf("{");
  const arrIdx = s.indexOf("[");
  const objectFirst = objIdx !== -1 && (arrIdx === -1 || objIdx < arrIdx);
  const order = objectFirst ? [["{", "}"], ["[", "]"]] : [["[", "]"], ["{", "}"]];
  for (const [open, close] of order) {
    const slice = extractBalanced(s, open, close);
    if (slice) {
      try {
        return JSON.parse(slice);
      } catch {
        /* try the next bracket type */
      }
    }
  }
  return null;
}
