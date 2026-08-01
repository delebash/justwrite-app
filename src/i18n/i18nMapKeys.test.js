// Message keys held in JS label maps: do they all resolve against the catalog?
//
// WHY a bespoke test — this is the third silent i18n failure mode, and it is the one that
// shipped. The 2026-07-30 sweep flipped `no-raw-text` to error and reported zero raw strings,
// but that rule only inspects TEMPLATE text. English sitting in a `<script>` object literal —
//
//     const SEVERITY_META = { flag: { label: "Flag", icon: "Alert" } };
//
// — is invisible to it, so 60+ user-visible strings across nine files never entered i18n at
// all and the Spanish build rendered them in English behind a green gate. TrashView alone
// showed "Narrative strands" untranslated while all 38 locale keys for that feature had been
// carefully renamed.
//
// The fix moved those maps to hold message KEYS, resolved at render time with $t(variable).
// That closes the original hole and opens a smaller one: a dynamic $t() cannot be checked by
// scanning for $t("literal"), and vue-i18n is configured with missingWarn:false, so a typo'd
// key renders the raw key string in the UI with no console error and no failing test. This
// test is what makes the new shape safe — it reads the maps as text and resolves every key.
//
// Reading the sources as TEXT is deliberate, matching i18nTSlots.test.js: what ships is the
// source, and parsing it is what keeps the test honest.

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

function sourceFiles(dir = RENDERER, out = []) {
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		if (statSync(p).isDirectory()) {
			if (entry !== "locales") sourceFiles(p, out);
		} else if (entry.endsWith(".vue") || entry.endsWith(".js")) out.push(p);
	}
	return out;
}

// `i18n: "some.key"` inside a meta map, and bare `kind: "some.key"` lines inside a *_I18N map.
const AS_I18N_FIELD = /\bi18n:\s*"([A-Za-z0-9_][A-Za-z0-9_.]*)"/g;
const AS_I18N_MAP_ENTRY = /^\s*"?[\w-]+"?:\s*"([a-z][A-Za-z0-9_]*\.[A-Za-z0-9_.]+)",?\s*$/gm;

// Only strings under a block we actually own — this must not judge, say, an icon name or a
// route path that happens to contain a dot.
const OWNED = /^(trash|search|events|plotHoles|critique|characterAudit|foreshadowing|stuck)\./;

function mapKeys() {
	const found = [];
	for (const file of sourceFiles()) {
		if (file.endsWith(".test.js")) continue;
		const src = readFileSync(file, "utf8");
		for (const re of [AS_I18N_FIELD, AS_I18N_MAP_ENTRY]) {
			for (const m of src.matchAll(re)) {
				if (OWNED.test(m[1])) found.push({ key: m[1], file });
			}
		}
	}
	return found;
}

describe("message keys held in JS label maps", () => {
	it("finds the maps at all — a zero here means the patterns stopped matching", () => {
		// Without this, a regex that silently matches nothing would make every other
		// assertion below vacuously pass. That is the failure mode this whole file exists
		// to prevent, so it must not be possible here either.
		expect(mapKeys().length).toBeGreaterThan(40);
	});

	it("every key resolves to a string in en.json", () => {
		const missing = mapKeys()
			.filter(({ key }) => typeof lookup(key) !== "string")
			.map(({ key, file }) => `${key} (${file.replace(RENDERER, "")})`);
		expect(missing).toEqual([]);
	});

	it("BITES: an unresolvable key is reported", () => {
		// The gate is only worth its runtime if it has been seen to fail. A key that is not
		// in the catalog renders as its own literal text in the UI — silently, because
		// i18n/index.js sets missingWarn:false.
		expect(lookup("trash.kinds.chapters")).toBe("Chapters");
		expect(lookup("trash.kinds.chaptrs")).toBeUndefined();
	});
});
