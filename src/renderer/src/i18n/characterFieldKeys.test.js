// Every DYNAMIC i18n key CharactersView builds must exist in the catalog.
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
//   · `npm run build:vite` compiles the SFC without resolving any key;
//   · the headless smoke asserts zero JS errors — and a missing key is NOT an
//     error: i18n/index.js sets missingWarn:false + fallbackWarn:false, so a
//     typo'd key renders an EMPTY STRING, silently, on a page that still passes.
// A one-character typo in a group or field name would therefore ship a blank
// label with every gate green. This test is what makes that impossible.
//
// It reads the view as TEXT on purpose: the descriptor arrays are `const`s
// inside an SFC's <script setup>, so there is nothing importable, and parsing
// the literal source is what keeps the test honest about what actually ships.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import en from "./locales/en.json";

const VIEW = fileURLToPath(new URL("../views/CharactersView.vue", import.meta.url));
const src = readFileSync(VIEW, "utf8");

/** Resolve a dotted key path against the catalog, or undefined. */
function lookup(path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), en);
}

/** The eight v3 descriptor arrays: every `{ group: "x", k: "y", type: … }`. */
function descriptorFields() {
  return [...src.matchAll(/\{\s*group:\s*"([^"]+)",\s*k:\s*"([^"]+)"/g)].map((m) => ({
    group: m[1],
    k: m[2],
  }));
}

/** A bespoke group whose members are `{ k: "x", … }` with the group implied by
 *  the const's name (MOTIVATIONS → motivation, ARC_STEPS → arc). */
function bespokeFields(constName, group) {
  const block = src.match(new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\];`));
  if (!block) return null; // signals a renamed/removed const — asserted below
  return [...block[1].matchAll(/\{\s*k:\s*"([^"]+)"/g)].map((m) => ({ group, k: m[1] }));
}

describe("CharactersView dynamic i18n keys", () => {
  it("finds the descriptor arrays it is meant to police", () => {
    // Guards against the test quietly passing on zero fields if the view is
    // refactored into a different shape.
    expect(descriptorFields().length).toBeGreaterThanOrEqual(45);
    expect(bespokeFields("MOTIVATIONS", "motivation")).toHaveLength(4);
    expect(bespokeFields("ARC_STEPS", "arc")).toHaveLength(3);
  });

  it("has a label and a hint for every field the view renders", () => {
    const fields = [
      ...descriptorFields(),
      ...(bespokeFields("MOTIVATIONS", "motivation") || []),
      ...(bespokeFields("ARC_STEPS", "arc") || []),
      // The bespoke voice grid resolves these four by static key.
      ...["accent", "vocabulary", "tic", "sample"].map((k) => ({ group: "voice", k })),
    ];
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

  it("has no catalog field entry the view never renders", () => {
    // The other direction: a stale key left behind by a removed field. Dead copy
    // is not a crash, but it is a translator asked to translate nothing.
    const rendered = new Set(
      [
        ...descriptorFields(),
        ...(bespokeFields("MOTIVATIONS", "motivation") || []),
        ...(bespokeFields("ARC_STEPS", "arc") || []),
        ...["accent", "vocabulary", "tic", "sample"].map((k) => ({ group: "voice", k })),
      ].map(({ group, k }) => `${group}.${k}`),
    );
    const orphans = [];
    for (const [group, fields] of Object.entries(en.characters.fields)) {
      for (const k of Object.keys(fields)) {
        if (!rendered.has(`${group}.${k}`)) orphans.push(`characters.fields.${group}.${k}`);
      }
    }
    expect(orphans).toEqual([]);
  });
});
