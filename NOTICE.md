# Notices

Code in this app that was copied or ported from another project, with its licence (the family rule,
`just-core/docs/family-rules.md`). The kit's own notices are repeated here because the app bundles the kit.

## From the family kit (`@delebash/ui`, bundled into this app)

- **UiTable's filter and sort** (`just-core/packages/ui/src/common/components/tableRows.js`) — ported from
  TanStack Table's table-core 8. MIT License, Copyright (c) 2016 Tanner Linsley.
- **The toasts' kind icons** (`just-core/packages/ui/src/common/services/toastBridge.js`) — Heroicons paths
  (MIT License, Copyright (c) Tailwind Labs, Inc.) as vue-sonner 2.0.9 shipped them. MIT License,
  Copyright (c) 2022 Yunwei Xiao.
- **The fonts** (`just-core/packages/ui/src/common/fonts.css`) — font files from the Fontsource packages
  (Inter, Spline Sans, Geist, Hanken Grotesk, Albert Sans, Manrope, DM Sans, Atkinson Hyperlegible,
  Fraunces, Source Serif 4, Newsreader, Libre Caslon Text, Playfair Display, EB Garamond, Spectral, Spline
  Sans Mono), each under the SIL Open Font License 1.1; each package's `LICENSE` holds its copyright and
  the licence.

## Bundled with this app

- **The spellchecker's dictionaries** (`src/services/spelling/dictionaries.js`, 2026-10-19) — wooorm's
  Hunspell dictionaries, each bundled whole: `dictionary-en` 4.0.0, the en_US dictionary derived from
  SCOWL (wordlist.sourceforge.net), Copyright 2000-2018 by Kevin Atkinson and the others its `license`
  file names, under the SCOWL licence (MIT AND BSD); `dictionary-es` 4.0.0, the es_ES dictionary of
  LibreOffice/Apache OpenOffice by Santiago Bosio, offered under GPL 3, LGPL 3 or MPL 1.1 — used here
  under the Mozilla Public License 1.1. Each package's `license` file holds its notices and terms.
- **The spellchecker** (`nspell` 2.1.5) — MIT License, Copyright (c) 2016 Titus Wormer.

The MIT licence text, which each MIT notice above refers to:

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.
