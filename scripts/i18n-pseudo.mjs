// Pseudo-locale generator — reads the English catalog and writes `qps.json`
// beside it. Pseudo-localisation makes three classes of i18n bug visible
// without a single real translation: strings that never went through $t()
// (they stay plain ASCII), strings that will overflow their control once a
// real locale runs ~30% longer, and strings that were concatenated instead of
// interpolated (the ⟦…⟧ brackets show where one message actually starts and
// ends).
//
//   npm run i18n:pseudo
//
// NOT registered in the app in this batch: nothing imports qps.json and it is
// not listed in the available locales yet. The locale-switcher phase wires it
// up; until then this script only produces the file so the shape can be
// reviewed (generate → inspect → delete; committing qps.json would also make
// `npm run i18n:report`'s locale glob report against the pseudo file).
//
// The character transform is the maintained `pseudo-localization` package
// (accented strategy — the same one Firefox uses), not a hand-rolled map
// (Ruling 4 in docs/plans/2026-07-26-i18n-phase1-coverage-plan.md; the package
// alone was probed to mangle `{n}` → `{ƞ}`, so this wrapper splits protected
// segments out first). Interpolation segments ({name}, {count}) and anything
// between < and > are copied through UNTOUCHED — mangling either would break
// the app rather than reveal a bug. `i18n-pseudo.test.js` pins that contract.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pseudoLocalizeString } from "pseudo-localization";

// Split on the two protected shapes so only the prose between them is mangled.
const PROTECTED = /(\{[^}]*\}|<[^>]*>)/g;

export function pseudo(value) {
  const body = value
    .split(PROTECTED)
    .map((part, i) => (i % 2 === 1 ? part : pseudoLocalizeString(part)))
    .join("");
  // +30% of the ORIGINAL length, so a control that fits English but not
  // German fails here (the accented strategy's doubled vowels add more on
  // top — over-revealing overflow is the point of a QA locale).
  const pad = "~".repeat(Math.ceil(value.length * 0.3));
  return `⟦${body}${pad}⟧`;
}

export function walk(node) {
  if (typeof node === "string") return pseudo(node);
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = walk(v);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const LOCALES = path.join(HERE, "..", "src", "renderer", "src", "i18n", "locales");
  const SRC = path.join(LOCALES, "en.json");
  const OUT = path.join(LOCALES, "qps.json");
  const en = JSON.parse(fs.readFileSync(SRC, "utf8"));
  fs.writeFileSync(OUT, `${JSON.stringify(walk(en), null, 2)}\n`, "utf8");
  let leaves = 0;
  (function count(n) {
    if (typeof n === "string") {
      leaves++;
      return;
    }
    for (const v of Object.values(n)) count(v);
  })(en);
  console.log(`i18n:pseudo — wrote ${path.relative(process.cwd(), OUT)} (${leaves} strings)`);
}
