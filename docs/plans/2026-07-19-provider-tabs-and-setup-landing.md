# Provider tabs + first-run setup landing (2026-07-19) — build record

## What changed

Three things on the AI providers surface, all in the shared kit (`just-llm-runner/ui`)
plus the two JustWrite files that drive it.

**1. Local vs Online became TABS.** The provider list used to render two stacked groups —
a "Local · free" eyebrow row over the local providers, then a "Cloud · metered" eyebrow
row over the cloud ones, each with its own near-duplicate row template and its own empty
state. It is now one segmented control (the shared `UiSegmented`, `variant="connected"`)
over ONE row template that renders whichever scope you're standing on. The two row
templates differed in exactly one thing — the icon glyph — so the single template selects
the chip SVG on local and the sparkle SVG on online, and everything else (name, caps, URL,
meta, status dot, the Test / Edit / Set-as-default actions cell) is now one copy instead
of two that could drift apart.

**2. The promoted built-in llama.cpp section is part of the Local tab.** It renders only
while the local scope is active, so the Online tab is purely the metered half. It did not
move and was not restructured — only its `v-if` gained the scope term.

**3. Two first-run landings.** The one-time AI setup dialog's "Connect an online provider"
now deep-links `/ai?providers=online`, which lands the provider list on the Online tab
instead of dropping the user on Local with nothing to do. And a Quick Setup wizard that
the deep link AUTO-OPENED now closes to the Home page; a wizard the user opened by
clicking the Run Quick Setup button closes in place and leaves them exactly where they
were.

## Why — the user's rulings

These are decisions, not inferences. Recorded verbatim:

- **Tabs instead of stacked groups.** Local and Online are a choice between two lists,
  not two sections of one list; a tab says that and halves the markup.
- **The built-in card lives on the Local tab.** It is the local engine, so it belongs to
  the local half and must not sit above an online-only list.
- **Add-provider defaults to the tab you're on.** Standing on Online and clicking "Add
  provider" should not hand you a form pre-set to Local.
- **The header and its count stay above the tabs, and the count stays TOTAL.** "Providers
  · N configured" describes the whole configuration, not the visible tab — it is
  deliberately NOT per-scope.
- **A deep-linked Quick Setup closes to Home; a button-opened one stays put.** Finishing
  first-run setup should return the user to their book, but a wizard run from the AI page
  should return them to the AI page.

The query parameter is `providers`, not `tab`: `tab` on this page already means the page
subnav (Providers & models / Routing by feature / …), and reusing it would name two
different things.

## file:line

Kit — `E:\Dev\Web\just-llm-runner\ui\src`:

- `views/AiModelsArea.vue:16` — `UiSegmented` import.
- `views/AiModelsArea.vue:50-55` — the `initialProviderScope` prop (the deep-link seam,
  documented beside `autoOpenQuickSetup`) and `defineEmits(["quick-setup-closed"])`.
- `views/AiModelsArea.vue:61-63` — `providerScope` ref, seeded from the prop. Named
  `providerScope`, never `tab`, so it cannot collide with the page subnav ref above it.
- `views/AiModelsArea.vue:81-82` — `shownProviders`, the one computed the single row
  template iterates.
- `views/AiModelsArea.vue:240-244` — `onQuickSetupClosed()`, which re-emits upward ONLY
  when `autoOpenQuickSetup` is set. This is the whole "deep-linked vs button-opened"
  distinction, in one condition.
- `views/AiModelsArea.vue:410-416` — the built-in section is now `v-if="builtinProvider"` (`:416`)
  plus `v-show="providerScope === 'local'"`. The scope term is v-SHOW on purpose: the
  QuickSetup mount inside carries `qsRef`, and TWO openers outside the block reach it —
  the hardware-change toast's "Run Quick Setup" action (`:344`) and the `?quicksetup=1`
  auto-open (`:358`). A `v-if` on the scope would unmount the wizard on the Online tab and
  turn both into silent optional-chain no-ops. Caught by the rules-checker on this diff;
  `providerScope.test.js` now pins it.
- `views/AiModelsArea.vue:418` — the QuickSetup mount gains `@closed="onQuickSetupClosed"`.
- `views/AiModelsArea.vue:447` — the new-provider `ProviderForm` gains
  `:initial-local="providerScope === 'local'"`.
- `views/AiModelsArea.vue:449-456` — the segmented control, where the first eyebrow row was.
- `views/AiModelsArea.vue:457-493` — the ONE row template and its two-way icon (`:463-464`).
- `views/AiModelsArea.vue:494-497` — the ONE empty state, its copy switched by scope.
- `views/AiModelsArea.vue:644-647` — `.lu-scope`; the four dead `.lu-eyebrow*` rules were
  removed after grepping the file to confirm no remaining markup used them.
- `views/QuickSetup.vue:40` — `defineEmits(["changed", "closed"])`.
- `views/QuickSetup.vue:279-282` — a watcher on `open` emits `closed`. It watches the ref
  rather than hooking each handler because BOTH close paths (`onModalClose` and the
  sweep-guarded `attemptClose`) funnel through `open.value = false`; one watcher cannot
  miss a path a future third close path would also take.
- `views/ProviderForm.vue:29-33` — the `initialLocal` prop.
- `views/ProviderForm.vue:72` — `const local = ref(props.provider ? !!props.provider.local
  : props.initialLocal);`. Only the NEW-provider branch changed; editing an existing
  provider still reads its stored value, and the `ONLINE_ONLY_TYPES` lock below it is
  untouched, so a metered type is still forced Online regardless of the tab.

JustWrite — `E:\Dev\Web\justwrite-app`:

- `src/renderer/src/views/AiView.vue:8,17` — `useRouter` alongside `useRoute`.
- `src/renderer/src/views/AiView.vue:45-51` — the two new bindings on `AiModelsArea` plus
  the comment explaining both.
- `src/renderer/src/components/AiSetupDialog.vue:12-13` — header comment now states the
  Online-tab landing.
- `src/renderer/src/components/AiSetupDialog.vue:32` — `router.push("/ai?providers=online")`.
- `src/renderer/src/components/__tests__/providerScope.test.js` — the new mount test.
- `vitest.config.js:31` — `@vueuse/core` added to `dedupe`. The file's own comment says to
  keep this list in lock-step with `vite.config.js`, and it had drifted: without it, any
  test mounting a kit component that reaches `AppModal` fails to resolve `@vueuse/core`
  from the kit's own directory, which has no `node_modules`.

## How to verify

Automated, from `E:\Dev\Web\justwrite-app`:

- `npx vitest run src/renderer/src/components/__tests__/providerScope.test.js` — 5 tests.
  They mount the real SFCs with a stubbed `fetch` serving three providers (built-in, a
  local Ollama row, a cloud Claude row) and assert: `initialProviderScope="online"` starts
  on Online and shows only the cloud row; a default mount starts on Local and shows only
  the local row; the built-in card renders on Local and disappears after CLICKING through
  to Online (which proves the switch, not merely the initial prop); and `ProviderForm`
  with `:initial-local="false"` / `"true"` lands on the matching choice of the WHERE
  control. A mount is the only gate that executes this logic — `build:vite` compiles SFCs
  without resolving script identifiers and biome does not check `.vue` identifiers.
- `npm run test:unit` and `npm run build:vite` for the surrounding suites. NOT run:
  `scripts/headless-smoke.mjs` — see the honest note at the end.

By hand: open `/ai` → the provider list shows a Local/Online tab strip under the
"Providers · N configured" header; the built-in card is above it and disappears on Online;
"Add provider" from Online opens a form already set to Online. Then open the first-run AI
setup dialog and click "Connect an online provider" — you land on `/ai?providers=online`
with Online active. Finally, hit `/ai?quicksetup=1`, close the wizard, and you land on
Home; open the wizard from its own button and closing leaves you on `/ai`.

## What would reverse it

Nothing here is a migration and nothing is persisted, so a plain revert of the two commits
(kit first, then JustWrite) restores the previous surface exactly: the two stacked eyebrow
groups with their two row templates, `/ai` as the online-provider landing, and a Quick
Setup that always closes in place. The `vitest.config.js` dedupe entry is the one line
worth keeping on a revert — it fixes a pre-existing drift from `vite.config.js` and is
independent of this feature.

## Honest notes

- `docs/models.md` was checked and does NOT describe the provider list's local/cloud
  grouping anywhere (it mentions the provider list once, at `:60`, without describing its
  layout), so it was left unchanged rather than edited speculatively.
- The first cut of this change put the scope term in the built-in card's `v-if`, which
  unmounted QuickSetup on the Online tab and would have made the hardware-change toast's
  "Run Quick Setup" action (`AiModelsArea.vue:344`) a silent no-op for anyone standing on
  Online. The rules-checker caught it; the fix is the `v-show` above, and the sixth test in
  `providerScope.test.js` now pins the wizard staying mounted so a future `v-if` fails
  loudly instead of silently.
- **The renderer gate did NOT run.** `scripts/headless-smoke.mjs` is the renderer gate per
  the project CLAUDE.md, and `build:vite` is only a compile check — but running the smoke
  needs a dev server on :1420 and a server on :17495, and this change was executed under
  an explicit instruction not to start either (the user has live servers on those ports on
  this box). So this GUI change ships verified by mounts + compile + lint, and NOT by the
  smoke or by a screenshot. Two things are therefore unlooked-at and worth one pass by
  eye: the tab strip's `max-width: 520px` is a guessed cap on a brand-new control, and the
  hidden-not-unmounted built-in card should be confirmed to leave no layout gap on the
  Online tab.
