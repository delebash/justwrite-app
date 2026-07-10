// The chip cache's write-invalidation (the 2026-07-10 chip-staleness fix —
// user: ran Quick Setup and every chip kept saying "Not set up"). The root
// cause was invalidateRoutes() existing with ZERO callers, so these pin the
// drift-proof replacement: the kit client notifies subscribers after every
// successful non-GET request(), and useResolvedRoute drops its WHOLE cache on
// ANY such write (the three-family allow-list was checker-rejected — see kit
// useResolvedRoute.js). Kit modules imported REAL via the source alias; fetch
// mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { request } from "@delebash/llm-ui/client.js";
import { useResolvedRoute } from "@delebash/llm-ui/composables/useResolvedRoute.js";

function jsonResponse(obj) {
  return {
    ok: true,
    status: 200,
    headers: { get: (k) => (k.toLowerCase() === "content-type" ? "application/json" : "") },
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  };
}

const { routeFor, ensureRoute, invalidateRoutes } = useResolvedRoute();

beforeEach(() => {
  vi.clearAllMocks();
  invalidateRoutes(); // module-level cache — start each case empty
});

describe("useResolvedRoute — write invalidation (chips update without a reload)", () => {
  it("caches a fetched route and serves it without refetching", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ providerId: "p", model: "m", configured: true }));
    vi.stubGlobal("fetch", fetchMock);
    await ensureRoute("critique");
    await ensureRoute("critique");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(routeFor("critique")).toMatchObject({ model: "m" });
  });

  it("a routing WRITE through the kit client drops the cache; the next ensure refetches the new truth", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("resolved-route")) {
        return jsonResponse(fetchMock.mock.calls.filter((c) => String(c[0]).includes("resolved-route")).length > 1
          ? { providerId: "local", model: "picked-by-quicksetup", configured: true }
          : { configured: false, detail: "No model is set." });
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    await ensureRoute("critique");
    expect(routeFor("critique")).toMatchObject({ configured: false });
    // The Quick-Setup-shaped write (setAsDefault PUTs each engine preset).
    await request("/v1/ai/engine-presets/pr1", { method: "PUT", body: { model: "picked-by-quicksetup" } });
    expect(routeFor("critique")).toBeNull(); // cache dropped
    await ensureRoute("critique");
    expect(routeFor("critique")).toMatchObject({ configured: true, model: "picked-by-quicksetup" });
  });

  it("EVERY non-GET kit write invalidates (providers/routing/task-kinds/anything); GETs do NOT", async () => {
    // Any-write invalidation is the checker-corrected final shape: the first
    // cut allow-listed three endpoint families and missed two live
    // route-changers (/v1/llm-providers PATCH/DELETE mutates the provider
    // registry resolved-route reads; /v1/ai/routing PUT feeds resolve_pin).
    const fetchMock = vi.fn(async () => jsonResponse({ providerId: "p", model: "m", configured: true }));
    vi.stubGlobal("fetch", fetchMock);
    for (const [path, method] of [
      ["/v1/ai/task-kinds/feature", "PUT"],
      ["/v1/ai/preset-assignments/task-kind", "PUT"],
      ["/v1/llm-providers/p1", "DELETE"],
      ["/v1/ai/routing", "PUT"],
      ["/v1/ai/prompts/greet", "PUT"],
    ]) {
      await ensureRoute("chat");
      expect(routeFor("chat")).toMatchObject({ model: "m" });
      await request(path, { method, body: {} });
      expect(routeFor("chat"), `${method} ${path} must invalidate`).toBeNull();
    }
    // Reads leave the cache alone.
    await ensureRoute("chat");
    await request("/v1/ai/engine-presets");
    expect(routeFor("chat")).toMatchObject({ model: "m" });
  });
});
