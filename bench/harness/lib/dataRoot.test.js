// The bench's data-root mirror (dataRoot.js) — the resolution an autostarted
// server gets MUST match what the app would resolve (src-tauri/src/lib.rs:274-308),
// or the bench lands on an empty platformdirs root and reports "engine is not
// installed" against a box that has one. Each case builds a throwaway repoRoot;
// env/platform are injected so no test depends on this machine's real dirs.

import { describe, expect, it } from "vitest";

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveAppDataRoot } from "./dataRoot.js";
import { engineMissingError } from "./llamaBench.js";

function makeRepo({ identifier = "com.justwrite.app", exePointer = "", cfgPointer = "" } = {}) {
  const repo = mkdtempSync(join(tmpdir(), "jw-dataroot-"));
  const exeDir = join(repo, "src-tauri", "target", "debug");
  mkdirSync(exeDir, { recursive: true });
  writeFileSync(join(repo, "src-tauri", "tauri.conf.json"), JSON.stringify({ identifier }));
  if (exePointer) writeFileSync(join(exeDir, "dataroot.txt"), exePointer);
  const appData = join(repo, "AppData");
  if (cfgPointer) {
    mkdirSync(join(appData, identifier), { recursive: true });
    writeFileSync(join(appData, identifier, "dataroot.txt"), cfgPointer);
  }
  return { repo, exeDir, appData };
}

describe("resolveAppDataRoot — the app's data-root resolution, mirrored", () => {
  it("an explicit JUSTWRITE_DATA_DIR env wins over everything (the cli.py envvar)", () => {
    const { repo, appData } = makeRepo({ exePointer: "R:\\pointed" });
    const root = resolveAppDataRoot(repo, { env: { JUSTWRITE_DATA_DIR: "X:\\forced", APPDATA: appData }, platform: "win32" });
    expect(root).toBe("X:\\forced");
  });

  it("the exe-dir dataroot.txt pointer wins (a user-relocated root)", () => {
    const { repo, appData } = makeRepo({ exePointer: "R:\\relocated\\data\n", cfgPointer: "R:\\wrong" });
    const root = resolveAppDataRoot(repo, { env: { APPDATA: appData }, platform: "win32" });
    expect(root).toBe("R:\\relocated\\data"); // trimmed, and it beat the config-dir candidate
  });

  it("falls to the OS-config-dir pointer when the exe dir has none", () => {
    const { repo, appData } = makeRepo({ cfgPointer: "R:\\from-config-dir" });
    const root = resolveAppDataRoot(repo, { env: { APPDATA: appData }, platform: "win32" });
    expect(root).toBe("R:\\from-config-dir");
  });

  it("no pointers anywhere → the dev default <exe dir>/data", () => {
    const { repo, exeDir, appData } = makeRepo();
    const root = resolveAppDataRoot(repo, { env: { APPDATA: appData }, platform: "win32" });
    expect(root).toBe(join(exeDir, "data"));
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
