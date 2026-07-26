// The kit's `useCatalogMeta()` must actually RETURN every name its consumers take.
//
// WHY this exists (the bug it is named after, 2026-07-26): `estVramById` was defined and
// module-exported in useCatalogMeta.js but was NOT in the object `useCatalogMeta()`
// returns. QuickSetup.vue:77 destructures it, so it bound to `undefined`, and
// wizardLeftoverMb() (QuickSetup.vue:130) evaluated `estVramById.value[…]` → "Cannot read
// properties of undefined (reading 'value')". That throw came out of openWizard's
// reconcile at exactly the point the embedding default is chosen, so the visible symptom
// was an error banner plus a permanently EMPTY embedding dropdown in Quick Setup.
//
// Nothing else can catch this class of defect:
//   · destructuring an absent key is legal JS — `undefined`, not an error;
//   · Biome does not check cross-module object shapes, and there are no types here;
//   · `npm run build:vite` compiles the SFC without resolving the identifier;
//   · the headless smoke never opens the wizard, and even if it did, the throw is caught
//     and rendered as a banner — the page keeps working, so "zero JS errors" still passes.
// The only durable guard is to assert the contract directly, which is what this does.
//
// It reads the kit's SOURCE rather than importing each consumer: the consumers are SFCs
// whose full mount would drag in the transport, Pinia and Reka, none of which this
// contract depends on. The parse is deliberately dumb and its assumptions are asserted —
// if it ever finds zero consumers it fails rather than passing vacuously.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// A DEEP import on purpose: useCatalogMeta is a kit-internal composable shared between
// kit components and is deliberately not on the `@delebash/llm-ui` barrel. The contract
// under test is internal too — this file is here only because the kit has no test harness
// of its own, and JW's vitest already aliases the kit source.
import { useCatalogMeta } from "@delebash/llm-ui/composables/useCatalogMeta.js";

// <repo>/src/renderer/src/components/__tests__ → the sibling kit checkout.
const KIT_SRC = fileURLToPath(new URL("../../../../../../just-llm-runner/ui/src", import.meta.url));

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if ([".vue", ".js"].includes(extname(entry.name))) out.push(full);
  }
  return out;
}

/**
 * Every property name any consumer takes off `useCatalogMeta()`, in both forms:
 *   const { a, b, refresh: alias } = useCatalogMeta()   → a, b, refresh
 *   const meta = useCatalogMeta();  … meta.a            → a
 */
function consumedNames() {
  const names = new Map(); // name → the file that wants it (for a readable failure)
  for (const file of sourceFiles(KIT_SRC)) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("useCatalogMeta()")) continue;

    for (const m of src.matchAll(/const\s*\{([^}]*)\}\s*=\s*useCatalogMeta\(\)/g)) {
      for (const part of m[1].split(",")) {
        // "refresh: loadCatalogMeta" → the SOURCE key is what must exist.
        const key = part.split(":")[0].trim();
        if (key) names.set(key, file);
      }
    }
    for (const m of src.matchAll(/const\s+(\w+)\s*=\s*useCatalogMeta\(\)/g)) {
      for (const use of src.matchAll(new RegExp(`\\b${m[1]}\\.(\\w+)`, "g"))) {
        names.set(use[1], file);
      }
    }
  }
  return names;
}

describe("useCatalogMeta() return contract", () => {
  it("finds the consumers it is meant to police", () => {
    expect(existsSync(KIT_SRC)).toBe(true);
    // QuickSetup + LuModelCatalog destructure; LuBookSearchSetup uses member access.
    expect(consumedNames().size).toBeGreaterThanOrEqual(10);
  });

  it("returns every name its consumers destructure or read", () => {
    const returned = useCatalogMeta();
    const missing = [];
    for (const [name, file] of consumedNames()) {
      if (!(name in returned)) missing.push(`${name} (wanted by ${file.replace(/\\/g, "/").split("/ui/src/")[1]})`);
    }
    expect(missing).toEqual([]);
  });

  it("exposes estVramById as a usable ref — the 2026-07-26 regression", () => {
    // The specific one that shipped broken. `.value` must be readable without throwing,
    // which is precisely what QuickSetup's wizardLeftoverMb() does.
    const { estVramById } = useCatalogMeta();
    expect(estVramById).toBeDefined();
    expect(() => estVramById.value).not.toThrow();
    expect(estVramById.value).toBeTypeOf("object");
  });
});
