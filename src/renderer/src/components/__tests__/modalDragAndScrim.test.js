// @vitest-environment jsdom
//
// THE MODAL SHELL'S TWO 2026-07-19 RULINGS (user, verbatim): the background behind a
// modal is neither blurred NOR dimmed, and modals drag by the header with an opt-out.
//
// TWO KINDS OF ASSERTION HERE, on purpose:
//
//  * SOURCE-level, for the CSS invariants. jsdom has no layout engine and paints
//    nothing, so no mount can observe a backdrop-filter or a transform taking effect —
//    the precedent is chipPopoverStacking.test.js next door, which reads the kit SFC's
//    <style> block for exactly this reason. `is-dragged`'s `transform: none` is pinned
//    the same way: simulating a real pointer drag needs getBoundingClientRect/offsetWidth
//    to return real geometry, which jsdom stubs to zero, so the drag MATH cannot be
//    exercised honestly here. What CAN be pinned is that the rule exists and says what
//    the drag depends on.
//
//  * MOUNT-level, for the draggable/opt-out class. That one is plain conditional-class
//    rendering, which jsdom renders faithfully — and mounting also proves the SFC's
//    script actually EXECUTES (useDraggable resolves, no ReferenceError). build:vite
//    compiles SFCs without resolving script identifiers and biome doesn't check .vue
//    identifiers, so a mount is the only gate that runs this code. Mounted with plain
//    `createApp`, matching LuFeatureChip.save.test.js (no @vue/test-utils dep).
//    The drag GUARD is mount-tested too — Element.closest() needs no geometry.
//
// NOT COVERED, and it needs the user's eyes on the real app: that a drag LOOKS right —
// no half-size jump on grab, the clamp keeping the header reachable, the close animation
// not yanking a moved modal back to centre. The clamp arithmetic specifically cannot be
// tested here: it reads offsetWidth and window.innerWidth, which jsdom stubs to zero.
import { afterEach, describe, expect, it } from "vitest";
import { createApp, h, nextTick } from "vue";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import AppModal from "@delebash/llm-ui/common/components/AppModal.vue";

const HERE = dirname(fileURLToPath(import.meta.url));
// …/justwrite-app/src/renderer/src/components/__tests__ → …/Web, then into the kit.
// Same repo-to-kit relationship vitest.config.js's alias encodes; if one moves, so does
// the other. (Identical to chipPopoverStacking.test.js — deliberately, so a kit move
// breaks both loudly rather than one silently.)
const KIT = resolve(HERE, "../../../../../../just-llm-runner/ui/src");

function readKit(rel) {
  const path = resolve(KIT, rel);
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(`Could not read the kit source at ${path} — has the kit moved relative to this repo? (see KIT above)`);
  }
}

// The single <style> block of an SFC, comments stripped, so a rule match can anchor on a
// preceding `}` without tripping over the file's prose.
function styleOf(vueSource) {
  const m = vueSource.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!m) throw new Error("no <style> block found");
  return m[1].replace(/\/\*[\s\S]*?\*\//g, "");
}

// The body of ONE rule, matched on the selector exactly as it appears in source.
// Anchoring on `^`/`}` plus a required `\s*{` keeps `.ui-modal` from also matching
// `.ui-modal-overlay` or `.ui-modal--wide`.
function ruleBody(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = css.match(new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, "m"));
  if (!rule) throw new Error(`no rule found for selector \`${selector}\``);
  return rule[1];
}

const MODAL_SRC = readKit("common/components/AppModal.vue");
const MODAL = styleOf(MODAL_SRC);

let app;
let host;

afterEach(() => {
  if (app) app.unmount();
  if (host) host.remove();
  app = null;
  host = null;
});

function mountModal(props = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  app = createApp({ render: () => h(AppModal, { title: "T", ...props }, { default: () => "body" }) });
  app.mount(host);
  return nextTick();
}

// Reka portals DialogContent to <body>, not into the mount host — query the document.
function modalEl() {
  return document.querySelector(".ui-modal");
}

describe("the modal overlay neither dims nor blurs (user ruling, 2026-07-19)", () => {
  it("parses the overlay rule it asserts on (a rename must fail loudly, not silently pass)", () => {
    expect(ruleBody(MODAL, ".ui-modal-overlay")).toContain("z-index");
  });

  it("declares NO backdrop-filter — the blur is gone", () => {
    expect(ruleBody(MODAL, ".ui-modal-overlay")).not.toMatch(/backdrop-filter/);
  });

  it("declares NO backdrop-filter anywhere in the stylesheet", () => {
    // Belt and braces: the blur must not reappear on some other selector.
    expect(MODAL).not.toMatch(/backdrop-filter/);
  });

  it("paints a transparent background — the scrim dim is gone", () => {
    const body = ruleBody(MODAL, ".ui-modal-overlay");
    expect(body).toMatch(/background:\s*transparent/);
    // The old scrim was a --scrim var / color-mix black. Neither may survive.
    expect(body).not.toMatch(/--scrim/);
    expect(body).not.toMatch(/color-mix/);
  });

  it("keeps the overlay ELEMENT — it still blocks the page behind + carries outside-click", () => {
    const body = ruleBody(MODAL, ".ui-modal-overlay");
    expect(body).toMatch(/position:\s*fixed/);
    expect(body).toMatch(/inset:\s*0/);
  });
});

describe("drag is on by default, with an opt-out", () => {
  it("mounts draggable by default and carries the affordance class", async () => {
    await mountModal();
    expect(modalEl()).toBeTruthy();
    expect(modalEl().classList.contains("ui-modal--draggable")).toBe(true);
  });

  it("drops the class when the host opts out with :draggable=\"false\"", async () => {
    await mountModal({ draggable: false });
    expect(modalEl()).toBeTruthy();
    expect(modalEl().classList.contains("ui-modal--draggable")).toBe(false);
  });

  it("is not dragged until it is actually dragged", async () => {
    await mountModal();
    expect(modalEl().classList.contains("is-dragged")).toBe(false);
  });

  it("gives the header a move cursor ONLY under the draggable class", () => {
    // Unconditional cursor:move would lie on an opted-out modal.
    expect(MODAL).toMatch(/\.ui-modal--draggable\s+\.ui-modal__header\s*\{[^}]*cursor:\s*move/);
    expect(ruleBody(MODAL, ".ui-modal__header")).not.toMatch(/cursor:\s*move/);
  });
});

// A pointerdown vueuse's useDraggable will accept: it reads `e.button` (must be 0) and,
// with no `pointerTypes` option set, does not filter on pointerType. MouseEvent carries
// button/clientX/clientY and jsdom has it; `capture: true` listeners on the header still
// see a bubbling event dispatched on a descendant.
function pointerDown(el, clientX = 200, clientY = 100) {
  el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX, clientY }));
  return nextTick();
}

// THE DRAG GUARD — the one escape in this feature, and it must be proven to FIRE.
// onStart returns false for interactive header controls. If it silently broke, vueuse's
// start() would reach handleEvent(e) → preventDefault() on the header pointerdown and the
// close button would stop responding. Element.closest() needs no layout, so unlike the
// clamp math this IS honestly testable in jsdom.
describe("dragging never starts from a control in the header", () => {
  it("does NOT start a drag from the close button", async () => {
    await mountModal();
    const close = document.querySelector(".ui-modal__close");
    expect(close).toBeTruthy();
    await pointerDown(close);
    expect(modalEl().classList.contains("is-dragged")).toBe(false);
  });

  it("DOES start a drag from the plain title area (the guard must not over-fire)", async () => {
    await mountModal();
    const title = document.querySelector(".ui-modal__titleblock");
    expect(title).toBeTruthy();
    await pointerDown(title);
    expect(modalEl().classList.contains("is-dragged")).toBe(true);
  });

  it("does not start a drag at all when the host opted out", async () => {
    await mountModal({ draggable: false });
    await pointerDown(document.querySelector(".ui-modal__titleblock"));
    expect(modalEl().classList.contains("is-dragged")).toBe(false);
  });
});

describe("a dragged modal drops the centring transform AND the animation", () => {
  it("declares .ui-modal.is-dragged { transform: none; animation: none }", () => {
    // WHY BOTH: .ui-modal centres with translate(-50%,-50%) while the drag positions
    // with left/top — leaving the transform up offsets the modal by half its size. And
    // the close keyframe animates transform back toward centre, which would yank a
    // dragged modal across the screen on the way out.
    const body = ruleBody(MODAL, ".ui-modal.is-dragged");
    expect(body).toMatch(/transform:\s*none/);
    expect(body).toMatch(/animation:\s*none/);
  });

  it("still centres an UNdragged modal (the rule is an override, not a replacement)", () => {
    expect(ruleBody(MODAL, ".ui-modal")).toMatch(/transform:\s*translate\(-50%,\s*-50%\)/);
  });

  it("binds the is-dragged class and a transform-clearing style in the template", () => {
    // The CSS rule is inert unless the template can actually apply it.
    expect(MODAL_SRC).toMatch(/'is-dragged':\s*dragged/);
    expect(MODAL_SRC).toMatch(/transform\s*=\s*"none"/);
  });
});
