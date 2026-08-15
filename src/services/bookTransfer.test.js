// requestBlob path-first regression guard for the Phase-2 book export. The kit's
// requestBlob is PATH-FIRST (`requestBlob(path, {method="GET"})` — the shared
// serverApi transport since 2026-08-05, publicly exported via common/index.js);
// a stale `requestBlob("GET", path)` would
// fetch the path "GET". These cases lock the corrected single-arg export call and
// the import POST. `bookTransfer.js` reads its capability flags at module load,
// so the module is imported AFTER the native mock is in place (beforeAll +
// dynamic import). The mock target is `services/native.js` now — the
// `window.justwrite` global it used to stand in for died on 2026-08-14.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Delivery goes through the kit's ONE save door since 2026-08-15
// (common/services/fileSave.js) — native dialog where a saver is wired,
// Downloads otherwise. This file locks what JustWrite hands it.
const kitSaveBlob = vi.fn(async () => ({ ok: true, path: "/data/My Book.zip" }));
vi.mock("@delebash/llm-ui", () => ({
  requestBlob: vi.fn(async () => new Blob(["ZIPBYTES"], { type: "application/zip" })),
  post: vi.fn(async () => ({ id: "prj_new", title: "My Book" })),
  // bookTransfer now pulls chooserDir/rememberDir from chooserDirs.js, which reads
  // the default folder from GET /v1/health via the kit `get`.
  get: vi.fn(async () => ({ dataDir: "/data" })),
  saveBlob: (...a) => kitSaveBlob(...a),
  downloadBlob: vi.fn(),
}));
vi.mock("./settings.js", () => ({
  readSetting: vi.fn(() => null),
  writeSetting: vi.fn(),
}));

const pickFile = vi.fn(async () => ({ dir: "/data", dataBase64: "QkFTRTY0" }));
vi.mock("./native.js", () => ({
  hasShell: () => true,
  saveFile: vi.fn(),
  pickFile: (...a) => pickFile(...a),
  storageGetRoot: vi.fn(async () => ({ root: "/data" })),
}));

import { post, requestBlob } from "@delebash/llm-ui";

let exportProject;
let importProject;

beforeAll(async () => {
  ({ exportProject, importProject } = await import("./bookTransfer.js"));
});
afterAll(() => {
  vi.resetModules();
});
beforeEach(() => {
  requestBlob.mockClear();
  post.mockClear();
  kitSaveBlob.mockClear();
  pickFile.mockClear();
});

describe("bookTransfer — path-first requestBlob (kit client.js:65)", () => {
  it("exportProject calls requestBlob with the export PATH as the sole arg", async () => {
    await exportProject("prj1", "My Book");
    // path-first: the SOLE argument is the path — not the method "GET".
    expect(requestBlob).toHaveBeenCalledWith("/v1/projects/prj1/export");
    expect(requestBlob.mock.calls[0][0]).toBe("/v1/projects/prj1/export");
    expect(requestBlob.mock.calls[0][0]).not.toBe("GET");
    // the returned blob is handed to the save door as "<title>.zip".
    const [blob, name] = kitSaveBlob.mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe("My Book.zip");
  });

  it("importProject POSTs the picked zip bytes to /v1/projects/import", async () => {
    const meta = await importProject();
    expect(post).toHaveBeenCalledWith("/v1/projects/import", { zipBase64: "QkFTRTY0" });
    expect(meta).toEqual({ id: "prj_new", title: "My Book" });
  });
});
