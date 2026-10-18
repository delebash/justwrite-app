// SPDX-License-Identifier: MIT
// The bundled samples in `<dataDir>/samples/` (app.js materializeSamples): copied on the first
// boot, and on a later boot each entry the app ships is replaced when its bytes differ from the
// copy — so a fixed sample reaches an install that booted before (2026-10-18) — while anything
// else in the folder is left alone.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

let bundled;
const before = process.env.JUSTWRITE_SAMPLES_SRC;
const put = (file, text) => {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text);
};
beforeEach(() => {
  bundled = tmpPath();
  put(join(bundled, "tutorial", "book.json"), '{"project":{"startedOn":"2026-05-02"}}');
  put(join(bundled, "other.zip"), "zip bytes");
  process.env.JUSTWRITE_SAMPLES_SRC = bundled;
});
afterEach(() => {
  if (before === undefined) delete process.env.JUSTWRITE_SAMPLES_SRC;
  else process.env.JUSTWRITE_SAMPLES_SRC = before;
});

test("the first boot copies the bundled samples", async () => {
  const data = tmpPath();
  await client(data);
  expect(readFileSync(join(data, "samples", "tutorial", "book.json"), "utf8")).toContain("2026-05-02");
  expect(readFileSync(join(data, "samples", "other.zip"), "utf8")).toBe("zip bytes");
});

test("a later boot replaces a stale sample and leaves the rest of the folder alone", async () => {
  const data = tmpPath();
  put(join(data, "samples", "tutorial", "book.json"), '{"project":{"startedOn":"May 2, 2026"}}');
  put(join(data, "samples", "tutorial", "stale-extra.txt"), "from an older sample");
  put(join(data, "samples", "other.zip"), "zip bytes");
  put(join(data, "samples", "mine", "book.json"), '{"mine":true}');
  await client(data);
  expect(readFileSync(join(data, "samples", "tutorial", "book.json"), "utf8")).toContain("2026-05-02");
  expect(existsSync(join(data, "samples", "tutorial", "stale-extra.txt")), "the entry is the bundled one, whole").toBe(false);
  expect(readFileSync(join(data, "samples", "other.zip"), "utf8")).toBe("zip bytes");
  expect(readFileSync(join(data, "samples", "mine", "book.json"), "utf8"), "a folder the app doesn't ship").toBe('{"mine":true}');
  expect(readdirSync(data).filter((n) => n.startsWith(".samples-tmp-")), "no temp folder left behind").toEqual([]);
});
