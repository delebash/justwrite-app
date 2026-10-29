// Accessibility — every page of the REAL desktop app against WCAG 2.2 AA (the kit's app-structure §17), checked by
// axe-core, Deque's engine and the standard automated check (playwright.dev/docs/accessibility-testing), in the
// light theme and the dark one. The family template's e2e/tests/a11y.test.js on JustWrite's pages: every route,
// Settings section and open-book page in lib/pages.js, and the AI page's tabs. axe finds what a machine can —
// names, roles, contrast, ARIA misuse; the keyboard path through a screen and its reading order stay a person's
// review. On your real data, like the smoke suite (lib/driver.js): the theme follows the system for the run, and
// your `ui` settings section (where the theme lives) is written back after it.
//
// Before: `npm run build` from the app root (the harness drives what was last built). Run: `npm test` here.

import { strict as assert } from "node:assert";
import { after, before, test } from "node:test";
import { AxeBuilder } from "@axe-core/playwright";
import { Driver } from "../lib/driver.js";
import { firstOfEachKind, pagesOf } from "../lib/pages.js";

// WCAG 2.0, 2.1 and 2.2, levels A and AA — axe's tags (github.com/dequelabs/axe-core/blob/develop/doc/API.md)
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const API = "http://127.0.0.1:17495/v1";
// a page's data and its late parts (measured on the sample book: 1.2 s covers every page)
const SETTLE_MS = 1_200;

const d = new Driver();
let page;
let pages;
let uiWas; // the user's `ui` settings section, restored in after()

before(async () => {
  await d.launch();
  await d.maximize();
  page = d.page;
  await page.waitForSelector(".q-page", { timeout: 30_000 });
  uiWas = (await (await fetch(`${API}/settings`)).json()).ui;
  pages = pagesOf(await page.evaluate(firstOfEachKind));
  // the theme follows the system for the run, so each scheme below is the one emulated
  await d.navigate("#/settings/appearance");
  await page.locator('[data-testid="theme-mode-system"]').click();
});

after(async () => {
  try {
    if (uiWas !== undefined) {
      // Past the renderer's 150 ms settings debounce, then the user's section goes back.
      await d.sleep(500);
      await fetch(`${API}/settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ui: uiWas }),
      });
    }
  } finally {
    await d.close();
  }
});

/** axe's violations on what the window shows now, as lines a failure can be read from. Legacy mode: axe otherwise
 *  gathers its results in a blank page it opens, and Playwright's Electron opens none ("Target.createTarget: Not
 *  supported" — measured by docgen's session on its built app, 2026-10-29); legacy mode skips that page and only
 *  loses cross-origin frames, which the app has none of (axe-core-npm's playwright README, setLegacyMode). */
async function violations(where) {
  // a toast fading in is measured mid-fade (axe reads its colours at that moment): the finite animations and
  // transitions running now end first — a spinner's endless one isn't waited for; after 5 s it scans anyway
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Number.POSITIVE_INFINITY), null, { timeout: 5_000 })
    .catch(() => {});
  const { violations: found } = await new AxeBuilder({ page }).withTags(TAGS).setLegacyMode().analyze();
  return found.map((v) => `${where} — ${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

for (const scheme of ["light", "dark"]) {
  test(`every page meets WCAG 2.2 AA in the ${scheme} theme`, async () => {
    await page.emulateMedia({ colorScheme: scheme });
    const found = [];
    for (const hash of pages) {
      await d.navigate(hash);
      await d.sleep(SETTLE_MS);
      assert.equal(await d.htmlAttr("data-theme"), scheme, hash);
      found.push(...(await violations(hash)));
    }
    // the AI page's tabs, each from its tab strip
    await d.navigate("#/ai");
    await d.sleep(SETTLE_MS);
    const tabs = page.locator('.lu-subnav [role="tab"]');
    for (let i = 0, n = await tabs.count(); i < n; i++) {
      const name = (await tabs.nth(i).innerText()).trim();
      await tabs.nth(i).click();
      await d.sleep(SETTLE_MS);
      found.push(...(await violations(`#/ai, the ${name} tab`)));
    }
    assert.deepEqual(found, [], `${found.length} failing, ${scheme} theme`);
  });
}
