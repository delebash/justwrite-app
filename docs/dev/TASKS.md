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


## A–D after the close-out: Spanish, the phone, accessibility, installing [2026-10-29]
STATE:  DECIDED — the user: "your rec all go", on these as shown (verbatim):
        **A. Spanish translations: when to run them.** 96 English strings have no Spanish yet: the 26
        help-page summaries plus the screens added yesterday and today (PDF page sizes, Story Bible
        export, POV character, repeated words, the trend line). In Spanish they show in English for now.
        My recommendation: one docgen translation-and-review run, as the last step before the family
        release, after all English changes are done. … I'd add it to TASKS as the release's last step so
        it isn't forgotten.
        **B. The phone app: in this release or not.** … My recommendation: leave the phone out of this
        release. sync.md would say the phone app isn't available yet and point phone users to opening
        JustWrite in their phone's browser. The phone's open TASKS items (device tests, the cloud folder
        on the phone) close with it; the code stays for later.
        **C. Accessibility: adopt the family's new WCAG 2.2 AA check.** … Sidebar word counts are too
        faint: they become a little darker (the kit's standard muted grey). Sidebar status words ("Done",
        "Draft") are coloured text, and green and blue are too light to read: they become neutral text
        with a coloured dot, the way the chapter bar's "● Done" already looks. The colour stays, as the
        dot. Plot board beat cards, 6 checkboxes and 2 scroll areas get fixes for screen readers and
        keyboards: nothing changes visually. The check itself runs once at the end with the other checks,
        never on commit. My recommendation: do it, including those two sidebar look changes.
        **D. "Installing it" in Getting started.** … add the template's first-launch steps, with
        JustWrite's own installer names (Windows JustWrite-Setup-<version>.exe, the macOS .dmg, Linux
        .AppImage or .deb): Windows: More info → Run anyway. macOS: System Settings → Privacy & Security
        → Open Anyway. Linux: make the AppImage runnable.
OPEN:   A — at the family release, its last step (see "Before the family release" below); C — building.
GO:     given 2026-10-29.

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
        Then 14 and 15, in the kit's session (2026-10-29), the user: "Keep both" — the kit built both into
        the shared Sync screen (just-sqlite-sync ccf3fb6 / 7e0fc0d, kit e98968a / c57386c): a cloud-folder
        device's Remove and the Changes waiting line; JustWrite shows them, and sync.md describes them
        (103d4750, 863bfa82). Neither is a drop.
OPEN:   none — 22 decided (B in the A–D entry above). 20 DONE 2026-10-29: Update clicked on the AI page against the user's data — pin and
        engine b11960 (was the stale b10750 pin over b11239). 19 DONE 2026-10-29: the 26 docs' ledes, `lede.*` in en.json,
        Help and the palette read them, `npm run i18n:docs` in test:fast.
GO:     given 2026-10-29 for 1–20, as above; 22 not decided.

## Now / near-term (JustWrite)

- **Before the family release — its last step:** one docgen translation-and-review run on JustWrite
  (`es`), after the last English change: the strings added since the last run (96 on 2026-10-29) and
  any whose English changed. The user's A, above.


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
