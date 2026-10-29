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
OPEN:   the Lab check is now `npm run eval` (TASKS "Automated testing", 2026-10-16): every sample
        ran on gemma; its findings are listed there.
        Slice 4's bench leg (the plan's D4) done 2026-10-18 on the user's "run it now go": Draft
        from plan passes on gemma-4-26b and gemma-4-12b; 26b lands the scene's turn, 12b softens
        it — 26b is fit for Scene drafting, so the feature carries no warning (RESEARCH "Testing").
GO:     given 2026-10-11 — "your rec all go" (twice) for the design, the decisions, RESEARCH.md,
        the POV/"when" fix and the doc fixes; "you have go for implementation" for slices 1–2;
        "your rec go" for the third round (Task 0, Tasks 9b and 11b, Task 12 in the chat panel);
        "think on the questions again your rec go" (2026-10-16) for the fifth round's recs, the
        sheets and slice 3, and the phone's sentence; the same words again (2026-10-16) for the
        sixth round's.

## Automated testing: real models and click-through flows [2026-10-16]
STATE:  DECIDED 2026-10-16 — the user: "what am i checking can you do it do you have or can find
        tools to do testing like jv so there is minimul human interaction and can test with other
        ai models what can you do? this type of testing is something we need to be able to to for
        any app more good automated testing that is quick, think on your rec again always
        adversially go"; then, asked what was being changed and told (nothing existing replaced:
        the real-model eval for the Lab check, and the one-off click-through scripts made
        permanent tests), "carry on, your rec go".
WHY:    the Lab check was the user's to do by hand; every test faked the model's reply; my
        click-through checks were one-off scripts nobody re-ran.
BUILT:  `npm run eval` (promptfoo 0.123.1 through npx; the kit's `scripts/evals/`: the app server as
        a provider, the Lab samples as test cases; JustWrite's `evals/`: the config and the reply
        contract) and `npm run test:flows` (Playwright Test, `tests/flows/`, 14 tests at 1280 and
        390 px, AI stubbed by the kit's `scripts/lib/ai-stub.js`); the smoke's setup shared as
        `scripts/lib/scratch-server.js`. Docs: architecture-notes.md "Test harness detail".
        First runs: the flow tests pass (30 s); the eval on gemma-4-26b and gemma-4-12b — findings
        below and in RESEARCH "Testing".
        The findings, asked as shown (2026-10-16): "1. Autosave fails for any book over 64 KB —
        this is serious. … Fix: the kit's request helper drops that setting when the body is over
        64 KB, which fixes every app at once. … A new flow test would check a big book saves.
        2. Three writer samples always fail … Fix: add the variables to `seed_presets.js:264,
        270, 320`. Also have the kit's sample seeder add a missing variable to a sample already
        saved, keeping your values, so your database gets them. 3. Brainstorm's plot sample tests
        the wrong thing. … Fix: one sample per way the app asks for plot ideas. These are new
        labels in the Lab, so I need your word on them: "Plot beats from a seed", "Next beats at
        the cursor", "Next beats on a strand". 4. Draft from the premise contradicted the premise.
        … Fix: the prompt gains "keep every fact the book gives — names, pronouns, who is who",
        and the sample gets the main cast, as a real book would send. 5. Fill from book can lose
        a character's vocabulary. … Fix: the app joins the list with semicolons …, and the prompt
        asks for semicolons." Then: "Your go to translate the new English lines, which also uses
        the GPU." The user: "your rec on all go" (2026-10-16).
        Built 2026-10-16: 1 — kit `6b7d96b` (the transport keeps keepalive only within 64 KiB in
        flight) + `a56e0a3` (its tests: a book over 64 KB saves); 2 — `575ba75` + kit `3b485a8`
        (the samples carry the variables; the seeder adds a variable a stored sample lacks; a test
        renders every sample through its prompts); 3 — `14fb8b8` (the three samples, held to their
        composers); 4 — `a820ccd` (the rule, healed into an unedited stored prompt; the sample's
        cast); 5 — `e2da0ee` (a list of phrases joined with semicolons; the prompts name the shape).
        Run 2026-10-16 on the GPU, after JustVoice freed it:
        - `npm run eval` on the changed actions passed 12 of 12 on gemma-4-26b (RESEARCH
          "Testing").
        - The new English lines went to docgen as a job (proposals only; `es.json` byte-identical
          before and after). That is 74 keys: the 72 added since the 2026-10-15 staging, and the 2
          whose English changed since (`writingAi.storyContextDesc`, `mentionRefs.empty`), whose
          old proposals it replaced. All 74 staged, none failed, 76 s.
FOUND:  2026-10-16, while freeing the card: the kit's `POST /v1/llm-runner/stop` with no body at all
        returned 500, "Cannot read private member #state from an object whose class did not
        declare it". The 2026-10-17 recs, as shown: "My rec: go back to the adapter's default —
        delete `overrideGlobalObjects: false`" (the other option, NOT STANDARD: keep the setting
        and hand the body limit a real request in `readBody`); and for the Spanish: "Keep "beat"
        … and "hilo" for strand, put the number before the noun ("{n} notas"), all three in
        docgen's conventions line for Spanish, then re-run the affected keys as a job (proposals
        only)." The user: "go your rec"; asked which, "think on it adverserially your rec go";
        and "i dont mind non standard i want what is best what works the reason for sticking
        with standard is you often write and fix problems when a standard fix already exists".
        What the attack changed: docgen's conventions line is docgen's packaged rule for Spanish
        in every project, so the three went into JustWrite's own context sentence instead. The
        glossary was no fit either: it protects whole words, case-sensitive, so "beat" would miss
        "beats".
        Built 2026-10-17:
        - Kit `479dbad`: the server keeps @hono/node-server's default globals. Any JSON body that
          came without a Content-Length (chunked, or a POST with none) had answered 500 on every
          family server. Two tests go through the real server (kit RESEARCH, hono/body-limit).
          Checked: kit 1,199 passed, JustWrite's server 166, the smoke, the flows 16 of 16; on
          docgen's server, a POST to the stop route with no body and a chunked one both answer
          200. JustVoice on 479dbad (its session, 2026-10-17): the smoke rendered every view
          with zero JS errors, and the stop route with no body answers 200.
        - JustWrite's docgen context sentence gains: "In Spanish, a plot beat stays "beat"
          (plural "beats"), a strand of the plot board is "hilo", and in a plural form the
          number comes before the noun ("3 notas")."
        - A job re-staged the 158 keys those rules govern: every key whose English says
          beat/beats/strand/strands, and every plural form with a number. All 158 staged, none
          failed; `es.json` byte-identical.
          Read: every beat key keeps "beat", every strand key says "hilo"; 155 of the 158 put
          the number first.
        The Spanish review, DECIDED 2026-10-17 — the user: "your rec what else is next i dont want
        to review spanish can you do it"; then "realisitically you are a very smart ai, either you
        can do most of the work find tools like you did in jv or if need be we make tools but i
        want an agentic worflow with little human interaction". The tools are in docgen's RESEARCH
        ("Automatic translation review: tools"). Asked as shown: "My rec: one saved workflow in
        docgen's repo, reusable for any app's catalog. You'd see only a summary and a short list
        of anything left over. 1. Translate: docgen's job, as now. 2. Machine checks: docgen's
        checks, plus the Spanish spellchecker. 3. Review: 4 reviewer agents split the strings. Each
        one marks errors in the MQM style and writes a fix, only for real errors and never for
        style. They work from one term sheet built from the catalog plus your three rules. 4.
        Verify: 4 verifier agents keep a fix only if they agree it improves the string (the MQM-APE
        filter). A fix that breaks docgen's checks is dropped automatically. 5. Apply: through
        docgen's own Apply and Save, so it's undoable and every `es.json` change shows in git. Then
        docgen's `check` must pass. 6. On screen: JustWrite's flow tests run in Spanish at 1280 and
        390 px, checking for overflow. 7. First run: all three catalogs waiting today (JustWrite,
        the kit, docgen; about 4,800 strings), with 9 agents in total." NOT STANDARD: "the
        workflow script and the small export and apply scripts around docgen". The user: "auto
        compatcte re read docs rules notes so you know where you are at your rec on all think on
        them again adversarially first go". What the attack changed, as shown: no GPU (the
        reviewers write the kit's new strings through docgen's Save, no translate job);
        acceptances recorded by the reviewer "Claude (AI review)", set on a scratch copy of
        docgen's data ("the engine never signs off"); a pick in the strings where the file's
        Spanish and the proposal differ; every final string compiled with vue-i18n's message
        compiler; run from the scratchpad, saving it into docgen as a reusable tool asked by name
        once it has worked; 1 term sheet + 6 reviewers + 2 verifiers.
        Run 2026-10-17 (numbers in docgen's RESEARCH): the term sheet, 201 terms; 1,282 decisions;
        the verifiers upheld 1,234 and rewrote 48; a last agent (the tenth) ruled on the 430 strings
        still flagged — 2 fixed, 428 accepted with a reason; my own on the way: "P. ej." after a full
        stop in 11 hints, the kit's speed band "bien" → "aceptable" (its settings call it that), and
        17 counts given both forms ("{n} encontrado | {n} encontrados" — vue-i18n picks the form
        from `n`, the kit's RESEARCH §8; docgen's placeholder check counts `{n}` across both forms,
        so they are accepted). Applied through docgen's routes on a scratch-data server: every
        `es.json` equals the decisions key by key — JustWrite 3,052 of 3,052 (was 2,092), the kit
        1,480 (was 62), docgen 278 (new). Nothing left staged or unreviewed; `es.accepted.json`
        written in each project. All six problems listed here before are fixed (the number first,
        "reveses", "Redacción: {name}", "desactualizado", "biblia de la historia", "{n} beat").
        Checked: docgen's `check` passes on JustWrite's and docgen's catalogs, and on the kit's but
        for `kit.quickSetup.doneBody` (empty in English on purpose — docgen's TASKS, FOUND
        2026-10-15); test:fast (unit 713, build, server 166); the kit's UI tests (12); i18n:report
        MISSING 0; the smoke; the flows 16 of 16; every route in Spanish at 1280 and 390 px — no
        sideways page, the same boxes scrolling in themselves as before (the tables at 390);
        docgen's screens in Spanish from its real window. Fixed on the way: the kit's Icon shrank
        beside a label that wraps (docgen's nav, "Configuración de la aplicación") — it keeps its
        size now. User docs: whats-new.md.
        2026-10-18 — the run's follow-ups, decided as shown: "2. Four code bugs put English into
        Spanish screens. The backups dialog shows the raw name "prev2". The fix is the label
        function the backups list already uses. The Import page inserts the English words
        "chapter" and "note" into sentences. The sidebar makes "New …" by cutting the "s" off a
        translated word, which gives "ubicacione". The marketing pack shows the raw
        "high/medium/low". My rec for the last three: whole messages per case, or one key per
        item, with the same English as today. Pasting a noun into a sentence breaks Spanish gender
        ("este nota"); that point changed my rec. The Spanish for the new keys goes through the
        same review. 3. Two theme names stay English. "Fine Press" and "Ivory Press" are
        untranslated while their sibling themes are translated. My rec: "Imprenta fina" and
        "Imprenta marfil". 4. Three docgen fixes, each with a test: Check placeholders form by
        form, so a Spanish string with more forms isn't flagged. Count a string that is blank in
        English as done. Name languages in the interface's language; Spanish screens show "Spanish
        (es)" today." The user: "compacted re read docs rules session your rec on all go".
        Done: the restore title through `generationLabel()`; Import's wording as whole messages per
        case (8 new `import.*` keys, `count.chapterNoun` / `count.noteNoun` after `count.flagNoun`,
        the "Untitled note/chapter" placeholders reuse `sceneNotes.untitledNote` and
        `chapters.outline.untitledChapter`); each sidebar + button names its entity's existing
        "New …" key (`newLabel` on the nav row — the reuse-before-mint rule, so no new key); the
        confidence chip one key per level. The Spanish: one agent wrote the 13 new strings, a
        refuting verifier upheld 9 and rewrote 4, and ruled the Import button's "Eliminar" a
        terminology error (it only leaves a section out; the term sheet's "quitar" — the thing
        survives) → "Quitar", with its tooltips and line; the theme names as approved. Saved
        through docgen's Save (16 strings; docgen pruned the 7 replaced keys itself). docgen's
        three fixes: its TASKS, Task 6. Checked: docgen's `check` passes with exit 0 on all three
        catalogs (JustWrite 3,058 of 3,058; the kit 1,481 of 1,481; docgen 278); test:fast (unit
        713, build, server 166); i18n:report MISSING 0; the smoke; the flows 16 of 16; each touched
        screen driven in Spanish and English on the scratch server (the six + buttons, Import as
        notes and as chapters with both tooltips, the restore title from a real autosave, the
        confidence chips) — every string as in the catalogs, no page errors; docgen's server
        tests 165, unit 5, lint. User docs: whats-new.md (both apps), docgen review.md.
        2026-10-18, second round — three findings shown with recs: "1. Restore title … My rec is
        one message per copy, for example `Restore "{title}" from the previous autosave?` … 2.
        Import's notes tag … My rec: start the field with the word its placeholder already shows
        ("nota" in Spanish) … 3. Seeded names … My rec is a plan before any code: each seeded row
        keeps its catalog key and shows the translation until you rename it." With them, the
        three cleanups named before (the smoke's `/v1/kv` probe, the passive-voice sample, the
        voice prompt's scale). The user: "keep going until everything is done your rec but think on
        your decisions twice before doing, finish everything dont stop". Done, with what the
        second look changed:
        - The restore title: three whole messages, the list's own words ("from the current /
          previous / earlier autosave?"); the read error beside it ("Couldn't read the autosave
          file.") was English in code — a key now.
        - The notes tag: a new note took "note" from code too (`project.js` `addNote`), so
          changing Import alone would have given a Spanish book two tags; one catalog word
          `defaults.noteTag` (with the other create-time words) for New note, Import's field and
          the store's import default. A tag is free text, so it can't be translated when shown —
          it is written in the writer's language (the 2026-10-13 ruling: new-thing names in the
          app's language when created). The server's save still fills an empty tag with "note"
          (the seeded-words plan, OPEN 2).
        - Found by the seeded-words sweep and fixed, as the existing rulings say: the marker
          categories (a code table — it names its keys; the chips showed the English constant);
          the Architecture documents in the sidebar and search (a fixed set shown by key, as the
          page — one table, `services/architectureDocs.js`); a new tag-vocabulary entry ("New
          tag", `defaults.tag`). And, from JustVoice's sibling session: Clear models cache says
          when the cache is shared (the template's line, kit `d716a8b`) — though the kit's
          `cacheShared` can't see apps that share JustWrite's own cache (told to that session).
          And the Writing settings window's choices ("theme", "small", "enabled", "disabled" —
          English literals in `EditorSettingsModal.vue`, found by the Spanish verifier) take keys.
        - The Spanish of this round's 25 new strings (slice 4's, the restore question, the
          create-time words, the shared-cache line, the Writing settings choices): one agent
          wrote them, a refuting verifier upheld them; saved through docgen's Save (docgen pruned
          the replaced key). Two advisory terminology flags accepted as false alarms ("de lo
          anterior" is `continueDesc`'s own closing phrase; "escríbelo" is "escribe" with its
          pronoun), by the reviewer "Claude (AI review, 2026-10-18)".
        - The smoke reads `/v1/settings` (what replaced `/v1/kv`) and its header says so.
        - The passive-voice rule has its own Lab sample, "Passive paragraph" (a new label, so the
          seeder adds it to existing databases); the voice passes' register line lost its scale,
          both older stored texts heal. The eval on the three actions: 4 of 4 on gemma-4-26b and
          on gemma-4-12b, both reading as intended (RESEARCH "Testing").
        2026-10-18, third round — the user: "your rec on all go dont stop dont ask me again do it all
        untill all your tasks are done you keep saying things like needs your word, dont stop
        instead think adversiarally on these things and take your on rec go on all". Done:
        - OPEN 1, the review saved as docgen's tool (NOT STANDARD, taken on that go): docgen
          `34af5fb`, `docs/dev/agentic-review.md`. The second look changed: a run folder instead of
          fixed paths; the message compiler a dev dependency at the apps' vue-i18n version; the
          guide split into the method, the language's rules and each project's context.
        - OPEN 2, seeded words, in the kit, here and in docgen (the plan's §5 says what was built
          and what the second look changed): statuses and worldbuilding categories show the
          catalog's word until renamed, everywhere they render — the store's getters, and Trash and
          the sidebar's delete message, found by the re-grep; the AI page's features, actions and
          presets and the kit's five descriptive provider names by key; a status or category the
          writer adds starts with the catalog's word; a note's blank tag stays blank on save. Knob
          help and measurement labels stay English (technical text, as the model catalog's).
          The Spanish of the 134 new strings (here 122, the kit 5, docgen 7), through docgen's
          tool (`--new`): one reviewer translated them, a refuting verifier upheld all 134, and
          the 12 strings docgen or the spellchecker still flagged were accepted as correct (names,
          words Spanish shares, valid words the dictionary lacks), by "Claude (AI review,
          2026-10-18)". Six consistency fixes the reviewer noted, saved through docgen's Save:
          "Done" and "To do" as the statuses say on Analysis and Home ("Completado", "Pendiente"),
          the plot-hole audit's world-rules pill "activado/desactivado" (was "encendido/apagado";
          the kit's switches say "Activado"), "esta ventana" for "this modal", and the session
          recap's blurb naming the resume briefing as its feature does.
        - OPEN 3, `book-smoke.js`: it seeds through `/v1/settings`, forwards the page's `/v1`
          off :1420 and waits for the store hook; LOAD and SAVE pass on scratch ports (RESEARCH
          "Testing").
        - Checked: docgen's `check` exit 0 on all three catalogs (here 3,204 of 3,204, the kit
          1,486, docgen 285); test:fast (unit 728, build, server 170 with the blank-tag test);
          i18n:report MISSING 0; the smoke; the flows 20 of 20; the seeded words on screen in Spanish
          and English on a snapshot of your data (Settings → Project, the sidebar, Analysis, the
          AI page and its providers) — your renamed "Magic & lore" stays as written; the kit's
          tests (core 1,226, ui 18 with `seeded_words.test.js`) and lint; docgen's tests (server
          165, unit 5) and lint; the family guard. User docs: appearance.md, whats-new.md (here);
          settings.md, whats-new.md (docgen).
        2026-10-18, fourth round — the user: "keep going until all issues are fixed dont stop
        adversiarl think on your decisions go". Done, with what the second look changed:
        - One action, one name: Continue with direction… everywhere (the AI page said "Guided
          continue", the AI tasks list "Continue (guided)", its no-direction error "Guided
          Continue …"). It reuses its sibling's keys — `continueDirected` as Rewrite with direction
          uses `rewriteDirected`, and Rewrite's `err.noDirection` — so three keys retired and none
          minted (docgen dropped their Spanish on Save); writing.md's "Guided Continue" too.
        - The tutorial's copy in the data folder refreshes: a boot replaces each sample the app
          ships whose bytes differ, and leaves anything else in the folder alone (D4 of
          2026-07-13 kept — the copy stays, it just stops going stale). The attack: nothing in the
          user docs puts files there. Your tutorial project already in the database keeps its
          stored dates, as notes do (the 2026-10-13 ruling).
        - Found on the way: the "Your graphics hardware changed" notice lost its title (it passed
          `title` and `message`; `pushToast` takes `description`), and a toast's long button
          squeezed its message into a 110px column in Spanish. The kit's toast row wraps now and
          keeps the message at least 180px (a shorter minimum would keep the squeeze, a longer one
          would push "Undo" under one-line messages); measured in Spanish and English at 1280
          and 390.
OPEN:   nothing of this item's rounds. Slice 4's bench leg (D4) is in "AI drafting".
GO:     given 2026-10-16 for the eval and the flow tests ("think on your rec again always adversially
        go"; "carry on, your rec go"); for the five fixes, the three labels and the translation
        ("your rec on all go"); 2026-10-17 for the stop route and the Spanish ("go your rec";
        "think on it adverserially your rec go"); 2026-10-17 for the Spanish review ("auto
        compatcte re read docs rules notes so you know where you are at your rec on all think on
        them again adversarially first go"); 2026-10-18 for the follow-ups 2–4 ("compacted re read
        docs rules session your rec on all go"); 2026-10-18 for the second round ("keep going until
        everything is done your rec but think on your decisions twice before doing, finish
        everything dont stop"); 2026-10-18 for the third round ("your rec on all go dont stop dont
        ask me again … take your on rec go on all"); 2026-10-18 for the fourth round ("keep going
        until all issues are fixed dont stop adversiarl think on your decisions go").

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

## The server moves to Hono [2026-10-09]
STATE:  DECIDED 2026-10-09, family-wide — the decision with the user's words is the kit's TASKS,
        "The family's servers move to Hono — one server that runs in Node and in a worker".
WHY:    the phone's in-app server ran Fastify through `inject` on ~400 lines of Node stand-ins;
        Hono runs in the worker as it is (`app.fetch`). The kit's item has the full reasons.
NOT:    the kit's item.
BUILT:  2026-10-09 — 14 routers, app.js, phone.js, sync.js, the error envelope, the test client
        on `app.request` (148/148); the phone versions by `server/package.json` `"imports"` (`#app_state`,
        `#api/autosave_api`, `#database/demo_seed`, `#editor/html`, `#sync_platform`); the phone bundle
        8.0 MB, checked in Chrome on `dist/spa-in-app` (the book, an image, an AI stream). The plan:
        `../just-core/docs/plans/2026-10-09-hono-standard.md` §9.
OPEN:   nothing. (2026-10-09: the phone on Hono ran on the Android 16 emulator — the tutorial book,
        kept across a force-stop, an AI answer through native HTTP.)
GO:     given 2026-10-09 (the kit's item).

## JustWrite on Quasar — the desktop app and Settings → Sync BUILT and merged; the phone next [2026-10-08]
STATE:  DECIDED 2026-10-08 — every family app moves to Quasar (the kit's TASKS, "Every family app
        moves to Quasar…", rec 1: "Quasar's own tooling for everything. Its Electron mode is the
        desktop app, calling the kit's shared function for the data folder, the server and the
        tray. Its Capacitor mode is the phone app."); the go: "we need to do the quasar conversion
        as well you have a go on that". The order of work and its status: the kit's
        `docs/plans/2026-10-08-sync-and-quasar-program.md`, step Q4; the layout: the kit's
        `docs/app-structure.md` §Q.
BUILT:  2026-10-08, on branch `quasar` (in a worktree, since merged and removed 2026-10-26 — the
        master checkout ran your app, so the move stayed off it until you merged): `quasar.config.js` (the one build
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
OPEN:   1. DONE — merged into master by the user's go ("your rec all go", on "1. Merge both quasar
           branches?"); after pulling: `npm install` and once `cd src-electron && npm install`.
        2. DONE — the Settings → Sync screen and its user docs (the Sync item below).
        3. The phone: the server in a web worker on SQLite WASM, the storage guard, OneDrive/
           Dropbox sign-in, the QR pairing (the Sync item below). Scope decided 2026-10-08 (the
           Sync item, decision 8): the book, its images and versions, sync, online AI providers.
           Slices 1–6 built (5 and 6 on 2026-10-09 — the item "The phone's screens (slice 5) and
           the iOS build (slice 6)"); the record: the kit's `docs/plans/2026-10-08-the-phone.md`.
        4. The release workflow is rewritten for Quasar but not run (it needs a tag).
GO:     given 2026-10-08 ("we need to do the quasar conversion as well you have a go on that").

## The family moves to Electron and a Node server — JustWrite's step is BUILT, waiting on your use [2026-10-08]
STATE:  DECIDED 2026-10-05, 2026-10-07 and 2026-10-08 — every ruling, as shown and approved, is in
        JustVoice's TASKS, "The family moves to Electron and a Node server; Tauri and Python go"
        (the decision lives with the plan, §6 is this repo's step). This item is a pointer only.
BUILT:  2026-10-08, under the user's go "do it all … finsih the conversion your rec on all go!":
        the server in JavaScript (`server/src/`, mounting the kit's `@delebash/core`), the
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
        (`../just-core/packages/ui/src/common/services/appearance.js`, live CSS variables).
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

## THE FAMILY PARITY BATCH — approved 2026-08-05, THE next build
- **The master plan (read WHOLE before coding any slice):**
  `../justwrite-app/docs/plans/2026-08-05-family-parity-batch.md` — all
  decisions verbatim (①-⑤, the no-escape-valve commitments, the governing
  mechanism-vs-data principle), the 12-slice checklist, the Speaker-Lab
  12-point acceptance inventory, the approved human copy for the 13 rows,
  the after-batch order (UiTable → e2e harness → THE deep exhaustive audit →
  product calls). This repo's slices are marked per-app inside it.

## Found by the 2026-08-05 family audit

- *(Non-issue, recorded: `family.lab.changeData` is fed but JW passes no
  dataLinks — JW has no promptless features, so the line never renders; the key
  is future-proofing.)*

## Now / near-term (JustWrite)

- **"Serve `/health` before `seed_workspace`" — recommend DROPPING; your ruling owed.**
  Measured 2026-07-25: it buys 36 ms of a ~975 ms pre-listen window dominated by framework
  imports that cannot be deferred. (Correction, docs campaign: there is no "re-measure
  snippet" — the record holds one measured breakdown, now in
  `docs/dev/measured-performance.md` §Boot.)
- **Fit-estimate label wording — your veto still open.** Shipped with the PC-class work;
  `docs/plans/archive/2026-07-22-igpu-research-and-cpu-band-recovery.md` §25 addendum 9.
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
  - Key-naming style + the `|` plural pipes in `en.json` — your veto still open.
  - ~200 duplicate call sites could point at existing `common.*`/`count.*` keys — optional
    reuse polish.
  - Trap to remember: `@` is vue-i18n's linked-message syntax — write `{'@'}` in messages;
    nothing in the toolchain catches it, so render-check any message containing `@ | {`.
- **Single-source text system + translation — THE NEXT BIG TASK** (now planned as "Every app and
  the kit on vue-i18n", above; the docs half stays here) (your roadmap ruling
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
  `just-core/docs/plans/archive/2026-07-08-big-batch-queue.md`]: the §7.1
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

*(Worked through 2026-10-24 on a scratch server over a copy of your data, real models on the 2070S:
the boot splash, the plate, the self-hosted fonts, the catalog's layout / needs line / Fit hover /
badges, Quick Setup, the download bars, the PC classes panel (This PC line, Use for this PC → Set
manually → Use auto-detect, Copy in the list and the editor), the hardware-changed toast, the engine
builds table, the pricing editor, Unload / Load / Set as default, Load & measure → the history,
2-minute optimize → Skip → "Optimize cancelled.", batch Fill from book in review and auto-apply mode
(only empty fields filled, read back from the database), Ask the book end to end (index, cited
answer, chat + embedding resident together), the MTP draft load (43 tok/s, acceptance 0.81) and the
thinking budget, `--restore` after a hard kill, the bench's `--autostart` on the Node server (it left
the server and vite on :17495 / :1420 after the run — fixed: no shell in between, the tree kill
waited for), and the data folder moved through the built app (a custom folder → Move back to the
default folder → restart → the book there → the old copy listed → Remove the old copy; only the OS
folder picker of Change folder was not driven). Closed as stale: the 31B row, the 2070S spawn
failure, the Python boot timing, the probes' findChrome (8 dead probes deleted, the rest need
JW_APP + JW_API). The kit findings are all fixed: the model's name on the splash and in Quick Setup
and the Fit hover's sentence (kit 43b19a9); one tune word in the Tune dialog and the catalog, the
pricing table's Save, the provider timeout (a field in the provider form, and a database still on the
old seeded 60 s gets 900 at the next start — checked on a copy of yours), and whole sizes (a no-break
space between number and unit) (kit 0b8e7ad); just-sqlite-sync's second Yjs (sync e32dde4).)*

- **AMD / Intel graphics detection** (Ledger §G6): needs a Windows machine with an AMD or Intel GPU
  (the Core Ultra 7 laptop) — the AI page's hardware strip names the adapter, its VRAM and class.
- **A thinking run on Anthropic** (Unit 2's cloud half): needs an Anthropic key, and none is set;
  the request shape is unit-tested only (`adapter_extra.test.js`).
- **The engine update replacing its build** (providers round 10, the 2026-09-19 safe-update flow):
  reachable only when a newer pinned build exists.
- **Marketing screenshots** (Ledger §G4): `npm run screenshots` after `npm run build`, with
  warm-start off — part of preparing a release.

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
  `docs/app-structure.md` §Q.8 (the data folder).
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
the SDK-pivot re-open trigger) → `../just-core/docs/dev/TASKS.md`; JV-owned
(F3 · I6) → `../JustVioce/docs/dev/TASKS.md`.)*

## Fit redesign (family, runner-owned) — JW impact

Tracked in `../just-core/docs/dev/TASKS.md` (THE resume surface — its fit
item now opens with a STATUS-NOW block; read that first); full plan
`../just-core/docs/plans/2026-08-09-fit-redesign.md` (consensus 2026-08-13,
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
