# JustWrite — E2E test & screenshot harness

WebDriver-driven automation for the real Tauri build. Drives WebView2
on Windows via [tauri-driver](https://github.com/tauri-apps/tauri/tree/dev/tooling/webdriver)
+ msedgedriver, talking direct WebDriver HTTP from Node — no
WebdriverIO. The webdriver wrapper lives in `lib/driver.mjs`.

## Prereqs

```bash
# Rust + cargo already required for the app.
cargo install --locked tauri-driver

npm install         # installs Node deps + fetches msedgedriver via postinstall
```

`npm install` triggers `scripts/fetch-driver.mjs`, which detects your
local Microsoft Edge version (Windows registry → `BLBeacon`) and
downloads the matching `msedgedriver.exe` from
<https://msedgedriver.microsoft.com/> into `drivers/`. The binary is
gitignored — Edge auto-updates roughly monthly and a committed driver
would go stale.

Refresh manually after a major Edge update:

```bash
npm run fetch-driver   # --force re-downloads even if a driver is present
```

## Scripts

### `npm run capture`

Drives the production Tauri binary at `../src-tauri/target/release/justwrite.exe`
through a fixed list of routes and saves PNGs straight into the
website's `public/screenshots/` folder. Used to refresh the marketing
shots. Edit `capture-direct.mjs` to change the route list or output
path.

### `npm test`

Runs the smoke suite (`tests/*.test.mjs`) via Node's built-in test
runner. Launches the real Tauri build once, shares the session across
tests for speed. Currently:

| Test | What it asserts |
| --- | --- |
| titlebar | window title contains "JustWrite" |
| sidebar mounts | a Manuscript section header is in the DOM |
| project hydrates | `#/chapters` renders without error |
| analysis route | KPIs render |
| studio route | Cast/voice content visible |
| settings → AI | configured providers visible |
| theme switcher | *skipped — needs reka-ui-aware selector* |
| undo/redo binding | keydown handlers respond |

## How it works

1. `lib/driver.mjs` spawns `tauri-driver` on `127.0.0.1:4444`, pointing
   it at `drivers/msedgedriver.exe` (the W3C-compliant Edge WebDriver
   that drives the WebView2 control inside our Tauri window).
2. A WebDriver session is created with `tauri:options.application`
   pointing at the built `.exe`. tauri-driver launches that binary,
   msedgedriver attaches to its WebView2 instance, and we get a normal
   WebDriver session for the renderer process.
3. The `Driver` class wraps the protocol with thin helpers:
   `navigate`, `exec`, `waitUntil`, `screenshot`, `attr`, `click`,
   `textOf`, `exists`, etc. Tests use those directly.

## Why not WebdriverIO?

We tried — both v9 (undici-level `UND_ERR_INVALID_ARG` on session
create) and v8 (hangs during session handshake, no diagnostic output).
Direct HTTP is ~120 lines, deterministic, and proven to work.

## Adding a test

Drop a new `tests/*.test.mjs` file. Use the shared `Driver` instance
pattern from `smoke.test.mjs`:

```js
import { test, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { Driver } from "../lib/driver.mjs";

const d = new Driver();
before(async () => { await d.launch(); });
after(async  () => { await d.close(); });

test("my feature", async () => {
  await d.navigate("#/some/route");
  await d.waitUntil(`return /some text/.test(document.body.textContent);`);
});
```

## Adding a screenshot

Append to the `TARGETS` array in `capture-direct.mjs`. Each entry is
`{ name, hash, wait }`. The PNG lands at
`../../justwrite-website/public/screenshots/<name>.png`.

## Gotchas

- The release binary is whatever was last built. Run `npm run build`
  in the app root if your source has drifted.
- Don't run with your own JustWrite open. Both instances share AppData
  and IDB; concurrent writes from autosave race.
- `tauri-driver` is brittle if the port is already bound. The harness
  spawns it and kills it on exit; orphaned processes (after a kill -9)
  need a manual `taskkill /F /IM tauri-driver.exe`.
