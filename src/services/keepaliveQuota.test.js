// The kit's server transport keeps `keepalive` only while it fits the Fetch standard's 64 KiB of
// keepalive bytes in flight (2026-10-16): past that the browser refuses the request outright, which
// is how the book's autosave failed for every book over 64 KB (projectApi.js sends keepalive).
import { afterEach, describe, expect, it, vi } from "vitest";
import { serverFetch } from "@delebash/ui/common/services/transport.js";

const KIB = 1024;
const sent = [];
afterEach(() => {
  sent.length = 0;
  vi.unstubAllGlobals();
});

function stubFetch({ hold = false } = {}) {
  const releases = [];
  vi.stubGlobal("fetch", (input, init) => {
    sent.push({ input, keepalive: !!init?.keepalive, bytes: init?.body?.length ?? 0 });
    if (!hold) return Promise.resolve(new Response(null, { status: 204 }));
    return new Promise((resolve) => releases.push(() => resolve(new Response(null, { status: 204 }))));
  });
  return releases;
}

describe("keepalive within the 64 KiB in flight", () => {
  it("keeps keepalive on a body that fits, and drops it on one that doesn't", async () => {
    stubFetch();
    await serverFetch("/small", { method: "PUT", body: "x".repeat(60 * KIB), keepalive: true });
    await serverFetch("/book", { method: "PUT", body: "x".repeat(70 * KIB), keepalive: true });
    expect(sent.map((s) => [s.input, s.keepalive])).toEqual([["/small", true], ["/book", false]]);
  });

  it("counts what is still in flight, and frees it when the request is done", async () => {
    const releases = stubFetch({ hold: true });
    const first = serverFetch("/a", { method: "PUT", body: "x".repeat(40 * KIB), keepalive: true });
    const second = serverFetch("/b", { method: "PUT", body: "x".repeat(40 * KIB), keepalive: true });
    await Promise.resolve();
    expect(sent.map((s) => s.keepalive)).toEqual([true, false]);
    for (const release of releases) release();
    await Promise.all([first, second]);
    stubFetch();
    await serverFetch("/c", { method: "PUT", body: "x".repeat(40 * KIB), keepalive: true });
    expect(sent.at(-1).keepalive).toBe(true);
  });

  it("measures bytes, not characters", async () => {
    stubFetch();
    await serverFetch("/accents", { method: "PUT", body: "é".repeat(40 * KIB), keepalive: true });
    expect(sent.at(-1).keepalive).toBe(false);
  });

  it("leaves a request without keepalive alone", async () => {
    stubFetch();
    await serverFetch("/plain", { method: "PUT", body: "x".repeat(100 * KIB) });
    expect(sent.at(-1).keepalive).toBe(false);
  });
});
