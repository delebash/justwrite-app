# TASKS — the live open-work tracker (JustWrite)

> **THIS is JustWrite's live tracker.** Since 2026-08-04 every repo carries its own
> (the docs campaign; the rule: **an item lives where the code that closes it
> lives**): kit + shared-server work → `../just-llm-runner/docs/dev/TASKS.md` ·
> JustVoice → `../JustVioce/docs/dev/TASKS.md` · this file = JustWrite + the
> cross-app coordination items only. Unscheduled ideas live in `docs/dev/IDEAS.md`.
>
> **How to use.** One line per item + a pointer to its detail doc — the depth lives in the
> linked doc, not here. **Close = delete** (the user's ruling, 2026-08-04): when an item ships
> and its QC is done, its line leaves the file — git and the plan docs keep the history. Add an
> item the moment it's real. A tracker line is a claim, not evidence.
>
> **Last swept: 2026-08-04** — close-means-delete applied to the whole file. Every
> SHIPPED/CLOSED narrative was removed; whatever a closed item still owed (a QC glance, a
> veto, a watch) survives below as its own line. The prior sweep notes, the 2026-07-26
> full-verification banner, and all the shipped detail are in `git log -- docs/dev/TASKS.md`.


## JustWrite on Quasar — the desktop app BUILT on branch `quasar`; the Sync screen and the phone next [2026-10-08]
STATE:  DECIDED 2026-10-08 — every family app moves to Quasar (the kit's TASKS, "Every family app
        moves to Quasar…", rec 1: "Quasar's own tooling for everything. Its Electron mode is the
        desktop app, calling the kit's shared function for the data folder, the server and the
        tray. Its Capacitor mode is the phone app."); the go: "we need to do the quasar conversion
        as well you have a go on that". The order of work and its status: the kit's
        `docs/plans/2026-10-08-sync-and-quasar-program.md`, step Q4; the layout: the kit's
        `docs/app-structure.md` §Q.
BUILT:  2026-10-08, on branch `quasar` (worktree `../justwrite-quasar` — the master checkout runs
        your app, so the move stays off it until you merge): `quasar.config.js` (the one build
        config; the kit UI alias; port 1420; electron-builder with the old installer's settings —
        NSIS, the fuses, the launcher, a universal macOS .dmg); `src-electron/` (the kit's
        `runDesktopApp`, the same settings as `electron/main.js`; icons moved from `build/`);
        `src-capacitor/` (com.justwrite.app); the start-up `src/main.js` → the boot file
        `src/boot/jw.js` (the same sequence), the root `src/App.vue` (the shell, renamed
        `AppShell.vue`, or the connection-error screen); `router/routes.js`; `stores/index.js`;
        `src/css/quasar.variables.scss` (the kit's theme); `server/` its own package
        (`justwrite-server`, an npm workspace) holding the editor schema (`server/src/editor/`, the
        renderer imports `justwrite-server/editor/…`) and the samples (`server/samples/`); the
        headless UI from `dist/spa` (the app folder when packaged); the smoke serves the built UI
        from its scratch server (no Vite on 1420 — it can run beside the app now) and snapshots
        through the kit's `openDatabase` (better-sqlite3 was never a root dependency, so every
        smoke ran on an empty folder); the e2e drives `dist/electron/UnPackaged`; the release
        workflow on Quasar's CLI (and it now checks out `just-sqlite-sync`); the docs.
CHECKED: dev mode (the window on :1420, the server from source on `data/`, routes, zero errors once
        Vite's dependency cache is warm — the first run hits Vite's "Outdated Optimize Dep"
        reloads) · the installer builds; the packaged app on a copy of your data (`app://`, the
        bridge, the server, five routes, zero errors) · the headless launcher serves the UI from
        the archive · e2e 7/7 · the smoke on a snapshot of your data · unit 590/590 · server
        141/141 · lint · the kit's guard (kind quasar, no violations) · ten screens against the
        Electron + Vite build at 1440×900: within 0.02 % of their pixels, except disabled buttons
        (Quasar's global disabled rule — the kit's TASKS, the Quasar item, OPEN 5).
OPEN:   1. Your merge of `quasar` into master (close the app first; then `npm install` and once
           `cd src-electron && npm install`).
        2. DONE — the Settings → Sync screen and its user docs (the Sync item below).
        3. The phone: the server in a web worker on SQLite WASM, the storage guard, OneDrive/
           Dropbox sign-in, the QR pairing (the Sync item below).
        4. The release workflow is rewritten for Quasar but not run (it needs a tag).
GO:     given 2026-10-08 ("we need to do the quasar conversion as well you have a go on that").

## The family moves to Electron and a Node server — JustWrite's step is BUILT, waiting on your use [2026-10-08]
STATE:  DECIDED 2026-10-05, 2026-10-07 and 2026-10-08 — every ruling, as shown and approved, is in
        JustVoice's TASKS, "The family moves to Electron and a Node server; Tauri and Python go"
        (the decision lives with the plan, §6 is this repo's step). This item is a pointer only.
BUILT:  2026-10-08, under the user's go "do it all … finsih the conversion your rec on all go!":
        the server in JavaScript (`server/src/`, mounting the kit's `@delebash/llm-runner`), the
        shell (`electron/main.js` on the kit's `runDesktopApp`, the 400 ms close hold), `native.js`
        on the `window.appShell` bridge (About now names Electron's version), the e2e on
        Playwright's Electron driver, `npm run smoke` and the bench on the Node server, the
        electron-builder installer (`npm run build` → `release/`) and the release workflow, the
        docs. The dev data root moved from `src-tauri/target/debug/data` to `<repo>/data` with
        every saved path into it rewritten (9 database cells across the three apps, 18 files, the
        cache registry); the 2026-08-15 headless root is kept aside as `data-old-2026-08-15/`.
        Python (`server/justwrite_server/`) and Tauri (`src-tauri/`) are deleted.
CHECKED: server tests 146/146 · the route diff against the Python server (92 reads: 78
        identical, 14 volatile; 37/37 writes; 4,809 database cells, 0 different) and the seed
        comparison (17,741 cells, 0 different) · the headless smoke (every route, zero JS errors)
        · e2e 7/7 on your real data · the installer installs, starts (window, server, CSP), serves
        headless with the bundled tutorial book; an update and an uninstall keep `data\`.
OPEN:   your use of the moved app — `npm run dev`, or the installer from `npm run build`. The
        release workflow is rewritten for electron-builder but not run (it needs a tag).
GO:     none needed to use it; anything you find gets its own item.

## The phone app's UI library — the theming test [2026-10-08]
STATE:  DECIDED 2026-10-08 (after the test) — the user: "i stopped the electron vite that wasnts
        supposed to happen 1 quasar 2 your rec 3 sync but we need to discuss the design, there are
        several ways to sync sqlite turso https://github.com/sqliteai/sqlite-sync and many others",
        answering the questions as shown: "1. Which library? My lean: Quasar. The override sheet
        is a one-time cost covering every screen, and the two libraries' costs are close. The
        phone shell is the point of the move, and Quasar is the only one that ships it." ·
        "2. Should I commit the test, given the other session is mid-restructure? My lean: on a
        JustWrite branch, so its restructure doesn't sweep the test in or lose it." · "3. Still
        open from before: sync in the first phone release or zip first, your own cloud folder or
        a hosted service, and keep both copies or merge when a chapter is changed on two devices."
        Then: "save everthing we need to restart session save all research in detail and any
        session info so we can pickup without redoing anything".
        So: the phone app's library is **Quasar**; the test is committed on a JustWrite branch
        (approved, not yet run — that message had no go); sync goes to a design discussion
        first — the record is `docs/plans/2026-10-08-sync-design.md`.
        DECIDED 2026-10-08 (the test itself) — the user, "your rec go", on the recs as shown:
        "1. Which libraries go in the test? My lean: Quasar, Element Plus and Reka UI. One
        look-based library that's mobile-aware, one built on CSS variables, and one with no look
        of its own. 2. Which JustWrite screen? My lean: one with fields, buttons, a table and a
        dialog, plus the editor toolbar. You name it."
        The test as shown: "Setup: the same JustWrite screen built with each candidate and driven
        by our appearance engine. Pass: Every Appearance knob changes the screen live. It matches
        today's screen side by side, at desktop and phone width. Pick: the one that passes with
        the fewest override lines."
        Mid-work, the same day: "i dont care how much we have to rewrite dont take that into
        consideration" — rewrite size is not a criterion; override lines count only as how much
        a library fights our look.
        Before it, the same day: "i agree with your recs" (ruling 8 stands; Quasar through its CLI
        if a framework is taken; one JustWrite screen first), then "the questions is can we do our
        own custom theme manager nad not rely on material, i think we need to test that if not we
        can use other vue ui frameworks, use electron vite and capacitor and do our own".
        Named under the go (the rec left the screen to me): Locations (`src/views/LocationsView.vue`)
        — its list is a table (EntityIndex → UiTable) with a search field and facet chips; its
        detail has fields, a checkbox, buttons, tags, the status select, the editor and its
        toolbar, and its dialogs (Images, Groups, Sweep). Every part the rec named is on it.
        Found while setting up: the kit already sits on Reka UI (AppModal, HelpDrawer, UiSelect,
        UiMultiSelect, LuFeatureChip, LuModelCatalog), so today's Locations screen is the Reka
        entry; the test builds the Quasar and Element Plus versions against it.
WHY:    one framework for desktop and phones without Material; the question is whether a
        library's components follow the kit's appearance engine
        (`../just-llm-runner/ui/src/common/services/appearance.js`, live CSS variables).
NOT:    Vue Lynx (native views, not DOM — TipTap can't run; pre-alpha) · PrimeVue 5 (a commercial
        PrimeUI licence with a key since 5.x; 4.5.5 was the last MIT) · Vuetify (Material) · back
        to Tauri (rejected 2026-10-05; a Node sidecar ships node.exe, 103 MB).
BUILT:  2026-10-08, uncommitted — the record is `docs/plans/2026-10-08-phone-ui-library-test.md`.
        The Locations screen on Quasar 2.35.0 and on Element Plus 2.14.7, dev-only pages
        `#/ui-test/quasar/locations` and `#/ui-test/element/locations` (`src/ui-test/`; the router
        imports them only under `import.meta.env.DEV`); `@quasar/vite-plugin` in `vite.config.js`;
        quasar, @quasar/extras, @quasar/vite-plugin, sass-embedded, element-plus as devDependencies
        (the install also moved @floating-ui/core 1.7.5→1.8.0 and utils 0.2.11→0.2.12).
CHECKED: both libraries follow every Appearance knob live on every control (121 checks) and
        match today's screen light and dark, dialogs and menus included; zero JS errors; the
        shipped `vite build` is unchanged (614/615 chunks equal, the one a kit commit made
        meanwhile). Overrides beyond the variable mapping: Quasar 150 lines, Element Plus 94. At
        390 px all three pages are unusable alike (the 280 px sidebar) — only Quasar ships a
        breakpoint drawer. By the approved pick rule (fewest override lines): Element Plus.
        Found: today's status menu draws with no background (StatusSelect.vue's scoped styles
        never reach Reka's portalled menu) — not fixed.
OPEN:   1. DONE 2026-10-08 under "you have a go on it all your recs": the test's code
           (package.json, package-lock.json, vite.config.js, src/router/index.js, src/ui-test/) is
           committed on branch `ui-library-test`; its records (this file, RESEARCH, the plan doc
           and its folder) on master. NOT committed anywhere: biome.json (the stopped
           electron-vite session's edit). The Quasar move (item 3) supersedes the test's pages.
        2. The sync design — moved to its own item below, "Sync — offline first, by file, folder
           and server".
        3. DECIDED 2026-10-08 — every app moves to Quasar, and Quasar's own tooling is the desktop
           shell (its Electron mode, calling the kit's shared function) and the phone (its
           Capacitor mode): the kit's TASKS, "Every family app moves to Quasar", rec 1.
GO:     given 2026-10-08 ("your rec go") for the test; for 2, "… go" (the research and the
        design); 3 is decided. None yet for 1.

## Sync — offline first, by file, folder and server [2026-10-08]
STATE:  DECIDED 2026-10-08, step by step (the record, with every option shown, is
        `docs/plans/2026-10-08-sync-design.md`). For every family app, so the code lives in the kit.
        Widened from JustWrite's phone first — the user: "no we need to decide on sync method for
        jw and make it so we coudl add it to other apps easily if we decide we want to say sync
        acrross desktops or just run the server in the cloud … go".
        1. Offline first — the user, on shape A (one cloud server, every device its client, no
           sync): "a is out, these need to be offline first so rethink".
        2. Licences — the user: "the only license we carred about whas onese that prevented
           commercial use or lgpl no one said it had to be mit". So: anything that allows
           commercial use and isn't copyleft (Apache-2.0 fine; FSL fine — it bars only a competing
           product); out: Elastic License 2.0 (sqlite-sync: production needs a paid licence), AGPL.
           Tightened mid-work the same day — the user: "why are you searching for something thst
           costs money ditto pricing only open source solutions or one we make". So: open source
           or our own build only — no paid tiers, commercial editions or closed hosted services,
           free or not.
        3. Three ways to carry changes — the user: "we also need an options to manually sync like
           i think you had importing exporting zip file so you can send changes from phone to
           desktop without setting up server, ideally since this isnt really a big app i ould love
           a solution where the user could just open the file one one drive for each app and sync
           as well". The questions as shown: "1. One folder with a file per device, rather than one
           shared file? My lean: the folder. If two devices write one file at the same moment,
           OneDrive saves a conflict copy. For you it's the same single step: pick the OneDrive
           location once in each app." · "2. Is the cloud server still wanted, or are the file and
           the folder enough? My lean: build the file and the folder first, and add the server
           only if you ask for it later." The user: "1 your rec 2 i want server was well 3 think
           on this again …". So: a file carried by hand (import merges), a shared cloud folder
           with one change file per device, and a server — all three. The live database never
           goes in the cloud folder; only change files travel.
        4. What the hand-carried file holds, and what syncs — shown: "1. Revised lean for 3: the
           hand-carried file holds the books you pick, each one complete. The picker starts with
           the books changed since your last export ticked. Importing the same file twice still
           does no harm. Agreed?" · "2. Still open from before: what syncs? My lean: the books,
           meaning the manuscript, story bible, images and saved versions. Settings, API keys,
           writing stats and the search index stay on each device. Chats come later." The user:
           "your rec on all go".
        5. Candidates narrowed to cr-sqlite or our own build (shown as "Ready to record once you
           say go"; approved by the same "your rec on all go"). The user, on cr-sqlite's forks:
           "we can maintain, we can also write our own if you think that is better since not many
           choices". My rec as shown: "write our own, using cr-sqlite's merge rules" (plain
           JavaScript in the kit; triggers record changes; the latest edit wins field by field on
           a hybrid clock, ties broken by device id; deletes and restores tracked; Yjs for chapter
           text). NOT decided — the user: "your rec on all go do the testing and think if we
           should just roll our own", and mid-work: "also what about other datbase backends
           besides sqlite, other there other better db options for crossplatform and syncing?" …
           "go".
        6. How people run it — the user, mid-work the same day: "there have to be good syncing
           opensour solutions as that is all we do these days use phone and sync to dekstop its a
           mush for just about any appk, the difference is that we dont necessarily want a
           complicated cloud server setup, since this is for authors it would be nice for the user
           to just be able to install a sever on there laptop and sync with phone over internet or
           do themanual we talked about, but also the option to run the whole thing as a sever
           where desktop and phone connect to server and sync to their local copies or option to
           not have local copy and use server directly as phone could run out of storage and just
           loaded from server would be better, so i want these types of options, think abnout how
           user would use these apps?" So four ways to run it, as options: the laptop app is the
           server and the phone syncs with it over the internet · by hand (the file) · a server
           that desktop and phone sync their local copies with · no local copy, working straight
           off a server (the thin client; shape A returns as one option, not the only shape). The
           usage think goes in the design doc's "Round 2". Then: "i can see an author working on
           desktop, then on tablet they goto dropbox open the file and continue writing" · "maybe
           we just use export import of database for manual sync but that could be a lot of
           uncecessary data" (answered: a whole-database import replaces the other copy's newer
           work; the decided file carries only the picked books and merges).
        7. DECIDED 2026-10-08 after round 2 — the user, "your rec" then "your rec on all go", on
           these as shown:
           · "Should the sync be its own product repo, scoped as above? My lean: yes." The scope as
           shown: "Its own repo and npm package, built to product standard: a stable, versioned
           file format, real docs, and heavy tests, including random edits on three copies that
           must always end up identical. It works on any SQLite database whose tables have primary
           keys: one owner, many devices, on Node and in a browser or phone webview. The kit uses
           it, so JustWrite, JustVoice and docgen get it. Left out until wanted: multiple users,
           permissions, partial sync, other languages. The design shouldn't block adding them
           later. The name is yours to pick." (Supersedes round 2's "a shared kit module".)
           · "Scene text: merge with Yjs, or keep both copies on a clash? My lean: Yjs. It's the
           only one that never makes the author choose, and our editor supports it officially."
           · "To guard against a wiped phone database, the phone also saves its outgoing changes to
           the app's own native folder and rebuilds from them if needed? My lean: yes."
           · "Cloud folder on the phone through signing in to OneDrive, then Dropbox? My lean: yes.
           Google Drive later, because its app folder is hidden from the desktop."
           · "Encrypt the change files that go into a cloud folder? My lean: yes, with a library
           key the desktop shows once as a QR code."
           · Licences, for what we ship: "MPL-2.0 … not in what we ship; fine for a separate
           program you install, such as Syncthing" · "FSL … count it as excluded". For programs
           the user installs, the user: "we arent using antying for commercial use just becuase we
           are syncing 2 datbases from phone to laptop, we dont care about these licesense".
           · Phone ↔ laptop over the internet: "we build no relay of our own. Over-the-internet
           direct sync is 'install Tailscale', documented, on top of the address setting we need
           anyway" — the user: "we just have instructions for user to setup zerotier or tailscale
           both rquire a login on perspective site, once setup our apps work correct, no coding
           required we just authorize our servers, correct?" (answered yes, with our side's three
           pieces: the server accepts other devices — today it listens on `127.0.0.1`,
           `server/src/serve.js:64`; a pairing token; the phone app allows `http://` to private
           addresses). Also "Document Syncthing as a no-Dropbox folder option, Android only for
           now? My lean: yes."
           · "iOS test: run it on GitHub's Mac machines with the iPhone simulator (a new workflow
           file), or wait for a Mac? My lean: GitHub's Mac machines." (Which repo holds the
           workflow is not decided.)
           Then: "give me a summary of the ways we can sync and basics of how it works and is
           setup, then complete the design and code it all". The design is
           `../just-llm-runner/docs/plans/2026-10-08-sync-product-design.md`.
WHY:    a writer works on the phone and the desktop with no network, and moves changes without
        setting up a server; one design any family app can add.
NOT:    shape A, one cloud server with no offline work (the user, above) · the live SQLite file
        in a cloud folder (sqlite.org/howtocorrupt.html) · PowerSync (devices sync only with its
        server; the central copy is Postgres/MongoDB/MySQL/SQL Server; no file or folder mode) ·
        Turso Sync (syncs only with its sync server; pre-1.0) · ElectricSQL (Postgres, read path
        only; the old SQLite-client `electric-sql` package is deprecated, last 0.12.1 of
        2024-06-19) · sqlite-sync (Elastic License 2.0).
BUILT:  2026-10-08, under "just-sqlite-sync you have a go on it all your recs complete the whole
        project…": the engine is its own repo, github.com/delebash/just-sqlite-sync
        (`@delebash/sqlite-sync`, a `file:` dependency; its README/design/TASKS). JustWrite's
        server side (no UI yet — it's built on Quasar, the kit's program step Q4):
        · the save writes only what changed against what that window last loaded
          (`book_io.saveBookChanges`, `api/projects_api.js` bases keyed by the window's
          `x-jw-client`); decompose (import, samples) still replaces whole;
        · `server/src/sync.js` — the engine on projects + PROJECT_TABLES + image_blobs +
          chapter_versions; scene text merged through Yjs on the editor's own schema
          (since the Quasar move `server/src/editor/editorSchema.js`, in the server package; the
          renderer imports it as `justwrite-server/editor/editorSchema.js`);
          this device's identity (`sync-device.json`, tied to the machine); the `sync` settings
          section; routes `/v1/sync/{hello,pull,push}` (the engine's) and `/rev`, `/status`,
          `/settings`, `/run`, `/folder/run`, `/folder/libraries`, `/export`, `/import`,
          `/peer/run`, `/pair`, `/pair/join`; folder + peer auto-sync every `autoMinutes`;
          `serve.js` listens on the network only when "let my other devices connect" is on AND a
          pairing token exists; reset starts a new library; restore's writes are stamped;
        · the renderer: ids with 64 random bits (`stores/project.js` uid), the window id on book
          requests, `watchSync` → `reloadFromServer()` when another device's changes land;
        · the kit's CSRF guard allows the phone webview's origins (`CAPACITOR_ORIGINS`).
        Checked: server 141/141 (7 new in tests/sync.test.js: only changed fields written · a
        window's old snapshot doesn't undo another device's change · scene text written on two
        devices merges through the editor schema · export/import by hand · another library refused
        until joined · pairing behind its token · reset), unit 590/590, lint, vite build, the
        headless smoke (all routes, zero JS errors).
        Earlier the same day: round 2 (the design doc's "Round 2"); the Android SDK at
        `E:\Android\Sdk` (AVD `jvtest`), `E:\Android\jdk-21` → Visual Studio's JDK 21.
BUILT:  2026-10-08, on branch `quasar` (the Quasar item above): Settings → Sync — the kit's
        `SyncPanel` (`../just-llm-runner/ui/src/components/SyncPanel.vue`, imported by path; it
        needs `qrcode`, MIT): the status ("Synced 2 min ago · from …", Sync now), this device's
        name and how often it syncs, "Let my other devices connect" and the pairing code (a QR code
        plus copyable text), pairing with a code, the cloud folder (a note when it already holds
        another library), by hand (the books changed since the last export ticked, optional
        encryption, Export…/Import…, joining another library on import after a confirm), the
        devices. Server: an export records when it ran (`lastExport`); joining with a code adopts
        the code's library and key even when none of its addresses answer (the folder carries the
        changes); one sync shortly after start (the design: "when the app opens"). User docs:
        `docs/sync.md` (in Help's contents and the guide's index), the Settings intro names Sync.
        Checked: server 142/142 (new: joining with a code when no address answers; export
        remembered), unit 592/592, lint, the smoke on a snapshot of your data, and the screen on a
        copy of your data (status, the book listed, the QR code, the full code, an export saved as
        "The Ninth Facet 2026-10-09.jwsync").
OPEN:   the phone (the Quasar item, OPEN 3) · "Use the server directly" (the thin client) comes
        with the phone · "changes waiting" on the status line (the design §2) has no source yet —
        no route counts what another device hasn't received · leaving the cloud folder's devices
        (the folder transport's removeDevice) has no button yet · a real OneDrive/Dropbox sign-in
        needs the user's app registrations · Sync joins the family's Settings canon when JustVoice
        gets sync (adding it now would fail JustVoice's and docgen's "renders every family
        section" tests) · my choices under "your recs" where the record had a gap, to confirm:
        the by-hand file's extension `.jwsync`; by-hand files unencrypted unless asked (the cloud
        folder's always are); the screen's words not quoted in the design (its labels, hints and
        messages — `SyncPanel.vue`).
GO:     given 2026-10-08 — the tests and research ("your rec on all go do the testing"), then
        the build ("just-sqlite-sync you have a go on it all your recs complete the whole
        project without stopping unless you need to").

## THE FAMILY PARITY BATCH — approved 2026-08-05, THE next build
- **The master plan (read WHOLE before coding any slice):**
  `../justwrite-app/docs/plans/2026-08-05-family-parity-batch.md` — all
  decisions verbatim (①-⑤, the no-escape-valve commitments, the governing
  mechanism-vs-data principle), the 12-slice checklist, the Speaker-Lab
  12-point acceptance inventory, the approved human copy for the 13 rows,
  the after-batch order (UiTable → e2e harness → THE deep exhaustive audit →
  product calls). This repo's slices are marked per-app inside it.

## Found by the 2026-08-05 family audit

- **Found by the 2026-08-05 s2 three-app parity audit** (the bundle-extra branch
  pin from the earlier note is FIXED — it pinned the stale July branch
  `claude/admiring-galileo-il3q0o`; now `@main`, matching its own "never goes
  stale" comment):
  - **No Origin-header CORS test.** §6's rule — "the test that bites sends an
    `Origin:` header and asserts `access-control-allow-origin` comes back" —
    exists in docgen (`tests/test_app.py`) and JV (`tests/test_error_cors.py`)
    but NOT in JW, the app the standard cites as the canonical envelope+CORS
    text. Mirror docgen's test.
  - **`100vh` violation:** `src/components/SceneLinks.vue:264` —
    `max-height: calc(100vh - 48px)` on the popover. Under the UI-scale zoom,
    100vh references the UNZOOMED viewport (the family rule's stated reason),
    so the popover can overflow at zoom ≠ 1. Fix with a zoom-safe bound; the
    shell chain itself is clean.
- *(Non-issue, recorded: `family.lab.changeData` is fed but JW passes no
  dataLinks — JW has no promptless features, so the line never renders; the key
  is future-proofing.)*

## Now / near-term (JustWrite)

- **`family.*` es values are HAND-TRANSLATED (2026-08-04)** — the new catalog block
  behind the kit's labels feed (`src/i18n/familyLabelsFeed.js`: AI tabs, download-bar
  actions, connection-error copy, the `family.lab` group) got hand-es'd values; run them through the docgen
  translator + review workspace when that pipeline goes live, like the rest of es.json.
- **"Serve `/health` before `seed_workspace`" — recommend DROPPING; your ruling owed.**
  Measured 2026-07-25: it buys 36 ms of a ~975 ms pre-listen window dominated by framework
  imports that cannot be deferred. (Correction, docs campaign: there is no "re-measure
  snippet" — the record holds one measured breakdown, now in
  `docs/dev/measured-performance.md` §Boot.)
- **Fit-estimate label wording — your veto still open.** Shipped with the PC-class work;
  `docs/plans/archive/2026-07-22-igpu-research-and-cpu-band-recovery.md` §25 addendum 9.
- **Writer's-editor expansion — decision-closed plan written, NOT launched; launch = your
  word.** Order 3→2→1-spike→4 (prose highlights · thesaurus · bible-aware spell/grammar
  spike · session word target). Plan: `docs/plans/2026-07-26-editor-expansion-executor-plan.md`;
  findings: `docs/plans/2026-07-26-writers-editor-gap-research.md` + the IDEAS.md gap table.
  Wait-gates: i18n Phase 1a is merged (done); confirm no bench is running at launch.
- **The 2026-07-19..26 unauthorized-changes review — 77 user-visible commits await YOUR
  verdict; only you can say which you approved.** Next candidate: `ea543ae` (panels dismiss on
  Esc/outside-click + nav toggle). Method (both proven the hard way): enumerate with the FULL
  log + a date filter, never `git log --since` (it hid 40 commits including the guilty one);
  "the commit message mentions the user" is NOT evidence of authorization. Regenerate the
  per-commit list with the script — don't trust a stale `visible-changes.txt`.
- **Whole-repo "extraction vs copies" audit — OWED, on your call** (your 2026-07-26 ruling).
  Detector that works: normalise the domain noun between sibling files and diff — jscpd can't
  see this class. Candidates: the seven entity views' detail-mode blocks · per-view empty
  states · the seven `useStatusDisplay` copies · the ~20 probe scripts' private `findChrome()`.
- **i18n remnants** (the sweep itself is DONE — 0 warnings, `no-raw-text` is `error`; record:
  the i18n plan docs + git):
  - Flaky `projectHistory.test.js` cap test — failed once in four identical runs under GPU
    load, mechanism unexplained, not i18n's — yours to call.
  - The frozen `v0.1 · local` brand line MOVED, it didn't die (docs campaign
    2026-08-04, verified): it now lives as the catalog value `sidebar.brand.sub`
    (`en.json` + `es.json`); binding it to `APP_VERSION` (an interpolated message)
    is still the fix — yours to call.
  - Key-naming style + the `|` plural pipes in `en.json` — your veto still open.
  - ~200 duplicate call sites could point at existing `common.*`/`count.*` keys — optional
    reuse polish.
  - Trap to remember: `@` is vue-i18n's linked-message syntax — write `{'@'}` in messages;
    nothing in the toolchain catches it, so render-check any message containing `@ | {`.
- **Single-source text system + translation — THE NEXT BIG TASK** (your roadmap ruling
  2026-07-26; detail: IDEAS.md's single-source entry + 
  `docs/plans/2026-07-26-i18n-single-source-research.md`). All seven decisions blessed; shape
  ruled GENERIC (any Vue app). **The translation tool is now `just_ai_i18n_docgen`** — the
  Python successor of the proven v2 prototype; the Node original was retired 2026-08-04
  (archived: https://github.com/delebash/just-ai-help). Open asks on you: ship the measured
  `es.json` into JW · the upstream `--think` PR · whether to rotate the Gemini key that
  appeared in chat.

## Open — awaiting a go

- **QC queue posture (standing)** — the live findings you drop while QC-ing on your
  box; discussion-first, each needs its own go. (B5-4 CLOSED by the docs campaign —
  the big-batch build record shows the accent nav row SHIPPED, probe-measured; the
  old "design call remains" line was stale. Batches 4-6 have nothing left open.)
- **Big-batch residuals — your words owed** [extracted from the archived
  `just-llm-runner/docs/plans/archive/2026-07-08-big-batch-queue.md`]: the §7.1
  sub-questions (a) blast-radius confirm named-vs-generic (shipped as NAMED per the
  rec — one line changes it) · (b) the Apply verb/label · (c) the help-popover copy
  (built as a lede; the popover awaits the copy) · (d) provenance-badge wording ·
  plus the QC-38 AI-queue main-menu doorway's label ("AI tasks" flagged default).
- **I1 + queued follow-ups (each needs a word)** [same source]: shared
  `runJsonAnalysis` · `useEntityCrudView` (the 7 byte-identical focus-watches ride
  it) · gate ratchets · per-model GGUF delete · ensure-resident timeout test ·
  "loading the model" progress label · hooks payload channel · DOM-env `htmlToText`
  suite · SceneNotesPanel i18n · CommandPalette direct-creates lack `?new=1` ·
  the `.wb-search*`/`.set-desc strong` CSS fold · promote the scratchpad
  popup-probe to `scripts/` if the flows need a standing guard.
- **Class-library copy/UX calls — yours** [extracted from the archived igpu doc
  §25]: the Add-model picker filters to class members (you hit this and hated it) ·
  MoE-vs-dense visibility wherever hardware numbers show · `LuMeasureHistory`'s
  bare "measured" word · the class-library lede says "a memory RANGE" (factually
  wrong; rewrite drafted, you own copy) · whether the library is a single-machine
  view · whether "Recommended" becomes user-settable · rename ARCHITECTURE's
  "Model class defaults" heading ("Model family thinking defaults") to end the
  vocabulary collision.
- **RAG corpus follow-ups**: imported chapters land as ONE scene → one diluted
  embedding per chapter (fix E5: scene-break splitting on import) · editing an
  embed template needs a manual Rebuild with no surfaced affordance. Design:
  `docs/dev/rag-design.md`.
- **Catalog-row download: Retry without Cancel** on the failed/"Getting ready"
  state (your screenshot) — distinct from the shipped Cancel/Dismiss surface.
- **Boot hardening pair**: providerBackend/routingBackend retry 3×700 ms = a
  silent 2.8 s on any shape-check failure (worth a guard) · verify the stale
  "loads on first use" chip after a confirmed load next app boot · the 2026-07-11
  0.6B-weights deletion was never root-caused (suspects: row Delete / re-download
  cache-clear / verify purge on an AV race).
- **Rust D2 — delete legacy `images_read`/`images_delete` — YOUR CALL, never made**
  (explained 2026-07-13, rec: delete; two dead fns reading pre-server disk-file
  image records). Extracted from `docs/plans/archive/2026-07-13-rust-minimization-and-choosers.md`
  by the docs campaign — the decision had fallen out of the tracker.
- **Per-band survey residue — CORRECTED (docs campaign): the "two open decisions"
  cite was CIRCULAR** (the banner pointed at this tracker, the doc body says "no
  open decisions remain"). Best reconstruction of the two user-word items actually
  in the doc: (a) one word flips the vram16|ram32 band to the 27B if a prose trial
  favors it; (b) the 70B/GLM availability rows — keep or remove. Both yours.
  Verdicts distilled: `docs/dev/measured-performance.md` §Per-band.
- **Think-A/B + b9993 loop re-test — RESULTS never filled: dead or owed?** The
  user-ordered on-box batch in `docs/plans/archive/2026-07-16-think-ab-and-loop-retest.md`
  has an empty results template. Rule it: run the two tests, or kill the doc.
- **2026-06-20 deep-audit backlog — merge call before it archives:** its untriaged
  findings overlap the open "extraction vs copies" audit above; decide fold-or-drop
  (`docs/plans/archive/2026-06-20-deep-audit.md`).

*(Moved 2026-08-04 by the placement rule: I2 cloud prompt caching → the runner's
`docs/dev/TASKS.md`; the whole JustVoice section (F1/F5/F6/F2, still parked behind
JW by your roadmap ruling) → `../JustVioce/docs/dev/TASKS.md` — with F1's stale
"JV can't even import llm_runner" claim corrected there: check-consumers passes for
JV as of 2026-08-04; the convergence scope itself stands.)*

## Your-box checks (only the Windows / 2070S machine can finish these)

- **Boot splash after the kit adoption (2026-08-04):** the load group is the
  kit's `<BootModelLoad />` now and the model bar shows the MODEL NAME (your shared-behavior
  ruling) instead of "Loading your writing model". One boot with warm-start on is the look
  pass. Gates already green: 567/567 vitest, build, i18n report (its `literal`/`nav.settings`
  rows pre-exist, proven on a stashed clean tree). `warmStartup.js` deleted; the bench
  suppression rides the kit's `skip` option (`main.js`).

- **QC the shipped 2026-07-24/25 batch — pushed; your eyes are the only outstanding half:**
  the boot-splash plate (fit = fill) · self-hosted fonts (**needs one fresh `npm run dev`** —
  `vite.config.js` changed) · boot 4.1 s → 2.3 s · the downloader rate-limit fix · the Model
  Catalog layout. (Cite CORRECTED by the docs campaign: these were §20-33 of the
  mtp-verify doc, not the igpu doc; the numbers are distilled in
  `docs/dev/measured-performance.md` §Boot + downloads.)
- **Bench legs still owed on your box** [extracted from the archived igpu doc §7]:
  the CPU raw llama-bench pp/tg matrices (unmeasured since the `-c` flag fix) · the
  GPU RAG bible-vs-index comparison (`forceBibleOnly` + permanent `-bible` legs —
  your "i cant believe we did not do that in the first place") · the characterChat
  bible-leg variant · Bonsai's CPU leg under the corrected id
  `ternary-bonsai-27b-q2-g64` (loads in 13 s; 0/10 chats completed last try).
- **drive.js autostart has still never fired** — the 13:46 bench attached to
  your live server; closes on any `--autostart` bench with the app closed (since
  2026-10-08 it starts the Node server on Electron's Node). Plus two glances: PricingEditor + LuRunnerBinaries have never been
  RENDERED by eyes (code-verified only) · StyleTune's drafter re-scope — the 8 GB
  class tune sets `spec_type: none` BY DESIGN, so a drafter load needs a deliberate
  override or a bigger box (and its drafter measured no gain anyway:
  `docs/dev/measured-performance.md` §MTP).
- **LOOK at the PC-class surfaces the 2026-07-27 look pass did not cover:** the catalog row's
  needs line beside the download size · the Fit hover's "Estimated / not yet tested on your PC
  class" wording · the renamed badge with your class after it. (The class-configs modal and the
  QuickSetup wizard were QC'd good 2026-07-27.) Same plan doc, §24.
- **Quick Setup wizard EMBEDDING check** — the fix shipped + contract-tested 2026-07-26, but
  only the GUI can prove the wizard: open it, confirm EMBEDDING populates and the banner is gone.
- **Model-download Cancel/Dismiss glance** — server + tests verified 2026-07-26; one look at the
  failed / "Getting ready" states is all that's left.
- **Delete the 31B row in your local catalog UI if you want it gone** — the seeder is
  insert-only, so the 2026-07-26 removal reaches fresh installs only.
- **Batch Fill-from-book: the review phase + auto-apply write have never had a live
  run** [attributed: `docs/plans/archive/2026-07-19-batch-fill-from-book.md` — shipped from
  unit-tested pieces; "get their first live run on the user's box"]. One real batch
  on your box is the acceptance.
- **Pass-1 execution tail** [attributed: `docs/plans/archive/2026-07-22-pass1-execution-plan.md`
  tail — "paused pending the planner's decision"]: the smoke's splash-aware wait ·
  your box-look at the new panel line / editor Copy / override flow / the rename ·
  the iGPU laptop kit queue.
- **Bench harness `--restore` fire-test** — one deliberate mid-leg kill → `npm run bench --
  --restore bench/results/<run-id>` → the Routing tab shows the original assignments. Still only
  proven against a fake client. `docs/plans/archive/2026-07-19-llm-bench-harness.md`.
- **`book-smoke.js`** — unverified since the shared-helper extraction; needs port 1420 free once.
- **19 probe scripts still carry a Linux-only `findChrome()`** — they cannot find a browser on
  Windows at all; convert to the shared `tests/lib/smoke-common.js` import or delete the dead
  ones. Same plan doc.
- **Unit 2 reasoning acceptance** — one local High chat run stopping at the hardware cap · one
  new-Anthropic run with reasoning words on the wire, no 400. Ledger §G.
- **Ledger §G1–G6** — Plan B on-device gates · portable data folder · the RTX 2070S spawn
  failure (now self-reporting) · marketing screenshots · full RAG end-to-end + router-flag
  confirm · Windows AMD/Intel detection spot-check. Ledger §G.
- **Providers-surface rounds 9–19** — the per-round box checks.
  `just-llm-runner/docs/plans/archive/2026-07-06-providers-surface-redesign.md`.

## Standing rulings (constraints, not tasks — they gate future work)

- **The data location is the USER's, and the shape is the FAMILY's** (ruling 2026-08-14,
  verbatim): *"absolutely no data for any of these apps should be stored anywhere but where
  the user has set the storage directory, which by default will be the install directory for
  the app"* + *"appdata is not banned, what is banned is anything that the user has not
  decided"* + *"all that can be the same should be, this includes how data is stored"*.
  ONE implementation for every app — `llm_runner.platform.data_paths.resolve_data_dir`;
  `paths.py` is a three-line caller and may never re-implement the ladder (env var → `data/`
  in the install dir → OS app-data ONLY when that is unwritable). JW's own
  `platformdirs.user_data_dir` default was creating `AppData/Local/JustWrite/JustWrite` on
  every headless boot; it is gone. The shell resolves the identical ladder in Rust and must
  NEVER write the computed default into `dataroot.txt` on first run — that lock pinned
  JustVoice to an obsolete default and vetoed the new one silently (JV `6b8b091` context;
  full record in `../JustVioce/docs/dev/TASKS.md`). Contract text: kit
  `docs/app-structure.md` §5 + §6.
- **Server reuse is VETOED** ("i am affraid of a server running when it shouldnt"); the
  kill+respawn cost (`lib.rs:377-391`) was measured and no cheaper boot lever exists.
- **Commit-gate hooks are REJECTED** — the remedy for unauthorized change is asking before
  UI-behaviour changes, not machinery.
- **Availability ≠ recommendation** (the 70B/GLM precedent): a catalog row may exist untested;
  a band recommendation may not.
- **The index FINDS, Outline RESTRUCTURES** — the index never nests scenes, Outline never grows
  filters; drifting either way builds the same page twice.
- **No outside model seeds untested** (the A/B law) · catalog rows are GGUF/cross-platform only.
- **E-row third-party drafters stay `mtp: False`** — revisit only on a measured need; any
  laptop session adds one `-md` load leg first.
- **Refusal probes: always run the stock CONTROL leg, and READ every result** — the failure
  that matters (deflection) is invisible to any text metric; the keyword-scorer post-mortem
  lives in the DO-NOT-ADD comment above `looksRefused` (`services/benchHook.js`).

## Parked (wakes on a trigger or a fresh ask — not active work)

- **I5 — the deferred parking lot** (per-scene snapshots · per-entity write REST · RAG
  sqlite-vec ANN · extract kit `common/` → `@delebash/ui` · llama-swap layer · the
  Tauri/package rename PR). Ledger §I5.
- **claude-config standalone provisioning** — only the fresh-container proof is outstanding
  (prove `~/.claude` provisions from `github.com/delebash/claude-config`, then JW's vendored
  copy can go).
- **`uma` → `mem_arch`** — a design call parked until a unified-memory NVIDIA box actually
  exists; the "Use for this PC" override covers such a user today.

*(Moved 2026-08-04 by the placement rule — runner-owned parked items (D5 · D6 · I3 ·
the `--fit`/MTP upstream WATCH · the Harrier/KaLM model watchlist · the LICENCE flag ·
the SDK-pivot re-open trigger) → `../just-llm-runner/docs/dev/TASKS.md`; JV-owned
(F3 · I6) → `../JustVioce/docs/dev/TASKS.md`.)*

## Fit redesign (family, runner-owned) — JW impact

Tracked in `../just-llm-runner/docs/dev/TASKS.md` (THE resume surface — its fit
item now opens with a STATUS-NOW block; read that first); full plan
`../just-llm-runner/docs/plans/2026-08-09-fit-redesign.md` (consensus 2026-08-13,
amendments §13, ALL rulings §8.17–23a). JW-SIDE STATE — the redesign's BUILD
PHASES ARE COMPLETE (0–7, all BUILT + GATED + PUSHED 2026-08-13; the standing
fit-architecture story is the kit's `docs/dev/serving-design.md` fit section).
Phases 4–7 touched JW only through the shared kit + three models.md passes —
the arch-aware budget line's "Memory" wording, the remembered-footprints /
Clear-history story, and the evidence-ranking line:
- DONE — seed regeneration (§8.19 facts-not-floors: `seed_presets.py` carries the
  nine header facts incl. the three KV scalars, curated CHAT floors deleted, the
  three EMBED floors kept; refreshed LIVE from HF via the kit's
  `scripts/refresh-seed-facts.py`).
- DONE — `classMembership.test.js` re-validated WITH the user (7/8 byte-identical
  to the 2026-07-26 table; GLM's ram64 loss RULED §8.23a; FLEET literals are the
  computed floors now).
- DONE — badge + speed-band + veto-removal + knob-location user docs
  (`docs/models.md`, same-change as the features; bottom band displays
  "very slow" — user ruling 2026-08-13, display-only via SPEED_BAND_LABEL).
- DONE — the §7.3 selectable-pin (`src/components/slotOptions.test.js`, vitest
  over the kit's pure `buildSlotOptions`).
- `docs/dev/measured-performance.md` carries the derived bandwidth constants +
  the 0.41-vs-0.446 physics cross-check; the kit now SEEDS those constants as
  data (runner_setting `bw_eff_device` 0.6 / `bw_eff_host` 0.15 + the
  `hardware_classes` bw columns) — the doc is the evidence, the seed is the law.
- DONE (kit Phase 6, 2026-08-13) — the §13.9 pinned test landed in the kit
  (`test_expert_layer_marginal_matches_measured`: physics 0.446 vs this doc's
  measured 0.41 GB/layer, 9% off inside the ~15% band, sourced to
  measured-performance.md), alongside the joint MoE solve — JW rides: the
  Tune dialog's "Computed for this PC" rows now show the measured-tune-shaped
  split (ngl=all + just-enough ncmoe) instead of the old inverse's ngl 8-9.
- DONE (kit Phase 7, 2026-08-13 — the last build phase) and JW rides all
  three halves: the §7.4 evidence ranking (the wire's new `ranHere` bit — a
  model measured/tuned/loaded on THIS machine stays recommendable even when
  the estimate would reject it; models.md carries the user-facing line, the
  kit truth-table pins the rule) · the §7.3 uncurated-path gate + the
  no-badge-still-launchable pin (kit tests — they protect the hand-add-by-
  link flow JW users drive) · the §7.6 docs pass (the one-authority story
  STANDS in the kit's serving-design.md; JW's architecture-notes was
  verified to carry NO fit section to rewrite — the 2026-08-04 docs
  campaign's distillation predates the plan's target, recorded rather than
  invented; measured-performance.md's constants + calibration notes stand
  from Phase 3).
- USER-SIDE STATE (2026-08-13): the desktop checkpoint is CLOSED (the user
  confirmed the flagship reads ~fine and the Tune & measure flip works).
  REMAINING, at the user's pace: the two-laptop glance — on each, (a) the
  E4B row reads Fits with a band (16 GB Iris Xe box), (b) the engine
  panel's budget line reads "Memory" (one-pool boxes — the Phase 4 wire,
  never yet seen live on real one-pool hardware), (c) the box's
  `__machine_ram_bw__` probe row holds a plausible GB/s (LPDDR5 → higher
  than the desktop's 19.01). Then the JV VRAM wiring on its own go.
