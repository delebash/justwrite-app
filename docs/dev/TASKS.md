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


## Now / near-term (JustWrite)

- **Before the family release — its last step:** a docgen run on JustWrite's Spanish for any English
  that changes after 2026-10-29's run (none, if no later fix touches en.json). The user, verbatim: "do the
  spanish run after all fixes in other apps like core ect", then "or if card is free you can do it now".
  The run was done 2026-10-29 with docgen's own translate (3178/3178, check exit 0); the user: "i dont
  want to spend a lot of my tokesn for claude on translation" — docgen translates, never Claude agents.


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
