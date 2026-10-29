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


## Three feature ideas: PDF page size, Story Bible export, AI-written words by chapter [2026-10-28]
STATE:  DECIDED — `docs/plans/2026-10-28-four-feature-ideas.md` (each idea argued against twice,
        the standards, the decisions numbered with my recommendation, the blast radius).
        The user, on the four ideas: "i like the feature ideas lets do that after you finish the
        fixes and other stuff you are doing", then "but also think on your feature ideas
        adverserilay again before you do your rec", then, on what still waited on them: "think on
        still waiting on you adverserily and choose your rec go" — the plan's recommendations, all
        of them; the series idea, argued once more, is parked in `docs/dev/IDEAS.md` (the biggest
        change by far, and nobody has asked for it yet).
OPEN:   1 (PDF page size), 3 (Story Bible export) and 2 (AI-written words by chapter) BUILT
        2026-10-28 (the plan's "Built" notes) — your use of them on `npm run dev`. No release until
        every open task is finished (the user, 2026-10-28: "i asked you to not do that until all task
        all things are complete, finish things first"); v2.0.1 was cancelled before it published.
GO:     given 2026-10-28, as above.

## AI drafting on the story-world pages and in the editor [2026-10-11]
STATE:  DECIDED; slices 1 (characters) and 2 BUILT 2026-10-11, per the
        plan `docs/plans/2026-10-11-ai-drafting-plan.md` (each task ticked there with its commit). First round, asked as shown (after Fable's review of the first design, whose changes were
        accepted: one context composer first; the describe box stays while a page is thin; keep
        the name "Fill from book"; locations/objects/groups need a fields decision; your own AI
        actions are the kit's; names before titles; verify the POV/"when" loss first):
        "1. Placement: describe box, kept visible while a page is thin, plus **Draft with AI ▾**
        with **Fill from book** kept as its item. Or the review window only.
        2. Brainstorm: keep it, with names moving into the name fields first.
        3. **New:** do locations, objects and groups get structured sheets, and with which fields?
        Or is a drafted note enough?
        4. Scene plan: a Summary field, after the POV/"when" test.
        5. How far into prose: opt-in scene drafting.
        6. Order: the composer, then story-world drafting, then story-aware writer actions, then
        summaries and planning, then scene drafting. The kit's custom actions are sized
        separately. Before or after the translation work?
        Still open from before: say go and I'll add the survey findings to RESEARCH.md. Also say
        whether you want the POV/"when" round-trip test run now." (Earlier, as shown: "if the
        round-trip test confirms it, fix it as its own bug.")
        The user: "your rec all go".
        Second round, asked as shown (each with its reason, in the spec §9):
        "1. Locations, objects, groups: give them small sheets. Each keeps its current description
        and gains a few fields that stay folded when empty: Location: Atmosphere & senses, History.
        Object: Properties, History, Where it is now. Group: Goals & beliefs, Leadership, History.
        Worldbuilding stays an article; the AI drafts its body from the title and summary.
        2. Order: characters first, then translation, then the rest. 1. AI drafting for characters,
        plus the AI writing actions that know the story. 2. The translation work. 3. The new sheets,
        scene summaries and planning, then scene drafting.
        3. When to show the describe box: while none of a character's sheet sections has anything in
        it. Elsewhere, while the page's own fields are empty.
        4. How much story the AI is sent: at most 15% of the model's context window, adjustable in
        Settings → AI. Only the relevant cards are sent, so this limit only matters in crowded scenes.
        5. Line edits don't get the story notes.
        6. Save to sheet: a chat answer goes through the same describe-and-draft review, and you tick
        which fields to keep.
        7. Scene drafting switch: set per book, in Settings → Project next to Premise, off by
        default, labelled AI scene drafting.
        8. Button labels: keep the proposed list, with three changes: "Create selected" → "Add {n}
        to story bible"; "Draft the Fabula / Setting from the premise" → "Draft from the premise";
        "Write dialogue" → "Write dialogue…".
        9. Fix the three user-doc errors.
        10. Leave JustVoice's unlinked plan doc to the JustVoice session."
        The user: "your rec all go"; then "you have go for implementation".
        Third round (after Task 11, a second look at what was built), asked as shown:
        "1. Do Task 0 next, before slice 2. server/src/book_io.js never saves excludeFromAi, and
        drops status for scenes, characters, locations, objects and groups. So Exclude from AI on
        a scene, character or group resets the next time the book loads. The story-context
        builder (storyContext.js:38) and Ask the book's index (chunker.js:99) both honour the
        checkbox, but only until that reload. Slice 2 sends story notes with every prose action,
        so after a restart a character you excluded would go out with every Rewrite.
        2. Try the new prompts on your real model before I build more like them. No real model
        has run the four new actions; every test faked the model's reply. In your app: Settings →
        AI → Routing by feature → Character profile, and Brainstorm → the Lab; run the three
        seeded samples ("Character from a description", "Character sheet section", "Suggest
        characters").
        3. Rebuild Suggest characters the way the spec described it — shaped like Entity sweep:
        you type what you're looking for and click Suggest; while it runs, the window shows the
        shared progress strip with Cancel and can't be closed; the rows then go to the same review
        list, as EntitySweepModal.vue:301 does. (Today: leaving the page while it runs loses the
        answer; Cancel is only in the AI tasks panel; a failure is only a toast.)
        4. Translate the review list's leftover English: the section names (reusing the nav.*
        keys), the "Ch. N — Untitled" chapter labels, and the toast — "Added {n} to the story
        bible.", to match the button.
        5. Hide the empty Aliases box on suggested rows; show it only for Entity sweep.
        6. The header squeeze: give the kit's PaneHeader a slot for the name box, and let its
        buttons wrap below the title whenever they don't fit; the five detail pages (Characters,
        Locations, Objects, Groups, Notes) use it, and the CSS copy in src/css/app.scss goes.
        Unblocks Task 10 (Name ideas).
        7. Put Save to sheet (Task 12) in the chat panel itself, so it works on every page.
        8. Record progress as each task lands: tick each task in the plan with its commit.
        Suggested order: Task 0; you run the three Lab samples; points 3, 4 and 5 in one commit;
        the header fix in the kit, then Task 10; Tasks 12, 13, 14 and 15."
        The user: "your rec go" (2026-10-11).
        Task 9b, reopened (my count of the hand-built headers was wrong: 15 pages, not 5), asked
        as shown: "Step 1 — one source: the header classes move into the kit's shared stylesheet
        … PaneHeader uses those classes and drops its private copy; JustWrite's app.scss copy is
        deleted. The wrap fix is written once there. Step 2 — reuse the component, not just the
        styles: PaneHeader gains a slot for a breadcrumb plus an editable name; the 12 hand-built
        headers with the same shape switch to it … their hardcoded English breadcrumb labels move
        into translations. Window headers: the window header wraps whenever it doesn't fit, and
        the chip shortens the model name (…) instead of overflowing. Error boxes (21 files) and
        intro lines (9 files): one shared error box and one intro-line class in the kit."
        The user: "good coding practices reuse not copy"; then "this is one of your rules you
        shouldnt need to ask this question, you should do what a profressional software dev
        does, reuse code make components use frameworks, its not difficult, this is one of your
        rules, follow it, think on the correct profressional way to solve this, then go"
        (2026-10-11). Done the professional way: every page header is the kit's PaneHeader (all
        15, the three custom layouts included — Chapters keeps its centred switch as a layout on
        it, Markers and Reader knowledge are its "intro" variant), so no global copy is needed at
        all; every window's header, intro line and error box are AppModal's and UiBanner's.
        Fourth round (after Tasks 10, 12, 13), asked as shown: "1. Task 14 wording. I propose:
        Rewrite with direction… needs a selection and sits beside Rewrite. Menu description: "Same
        as Rewrite, but you say how first ("make her colder"). Keeps meaning, voice and tense
        unless your direction changes them." Dialog: title "Rewrite with a direction"; message
        "How should this passage change? One sentence is enough."; field "Direction" (existing);
        placeholder "e.g. Make her colder — she's already decided."; button "Rewrite this".
        Write dialogue… writes at the cursor and sits after Continue with direction…. Menu
        description: "Writes an exchange at the cursor between the scene's characters, in their
        story-bible voices. You say what it's about first." Dialog: title "Write dialogue";
        message "What's the exchange about? Name who speaks if it matters."; field "Direction";
        placeholder "e.g. Nettle presses Cael about the token; Cael deflects."; button "Write
        this" (existing). 2. Save to sheet's window currently says "From a description" above an
        answer from a chat. Keep that, or change it to "From a chat answer"? 3. Fix Accept all /
        Reject all now?"
        The user: "your rec go" (2026-10-11). Applied: 1 as proposed; 2 kept as it is (no new
        wording); 3 fixed (`87f0ca0`, and the last-paragraph case `c8914db`).
        Fifth round (the plan for the sheets and slices 3–4, its §5 plus the phone), asked as
        shown: "1. Hints for the 8 new fields, for example Atmosphere & senses: "What it's like
        to be there: light, sound, smell, mood." [use the drafts in the plan's §5] 2. One
        database change for all the new fields, so your other devices are asked to update once.
        [yes] 3. Names of the new AI features, shown in Settings → AI → Routing by feature.
        Proposed: Story-world sheets, Scene summary, Plot planning, Draft from the premise, Scene
        drafting. [these] 4. Fill from book for locations, objects and groups. It isn't in the
        spec. [not now] 5. The marking of AI-written text in slice 4: how it looks and whether it
        survives your edits. [I bring a design before slice 4; the sheets and slice 3 don't
        wait] 6. The phone's no-model message. Today it says "run Quick Setup…", which the phone
        doesn't have. Proposed: "No AI model is set up on this phone. Open the AI page, add an
        online provider and choose its model.""
        The user: "think on the questions again your rec go" (2026-10-16). The recs after the
        second look, applied:
        1. The hints in the character sheet's style — one line, then an example:
           Atmosphere & senses: "What it's like to be there — light, sound, smell, mood. e.g.
           salt and diesel; the fog never lifts before noon." Location History: "What happened
           here before the story, and what people say about it. e.g. burned in the '62 fire;
           locals say the night shift still clocks in." Properties: "What it does, what it's
           made of, what makes it unusual. e.g. brass, always warm; it stops when its holder
           lies." Object History: "Where it came from and who has held it. e.g. made for the
           first harbourmaster; pawned twice, stolen once." Where it is now: "Who has it, or
           where it is, at this point in the story. e.g. sewn into her coat lining." Goals &
           beliefs: "What the group wants and what it holds true. e.g. keep the old charts
           secret; the sea collects its debts." Leadership: "Who leads it and how it decides.
           e.g. three elders vote; the eldest breaks ties." Group History: "How it began and
           what shaped it. e.g. founded by the fire's survivors; split over the harbour deal."
        2. One sync step (4) for the eight sheet columns and the scene Summary. Slice 4's switch
           column waits for slice 4: its AI-text mark changes the editor schema sync's scene
           adapter shares (`server/src/sync.js` `editorExtensions`), so slice 4 takes a step of
           its own either way.
        3. Two new rows, as slice 1 did (its new actions sit under existing features; each
           action routes on its own preset): **Story-world sheets** (Locations, Objects, Groups,
           Worldbuilding) and **Planning** (Summarize this scene, Fill this template for my
           story, Draft from the premise). Name ideas, Suggest locations… and Suggest next beats
           sit under Brainstorm, as Suggest characters does. Scene drafting keeps its own row,
           with slice 4.
        4. Fill from book for the new sheets: not now.
        5. Slice 4 waits for the AI-text mark's design, which I bring; the sheets and slice 3
           are built now.
        6. The phone: "No AI model is set up on this phone. On the AI page, add an online
           provider with its Default model, then press Set as default on it." (An added
           provider isn't made the default by itself — the 2026-07-06 ruling, the kit's
           `seedDefaultRouting` — so the sentence names the button.)
        The other new words (the describe box's label per page, the review window's lines, task
        labels) follow slice 1's, page by page, and are listed in the report with their commit.
        Sixth round (after the sheets and slice 3), asked as shown: "1. **Editor AI menu ideas:**
        what should picking a Next plot beat or Plot twist do? I'd open **Continue with
        direction…** with the idea filled in. The alternative is copying it, as the Brainstorm page
        does. 2. **From a description:** should it also propose a **Description** for a location,
        object or group whose Description is empty? I'd say yes. 3. **Draft with AI ▾:** keep it
        as a one-item menu so Fill from book can join it later? I'd say yes."
        The user: "think on the questions again your rec go" (2026-10-16). The recs after the
        second look, applied:
        1. What Unstuck's **Write this** does — the editor's own precedent for a list of ideas:
           the next 2–4 paragraphs in that direction, as the accept/reject diff, with no dialog
           between (the diff is the review). Unstuck's window becomes the shared one
           (`IdeaListModal.vue`); the ideas come from the scene's story context and the prose up
           to the cursor; Regenerate never repeats an idea already shown. New words: the menu
           lines "Ideas for what could happen next, from your book, this scene and the prose
           before the cursor. Pick one and JustWrite drafts the next 2–4 paragraphs in that
           direction." and "Twists, reveals and reversals the story could take from here —
           plausible to wild. Pick one and JustWrite drafts the next 2–4 paragraphs in that
           direction." (each also the window's lede), and the toast "Write a few lines first —
           the ideas pick up where your prose ends."; the rest reuses Brainstorm's and Unstuck's.
        2. Yes, while the page has none: the description (a group's Blurb) is rich text, so a
           plain-text draft never replaces one. A character's draft already proposes its
           one-liner the same way.
        3. Keep it — the plan's "Draft with AI ▾ → From a description", the same control on all
           four sheet pages; Fill from book joins it if it's built.
        Seventh round, 2026-10-28 — Brainstorm where it's used. The user: "you did it wrong
        everything was supposed to have a seed prompt … when you added it to other you dropped seed
        prompt!!!!!"; "i just wanted the functionality ofr brainstorm to be in the place where it is
        used instad of having to goto a special menu to generate character name or charter or plot
        and then have to copy and paste it". The design, as shown: one panel, the same everywhere —
        Brainstorm's own controls, opened from a labelled button beside the thing it fills: the
        Seed prompt (as on Brainstorm), Generate, the ideas with 👍 and More like these; nothing runs
        until Generate; the ideas use the seed, what's on the page and the book; clicking an idea's
        button puts it in place and closes the panel. Where: character names at a character's name
        (sets the name); place names at a location's; item / object names at an object's or a
        group's; titles at the book title (Settings → Project), a chapter's title, a scene's title
        (sets that title); next plot beats and plot twists on a Plot board strand (adds it as a beat
        on that strand) and in the editor's AI menu at the cursor (writes the next paragraphs in that
        direction — Write this). Anything (free prompt) stays on the Brainstorm page. Unchanged: the
        Brainstorm page, Suggest characters / Suggest locations, Draft with AI. Changes: Name ideas
        stops generating on open, gets its words instead of a lone ✨, and gets the seed back; titles
        get the panel; the Plot board's and the editor's plot-beat and plot-twist windows become this
        same panel. Words: the buttons "Name ideas", "Title ideas"; the action on an idea "Use" (names
        and titles), "Add as beat" (Plot board), "Write this" (editor); under the seed box at a page
        "Leave it empty for ideas that fit this page and your book." The user: "seed should be
        optional"; the Brainstorm page left as it is (my rec: its seed stays required — away from a
        page it sends neither the page nor the book); "your rec go" (2026-10-28). Then, asked for my rec on
        the Plot board's window and on two things seen but left alone ("think on it again and then go
        with you rec", 2026-10-28): the Plot board's idea window stays open — Add as beat adds the
        beat and its button reads "Added", disabled; names, titles and Write this still close; the
        Timeline (and an entity's Events) shows an event at midnight — a date picked alone — without
        a time; Relations breaks a long name onto two lines at its own size instead of squeezing it.
WHY:    the user, 2026-10-11 — AI creation on each story-world page, not only on Brainstorm, and AI
        that writes the story or parts of it. Picks up IDEAS.md "Brainstorm → point-of-use
        generation" (2026-07-26).
DETAIL: the spec `docs/plans/2026-10-11-ai-drafting-spec.md`; the survey
        `docs/plans/2026-10-11-ai-writing-apps-survey.md`; RESEARCH.md "What other writing apps ship".
BUILT:  the POV/"when" fix — `d55f8f5` (+ the kit's `1ab9a69`): a scene's POV and "when" are
        saved; existing databases gain the columns at boot; sync schema 2; whats-new. Decision 9 —
        the three user-doc errors fixed (getting-started.md auto-update; writing.md "When" and
        Entity sweep). Plan Tasks 1–9 and 11 (the kit's `1476549` `b9ea75d`; `d797c1f`,
        `c2a98c5` + `850a848`, `4b9f073`, `52222e0`, `7d66857`, `72ddd50`, `7c07ce9`, `a976c34`). Task 0 — status and Exclude from AI kept (sync schema 3), and honoured by
        every card reader. Task 11b — Suggest characters in Entity sweep's shape. Task 9b — one page
        header, one window header / intro line / error banner (the kit's `5856019`). Task 10 —
        Name ideas at a character's name, on Brainstorm's own categories, prompt, rounds and list.
        Task 12 — Save to sheet under a Talk to {name} answer, its review window in the chat panel.
        Task 13 — slice 2: the six prose actions send the scene's story context; the Context line.
        Task 14 — Rewrite with direction… and Write dialogue…, wording as asked in the fourth round.
        Task 15 — closed out: the gates, every surface at 1280 and 390 px, RESEARCH (here and the
        kit's `544dfd3`). Fixed on the way: the description draft's voice pass (`be35f4b`), Accept
        all / Reject all (`87f0ca0`, `c8914db`).
        The sheets and slice 3 (2026-10-16, the fifth round; the plan
        `docs/plans/2026-10-15-ai-drafting-plan-slices-3-4.md`, each task ticked there): the columns
        and sync schema 4 (`2769599`); the sheets on the three pages and the cards (`df8b6c0`);
        drafting them, Worldbuilding's body, Name ideas, Suggest locations (`afff407`); the
        Summary, the Plot board's strand menu, Draft from the premise (`891ce9e`); the phone's
        sentence (`e10b65b`). Fixed on the way: the bare @ in mentionRefs.empty (`b1c584b`), the
        Apply template list's outside click (`f1d8128`).
        The AI-text mark's design and slice 4 (2026-10-18), under the user's "keep going until
        everything is done your rec but think on your decisions twice before doing, finish
        everything dont stop" — the design with each decision's second look is
        `docs/plans/2026-10-18-ai-text-mark-and-slice-4.md`: every AI-written passage is marked
        (KDP's line: AI-written, not AI edits of your words — those only where they rewrite marked
        text), a violet ink in the editor only; the AI's words stay marked through edits, the words
        you type are yours, Mark as mine clears it; Highlight AI-written text in Writing settings;
        Settings → Project's AI scene drafting switch and the count of AI-written words; Draft from
        plan on its own row, Scene drafting (sync schema 5: the column and the mark). Checked:
        unit (the mark on the app's schema: accept, an edit of unmarked and marked text, typing,
        paste, Enter, Undo, Mark as mine), server (the column round trip, sync 5, the row, prompt,
        preset and Lab sample), a new flow test (`tests/flows/scene-draft.spec.js`, 1280 and 390
        px: off by default, the switch, an empty scene drafted from its Summary and accepted, a
        typed word unmarked, the count, Mark as mine).
OPEN:   your look at the seventh round's build (Brainstorm where it's used, `c391373`) and its
        follow-ups (`459c5ad`). The Lab check (`npm run eval`) and Slice 4's bench leg are done
        (RESEARCH "Testing").
GO:     given 2026-10-11 — "your rec all go" (twice) for the design, the decisions, RESEARCH.md,
        the POV/"when" fix and the doc fixes; "you have go for implementation" for slices 1–2;
        "your rec go" for the third round (Task 0, Tasks 9b and 11b, Task 12 in the chat panel);
        "think on the questions again your rec go" (2026-10-16) for the fifth round's recs, the
        sheets and slice 3, and the phone's sentence; the same words again (2026-10-16) for the
        sixth round's.

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
OPEN:   1. your review of the screenshots; 2. done 2026-10-16 (`e10b65b`: the phone's own way to set
        a model up, decided in "AI drafting"); 3. the camera line on iOS ("JustWrite uses
        the camera to scan the pairing code your computer shows.") — written by me, yours to change;
        4. not run: sync with a paired computer from iOS, the unsigned device build for the sideload
        route (the cloud-folder item, OPEN 1).
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
GO:     not given.

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
           `../just-core/docs/plans/2026-10-08-sync-product-design.md`.
        8. DECIDED 2026-10-08 (after Settings → Sync was built) — the user: "your rec all go", on
           these as shown: "3. Phone scope: which JustWrite features run on the phone? A phone
           can't run the local AI engine, the search index or the file autosave. Lean: the book,
           images, versions, sync and online AI providers." · "7. Confirm my choices where the
           record had gaps: The .jwsync file extension. Hand-carried files unencrypted unless you
           tick the box. The Sync screen's wording. Sync as a JustWrite-only Settings section for
           now (adding it to the family list would fail JustVoice's and docgen's tests)." So: the
           phone runs the book, its images and versions, sync, and online AI providers; the four
           choices stand.
        9. DECIDED 2026-10-08 (the phone's plan, `../just-core/docs/plans/2026-10-08-the-phone.md`)
           — the user: "keep going using yo9ur recs, think on your recs twice do it unitl the whole conversions is complete including the move to quasar dont stop", then "go". So the plan's leans stand, two of them changed on the second
           think: images are stored in scenes by id; the worker's DOM for scene merges is
           linkedom; AI calls go DIRECT from the worker (they stream) and fall back to native HTTP
           only for a provider that refuses a webview's call (native HTTP can't stream); the phone's
           screens are built after the kit's controls move to Quasar (Q3), on Quasar's mobile
           components, not gated on a separate mock.
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
          (`book_io.saveBookChanges`, `api/projects_api.js` bases keyed by the window's id —
          `x-jw-client` then, the kit's `X-Client-Id` since 2026-10-24); decompose (import,
          samples) still replaces whole;
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
          requests, `watchSync` → `reloadFromServer()` when another device's changes land (since
          2026-10-24 the kit's `watchOtherWindows`, which also counts the other windows on the
          same server);
        · the kit's CSRF guard allows the phone webview's origins (`CAPACITOR_ORIGINS`).
        Checked: server 141/141 (7 new in tests/sync.test.js: only changed fields written · a
        window's old snapshot doesn't undo another device's change · scene text written on two
        devices merges through the editor schema · export/import by hand · another library refused
        until joined · pairing behind its token · reset), unit 590/590, lint, vite build, the
        headless smoke (all routes, zero JS errors).
        Earlier the same day: round 2 (the design doc's "Round 2"); the Android SDK at
        `E:\Android\Sdk` (AVD `jvtest`), `E:\Android\jdk-21` → Visual Studio's JDK 21.
BUILT:  2026-10-08, on branch `quasar` (the Quasar item above): Settings → Sync — the kit's
        `SyncPanel` (`../just-core/packages/ui/src/components/SyncPanel.vue`, imported by path; it
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
OPEN:   the phone ("The phone's screens" and "The phone's cloud folder" above) · "Use the server directly" (the thin client) comes
        with the phone · "changes waiting" on the status line (the design §2) has no source yet —
        no route counts what another device hasn't received · leaving the cloud folder's devices
        (the folder transport's removeDevice) has no button yet · a real OneDrive/Dropbox sign-in
        needs the user's app registrations · Sync joins the family's Settings canon when JustVoice
        gets sync (adding it now would fail JustVoice's and docgen's "renders every family
        section" tests) · my choices under "your recs" where the record had a gap, to confirm:
        the by-hand file's extension `.jwsync`; by-hand files unencrypted unless asked (the cloud
        folder's always are); the screen's words not quoted in the design (its labels, hints and
        messages — `SyncPanel.vue`).
FOUND:  2026-10-13, reported by the JustVoice session (its review P16; the user's choice there,
        "(b)": the other computers' newer work wins) — restoring an old backup on a synced
        computer overwrites, on every paired or cloud-folder computer, the edits made since that
        backup, and deletes there what was made since: the restore's table copy fires the sync
        triggers, and the flush stamps every restored row as the newest change. Fixed on
        JustVoice's side, not yet pushed: just-sqlite-sync's `beforeRestoreCopy(h)` /
        `afterRestoreCopy(h)` and the engine's `afterRestore()`; the kit's `makeDataRouter` takes
        `beforeCopy` / `afterCopy`. JustWrite's part: `server/src/data_admin.js` (`onReplaced`,
        ~86-91) passes the two hooks and calls `afterRestore()` instead of `flushSync()`;
        `docs/sync.md`'s "Restoring a backup" bullet changes. GO given 2026-10-13 ("your rec think
        on them again go" — the rec was "go once they push"). ON HOLD since 2026-10-13, at
        JustVoice's request: its stress test (three devices, random edits, backups and restores,
        300 runs) found permanent divergence in this design; a "restored device becomes a new
        identity" design passed 300/300 and awaits the user's word in JustVoice's session. The
        engine's changes are on just-sqlite-sync's branch `restore-wip`, not main; the kit's
        restore route keeps its optional hooks (`beforeCopy` / `afterCopy` / `afterTables`),
        unused until then. Don't wire JustWrite's side before that word.
        2026-10-15, from JustVoice's session: the new-identity design is built (just-sqlite-sync
        `35dc1d7`, kit `4157d95`, JustVoice `5f76cb9`; more engine fixes coming there, a
        convergence bug that needs no restore among them). JustWrite's part now: `server/src/
        sync.js` `export const restoreSyncHooks = appSync.restoreHooks;`; `data_admin.js`
        getDataRouter adds `...restoreSyncHooks` and drops `flushSync()` from `onReplaced`; a
        restore test; `docs/sync.md` "Restoring a backup … counts as an edit" is no longer true.
        Waits for the user's word on the changed design, and for those engine fixes.
        The engine fixes landed 2026-10-15 (just-sqlite-sync `87dc877`, its RESEARCH `9bfac8b`): a
        parent's delete cascading over a re-inserted child is recorded now — on every device,
        restore or not; the Yjs client id is the device plus the row's insert mark, so rich text
        survives a delete-and-reinsert, and old and new engines merge without losing or doubling
        an edit. Stress, JustVoice's: 3,500/3,500 plain, 2,300/2,300 and 1,300/1,300 restore runs.
        JustWrite runs the new engine already (a `file:` dependency): its server suite passes
        (160). One more line for JustWrite's wiring: the app layer's sync options take `auth.set`
        — `(tokens) => writeRow("auth", { ...readRow("auth"), tokens })` — so a restore keeps the
        pairing tokens (JustVoice `e07a7f9`). Ruled 2026-10-15 — the user: "your rec go", then
        "think on everthing again before coding go", on "Restore wiring: go now that the engine
        fixes are in." Built 2026-10-15: `restoreSyncHooks` in sync.js, spread into getDataRouter,
        `flushSync()` gone from `onReplaced`, `auth.set` as above; two tests through POST
        /v1/data/restore (tests/sync.test.js — the backup's stamps kept, a new device with the old
        id an origin, nothing restored sent as this device's change, the sync settings and a token
        paired after the backup kept; another library's backup refused with 409 while a folder is
        set, restored when not, the library unchanged), each failing without its piece; docs
        sync.md "Good to know", backups-and-data.md, whats-new.md. The phone has no restore route.
FOUND:  2026-10-15 — JustVoice's kit additions JustWrite took up (the user: "your rec on all go",
        on "a data-folder lock, so a second JustWrite server can't open the same data (708b9d1),
        Retry on the connection-error page restarting a server that failed to start (8c7a17a),
        and a shutdown route, so the desktop app can stop a stale server cleanly instead of
        killing it (a1ddee9)"): the lock — serve.js names itself `APP_NAME` and its ladder folder;
        the boot asks the shell for the server's URL (Retry then restarts a failed start, and a
        JUSTWRITE_PORT in the environment no longer leaves the window on 17495); the connection
        page shows the lock's words; the shutdown route — the kit's (`0b42f44`, JustVoice's route
        moved there at its session's request), mounted in app.js, `shutdownPath` in the desktop
        main; checked live (the lock's words and exit 3; the POST stopped the server and freed its
        port). A port another program holds: ruled 2026-10-15 — the user: "your rec go", then "think
        on everthing again before coding go", on "Taken-port wording: "Port 17495 is in use by
        another program — close that program, then press Retry."" Built 2026-10-15: en.json
        `connectionError.portTaken` with `{port}` (the shell's `portTaken`) and `{retry}` (the
        button's own label, `kit.common.retry`, so a translation names the button as it reads);
        src/pages/ConnectionErrorPage.test.js; docs troubleshooting.md "The app can't reach its
        server" (the lock's words too — missed when they shipped), whats-new.md.
GO:     given 2026-10-08 — the tests and research ("your rec on all go do the testing"), then
        the build ("just-sqlite-sync you have a go on it all your recs complete the whole
        project without stopping unless you need to").

## Now / near-term (JustWrite)

- **Ask the book and Talk to a character show the model's Markdown raw** (`**bold**`, `*` bullets —
  `ChatPanel.vue`'s assistant bubble is plain text; seen in the 2026-10-28 real-model screenshots).
  WAITS ON THE KIT: a safe renderer for AI text (marked + DOMPurify — marked doesn't sanitize),
  asked of the kit session 2026-10-28; then the bubble renders through it.
- **Help hints translated** (docgen's single-source item, 2026-10-29): each doc's `lede:` front-matter
  instead of `docs/toc.json`'s English `hint`, read as `$t('lede.<slug>')` by Help and the command
  palette, docgen's `extract --check` in the gate. The kit's help renderer already skips front-matter
  (kit b8551d2; `front-matter` installed here); WAITS ON the kit's website `sync-docs.js` stripping a
  doc's front-matter and taking Starlight's description from `lede:`. Plan:
  `docs/plans/2026-07-26-i18n-single-source-research.md`.
- **i18n key-naming style + the `|` plural pipes in `en.json` — your veto still open.** Trap to
  remember: `@` is vue-i18n's linked-message syntax — write `{'@'}` in messages; nothing in the
  toolchain catches it, so render-check any message containing `@ | {`.
- **The release workflow on GitHub's latest action majors** (the user, 2026-10-29: "why dont we use
  whatever latest is for gituhb", "i want this for all apps"): `release.yml` still pins
  `actions/checkout`, `setup-node`, `upload-artifact` and `download-artifact` at `@v4` (they run on
  Node 20; the build itself is Node 24). Latest today: checkout v7, setup-node v7, upload-artifact v7,
  download-artifact v8. WAITS ON the kit's template `release.yml` (its session is moving it); JW then
  copies its lines and proves them with a dry run (`publish=false`).
- **Rotate the Gemini key that appeared in chat** — yours (the key itself is never printed).

## Your-box checks (only the Windows / 2070S machine can finish these)

- **AMD / Intel graphics detection** (Ledger §G6): needs a Windows machine with an AMD or Intel GPU
  (the Core Ultra 7 laptop) — the AI page's hardware strip names the adapter, its VRAM and class.
- **A thinking run on Anthropic** (Unit 2's cloud half): needs an Anthropic key, and none is set;
  the request shape is unit-tested only (the kit's `adapter_extra.test.js`).
- **The engine update replacing its build** (providers round 10, the 2026-09-19 safe-update flow):
  reachable now — the AI page offered "Update to b11960" over the installed b11239 on 2026-10-28.

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

- **The happy-dom override** (root `package.json`, 2026-10-29) — drop it when `@tiptap/html`'s peer
  range takes happy-dom 21 (it says `^20.8.9` up to 3.32.1). RESEARCH.md, Sync.

- **I5 — the deferred parking lot** (per-scene snapshots · per-entity write REST · RAG
  sqlite-vec ANN · llama-swap layer). Ledger §I5.
- **claude-config standalone provisioning** — only the fresh-container proof is outstanding
  (prove `~/.claude` provisions from `github.com/delebash/claude-config`, then JW's vendored
  copy can go).
