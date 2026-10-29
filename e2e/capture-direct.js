// The marketing screenshots: the REAL desktop app (Electron, the built UI), driven through
// e2e/lib/driver.js (Playwright's Electron driver; it replaced tauri-driver + msedgedriver on
// 2026-10-08), saving PNGs straight into the website's public/screenshots/ folder.
//
// It runs on a COPY of your data (scripts/lib/scratch-server.js `snapshotDataRoot` — your data
// folder is only read), with a sample book imported into the copy as Import a book does (the
// bundled "The Salt-Iron Road" unless JW_SHOTS_BOOK names another .zip). The copy borrows your
// installed engine and models (`cacheRoot`), because the FEATURES below run the real AI — the
// pictures show real answers, nothing stubbed. That uses the graphics card: ask JustVoice first.
//
// Run with: node capture-direct.js   (from e2e/; `npm run build` at the app root first)
//   JW_SHOTS_DIR   where the PNGs go (default: the website checkout beside this repo)
//   JW_SHOTS_BOOK  the book .zip to import into the copy
//   JW_DATA_ROOT   the data folder to copy (default: the one the app uses — findDataRoot)
//   JW_SHOTS_ONLY  only these pictures, by name (e.g. "sheet-draft,ask-the-book") — a retake
//   --no-ai        the page pictures only, without the FEATURES (no model, no graphics card)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findDataRoot, killTree, snapshotDataRoot, startServer } from "../scripts/lib/scratch-server.js";
import { Driver } from "./lib/driver.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.JW_SHOTS_DIR || path.resolve(__dirname, "../../justwrite-website/public/screenshots");
const BOOK_ZIP = process.env.JW_SHOTS_BOOK || path.resolve(__dirname, "../server/samples/The Salt-Iron Road.zip");
const WITH_AI = !process.argv.includes("--no-ai");
const ONLY = (process.env.JW_SHOTS_ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
// the copy's own server, only to import the book before the app opens (the smoke's is 17496, the
// eval's 17497, the flows' 17498; 17499 is just-house-paint's registered server port — the kit's
// app-structure.md port registry — so this one moved off it on 2026-10-28)
const PREP_PORT = Number(process.env.JW_SHOTS_PORT || 17504);
// a local model on a modest graphics card can take minutes over one answer
const AI_TIMEOUT = 10 * 60_000;

// Each target may set `focusNode` — a Relations node's name, clicked so its
// lines show — and `scroll` (CSS pixels), applied to the page's own scroller,
// falling back to window.scrollTo. Used to push past KPI strips on long pages
// so the screenshot lands on the more visually interesting body sections.
const TARGETS = [
  // Manuscript
  { name: "home-light",         hash: "#/",                    wait: 2500 },
  // a scene's prose (the chapter's own page is its scene cards, untitled in the sample book)
  { name: "editor",             hash: "#/chapters/ch1/scn_ch1_1", wait: 3000 },

  // Story world
  { name: "characters-list",    hash: "#/characters",          wait: 2500 },
  { name: "characters",         hash: "#/characters/c1",       wait: 3000 },
  { name: "locations",          hash: "#/locations",           wait: 2500 },
  { name: "objects",            hash: "#/objects",             wait: 2500 },
  { name: "groups",             hash: "#/groups/g1",           wait: 2500 },
  { name: "architecture",       hash: "#/architecture",        wait: 2500 },
  { name: "worldbuilding",      hash: "#/worldbuilding",       wait: 2500 },
  // the graph draws its lines for the node in focus — the protagonist's
  { name: "relations",          hash: "#/relations",           wait: 3000, focusNode: "Sable Coyne" },

  // Planning / structure
  { name: "strands",            hash: "#/strands",             wait: 2500 },
  { name: "plotboard",          hash: "#/plot",                wait: 2500 },
  { name: "timeline",           hash: "#/timeline",            wait: 2500 },
  { name: "notes",              hash: "#/notes",               wait: 2500 },
  { name: "brainstorm",         hash: "#/brainstorm",          wait: 2500 },

  // Analysis / reflection
  // past the pace chart and writing year, which an imported book has no sessions for
  { name: "analysis",           hash: "#/analysis",            wait: 3500, scroll: 760 },
  // the file names are the website's; the old Writer Lab — every AI feature's prompt, model and
  // preset — is the AI page's Routing by feature tab now
  { name: "writer-lab",         hash: "#/ai?tab=features",     wait: 3000 },

  // Settings
  { name: "settings-project",   hash: "#/settings/project",    wait: 2500 },
  { name: "settings-ai",        hash: "#/ai",                  wait: 2500 },
  { name: "settings-appearance", hash: "#/settings/appearance", wait: 2500 },
  { name: "settings-usage",     hash: "#/ai?tab=usage",        wait: 2500 },
  { name: "settings-backups",   hash: "#/settings/backups",    wait: 2500 },

  // Import / export
  { name: "import",             hash: "#/import",              wait: 2500 },
  { name: "export",             hash: "#/export",              wait: 2500 },
];

// The features added since v1.0.0, each shown with a real answer from the model. The words typed
// in are the sample book's (The Salt-Iron Road); `run` leaves the screen to capture.
const FEATURES = [
  {
    // Locations, objects and groups have sheets, drafted from a description (2026-10-16)
    name: "sheet-draft",
    async run(d, page) {
      await d.navigate("#/locations/l1");
      await d.sleep(2500);
      await page.getByRole("button", { name: /Draft with AI/ }).first().click();
      await page.getByText("From a description", { exact: true }).click();
      await page.locator("textarea").first().fill(
        "Noon glare off the salt flats, grit in every seam, the smell of brine and hot iron; caravans cross only by night, and the old road-cairns are older than either crown.",
      );
      await page.getByRole("button", { name: /^Draft$/ }).first().click();
      await page.locator(".cpf-row").first().waitFor({ timeout: AI_TIMEOUT });
      await d.sleep(1000);
    },
  },
  {
    // A scene drafted from its plan, the AI's words in their violet ink (2026-10-18)
    name: "scene-draft",
    async run(d, page) {
      await d.navigate("#/settings/project");
      await d.sleep(2000);
      const drafting = page.getByRole("switch", { name: "AI scene drafting" });
      if ((await drafting.getAttribute("aria-checked")) !== "true") await drafting.click();
      // New scene is the scene editor's, so a scene is opened first (as tests/flows' openSceneWithProse)
      await d.navigate("#/chapters/ch2");
      await d.sleep(2500);
      await page.getByRole("button", { name: /^scene 1/i }).first().click();
      await page.getByRole("button", { name: /New scene/ }).first().click();
      await page.getByRole("button", { name: /Links/ }).first().click();
      await page.getByRole("textbox", { name: "Summary" }).fill(
        "At the night halt Wren pries open the unlisted crate and finds salt-iron ingots stamped with the Regent's seal. Sable catches her at it — and, instead of raising the camp, helps her nail the lid back down.",
      );
      await page.getByRole("button", { name: "Close links panel" }).click();
      await page.locator(".scene-draft-cta").getByRole("button", { name: "Draft from plan" }).click();
      const accept = page.getByRole("button", { name: "Accept all" });
      await accept.waitFor({ timeout: AI_TIMEOUT });
      await accept.click();
      await page.locator(".ProseMirror span[data-ai-text]").first().waitFor();
      await d.sleep(1500);
    },
  },
  {
    // Ask the book: an answer from the manuscript, with the passages it cites
    name: "ask-the-book",
    async run(d, page) {
      await d.navigate("#/chapters/ch2");
      await d.sleep(2000);
      await page.keyboard.press("Control+j");
      const panel = page.locator(".chat-panel");
      await panel.waitFor();
      // a book imported into the copy has no index yet: its window (IndexBuildModal) builds as it
      // opens and ends on Done
      const build = panel.getByRole("button", { name: "Build index" });
      if (await build.count()) {
        await build.click();
        await page.getByRole("button", { name: "Done", exact: true }).click({ timeout: AI_TIMEOUT });
      }
      await panel.locator("textarea").fill("What is in the unlisted crate, and who wants it?");
      await panel.locator("textarea").press("Enter");
      await answered(page);
      await d.sleep(1500);
    },
  },
  {
    // Talk to a character, in their story-bible voice, with Save to sheet under the answer (2026-10-11)
    name: "talk-to-character",
    async run(d, page) {
      await page.keyboard.press("Escape");
      await d.navigate("#/characters/c1");
      await d.sleep(2500);
      await page.getByRole("button", { name: /^Talk to / }).first().click();
      const panel = page.locator(".chat-panel");
      await panel.locator("textarea").fill("What do you owe Adder Voss, and what happens if you don't pay?");
      await panel.locator("textarea").press("Enter");
      await panel.getByRole("button", { name: "Save to sheet" }).first().waitFor({ timeout: AI_TIMEOUT });
      await d.sleep(1500);
    },
  },
  {
    // Brainstorm where it's used (2026-10-28): Name ideas at a character's name, from a seed
    name: "name-ideas",
    async run(d, page) {
      await page.keyboard.press("Escape");
      await d.navigate("#/characters/c2");
      await d.sleep(2500);
      await page.getByRole("button", { name: "Name ideas" }).click();
      const panel = page.locator(".bs-popup");
      await panel.getByRole("textbox", { name: "Seed prompt" }).fill("short and desert-worn, two syllables");
      await panel.getByRole("button", { name: "Generate" }).click();
      await panel.locator(".bsr-item").first().waitFor({ timeout: AI_TIMEOUT });
      await d.sleep(1000);
    },
  },
  {
    // The built-in local AI: its model catalog, each model sized against this computer
    name: "ai-models",
    async run(d, page) {
      await page.keyboard.press("Escape");
      await d.navigate("#/ai");
      await d.sleep(3000);
      await page
        .getByText("Built-in provider — llama.cpp")
        .locator("xpath=ancestor::*[.//button[normalize-space()='Edit']][1]")
        .getByRole("button", { name: "Edit" })
        .click();
      await d.sleep(3000);
      // the catalog sits below the provider's form and the engine row
      await page.getByText("Model Catalog", { exact: true }).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
      await d.sleep(1500);
    },
  },
];

/** Until the chat panel's newest answer is complete — a pending one shows "…" (ChatPanel.vue), and
 * a streaming one keeps its task's Cancel in the panel until the last token. */
async function answered(page) {
  // an answer, or the error the panel shows in its place — which ends the wait at once, with its words
  // (2026-10-29: a model that failed to load kept the capture waiting its whole ten minutes)
  await page.waitForFunction(() => {
    const msgs = document.querySelectorAll(".chat-panel .cp-msg-assistant");
    const last = msgs[msgs.length - 1];
    if (last?.querySelector(".q-banner")) return true;
    const text = last?.querySelector(".cp-bubble-assistant")?.textContent.trim();
    return Boolean(text) && text !== "…";
  }, null, { timeout: AI_TIMEOUT });
  const failed = page.locator(".chat-panel .cp-msg-assistant").last().locator(".q-banner");
  if (await failed.count()) throw new Error(`the chat answered with an error: ${(await failed.textContent()).trim()}`);
  await page.locator(".chat-panel").getByRole("button", { name: "Cancel" }).waitFor({ state: "detached", timeout: AI_TIMEOUT });
}

/** JW_SHOTS_ONLY="name,name" retakes just those pictures (page or feature names). */
function wanted({ name }) {
  return !ONLY.length || ONLY.includes(name);
}

/** A copy of the user's data with the sample book imported and made the open book. */
async function prepareData() {
  const source = await findDataRoot();
  if (!source) throw new Error("No JustWrite data folder found to copy (set JW_DATA_ROOT).");
  const dir = snapshotDataRoot(source, { prefix: "jw-shots-", cacheRoot: path.join(source, "ai-cache") });
  const server = startServer({ port: PREP_PORT, dataDir: dir });
  try {
    const base = `http://127.0.0.1:${PREP_PORT}`;
    for (let i = 0; ; i++) {
      try {
        if ((await fetch(`${base}/v1/health`)).ok) break;
      } catch {}
      if (i > 120) throw new Error("The copy's server didn't start.");
      await new Promise((r) => setTimeout(r, 500));
    }
    const zipBase64 = fs.readFileSync(BOOK_ZIP).toString("base64");
    const r = await fetch(`${base}/v1/projects/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zipBase64 }) });
    if (!r.ok) throw new Error(`Import failed: ${r.status} ${await r.text()}`);
    const { id, title } = await r.json();
    const s = await fetch(`${base}/v1/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activeProjectId: id }) });
    if (!s.ok) throw new Error(`Opening the book failed: ${s.status} ${await s.text()}`);
    console.log(`→ "${title}" imported into the copy (${id})`);
  } finally {
    killTree(server);
  }
  return dir;
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const dataDir = await prepareData();
  // the app's own server on the copy, and its family registrations kept there too
  process.env.JUSTWRITE_DATA_DIR = dataDir;
  process.env.JUST_AI_HOME = dataDir;

  console.log("→ launching the app");
  const d = new Driver();
  await d.launch();
  await d.maximize();
  // Let the app boot fully — the stores hydrate from the server on mount.
  await d.sleep(4000);

  try {
    // Switch the active theme preset BEFORE running the capture loop, so
    // every shot reflects that look. Navigates to Settings → Appearance
    // and clicks the named preset tile, then jumps to a neutral route so
    // the first real target doesn't have to undo the settings page.
    const THEME = process.env.JW_THEME || "Fine Press";
    console.log(`→ setting theme preset: ${THEME}`);
    await d.navigate("#/settings/appearance");
    await d.page.locator(".preset-tile").first().waitFor({ timeout: 30_000 });
    const clicked = await d.exec(
      `const tile = [...document.querySelectorAll('.preset-tile')]
         .find((el) => el.querySelector('b') && el.querySelector('b').textContent.trim() === arguments[0]);
       if (!tile) return false;
       tile.click();
       return true;`,
      [THEME],
    );
    if (!clicked) throw new Error(`Theme preset "${THEME}" tile not found.`);
    // Give applyAppearance() time to push CSS custom properties + swap fonts.
    await d.sleep(1200);
    await d.navigate("#/");
    await d.sleep(800);

    for (const t of TARGETS.filter(wanted)) {
      console.log(`→ ${t.name} (${t.hash})`);
      await d.navigate(t.hash);
      await d.sleep(t.wait);
      if (t.focusNode) {
        await d.page.locator(".relations-node", { hasText: t.focusNode }).first().click();
        await d.sleep(800);
      }
      if (t.scroll) {
        // the page's own scroller: the tallest box in the page area that scrolls
        await d.exec(
          `const boxes = [...document.querySelectorAll(".q-page-container *")].filter((el) =>
             el.scrollHeight > el.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(el).overflowY));
           const el = boxes.sort((a, b) => b.clientHeight - a.clientHeight)[0];
           if (el) el.scrollTop = arguments[0]; else window.scrollTo(0, arguments[0]);`,
          [t.scroll],
        );
        await d.sleep(400);
      }
      const file = path.join(OUT_DIR, `${t.name}.png`);
      await d.screenshot(file);
      console.log(`   saved ${path.basename(file)}`);
    }

    for (const f of WITH_AI ? FEATURES.filter(wanted) : []) {
      console.log(`→ ${f.name} (the real model)`);
      await f.run(d, d.page);
      // the pointer off the page, so no hover tooltip lands in the picture
      await d.page.mouse.move(1, 1);
      await d.sleep(400);
      const file = path.join(OUT_DIR, `${f.name}.png`);
      await d.screenshot(file);
      console.log(`   saved ${path.basename(file)}`);
    }
  } catch (e) {
    // what the app showed when the step failed, beside the pictures
    await d.screenshot(path.join(OUT_DIR, "capture-failed.png")).catch(() => {});
    throw e;
  } finally {
    console.log("→ closing the app");
    await d.close();
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch (e) {
      console.log(`   the copy stays at ${dataDir} (${e.code}) — remove it by hand`);
    }
  }
  console.log("done.");
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
