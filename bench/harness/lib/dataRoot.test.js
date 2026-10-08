// The bench's data root (dataRoot.js) — the resolution an autostarted server gets MUST be
// the app's, or the bench lands on an empty root and reports "engine is not installed"
// against a box that has one. Since the Electron move it is the kit's one ladder; these
// pin the two answers the bench depends on. Each case builds a throwaway repoRoot; env is
// injected so no test depends on this machine's real dirs.

import { describe, expect, it } from "vitest";

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveAppDataRoot } from "./dataRoot.js";
import { engineMissingError } from "./llamaBench.js";

describe("resolveAppDataRoot — the app's data-root resolution", () => {
  it("an explicit JUSTWRITE_DATA_DIR env wins over everything", () => {
    const repo = mkdtempSync(join(tmpdir(), "jw-dataroot-"));
    writeFileSync(join(repo, "dataroot.txt"), "R:\\pointed");
    expect(resolveAppDataRoot(repo, { env: { JUSTWRITE_DATA_DIR: "X:\\forced" } })).toBe("X:\\forced");
  });

  it("no env, no pointer → <repo>/data, as the app in a checkout", () => {
    const repo = mkdtempSync(join(tmpdir(), "jw-dataroot-"));
    expect(resolveAppDataRoot(repo, { env: {} })).toBe(join(repo, "data"));
  });
});

describe("engineMissingError — the hard-gate message says what to actually do", () => {
  it("names the server, the in-app install fix, and the env override", () => {
    const msg = engineMissingError({ server: "http://127.0.0.1:17495" });
    expect(msg).toContain("http://127.0.0.1:17495");
    expect(msg).toContain("npm run dev");
    expect(msg).toContain("JUSTWRITE_DATA_DIR");
    expect(msg).not.toContain("data root:"); // no autostarted root to name
  });

  it("names the autostarted data root when the bench started the server", () => {
    const msg = engineMissingError({ server: "http://127.0.0.1:17495", dataRoot: "R:\\some\\data" });
    expect(msg).toContain("data root: R:\\some\\data");
  });
});
