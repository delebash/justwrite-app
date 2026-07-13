// requestBlob path-first regression guard for the Phase-2 book export. The kit's
// requestBlob is PATH-FIRST (`requestBlob(path, {method="GET"})`, client.js:65,
// publicly exported via index.js:14); a stale `requestBlob("GET", path)` would
// fetch the path "GET". These cases lock the corrected single-arg export call and
// the import POST. `bookTransfer.js` captures `window.justwrite` at module load,
// so the module is imported AFTER window is set (beforeAll + dynamic import).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@delebash/llm-ui", () => ({
  requestBlob: vi.fn(async () => new Blob(["ZIPBYTES"], { type: "application/zip" })),
  post: vi.fn(async () => ({ id: "prj_new", title: "My Book" })),
  // bookTransfer now pulls chooserDir/rememberDir from chooserDirs.js, which reads
  // the default folder from GET /v1/health via the kit `get`.
  get: vi.fn(async () => ({ dataDir: "/data" })),
}));
vi.mock("../settings.js", () => ({
  readSetting: vi.fn(() => null),
  writeSetting: vi.fn(),
}));

import { post, requestBlob } from "@delebash/llm-ui";

let exportProject;
let importProject;
let saveFile;
let pickFile;

beforeAll(async () => {
  saveFile = vi.fn(async () => ({ ok: true, path: "/data/My Book.zip" }));
  pickFile = vi.fn(async () => ({ dir: "/data", dataBase64: "QkFTRTY0" }));
  global.window = {
    justwrite: {
      shell: { saveFile, pickFile },
      storage: { getRoot: vi.fn(async () => ({ root: "/data" })) },
    },
  };
  ({ exportProject, importProject } = await import("../bookTransfer.js"));
});
afterAll(() => {
  delete global.window;
});
beforeEach(() => {
  requestBlob.mockClear();
  post.mockClear();
  saveFile.mockClear();
  pickFile.mockClear();
});

describe("bookTransfer — path-first requestBlob (kit client.js:65)", () => {
  it("exportProject calls requestBlob with the export PATH as the sole arg", async () => {
    await exportProject("prj1", "My Book");
    // path-first: the SOLE argument is the path — not the method "GET".
    expect(requestBlob).toHaveBeenCalledWith("/v1/projects/prj1/export");
    expect(requestBlob.mock.calls[0][0]).toBe("/v1/projects/prj1/export");
    expect(requestBlob.mock.calls[0][0]).not.toBe("GET");
    // the returned blob is handed to the native save dialog as "<title>.zip".
    const arg = saveFile.mock.calls[0][0];
    expect(arg.blob).toBeInstanceOf(Blob);
    expect(arg.suggestedName).toBe("My Book.zip");
  });

  it("importProject POSTs the picked zip bytes to /v1/projects/import", async () => {
    const meta = await importProject();
    expect(post).toHaveBeenCalledWith("/v1/projects/import", { zipBase64: "QkFTRTY0" });
    expect(meta).toEqual({ id: "prj_new", title: "My Book" });
  });
});
