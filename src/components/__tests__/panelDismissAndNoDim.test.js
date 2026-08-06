// @vitest-environment jsdom
//
// TWO 2026-07-19 USER RULINGS, pinned here.
//
//  1. "i want it to all look and feel the same, no blur background" — NO surface
//     dims or blurs the page behind it. AppModal's own overlay is already pinned by
//     modalDragAndScrim.test.js next door; this file covers the four remaining
//     overlays (HelpDrawer, CommandPalette, SceneLinks, and the deleted styles.css
//     `.modal-overlay`). Asserted PER SURFACE, not one blanket grep — a blanket grep
//     passes for the wrong reason the moment a selector is renamed.
//
//  2. "off focus should close it, same with click on nav like how chat works to open
//     close" — but "panels only, modals keep their locked backdrop". So the shared
//     usePanelDismiss composable is behaviour-tested here, and AppModal is NOT
//     touched (its `dismissable: false` default stands).
//
// WHY SOURCE-LEVEL for the CSS half: jsdom has no layout engine and paints nothing, so
// no mount can observe a background or a backdrop-filter taking effect. The precedent is
// chipPopoverStacking.test.js / modalDragAndScrim.test.js next door.
//
// WHY BEHAVIOURAL for the composable half: it is all Element.closest() and
// Node.contains(), neither of which needs geometry — jsdom runs them faithfully. These
// are real tests of real dismissal, not source greps.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, h, ref, nextTick } from "vue";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { usePanelDismiss } from "@delebash/llm-ui";

const HERE = dirname(fileURLToPath(import.meta.url));
// …/justwrite-app/src/components/__tests__ → …/Web, then into the kit.
// Same repo-to-kit relationship vitest.config.js's alias encodes (identical to
// modalDragAndScrim.test.js — deliberately, so a kit move breaks both at once).
const WEB = resolve(HERE, "../../../..");
const readKit = (rel) => readFileSync(resolve(WEB, "just-llm-runner/ui/src", rel), "utf8");
const readJw = (rel) => readFileSync(resolve(HERE, "../..", rel), "utf8");

// The single <style> block of an SFC, comments stripped, so a rule match can anchor on a
// preceding `}` without tripping over the file's prose.
function styleOf(vueSource) {
  const m = vueSource.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!m) throw new Error("no <style> block found");
  return m[1].replace(/\/\*[\s\S]*?\*\//g, "");
}

// The body of ONE rule, matched on the selector exactly as it appears in source.
function ruleBody(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = css.match(new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, "m"));
  if (!rule) throw new Error(`no rule found for selector \`${selector}\``);
  return rule[1];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. NO DIM, NO BLUR — per surface.
// ─────────────────────────────────────────────────────────────────────────────

const SURFACES = [
  { name: "HelpDrawer", selector: ".help-drawer-overlay", css: styleOf(readKit("common/components/HelpDrawer.vue")) },
  { name: "CommandPalette", selector: ".cp-overlay", css: styleOf(readJw("components/CommandPalette.vue")) },
  { name: "SceneLinks", selector: ".links-overlay", css: styleOf(readJw("components/SceneLinks.vue")) },
];

describe("no overlay dims or blurs the page behind it (user ruling, 2026-07-19)", () => {
  for (const { name, selector, css } of SURFACES) {
    describe(name, () => {
      it(`parses ${selector} — a rename must fail loudly, not silently pass`, () => {
        expect(ruleBody(css, selector)).toContain("position");
      });

      it("paints a transparent background — no scrim, no color-mix dim", () => {
        const body = ruleBody(css, selector);
        expect(body).toMatch(/background:\s*transparent/);
        expect(body).not.toMatch(/--scrim/);
        expect(body).not.toMatch(/color-mix/);
      });

      it("declares NO backdrop-filter anywhere in its stylesheet", () => {
        expect(css).not.toMatch(/backdrop-filter/);
      });

      it("keeps the overlay ELEMENT — it still positions / catches clicks", () => {
        const body = ruleBody(css, selector);
        expect(body).toMatch(/position:\s*fixed/);
        expect(body).toMatch(/inset:\s*0/);
      });
    });
  }

  it("styles.css no longer declares the dead blurring `.modal-overlay` rule", () => {
    const css = readJw("styles.css").replace(/\/\*[\s\S]*?\*\//g, "");
    // An unfiltered grep across every file type under src/ found ZERO consumers, so
    // the whole rule was deleted rather than de-dimmed. Comments are stripped above
    // so the tombstone comment can't satisfy this.
    expect(css).not.toMatch(/\.modal-overlay\s*\{/);
    expect(css).not.toMatch(/backdrop-filter/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2/3. usePanelDismiss — real behaviour.
// ─────────────────────────────────────────────────────────────────────────────

let app;
let host;

afterEach(() => {
  if (app) app.unmount();
  if (host) host.remove();
  app = null;
  host = null;
  document.body.innerHTML = "";
});

// Mounts a panel wired to the composable, plus the outside fixtures every test needs:
// a plain outside div, a [data-panel-toggle] trigger, a portaled [role="dialog"], and
// Reka Select popover content.
async function mountPanel() {
  const open = ref(true);
  const close = vi.fn(() => { open.value = false; });
  const panelEl = ref(null);

  host = document.createElement("div");
  document.body.appendChild(host);
  app = createApp({
    setup() {
      usePanelDismiss(open, panelEl, close);
      return () => h("div", [
        h("aside", { ref: panelEl, id: "panel" }, [h("button", { id: "inside" }, "x")]),
        h("div", { id: "outside" }, "elsewhere"),
        h("button", { id: "toggle", "data-panel-toggle": "" }, "Ask"),
        h("div", { id: "portaled-modal", role: "dialog" }, [h("span", { id: "in-modal" }, "m")]),
        h("div", { class: "ui-select-content" }, [h("span", { id: "in-select" }, "opt")]),
      ]);
    },
  });
  app.mount(host);
  await nextTick();
  return { open, close };
}

const mousedownOn = (id) =>
  document.getElementById(id).dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

describe("usePanelDismiss — click-outside", () => {
  it("closes on a mousedown genuinely outside the panel", async () => {
    const { close } = await mountPanel();
    mousedownOn("outside");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does NOT close on a mousedown INSIDE the panel", async () => {
    const { close } = await mountPanel();
    mousedownOn("inside");
    expect(close).not.toHaveBeenCalled();
  });

  it("does NOT close on a [data-panel-toggle] trigger — the toggle would otherwise look dead", async () => {
    // THE mutation-checked test. Break the exemption in usePanelDismiss.js and this
    // goes red: without it, mousedown closes the panel and the trigger's own click
    // immediately re-opens it, so a second nav click appears to do nothing.
    const { close } = await mountPanel();
    mousedownOn("toggle");
    expect(close).not.toHaveBeenCalled();
  });

  it("does NOT close for a portaled [role=\"dialog\"] — a modal over the panel is not 'outside'", async () => {
    const { close } = await mountPanel();
    mousedownOn("in-modal");
    expect(close).not.toHaveBeenCalled();
  });

  it("does NOT close for Reka Select popover content portaled out of the panel", async () => {
    const { close } = await mountPanel();
    mousedownOn("in-select");
    expect(close).not.toHaveBeenCalled();
  });

  it("ignores outside mousedowns once the panel is closed", async () => {
    const { open, close } = await mountPanel();
    open.value = false;
    await nextTick();
    mousedownOn("outside");
    expect(close).not.toHaveBeenCalled();
  });

  it("listens on mousedown, NOT click — Reka detaches Select options before click bubbles", async () => {
    const { close } = await mountPanel();
    document.getElementById("outside").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(close).not.toHaveBeenCalled();
  });
});

describe("usePanelDismiss — Esc", () => {
  it("closes on Escape while open", async () => {
    const { close } = await mountPanel();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does nothing on Escape while closed", async () => {
    const { open, close } = await mountPanel();
    open.value = false;
    await nextTick();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(close).not.toHaveBeenCalled();
  });

  it("ignores other keys", async () => {
    const { close } = await mountPanel();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(close).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. The extraction really happened — no second implementation survives.
// ─────────────────────────────────────────────────────────────────────────────

describe("the dismissal logic lives in ONE place (R3)", () => {
  const CHAT = readJw("components/ChatPanel.vue");
  const AIP = readKit("components/AiStatusPanel.vue");

  it("ChatPanel calls the shared composable", () => {
    expect(CHAT).toMatch(/usePanelDismiss\(/);
  });

  it("ChatPanel registers NO document keydown/mousedown dismissal of its own", () => {
    expect(CHAT).not.toMatch(/document\.addEventListener\(\s*["']mousedown["']/);
    expect(CHAT).not.toMatch(/document\.addEventListener\(\s*["']keydown["']/);
  });

  it("AiStatusPanel calls the shared composable and keeps no copy either", () => {
    expect(AIP).toMatch(/usePanelDismiss\(/);
    expect(AIP).not.toMatch(/document\.addEventListener\(/);
  });

  it("one toggle vocabulary — the old data-chat-toggle / data-ai-status-toggle names are gone EVERYWHERE", () => {
    // Walks the WHOLE renderer tree + scripts/, not a hand-listed handful. A
    // four-file version of this test passed green while three Playwright probe
    // selectors still targeted the dead `[data-chat-toggle]` and silently matched
    // nothing — the test name claimed more than the test checked. An unfiltered
    // walk is the only honest form of an "everywhere" claim.
    //
    // Comments are stripped first: files legitimately NAME the old attributes in
    // their history notes, and a test that failed on prose would be testing prose.
    const stripComments = (s) =>
      s.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    const ROOTS = [resolve(HERE, "../.."), resolve(HERE, "../../../scripts")];
    const offenders = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "__tests__") continue;
        const p = resolve(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.(vue|js|mjs|ts|css)$/.test(e.name)) continue;
        const code = stripComments(readFileSync(p, "utf8"));
        if (/data-chat-toggle|data-ai-status-toggle/.test(code)) offenders.push(p);
      }
    };
    for (const r of ROOTS) walk(r);
    expect(offenders).toEqual([]);
  });
});
