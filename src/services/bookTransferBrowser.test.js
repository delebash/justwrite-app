// The no-shell half of bookTransfer. Its twin next door (bookTransfer.test.js)
// covers the desktop host; this file covers a host with NO `window.justwrite.shell`
// — a browser tab or the headless server path.
//
// Why a second FILE and not a second describe: bookTransfer captures
// `window.justwrite` once at module load, so the two capability states need two
// module registries, and a per-file registry is the honest way to get that.
//
// What it locks (the 2026-08-08 ruling): export is NOT desktop-only. The .zip was
// the one export a browser could not reach, purely because the code went straight
// to the native save dialog; it now falls back to a plain download exactly as the
// PDF/DOCX/EPUB path and the shared kit's DataManagement backup already do.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@delebash/llm-ui", () => ({
  requestBlob: vi.fn(async () => new Blob(["ZIPBYTES"], { type: "application/zip" })),
  post: vi.fn(async () => ({ id: "prj_new", title: "My Book" })),
  get: vi.fn(async () => ({ dataDir: "/data" })),
}));
vi.mock("./settings.js", () => ({
  readSetting: vi.fn(() => null),
  writeSetting: vi.fn(),
}));

import { requestBlob } from "@delebash/llm-ui";

let canSaveFiles;
let canPickBooks;
let exportProject;
const clicked = [];

beforeAll(async () => {
  // A host with a bridge but no shell — the browser-only dev path's shape.
  global.window = { justwrite: {} };
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
  clicked.length = 0;
});

describe("bookTransfer — no desktop shell", () => {
  it("reports neither save nor pick capability", () => {
    expect(canSaveFiles).toBe(false);
    expect(canPickBooks).toBe(false);
  });

  it("exportProject downloads '<title>.zip' instead of reaching for a save dialog", async () => {
    const res = await exportProject("prj1", "My Book");
    // Same server call as the desktop path — only the destination differs.
    expect(requestBlob).toHaveBeenCalledWith("/v1/projects/prj1/export");
    expect(clicked).toEqual([{ href: "blob:fake", download: "My Book.zip" }]);
    expect(res).toEqual({ ok: true, downloaded: true });
  });

  it("keeps the display title verbatim, only dropping illegal filename chars", async () => {
    await exportProject("prj1", 'The Ninth: Facet?/"');
    expect(clicked[0].download).toBe("The Ninth Facet.zip");
  });
});
