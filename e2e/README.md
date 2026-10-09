# JustWrite — E2E test & screenshot harness

Automation over the REAL desktop app — Electron, the built UI from `app://justwrite`, its own
server on the dev data folder `<repo>/data` (your real data) — through Playwright's Electron
driver (`playwright-core`; since the family's move off Tauri, 2026-10-08). The wrapper lives in
`lib/driver.js`; it keeps the old harness's `Driver` API, so the tests read as before:
`exec(script, args)` runs a WebDriver-style script body in the page (over the debugger protocol,
so the app's real Content-Security-Policy stays on), and every DOM helper rides it.

## Prereqs

```bash
npm install                          # here (playwright-core), at the app root and in src-electron/ (electron)
npm run build                        # from the app root — the harness drives the BUILT desktop app
                                     # (dist/electron/UnPackaged with its server package installed —
                                     # build:unpacked skips that install, so the app finds no server)
```

No browser download and no driver binary: Playwright attaches to the Electron the app ships.

## Scripts

### `npm run capture`

Drives the desktop app through a fixed list of routes and saves PNGs straight into the
website's `public/screenshots/` folder. Used to refresh the marketing shots. Edit
`capture-direct.js` to change the route list or output path.

Before the route loop runs, the script clicks the named theme preset in Settings → Appearance so
every shot reflects that look. Default is **Fine Press**; override with the `JW_THEME` env var:

```bash
JW_THEME="Fine Press"   npm run capture   # default
JW_THEME="Studio"       npm run capture
JW_THEME="Ivory Press"  npm run capture
JW_THEME="Calm Modern"  npm run capture
JW_THEME="Editorial"    npm run capture
```

The value has to match the preset's visible `<b>` label exactly. The choice persists in your
settings, so later app launches keep the same theme until you switch again.

### `npm test`

Runs the smoke suite (`tests/*.test.js`) via Node's built-in test runner. Launches the app once
and shares it across the tests. Currently:

| Test | What it asserts |
| --- | --- |
| titlebar | window title contains "JustWrite" |
| sidebar mounts | a Manuscript section header is in the DOM |
| project hydrates | `#/chapters` renders without error |
| analysis route | KPIs render |
| AI Settings | `#/ai` lists configured providers |
| theme switcher | Fine Press → Studio → Fine Press moves `--accent-hue` 14 → 200 → 14 |
| undo/redo binding | keydown handlers respond |

The theme test is the suite's one write: your `ui` settings section is read before the suite
and written back after it, so your own theme survives a run.

### `npm run phone:ios` — the phone app on the iOS simulator

`phone-ios.js` drives the phone app (Quasar's Capacitor mode) on a booted iOS simulator through
Appium's XCUITest driver, with WebdriverIO as the client. It needs a Mac, so it runs on GitHub's
macOS runner: `.github/workflows/phone-ios.yml` (manual — the Actions page's "Run workflow", or
`gh workflow run phone-ios.yml`) builds the app for the simulator, boots one, starts Appium and
runs it. A fresh install opens on the welcome screen; **Try the tutorial project** makes the book
through the app's in-app server; Chapters, a scene in the editor, Characters, AI and
Settings → Sync are photographed from the simulator's own display (`simctl io screenshot`); then
the app is quit and reopened and the book must still be there. The screenshots and `report.json`
are the run's `ios-simulator` artifact. On a Mac by hand: `SIM_UDID=<booted simulator>
APP_PATH=<App.app> npm run phone:ios -- <outDir>`, with Appium on 127.0.0.1:4723.

## How it works

1. `lib/driver.js` launches the unpackaged desktop app (Quasar's `dist/electron/UnPackaged`, run
   by `src-electron`'s Electron) with Playwright's `_electron`, which loads the built UI from
   `app://justwrite`; the app's shell starts its server on :17495 over `<repo>/data` (or
   `JUSTWRITE_DATA_DIR`). `JUSTWRITE_DEV_NO_SERVER=1` keeps the shell from starting one (then the suite
   talks to whatever you started on :17495).
2. `exec(script, args)` evaluates a function expression in the page; `navigate`, `textOf`,
   `exists`, `click`, `waitUntil`… ride it. `maximize` and `screenshot` go through Electron and
   Playwright directly.

## Adding a test

Drop a new `tests/*.test.js` file. Use the shared `Driver` instance pattern from
`smoke.test.js`:

```js
import { test, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { Driver } from "../lib/driver.js";

const d = new Driver();
before(async () => { await d.launch(); });
after(async  () => { await d.close(); });

test("my feature", async () => {
  await d.navigate("#/some/route");
  await d.waitUntil(`return /some text/.test(document.body.textContent);`);
});
```

A test that changes your data must put it back — the suite runs on your real data folder.

## Adding a screenshot

Append to the `TARGETS` array in `capture-direct.js`. Each entry is `{ name, hash, wait }`. The PNG
lands at `../../justwrite-website/public/screenshots/<name>.png`.

## Gotchas

- The harness drives whatever `dist/electron/UnPackaged/` was last built. Run
  `npm run build` in the app root if your source has drifted.
- Don't run with your own JustWrite open — both would start a server on :17495 over the same
  data folder (the shell evicts the other listener).
- On boot the app may start loading your default AI model (warm-on-startup); closing the app
  stops it and its llama-server.
