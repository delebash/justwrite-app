# Notices

Code in this app that was copied or ported from another project, with its licence (the family rule,
`just-core/docs/family-rules.md`). The kit's own notices are repeated here because the app bundles the kit.

## From the family kit (`@delebash/ui`, bundled into this app)

- **UiTable's filter and sort** (`just-core/packages/ui/src/common/components/tableRows.js`) — ported from
  TanStack Table's table-core 8. MIT License, Copyright (c) 2016 Tanner Linsley.
- **The toasts' kind icons** (`just-core/packages/ui/src/common/services/toastBridge.js`) — Heroicons paths
  (MIT License, Copyright (c) Tailwind Labs, Inc.) as vue-sonner 2.0.9 shipped them. MIT License,
  Copyright (c) 2022 Yunwei Xiao.
- **The info banner's icon** (`just-core/packages/ui/src/common/iconPaths.js`, `Info`) — Lucide's "info"
  (lucide-static 1.60.0), derived from Feather. ISC License, Copyright (c) 2026 Lucide Icons and
  Contributors (its text below); MIT License, Copyright (c) 2013-present Cole Bemis.
- **The direction ranges** (`just-core/packages/ui/src/common/services/isolate.js`) — the strong left-to-right
  and right-to-left character ranges (`ltrChars_`, `rtlChars_`) of Google Closure Library's
  `closure/goog/i18n/bidi.js`. Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0), Copyright
  The Closure Library Authors.
- **The fonts** (`just-core/packages/ui/src/common/fonts.css`) — font files from the Fontsource packages
  (Inter, Spline Sans, Geist, Hanken Grotesk, Albert Sans, Manrope, DM Sans, Atkinson Hyperlegible,
  Fraunces, Source Serif 4, Newsreader, Libre Caslon Text, Playfair Display, EB Garamond, Spectral, Spline
  Sans Mono), each under the SIL Open Font License 1.1, whose text closes this file. Their copyright notices, as
  each Fontsource package's `LICENSE` gives them:
  - `@fontsource/inter` 5.3.0 — Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)
  - `@fontsource/spline-sans` 5.3.0 — Copyright 2021 The Spline Sans Project Authors (https://github.com/SorkinType/SplineSans)
  - `@fontsource/geist` 5.3.0 — Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font)
  - `@fontsource/hanken-grotesk` 5.3.0 — Copyright 2021 The Hanken Grotesk Project Authors (https://github.com/marcologous/hanken-grotesk)
  - `@fontsource/albert-sans` 5.3.0 — Copyright 2021 The Albert Sans Project Authors (https://github.com/usted/Albert-Sans)
  - `@fontsource/manrope` 5.3.0 — Copyright 2019 The Manrope Project Authors (https://github.com/sharanda/manrope)
  - `@fontsource/dm-sans` 5.3.0 — Copyright 2014 The DM Sans Project Authors (https://github.com/googlefonts/dm-fonts)
  - `@fontsource/atkinson-hyperlegible` 5.3.0 — Copyright 2020 Braille Institute of America, Inc.
  - `@fontsource/fraunces` 5.3.0 — Copyright 2020 The Fraunces Project Authors (github.com/undercasetype/Fraunces)
  - `@fontsource/source-serif-4` 5.3.1 — Google Inc.
  - `@fontsource/newsreader` 5.3.0 — Copyright 2020 The Newsreader Project Authors (http://github.com/productiontype/Newsreader)
  - `@fontsource/libre-caslon-text` 5.3.0 — Copyright 2012 The Libre Caslon Text Project Authors (https://github.com/impallari/Libre-Caslon-Text)
  - `@fontsource/playfair-display` 5.3.0 — Copyright 2017 The Playfair Display Project Authors (https://github.com/clauseggers/Playfair-Display), with Reserved Font Name "Playfair Display".
  - `@fontsource/eb-garamond` 5.3.0 — Copyright 2017 The EB Garamond Project Authors (https://github.com/octaviopardo/EBGaramond12)
  - `@fontsource/spectral` 5.3.0 — Copyright 2017 The Spectral Project Authors (https://github.com/productiontype/Spectral)
  - `@fontsource/spline-sans-mono` 5.3.0 — Copyright 2022 The Spline Sans Mono Project Authors (https://github.com/SorkinType/SplineSansMono)

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

The ISC licence text, which the Lucide notice above refers to:

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is
hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE
INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE
FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING
OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

The SIL Open Font License 1.1 text, which each font notice above refers to:

```text
-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```
