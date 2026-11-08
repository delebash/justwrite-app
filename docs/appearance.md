---
lede: Theme, fonts, accents, layout
---
# Appearance

The **Settings → Appearance** section lets you change how JustWrite looks. Everything here is reversible, none of it touches your manuscript, and there are presets if you don't want to fiddle.

This page covers what each control does and when you'd want to change it.

---

## Theme presets

Under the language picker, the Appearance section opens with a row of curated theme tiles. Click a tile to apply a complete bundle of settings — mode, fonts, accents, button shape — in one go. The **Preview** card just below updates instantly.

New installs open in **Fine Press** — Fraunces display + Spline Sans UI, oxblood accent, neutral surfaces, full-width editor with paragraph indent. Other curated tiles: Studio (Geist + teal, white surfaces), Ivory Press (ivory surfaces, cream paper, italic headings), Calm Modern (Geist + teal, neutral surfaces, paragraph indent), Editorial (Newsreader + indigo, cool surfaces, mono headings).

You can save your own preset once you've tuned things to your liking. A **Save current…** tile appears whenever any individual knob is changed from a preset's baseline.

If at any point things look wrong, the **Reset to defaults** button beside the **Theme preset** title restores every Appearance setting (Fine Press) while keeping any saved custom presets.

---

## Mode

- **Match system** — follow your operating system's dark/light setting (recommended)
- **Light** — always light
- **Dark** — always dark

---

## Typography

> *"I've been writing for three hours and my eyes are burning. I don't know if it's the font or the screen or just the hour, but I need to change something before I call it."*

These are the controls that most affect daily writing comfort.

### Font pairings

Quick-select tiles that set the UI font and display font together (the editor body font follows the display font). Each is a curated combination.

### Individual fonts

If you don't want a pairing:

- **UI font** — buttons, menus, labels
- **Display font** — titles, headings, big numbers
- **Editor body font** — your manuscript prose

The Editor body font is the one you'll stare at for the most hours. Pick whatever you can read for a long session. Its list is all serif fonts (Fraunces, Source Serif 4, Newsreader, EB Garamond and more), which are easier on the eyes for long reading; for a crisper sans-serif, use the editor's own settings, below.

The editor's own **Writing settings** (its gear) can set a different font over this one. Among them is **Atkinson Hyperlegible**, which the Braille Institute designed for readers with low vision: its letters are drawn to be hard to mistake for one another.

### UI scale

The **Size** row — five steps from **Compact** (90%) to **Large** (110%) — scales every label, control, and prose together. Useful for:

- High-DPI displays where defaults look small
- Sharing your screen and wanting bigger text
- Eye strain after a long session

### Section heading style and size

The small uppercase labels grouping the sidebar nav ("Manuscript", "Story world"). Style and size are independent.

### Menu item style and size

Each sidebar entry row. Adjust if the nav feels cramped or too sparse.

---

## Accents

JustWrite has two accent colours. Both are user-tunable.

### Accent (primary)

The main app accent. Drives:

- Selection highlights
- The active sidebar item
- Primary buttons and links

Choose from preset swatches or set a precise hue with the numeric input (0–360).

### Accent 2

A second accent for visual contrast. Drives:

- Progress rings
- Rules and peak markers in charts
- The "accent2" button intent (used for things like the Resume CTA)

A common pattern: pick a calm cool colour for Accent and a warm or bright colour for Accent 2. The two are visible side-by-side on Home (the **Resume writing** button is Accent 2; the goal ring's progress and the active nav item are Accent).

---

## Functional colours

Three colours that carry meaning in the UI:

- **Success** — green by default, used for confirmation, "Done" statuses, success toasts
- **Danger** — red by default, used for destructive actions, the Danger zone, error toasts
- **Info** — blue by default, used for informational chips and tags

Each has preset hues and a numeric picker. Re-tinting re-skins all matching buttons, tags, and status chips.

You can break the convention — make Danger orange, make Success teal — but the colours carry meaning, so unconventional choices may catch you out. The defaults are common enough that they read naturally.

---

## Backgrounds

> *"I write late at night and the white page is basically a flashlight pointed at my face. I want something warmer that I can actually sit with for two hours."*

These set the canvas the rest of the app sits on.

- **App** — the background tint behind everything
- **Sidebar** — the background tint behind the navigation
- **Editor paper** — the colour of the manuscript page itself (try a slight off-white or cream for long reading)
- **Text** — the text-colour family (the ink palette)
- **Apply editor paper to inline fields** — a checkbox that makes character / note / worldbuilding rich-text fields pick up the paper tint, so the whole app feels unified rather than two different surfaces

Each tint has curated swatches plus a free colour picker.

The Editor paper tint is the one worth spending a minute on. A pure-white background is glaring; a slight warm cream is easier on the eyes over a long session. If you write at night, a darker paper tint plus dark mode reduces strain. Find a combination you can actually live in.

---

## Editor layout

> *"The edge-to-edge text stretches all the way across my monitor and I keep losing my place at the end of each line. I just want it to look like a page."*

Two options:

- **Full width** — the editor takes the full width of the window edge-to-edge
- **Page** — the editor is centred with margins, with the book title as a running head and the chapter number at the foot of the page

**Page** mimics a printed page and is what most writers prefer. **Full width** is useful on small windows or for users who want every pixel for prose.

---

## Editor writing defaults

> *"The lines feel crammed together and I can't tell where one paragraph ends and the next begins. I'm rereading the same sentence twice."*

These are global defaults for the editor. The editor's **Writing settings** gear can override them — one choice for every chapter, which takes precedence over these (pick **theme** there to fall back to them).

- **Font size** — Small (15px) / Medium (18px) / Big (21px)
- **Line spacing** — 1.3 / 1.4 / 1.5 / 1.6 / 1.7 / 1.8 / 2
- **Paragraph spacing** — 0 / 0.3em / 0.5em / 0.8em / 1em
- **First-line indent** — Indent / No indent

These are the second-biggest comfort lever after font choice. Line spacing of 1.6–1.8 (the default is 1.7) is easier to read than a tight 1.3; a paragraph spacing of 0.3em makes prose breathe. First-line indent is a taste call — indented paragraphs feel like a book, no-indent feels like the web.

---

## Buttons

Three knobs that change the feel of every button in the app:

### Corner radius

- **Sharp** (2px) — strict, technical look
- **Standard** (6px) — default
- **Rounded** (10px) — softer
- **Pill** (999px) — fully rounded ends

### Density

- **Compact** — smaller padding, tighter clicks
- **Comfy** — more padding, more breathing room

### Label casing

- **Sentence** — labels as written (sentence case)
- **UPPERCASE** — automatic uppercase with adjusted letter-spacing

These are cosmetic — they don't affect what buttons do, only how they look. Adjust to taste.

---

## A practical setup

If you don't want to fiddle, the defaults are fine. If you do want to tune, a sensible order:

1. **Mode** first — match system unless you have a reason.
2. **Font pairing** — pick one tile.
3. **Editor paper tint** — try a cream or pale beige.
4. **Editor body font** — choose what you can read for hours.
5. **Editor writing** — line spacing is 1.7 by default; try 1.8 or 2 if it still feels tight.
6. **Accent** — pick a colour you like seeing.
7. **Save preset** so you don't have to redo it.

---

## See also

- **[Writing](writing.md)** — per-document editor settings overrides in the editor's gear icon
- **[Getting started](getting-started.md)** — the quick tour

---

## UI language

The language picker lives here in **Settings → Appearance** (it travels with the
look-and-feel settings). Switching it changes the interface language and
date/number formatting — never your manuscript prose. The names JustWrite
ships — the statuses, the worldbuilding categories, and on the AI page the
features, presets and providers — follow it too until you rename one; a name you
have changed stays as you wrote it in every language. English and Spanish ship
today; more arrive with app updates. (For contributors: a language is one JSON
file in `src/i18n/locales/` — no registry to edit — and the picker names each
language in itself.)
