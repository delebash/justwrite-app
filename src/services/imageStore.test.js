// requestBlob path-first regression guard for readImageBytes — the EPUB/PDF
// cover-read path (services/export/epub.js:68). The kit's requestBlob is
// PATH-FIRST (`requestBlob(path, {method="GET"})` — the shared serverApi
// transport since 2026-08-05, publicly exported via common/index.js); a stale
// `requestBlob("GET", path)` would fetch the
// path "GET" → throw → be swallowed → the cover silently dropped. These cases
// lock the corrected single-arg call AND the blob→bytes decode (the cover
// "lands"). Node env: global Blob is available (Node 18+).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@delebash/llm-ui", () => ({
  serverUrl: vi.fn((p) => p),
  post: vi.fn(),
  del: vi.fn(),
  requestBlob: vi.fn(),
  inAppServer: vi.fn(() => false),
}));

import { requestBlob } from "@delebash/llm-ui";
import { imagePath, readImageBytes, storedSrcFor, withSceneImages } from "./imageStore.js";

describe("imageStore.readImageBytes — path-first requestBlob (kit client.js:65)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads a server image PATH-first and decodes the blob to bytes", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    requestBlob.mockResolvedValue(new Blob([png], { type: "image/png" }));

    const out = await readImageBytes({ serverId: "img-abc" });

    // path-first: the SOLE argument is the image path — not the method "GET".
    expect(requestBlob).toHaveBeenCalledWith("/v1/images/img-abc");
    expect(requestBlob.mock.calls[0][0]).toBe("/v1/images/img-abc");
    expect(requestBlob.mock.calls[0][0]).not.toBe("GET");
    // the cover "lands": real bytes + mime + ext come back.
    expect(out).not.toBeNull();
    expect(out.mime).toBe("image/png");
    expect(out.ext).toBe("png");
    expect(Array.from(out.bytes)).toEqual(Array.from(png));
  });
});

// Images by path (2026-10-08): a scene stores a server image as `/v1/images/<id>`, never the
// address of the server that showed it; a read-only view moves that path aside so the browser
// doesn't load the bare path (the `v-scene-images` directive then shows it via `displaySrc`).
describe("imageStore — images by path", () => {
  it("a server image is stored as its path; an inline one as its data URL", async () => {
    expect(imagePath("img_9")).toBe("/v1/images/img_9");
    expect(await storedSrcFor({ kind: "server", serverId: "img_9" })).toBe("/v1/images/img_9");
    expect(await storedSrcFor({ kind: "dataurl", dataUrl: "data:image/png;base64,AA" })).toBe("data:image/png;base64,AA");
  });

  it("read views move only server images aside — the path and old absolute addresses", () => {
    const html =
      '<p>a</p><img src="/v1/images/img_1" alt="x"><img alt="y" src="http://127.0.0.1:17495/v1/images/img_2"><img src="https://example.com/p.png">';
    const out = withSceneImages(html);
    expect(out).toContain('<img data-scene-image="/v1/images/img_1" alt="x">');
    expect(out).toContain('<img alt="y" data-scene-image="http://127.0.0.1:17495/v1/images/img_2">');
    expect(out).toContain('<img src="https://example.com/p.png">');
    expect(withSceneImages("<p>no images</p>")).toBe("<p>no images</p>");
  });
});
