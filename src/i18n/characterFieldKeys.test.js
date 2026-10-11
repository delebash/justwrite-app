// Every DYNAMIC i18n key the character sheet builds must exist in the catalog.
//
// WHY a bespoke test rather than the normal gates: the character sheet resolves
// its ~200 field labels with a computed key —
//   $t(`characters.fields.${f.group}.${f.k}.label`)
// — and nothing else in the toolchain can see through that template literal.
//   · `npm run i18n:report` (vue-i18n-extract) only matches keys written as plain
//     string literals, so it reports none of these as missing and all as unused
//     — and note it scans .js too: spelling a translate-call out longhand in this
//     comment made the report invent a missing key named "literal";
//   · `npm run i18n:lint` only finds raw text, and there is none left here;
//   · `npm run build:spa` compiles the SFC without resolving any key;
//   · the headless smoke asserts zero JS errors — and a missing key is NOT an
//     error: i18n/index.js sets missingWarn:false + fallbackWarn:false, so a
//     typo'd key renders an EMPTY STRING, silently, on a page that still passes.
// A one-character typo in a group or field name would therefore ship a blank
// label with every gate green. This test is what makes that impossible.
//
// The fields live in services/characterSheet.js since 2026-10-11 (one source
// with the AI drafting); the page renders every one of them from there — the
// descriptor arrays by v-for, the motivation grid / arc card / voice grid from
// the module's MOTIVATION_CORE / ARC_FIELDS / VOICE_CORE. So the module IS what
// ships, and this test reads it directly (it used to parse the page's source,
// when the arrays were consts inside the SFC with nothing to import).

import { describe, expect, it } from "vitest";
import { SHEET_SECTIONS } from "../services/characterSheet.js";
import en from "./locales/en.json";

/** Resolve a dotted key path against the catalog, or undefined. */
function lookup(path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), en);
}

/** Every field the sheet renders under `characters.fields` (the backstory's label is
 *  `characters.detail.backstory`, outside this tree). */
const fields = SHEET_SECTIONS.flatMap((s) => s.fields).filter((f) => f.group !== "_top");

describe("character sheet dynamic i18n keys", () => {
  it("finds the fields it is meant to police", () => {
    // Guards against the test quietly passing on zero fields after a refactor.
    expect(fields.length).toBeGreaterThanOrEqual(58);
  });

  it("has a label and a hint for every field the sheet renders", () => {
    const missing = [];
    for (const { group, k } of fields) {
      for (const leaf of ["label", "hint"]) {
        const path = `characters.fields.${group}.${k}.${leaf}`;
        const value = lookup(path);
        if (typeof value !== "string" || !value.trim()) missing.push(path);
      }
    }
    expect(missing).toEqual([]);
  });

  it("has no catalog field entry the sheet never renders", () => {
    // The other direction: a stale key left behind by a removed field. Dead copy
    // is not a crash, but it is a translator asked to translate nothing.
    const rendered = new Set(fields.map(({ group, k }) => `${group}.${k}`));
    const orphans = [];
    for (const [group, groupFields] of Object.entries(en.characters.fields)) {
      for (const k of Object.keys(groupFields)) {
        if (!rendered.has(`${group}.${k}`)) orphans.push(`characters.fields.${group}.${k}`);
      }
    }
    expect(orphans).toEqual([]);
  });
});
