# TASKS — the live open-work tracker (JustWrite)

> **THIS is JustWrite's live tracker.** Since 2026-08-04 every repo carries its own
> (the docs campaign; the rule: **an item lives where the code that closes it
> lives**): kit + shared-server work → `../just-core/docs/dev/TASKS.md` ·
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


## Every open item settled — the close-out list [2026-10-29]
STATE:  DECIDED — the user, on my list of every open item (TASKS, the live plans, IDEAS, the roadmap,
        the code), each checked against the code and argued: "you can do 20 yourself, 21 done, 1-19
        your rec go". The list as approved, verbatim (one fact corrected while doing it, below):
        **Close:** 1. The DO-list entry (2026-10-29): all six built, multi-window checked, picture in. Delete
        it. 2. The three feature ideas (PDF page size, Story Bible export, AI words by chapter): built, with
        flows and docs. Only "your use of them" was left. Delete it. 3. AI drafting: built and checked with
        flow tests; the Lab check is done. Only "your look at the seventh round" was left. Delete it.
        4. Phone screens: the screenshot review and the camera sentence. Keep the sentence as written.
        5. The sync line "my choices to confirm" (the .jwsync extension, unencrypted unless ticked, the
        screen's words): you already approved these in round 8 on 2026-10-08 ("your rec all go"). The
        line is out of date. Delete it. 6. The kit's requests entry: all three are resolved; the pin moves
        to your Update click (item 20). Delete it. 7. The i18n key-style veto (open since 2026-07-31):
        3,175 strings, 55 with plural pipes. Changing the style would rename every key and its Spanish.
        Keep the style and close the veto. 8. Intel/AMD graphics detection: close. The speed measurements
        already ran on the Intel Arc laptop and a Radeon 780M, and picked the hardware class correctly.
        9. The happy-dom override line: keep the override (the latest @tiptap/html, 3.32.1, still asks
        for version 20, and npm audit needs 21) but close the line. 10. claude-config: JustWrite has no
        vendored copy left (0 files in git). Close it here. 11. The plan docs: archive the 12 finished
        ones, re-pointing RESEARCH's links, since plans/ is for live work only. Keep the single-source
        plan, which item 19 uses.
        **Drop:** 12. A thinking run on Anthropic: there's no Anthropic key and you're not paying for one.
        13. The "I5" parking lot (the llama-swap layer, a vector index, per-item write API routes,
        per-scene snapshots, the Tauri rename). 14. Sync's "changes waiting" count: nothing produces it;
        "Synced 2 min ago" already tells you where you stand. 15. A button to remove a device from the
        cloud folder. 16. Sync in the family's shared Settings sections: docgen has no sync. 17. A
        no-local-copy mode in the phone app: a browser already works straight off the server. 18.
        OneDrive/Dropbox sign-in: you ruled it out for now; it goes with item 22.
        **Do: me:** 19. Help hints translated: each of the 26 user docs gets a `lede:` line made from its
        existing toc.json hint, so no new words; Help and the command palette show the translated
        version, and docgen's check joins the final checks.
        **Do: you:** 20. Click Update on the AI page (the user: "you can do 20 yourself"). 21. The Gemini
        key (the user: "21 done").
        **Your decision:** 22. The phone app (iOS and Android) — my rec: leave the phone out of this
        release; sync.md says the phone app isn't available yet and points phone users to the browser
        route; the phone's device tests and the cloud folder on the phone close with it.
        Corrected while doing it: item 15 is not a drop — the Remove button is already built (the kit's
        SyncPanel `removeFolderDevice`, the sync engine's `DELETE /v1/sync/folder/devices/:id`, built
        2026-10-29 with tests; sync.md "Your devices" already says so), so its line closes as done; and
        item 11 is 13 plans, not 12.
OPEN:   19 and 20 (mine); 22 (the user's).
GO:     given 2026-10-29 for 1–20, as above; 22 not decided.

## The phone's screens (slice 5) and the iOS build (slice 6) [2026-10-09]
STATE:  DECIDED 2026-10-09 — asked after the 390 px pass and the emulator screenshots (the kit's
        `docs/plans/2026-10-08-the-phone.md`, slice 5), as shown:
        "1. Can I push JustWrite (37 commits ahead), the kit (55) and just-sqlite-sync (3) to GitHub?
        The iOS build runs on GitHub's macOS runner, and JustWrite's server pulls in both sibling
        repos, so all three have to be there. — My recommendation: yes, those three. docgen (11
        ahead) isn't needed for this.
        2. The pager can't fit on one line at phone width without losing something: it needs 378 px
        and has 346. For now it takes two clean rows: the count, then the controls. What should it
        drop on phones? — My recommendation: drop First/Last and "Page n / m". The count and the ‹ ›
        arrows already show where you are.
        3. Should I fix the three desktop problems above as part of this work? — My recommendation:
        yes. They're each a small change." (The three: the command palette's "AI usage" entry goes
        to a Settings section that doesn't exist; at 1280 px the chapter bar's right end is cut off;
        the Beat sheet dialog shows its "no model" error and its spinner at the same time.)
        The user: "you can do whatever your need your rec go".
WHY:    the phone plan's slices 5 and 6; the screens reviewed as emulator screenshots
        (claude.ai/artifact/GVRYsL1qV9jU5JR9RkPUAr).
NOT:    docgen's push; the phone's no-model error wording (it names Quick Setup, which the phone
        doesn't have — asked separately).
BUILT:  slice 5 — the kit fdbc100, 33ab9fe; JustWrite 321a6a5 (the 390 px pass, the walk, the
        screenshots). The answers: 2 — the kit 6f5d294 (the pager at phone width: the count, ‹ › and
        the page size); 3 — the palette's "AI usage" opens `/ai?tab=usage` (the AI page passes
        `?tab=` to the shared area, as it does `?providers=`), the chapter bar wraps instead of
        running past the card, the Beat sheet hides its spinner beside an error; user docs:
        ai-providers.md (the Usage tab's place), sync.md (the phone pager). Checked: the 390 px walk,
        1280 px screenshots, `/ai?tab=usage` opens Usage. 1 — pushed (JustWrite, the kit,
        just-sqlite-sync). Slice 6 — `src-capacitor/ios` (Capacitor's, Swift Package Manager; Info.plist:
        local-network HTTP and the camera line), `.github/workflows/phone-ios.yml` (manual) +
        `e2e/phone-ios.js` (Appium's XCUITest driver): green on run 38000436545 — welcome, the tutorial
        book, five screens, the book kept after quit and reopen, no errors (iOS 18.6 simulator). Found
        and fixed: the title bar under the status bar and island, the editor's word count under the
        home indicator (the kit's theme, a4e4639, b35e0e4). Screenshots, Android and iPhone:
        claude.ai/artifact/GVRYsL1qV9jU5JR9RkPUAr.
OPEN:   not run: sync with a paired computer from iOS, the unsigned device build for the sideload
        route (the cloud-folder item, OPEN 1) — WAITS ON the user's decision on the phone (the
        close-out list's item 22, at the top). The screenshots' review and the camera sentence were
        closed 2026-10-29 (the sentence kept as written).
GO:     given 2026-10-09 ("you can do whatever your need your rec go").

## The phone's cloud folder through the Files app — Dropbox first, OneDrive after November [2026-10-09]
STATE:  DECIDED 2026-10-09 — asked whether the app could hand files to the OneDrive app instead of
        an API key; shown (the kit's RESEARCH §2, "OneDrive from the phone"): handing one file works
        today (Export → share sheet); a folder the app keeps and syncs into isn't reliable yet —
        Android: "no source shows OneDrive/Google Drive/Dropbox supporting Android's folder
        picking"; iOS: "OneDrive is moving to Apple's newer file-provider API (rollout to early
        November 2026)", Dropbox already allows folder access; the one free Capacitor plugin that
        keeps a folder grant is `@daniele-rolli/capacitor-scoped-storage` (MIT, 0.1.0). The user:
        "yes i have iphone to test, hold off until after november for file provider role out, lets
        test on dropbox, i will install app, what do i need to do in dropbox".
WHY:    syncing the phone through a cloud folder without registering the app with Microsoft or
        Dropbox (the user: "this does not see to be user friendly has to be a better way").
NOT:    the OneDrive API registration for now (later, before JustWrite goes to other people);
        Android (no folder picking from cloud apps).
BUILT:  nothing yet. Desktop side already works: Settings → Sync → the shared folder, pointed at a
        folder the Dropbox desktop app syncs.
OPEN:   1. how a test build reaches the user's iPhone — shown: a Mac with Xcode and a free Apple ID
        (the app runs 7 days, then re-install), or GitHub's macOS runner + TestFlight (the paid Apple
        Developer Program, $99/year). The user: "i dont have a mac and am not spending money", then
        "we will test the app later" — HELD. The free route found for later: the unsigned build from
        GitHub's macOS runner (free for a public repo), installed from Windows with a free Apple ID
        through AltStore's AltServer or Sideloadly (7-day expiry, at most 3 sideloaded apps; a
        third-party tool signs in with the Apple ID — a throwaway ID is possible); 2. the folder
        grant on iOS — NOT STANDARD either way, needs
        the user's word by name: `@daniele-rolli/capacitor-scoped-storage` 0.1.0, or a small Swift
        plugin of our own on Apple's security-scoped bookmarks; 3. OneDrive through the Files app,
        re-tested after its file-provider rollout (early November 2026).
GO:     not given. WAITS ON the user's decision on the phone (the close-out list's item 22).

## Now / near-term (JustWrite)

- **Help hints translated** (docgen's single-source item, 2026-10-29): each doc's `lede:` front-matter
  instead of `docs/toc.json`'s English `hint`, read as `$t('lede.<slug>')` by Help and the command
  palette, docgen's `extract --check` in the gate. The kit's help renderer already skips front-matter
  (kit b8551d2; `front-matter` installed here); WAITS ON the kit's website `sync-docs.js` stripping a
  doc's front-matter and taking Starlight's description from `lede:`. Plan:
  `docs/plans/2026-07-26-i18n-single-source-research.md`.

## Your-box checks (only the Windows / 2070S machine can finish these)

- **The engine update replacing its build** (providers round 10, the 2026-09-19 safe-update flow):
  reachable now — the AI page offered "Update to b11960" over the installed b11239 on 2026-10-28.
  The same click fixes the stale pin (the database still pins b10750): Update writes the new build
  as the pin. Until then, don't use the engine's install button (it would fetch b10750).

## Standing rulings (constraints, not tasks — they gate future work)

- **One family release, only when every app is complete** (the user, 2026-10-29, verbatim): *"you
  dont understand we have several apps i want all kit work done for all apps before we release any
  app, i want to relase all apps that we are working on now but not until all kit work is done by
  each app that means each app is complete bugs fixed featrues done all tasks ideas done or removed
  from list"*. Never recommend or start a release before then (2026-10-28); passed to the kit's and
  docgen's sessions.

- **Naming popups — only where a data screen follows** (the user, 2026-10-29, verbatim): *"the new
  thing is for like data screens shuch as character before for a new character you would clikc new it
  would ask for name then open the new character screen, instead we no longer have a popup just asking
  for a new character name it now just opens the new character screen, these are the type of new
  popups i dont want, if all you are doing is a name with no other data then new popup is ok"*. So "+ New"
  for anything with its own page opens that page directly (the Worldbuilding article's went
  2026-10-29); a popup that only takes a name — Scene Links' and the Groups window's quick "new …", a
  status, a chat or preset name, a version's label — stays.

- **The data location is the USER's, and the shape is the FAMILY's** (ruling 2026-08-14,
  verbatim): *"absolutely no data for any of these apps should be stored anywhere but where
  the user has set the storage directory, which by default will be the install directory for
  the app"* + *"appdata is not banned, what is banned is anything that the user has not
  decided"* + *"all that can be the same should be, this includes how data is stored"*.
  ONE implementation for every app — the kit's `platform/data_paths.js` (`resolveDataDir`, the
  server) and `shell/dataRoot.js` (`resolveDataRoot`, the desktop shell); an app never
  re-implements the ladder (env var → the Change-folder pointer → `data/` in the install dir → OS
  app-data ONLY when that is unwritable). The shell must NEVER write the computed default into
  `dataroot.txt` on first run — that lock pinned JustVoice to an obsolete default and vetoed the
  new one silently (JV `6b8b091`; full record in `../JustVioce/docs/dev/TASKS.md`). Contract
  text: kit `docs/app-structure.md` §Q.8 (the data folder).
- **Server reuse is VETOED** ("i am affraid of a server running when it shouldnt"): the desktop
  shell stops a server already on the app's port that answers as this app's own, and starts its
  own (the kit's `shell/main.js`, `serverProduct` + `shutdownPath`).
- **No commit hooks, family-wide** (2026-08-04 "Commit-gate hooks are REJECTED — the remedy for
  unauthorized change is asking before UI-behaviour changes, not machinery"; and 2026-10-29, the
  family's lint hook dropped too — the user: "i dont want tests just running or things just running on
  commit in gituhb unless we need it often", then "remove hook"). Lint and tests run in the gates at
  the end of a piece of work, not on each commit.
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
