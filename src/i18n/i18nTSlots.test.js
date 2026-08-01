// Every <i18n-t> block in the renderer: does its keypath resolve, and do its
// named slots exactly match the message's placeholders?
//
// WHY a bespoke test rather than the normal gates — the same reasoning as
// characterFieldKeys.test.js, for the other half of the i18n surface. An
// <i18n-t> has TWO silent failure modes and nothing else in the toolchain sees
// either one:
//   · a wrong or renamed KEYPATH renders an EMPTY element, because i18n/index.js
//     sets missingWarn:false + fallbackWarn:false — no console error, no failing
//     smoke, just a sentence that vanished;
//   · a slot named differently from the placeholder renders the placeholder
//     LITERALLY, so the page ships "{chapters}" in visible copy.
// `i18n:lint` only looks for raw text and finds none inside an <i18n-t>;
// `i18n:report` matches plain string literals, not keypath attributes;
// `build:vite` compiles the SFC without resolving any key. So an interpolated
// sentence could break on a key rename with every gate green — and these are
// the LONGEST strings in the app, the intros and hints nobody re-reads.
//
// It reads the SFCs as TEXT on purpose, for the same reason the sibling test
// does: what ships is the template source, and parsing it is what keeps the
// test honest.
//
// The third assertion — no tags inside catalog values — pins the invariant the
// 2026-07-26 i18n-t conversion established: markup belongs in the template's
// slots, never in en.json, so a translator never has to preserve HTML.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import en from "./locales/en.json";

const RENDERER = fileURLToPath(new URL("..", import.meta.url));

/** Resolve a dotted key path against the catalog, or undefined. */
function lookup(path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), en);
}

function vueFiles(dir = RENDERER, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) vueFiles(p, out);
    else if (entry.endsWith(".vue")) out.push(p);
  }
  return out;
}

// Comments are stripped BEFORE scanning, and that is not hypothetical:
// EntityIndex.vue's header comment contains the literal text "<i18n-t>" while
// the file has no real block. Left in, the regex would pair that mention with
// the next genuine closing tag and validate an imaginary block's attributes.
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** Every <i18n-t> block, with its keypath and its named slots. */
function blocks() {
  const found = [];
  for (const file of vueFiles()) {
    const src = stripComments(readFileSync(file, "utf8"));
    for (const m of src.matchAll(/<i18n-t\b([\s\S]*?)>([\s\S]*?)<\/i18n-t>/g)) {
      const [, attrs, body] = m;
      found.push({
        file: file.slice(RENDERER.length).replace(/\\/g, "/"),
        keypath: attrs.match(/keypath="([^"]+)"/)?.[1] ?? null,
        slots: [...body.matchAll(/<template\s+#([a-zA-Z0-9_]+)/g)].map((s) => s[1]).sort(),
      });
    }
  }
  return found;
}

const placeholders = (msg) => [...msg.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();

describe("<i18n-t> keypaths and slots", () => {
  const all = blocks();

  it("finds the i18n-t blocks at all (guards against the regex silently matching nothing)", () => {
    expect(all.length).toBeGreaterThan(10);
  });

  it("every keypath resolves to a string — a typo renders an EMPTY element", () => {
    const broken = all.filter((b) => typeof lookup(b.keypath) !== "string");
    expect(broken.map((b) => `${b.file}: ${b.keypath}`)).toEqual([]);
  });

  it("every placeholder has a slot — a missing one renders LITERAL braces", () => {
    const bad = [];
    for (const b of all) {
      const msg = lookup(b.keypath);
      if (typeof msg !== "string") continue;
      const missing = placeholders(msg).filter((p) => !b.slots.includes(p));
      if (missing.length) bad.push(`${b.file}: ${b.keypath} -> {${missing.join("}, {")}}`);
    }
    expect(bad).toEqual([]);
  });

  it("every slot is used by its message — an extra one is silently dropped", () => {
    const bad = [];
    for (const b of all) {
      const msg = lookup(b.keypath);
      if (typeof msg !== "string") continue;
      const extra = b.slots.filter((s) => !placeholders(msg).includes(s));
      if (extra.length) bad.push(`${b.file}: ${b.keypath} -> #${extra.join(", #")}`);
    }
    expect(bad).toEqual([]);
  });

  it("no catalog value behind an i18n-t contains a tag — markup lives in slots", () => {
    const tagged = all
      .map((b) => ({ ...b, msg: lookup(b.keypath) }))
      .filter((b) => typeof b.msg === "string" && /<[a-zA-Z]/.test(b.msg));
    expect(tagged.map((b) => `${b.file}: ${b.keypath}`)).toEqual([]);
  });
});
