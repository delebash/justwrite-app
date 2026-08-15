// The no-shell half of bookTransfer. Its twin next door (bookTransfer.test.js)
// covers the desktop host; this file covers a host with NO desktop shell — a
// browser tab or the headless server path.
//
// Why a second FILE and not a second describe: bookTransfer reads its capability
// flags once at module load, so the two states need two module registries, and a
// per-file registry is the honest way to get that.
//
// What it locks (the 2026-08-08 ruling): export is NOT desktop-only. The .zip was
// the one export a browser could not reach, purely because the code went straight
// to the native save dialog; it now falls back to a plain download exactly as the
// PDF/DOCX/EPUB path and the shared kit's DataManagement backup already do.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The kit's save door decides native-vs-download (common/services/fileSave.js,
// 2026-08-15) — so THAT behaviour is the kit's to test. What this file locks is
// that the browser path still reaches the door with the right filename.
const kitSaveBlob = vi.fn(async () => ({ ok: true, downloaded: true }));
vi.mock("@delebash/llm-ui", () => ({
  requestBlob: vi.fn(async () => new Blob(["ZIPBYTES"], { type: "application/zip" })),
  post: vi.fn(async () => ({ id: "prj_new", title: "My Book" })),
  get: vi.fn(async () => ({ dataDir: "/data" })),
  saveBlob: (...a) => kitSaveBlob(...a),
  downloadBlob: vi.fn(),
}));
vi.mock("./settings.js", () => ({
  readSetting: vi.fn(() => null),
  writeSetting: vi.fn(),
}));
// No desktop shell — the browser path. `hasShell()` is the kit's one test
// (services/native.js re-exports it); mocking it here is what "a browser tab"
// means since the window.justwrite global died on 2026-08-14.
vi.mock("./native.js", () => ({
  hasShell: () => false,
  saveFile: vi.fn(),
  pickFile: vi.fn(),
  storageGetRoot: vi.fn(async () => null),
}));

import { requestBlob } from "@delebash/llm-ui";

let canSaveFiles;
let canPickBooks;
let exportProject;
const clicked = [];

beforeAll(async () => {
  global.window = {};
  global.URL.createObjectURL = vi.fn(() => "blob:fake");
  global.URL.revokeObjectURL = vi.fn();
  global.document = {
    createElement: () => {
      const a = {
        click: () => clicked.push({ href: a.href, download: a.download }),
        remove: () => {},
      };
      return a;
    },
    body: { appendChild: () => {} },
  };
  ({ canSaveFiles, canPickBooks, exportProject } = await import("./bookTransfer.js"));
});
beforeEach(() => {
  requestBlob.mockClear();
  kitSaveBlob.mockClear();
  clicked.length = 0;
});

describe("bookTransfer — no desktop shell", () => {
  it("reports neither save nor pick capability", () => {
    expect(canSaveFiles).toBe(false);
    expect(canPickBooks).toBe(false);
  });

  it("exportProject hands '<title>.zip' to the save door and reports the download", async () => {
    const res = await exportProject("prj1", "My Book");
    // Same server call as the desktop path — only the destination differs, and
    // that decision belongs to the kit door now.
    expect(requestBlob).toHaveBeenCalledWith("/v1/projects/prj1/export");
    expect(kitSaveBlob).toHaveBeenCalledTimes(1);
    expect(kitSaveBlob.mock.calls[0][1]).toBe("My Book.zip");
    expect(res).toEqual({ ok: true, downloaded: true });
  });

  it("keeps the display title verbatim, only dropping illegal filename chars", async () => {
    await exportProject("prj1", 'The Ninth: Facet?/"');
    expect(kitSaveBlob.mock.calls[0][1]).toBe("The Ninth Facet.zip");
  });
});
