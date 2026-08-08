// chooserDirs — the shared "where does this native dialog open?" resolver, and the
// hardening for the "chooser opens at the OS home dir" bug: chooserDir must NEVER
// return undefined/empty (an undefined default_path makes the Rust dialog skip
// set_directory and open at home). serverDataDir caches GET /v1/health once.
//
// The module captures window + caches the data dir at import time, so each case
// resets the module registry and re-imports after configuring the mocks.
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted holder the mock factories read at call time (vitest requires hoisting
// for factory-referenced state).
const h = vi.hoisted(() => ({ health: null, chooserDirs: null }));

vi.mock("@delebash/llm-ui", () => ({
  get: vi.fn((path) => h.health(path)),
}));
vi.mock("./settings.js", () => ({
  readSetting: vi.fn((key) => (key === "chooserDirs" ? h.chooserDirs : undefined)),
  writeSetting: vi.fn(),
}));

beforeEach(() => {
  h.health = async () => ({ dataDir: "/data" });
  h.chooserDirs = null;
  vi.clearAllMocks(); // reset call counts (the mocked kit `get` persists across resets)
  vi.resetModules(); // fresh chooserDirs module -> fresh serverDataDir cache per test
});

describe("chooserDirs — default folder resolution (the 'opens at home' fix)", () => {
  it("returns the remembered folder for a key without hitting /v1/health", async () => {
    h.chooserDirs = { export: "/remembered/export" };
    const { chooserDir } = await import("./chooserDirs.js");
    const { get } = await import("@delebash/llm-ui");
    expect(await chooserDir("export")).toBe("/remembered/export");
    expect(get).not.toHaveBeenCalled();
  });

  it("falls back to the server data dir (GET /v1/health) when nothing is remembered", async () => {
    const { chooserDir } = await import("./chooserDirs.js");
    const { get } = await import("@delebash/llm-ui");
    expect(await chooserDir("import")).toBe("/data");
    expect(get).toHaveBeenCalledWith("/v1/health");
  });

  it("caches the health fetch across calls (one request per session)", async () => {
    const { serverDataDir } = await import("./chooserDirs.js");
    const { get } = await import("@delebash/llm-ui");
    expect(await serverDataDir()).toBe("/data");
    expect(await serverDataDir()).toBe("/data");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("NEVER returns undefined/empty — a guaranteed non-empty fallback when health fails", async () => {
    h.health = async () => {
      throw new Error("offline");
    };
    const { chooserDir } = await import("./chooserDirs.js");
    const dir = await chooserDir("backup");
    // The whole point: a real string, never undefined, so the dialog never opens at home.
    expect(typeof dir).toBe("string");
    expect(dir.length).toBeGreaterThan(0);
  });

  it("rememberDir persists the folder under the chooser key", async () => {
    const { rememberDir } = await import("./chooserDirs.js");
    const { writeSetting } = await import("./settings.js");
    rememberDir("autosave", "/picked/here");
    expect(writeSetting).toHaveBeenCalledWith("chooserDirs", { autosave: "/picked/here" });
  });
});
