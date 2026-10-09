// SPDX-License-Identifier: MIT
// https://github.com/michael-ciniawsky/postcss-load-config

import autoprefixer from 'autoprefixer'
// The family's Quasar theme, part 2: Quasar's global disabled rule removed from its stylesheet, so
// each control keeps its own disabled look (the kit's ui/src/quasar/postcss.js says why). Node
// loads this file, so the path is the sibling checkout's, as the kit UI alias is.
import { dropQuasarDisabledRule } from '../just-llm-runner/ui/src/quasar/postcss.js'
// import rtlcss from 'postcss-rtlcss'
// import { Mode } from 'postcss-rtlcss/options'

export default {
  plugins: [
    dropQuasarDisabledRule(),

    // https://github.com/postcss/autoprefixer
    autoprefixer({
      overrideBrowserslist: ['baseline widely available']
    }),

    // https://github.com/elchininet/postcss-rtlcss
    // If you want to support RTL css, then
    // 1. yarn/pnpm/bun/npm install postcss-rtlcss
    // 2. optionally set quasar.config.js > framework > lang to an RTL language
    // 3. uncomment the following line (and its import statement above):
    // rtlcss({ mode: Mode.Override })
  ]
}
