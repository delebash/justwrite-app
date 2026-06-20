# Cross-app convergence: JustVoice ↔ JustWrite (2026-06-20)

**Goal:** both Vue 3 + Tauri 2 apps follow ONE standard — the *"Vue 3 + Tauri 2
app standard"* in the global `~/.claude/CLAUDE.md`. This doc records the audit
that found the divergences and the ordered, verified migration that closes them.
Same file is committed in both repos.

## Why they diverged
Built in separate sessions with no shared standard. JustWrite grew up
client-heavy (IndexedDB → accreted vue-router + a client-side seed); JustVoice
grew up server-first (stayed thin but hand-rolled its own hash router). Nothing
about either app's *requirements* forced the differences below.

## Audit — structural divergences

| Concern | JustWrite | JustVoice | Verdict |
|---|---|---|---|
| Global CSS | `assets/styles/tokens.css` (1 file, 2019 ln) | `styles.css` at root (1 file, 1984 ln) | arbitrary — converge: `tokens.css`+`styles.css` at root, both apps |
| Routing | vue-router, 30 routes, 29 lazy, 23 params | hand-rolled `hashchange` + `<component :is>`, 17 eager imports | arbitrary — JV reinvented a weaker router; adopt vue-router |
| Server base | `serverApi.js` `SERVER_BASE`, env `VITE_JW_SERVER_URL`, not origin-aware | `config.js` `resolveServerUrl()` (origin-aware), env `VITE_SERVER_URL` | arbitrary — JV logic is correct; unify in `serverApi.js` |
| Fetch wrapper | none central (scattered in `*Api.js`) | `useApi` store: `request`/`safeRequest`/`requestBlob`/`postForm` | arbitrary — JV pattern correct, but belongs in a service not a store |
| Seed/demo | client-side `domain/seed.js` | server-side | JW vestige of IndexedDB past; server-side is the thin-client rule |
| UI primitives | `components/ui/` (`Jw*`) | `components/jv/` (`Jv*`) | arbitrary folder name — converge on `components/ui/` |
| Theming | `services/appearance.js` | inlined in `stores/ui.js` | arbitrary — extract to `services/appearance.js` |
| Lint | `biome.json` | none | gap — JV adds Biome |
| Vite alias | `@renderer` | `@` + `@renderer` | minor — standardize on `@renderer` |

## Justified differences (leave; do NOT "fix")
- Dev ports: JW 1420 · JV 1430 / HMR 1431 (can't share).
- Scope/size: JV's renderer, server, and `lib.rs` (5 native modules) are bigger —
  engines, audio, dictation. Feature scope, not drift.
- JW's monolithic `project` store (snapshot undo/redo across all entities).
- Deferred-because-invasive (track, don't churn): Tauri `identifier`
  (`com.justwrite.app` vs `dev.justvoice.app`) and server package name
  (`justwrite_server` vs `justvoice`) — changing either relocates the OS
  app-data dir / breaks imports; do in a deliberate rename PR.

## Migration queue (ordered safe → risky; verify + commit each)
1. **JV** — add `biome.json` (match JW); run Biome, fix lint. *[low]*
2. **JV** — rename `components/jv/` → `components/ui/`, update imports. *[low, mechanical]*
3. **Both CSS** — JW move `assets/styles/tokens.css` → renderer root; split into
   `tokens.css` (`:root` only) + `styles.css` in *both*; update `main.js` imports. *[med]*
4. **JV** — extract theming from `stores/ui.js` into `services/appearance.js`. *[med]*
5. **JW** — `serverApi.js` origin-aware + add `request`/`safeRequest`/`requestBlob`/
   `postForm`; rename env `VITE_JW_SERVER_URL` → `VITE_SERVER_URL`. *[med]*
6. **JV** — move the fetch wrapper from the `api` store into `services/serverApi.js`. *[med-high]*
7. **JW** — demo seed → server-side; drop the `domain/seed.js` client path. *[med-high]*
8. **JV** — adopt **vue-router** (`createWebHashHistory`, lazy routes, params);
   replace the hand-rolled `hashchange` + `<component :is>`; preserve the
   kind-driven nav filter, deep-link cold-load, and the `?view=dictate` branch. *[high]*
9. **JW** — doc cleanup: update `CLAUDE.md` State/IPC sections off IndexedDB to
   the server/SQLite reality. *[low]*

## Verification per item
`npm run build:vite` (the app touched), Biome (both once #1 lands), `cargo check`
if Rust changes, and a Playwright smoke (boot → connection gate → main views) for
the routing / CSS / serverApi items. Commit each item on its own.
