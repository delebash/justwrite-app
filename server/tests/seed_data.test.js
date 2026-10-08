// SPDX-License-Identifier: MIT
// The JavaScript seed DATA equals the Python's, value for value and in the same order — no
// Python test file (an addition of the port). The seed modules were generated from the
// Python source (scripts/port-seed-modules.py); the fixture is the Python's values, dumped by
// scripts/dump-seed-data.py. Compared as JSON text, so key order counts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { FEATURE_CATALOG } from "../src/feature_catalog.js";
import { DEFAULT_FEATURE_PROMPTS, FEATURE_PROMPT_HEALS } from "../src/seed_feature_prompts.js";
import * as SP from "../src/seed_presets.js";

const PY = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "python-seed-data.json"), "utf8"));
const JS = { FEATURE_CATALOG, DEFAULT_FEATURE_PROMPTS, FEATURE_PROMPT_HEALS, ...SP };

test.each(Object.keys(PY))("%s equals the Python seed", (name) => {
  expect(JSON.stringify(JS[name])).toBe(JSON.stringify(PY[name]));
});
