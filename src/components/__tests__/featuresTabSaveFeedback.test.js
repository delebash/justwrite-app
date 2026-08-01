// Features-tab save feedback + the misleading key hint (user-reported 2026-07-18).
//
// (1) "when saving preset you should have a save toast in features tab" — saving a
// preset in the Lab (Save-as a new one, or Update-in-place) refreshed the dropdown
// but said nothing, while sibling actions in the SAME tab DO toast (JSON-output
// toggle → "JSON output on…", Reset → "Reset to defaults.", Backup → "Backup
// saved."). The two preset SAVES now push a success toast. Delete stays toast-less
// (the QC-37 toast law: the row leaves visibly).
//
// (2) The API-key field showed `sk-…` as its placeholder for EVERY online provider,
// but `sk-` is the OpenAI key prefix — misleading for Anthropic/Gemini/DeepSeek/etc.
// The hint is removed (user: "sk is misleading as that is only openai, just remove").
//
// WHY A SOURCE-READING TEST: these are kit SFCs (@delebash/llm-ui) — build:vite
// compiles without resolving that a toast call is present on the success path, and
// biome doesn't read .vue identifiers. The precedent is chipPopoverStacking.test.js
// next door (the kit has no harness of its own; JW's is where kit components get
// pinned). NOTE the asymmetry: JustVoice consumes the same kit and gets no guard here.
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
// …/justwrite-app/src/components/__tests__ → …/Web, then into the kit —
// the same repo-to-kit relationship vitest.config.js's alias encodes.
const KIT = resolve(HERE, "../../../../just-llm-runner/ui/src");

function readKit(rel) {
  const path = resolve(KIT, rel);
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(`Could not read the kit source at ${path} — has the kit moved relative to this repo?`);
  }
}

// The source of ONE async function, from its `async function NAME(` up to the next
// `async function ` (or </script>). Lets us assert a call lands in a SPECIFIC handler,
// not merely somewhere in the file.
function fnBody(src, name) {
  const start = src.indexOf(`async function ${name}(`);
  if (start < 0) throw new Error(`no \`async function ${name}\` in the source`);
  const next = src.indexOf("\nasync function ", start + 1);
  return src.slice(start, next < 0 ? src.length : next);
}

const FEATURE_LAB = readKit("components/FeatureLab.vue");
const PROVIDER_FORM = readKit("views/ProviderForm.vue");

describe("features tab — saving a preset confirms with a toast", () => {
  it("Save-as a new preset pushes a success toast", () => {
    const body = fnBody(FEATURE_LAB, "saveAs");
    expect(body).toContain("pushToast");
    expect(body).toContain("Preset saved.");
  });

  it("Update-in-place pushes a success toast", () => {
    const body = fnBody(FEATURE_LAB, "updatePreset");
    expect(body).toContain("pushToast");
    expect(body).toContain("Preset saved.");
  });

  it("delete stays toast-less (the QC-37 toast law — the row leaves visibly)", () => {
    expect(fnBody(FEATURE_LAB, "delPreset")).not.toContain("pushToast");
  });
});

describe("provider form — the API-key hint drops the OpenAI-only `sk-` prefix", () => {
  it("no `sk-` hint in the key field's placeholder (misleading for non-OpenAI providers)", () => {
    // Scope the check to the UiSecretInput's :placeholder binding only — not the whole
    // file (a comment may legitimately mention the prefix it removed). RED before: the
    // fallback was `'sk-…'`; GREEN after: it is `''`.
    const m = PROVIDER_FORM.match(/<UiSecretInput[\s\S]*?:placeholder="([^"]*)"/);
    expect(m, "the API-key UiSecretInput should declare a :placeholder").toBeTruthy();
    expect(m[1]).not.toContain("sk-");
  });
});
