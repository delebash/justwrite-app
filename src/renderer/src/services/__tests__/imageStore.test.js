// requestBlob path-first regression guard for readImageBytes — the EPUB/PDF
// cover-read path (services/export/epub.js:68). The kit's requestBlob is
// PATH-FIRST (`requestBlob(path, {method="GET"})`, client.js:65, publicly
// exported via index.js:14); a stale `requestBlob("GET", path)` would fetch the
// path "GET" → throw → be swallowed → the cover silently dropped. These cases
// lock the corrected single-arg call AND the blob→bytes decode (the cover
// "lands"). Node env: global Blob is available (Node 18+).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@delebash/llm-ui", () => ({
  serverUrl: vi.fn((p) => p),
  post: vi.fn(),
  del: vi.fn(),
  requestBlob: vi.fn(),
}));

import { requestBlob } from "@delebash/llm-ui";
import { readImageBytes } from "../imageStore.js";

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
