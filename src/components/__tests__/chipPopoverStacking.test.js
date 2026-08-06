// THE CHIP POPOVER MUST CLEAR THE MODAL (user-reported 2026-07-17: "model pick is not
// opening when i click on it", on the entity-sweep modal's chip).
//
// It was opening every time. `LuFeatureChip`'s popover portals OUT of the modal to
// <body> (PopoverPortal, no `to`), landing as a SIBLING of AppModal's overlay — and
// reka wraps it in a `[data-reka-popper-content-wrapper]` carrying `z-index: auto`,
// which creates NO stacking context. So `.afc-pop`'s own z-index competes directly
// with `.ui-modal-overlay`'s in the root stacking context, and at 60-vs-200 the
// popover painted BEHIND the scrim, under its 3px backdrop blur. Invisible ⇒ "not
// opening". It hit all 15 in-modal chip mounts; the 7 outside modals were fine, which
// is exactly what the user observed (ChatPanel's chips worked).
//
// Verified by DOM probe, 2026-07-17 — the popover MOUNTS and STAYS inside a modal
// (so this was never focus-trap dismissal), and it already carries
// `pointer-events: auto` while <body> is `none` (reka's DismissableLayer re-enables it
// because the popover out-ranks the dialog's layer). z-index was the only defect.
//
// WHY A SOURCE-READING TEST AND NOT A MOUNT TEST: jsdom has no layout and paints
// nothing, so no mount test can observe z-order — this class of bug sails past a green
// suite, which is how it shipped. What CAN be pinned is the INVARIANT the paint order
// follows from: a popper that portals to <body> must out-rank the modal it opens over.
// So we read the two literals from the kit's own sources and compare them.
//
// The kit has no test harness of its own (no vitest config, no test files under
// just-llm-runner/ui) — JW's is where kit components get tested, the precedent being
// LuFeatureChip.save.test.js next door. NOTE the asymmetry: JustVoice consumes the same
// kit and gets no guard from this.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// …/justwrite-app/src/components/__tests__ → …/Web, then into the kit.
// Same repo-to-kit relationship vitest.config.js's alias encodes as
// `resolve(__dirname, "../just-llm-runner/ui/src")`; if one moves, so does the other.
const KIT = resolve(HERE, "../../../../just-llm-runner/ui/src");

function readKit(rel) {
  const path = resolve(KIT, rel);
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(`Could not read the kit source at ${path} — has the kit moved relative to this repo? (see KIT above)`);
  }
}

// The single <style> block of an SFC, comments stripped, so a rule match can anchor on
// a preceding `}` without tripping over the file's prose.
function styleOf(vueSource) {
  const m = vueSource.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!m) throw new Error("no <style> block found");
  return m[1].replace(/\/\*[\s\S]*?\*\//g, "");
}

// The z-index declared by ONE rule, matched on the selector exactly as it appears in
// source. Anchoring on `^`/`}` plus a required `\s*{` keeps `.ui-modal` from matching
// `.ui-modal-overlay` or `.ui-modal--wide`.
function zIndexOf(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = css.match(new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, "m"));
  if (!rule) throw new Error(`no rule found for selector \`${selector}\``);
  const z = rule[1].match(/(?:^|;)\s*z-index\s*:\s*(-?\d+)/);
  if (!z) throw new Error(`\`${selector}\` declares no numeric z-index`);
  return Number(z[1]);
}

const CHIP = styleOf(readKit("components/LuFeatureChip.vue"));
const MODAL = styleOf(readKit("common/components/AppModal.vue"));
const SELECT = readFileSync(resolve(KIT, "common/styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("the chip popover out-ranks the modal it opens over", () => {
  it("parses the three literals it compares (a rename must fail loudly, not silently pass)", () => {
    expect(zIndexOf(CHIP, ":global(.afc-pop)")).toBeTypeOf("number");
    expect(zIndexOf(MODAL, ".ui-modal-overlay")).toBe(200);
    expect(zIndexOf(MODAL, ".ui-modal")).toBe(201);
  });

  it("clears the modal's SCRIM — otherwise it paints behind a backdrop-filter blur", () => {
    expect(zIndexOf(CHIP, ":global(.afc-pop)")).toBeGreaterThan(zIndexOf(MODAL, ".ui-modal-overlay"));
  });

  it("clears the modal's PANEL — the chip is in the modal's own header", () => {
    expect(zIndexOf(CHIP, ":global(.afc-pop)")).toBeGreaterThan(zIndexOf(MODAL, ".ui-modal"));
  });

  it("matches UiSelect, the other portalled popper that already clears modals", () => {
    // One answer for one role (the user's ruling, 2026-07-17): `.ui-select-content` is
    // the precedent — a reka-portalled popper used inside modals throughout. If these
    // ever diverge, one of the two is about to be wrong.
    expect(zIndexOf(CHIP, ":global(.afc-pop)")).toBe(zIndexOf(SELECT, ".ui-select-content"));
  });
});
