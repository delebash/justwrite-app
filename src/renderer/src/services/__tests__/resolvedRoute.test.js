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
import { resolvedSourceLabel, useResolvedRoute } from "@delebash/llm-ui/composables/useResolvedRoute.js";

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

  it("EVERY non-GET kit write invalidates (providers/routing/presets/assignments/anything); GETs do NOT", async () => {
    // Any-write invalidation is the checker-corrected final shape: the first
    // cut allow-listed three endpoint families and missed two live
    // route-changers (/v1/llm-providers PATCH/DELETE mutates the provider
    // registry resolved-route reads; a preset/assignment write repoints what a
    // run resolves to). 2026-07-15 one-source rewrite: the task tier is gone —
    // the live route-changers are the per-action ref PUT + the engine-preset
    // writes (params live only on presets now), so the legs below drive THOSE.
    const fetchMock = vi.fn(async () => jsonResponse({ providerId: "p", model: "m", configured: true }));
    vi.stubGlobal("fetch", fetchMock);
    for (const [path, method] of [
      ["/v1/ai/preset-assignments/feature", "PUT"],
      ["/v1/ai/preset-assignments/default", "PUT"],
      ["/v1/ai/engine-presets/pr1", "PUT"],
      ["/v1/ai/engine-presets/pr1/reset", "POST"],
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

  // 2026-07-15 one-source wire: resolved-route rows carry presetSource
  // ("assigned" | "default") + presetId/presetName — the two-tier resolution
  // (the action's ref → the global default preset; the task tier is gone). The
  // cache preserves the whole row verbatim (presentation is the consumer's job),
  // so a provenance chip reads the tier straight from the cached row.
  it("caches the one-source resolved-route row verbatim, presetSource included", async () => {
    const row = {
      feature: "critique", action: "", providerId: "local-llamacpp", model: "gemma",
      presetId: "p_judge", presetName: "Judgment & scoring", presetSource: "assigned",
      configured: true,
    };
    const fetchMock = vi.fn(async () => jsonResponse(row));
    vi.stubGlobal("fetch", fetchMock);
    await ensureRoute("critique");
    expect(routeFor("critique")).toMatchObject({
      presetId: "p_judge", presetName: "Judgment & scoring", presetSource: "assigned",
    });
  });

  // 2026-07-16: the endpoint's optional providerId/model OVERRIDE params now have a
  // LIVE consumer — the Lab column (kit ConfigColumn) asks what ITS pinned route
  // resolves to, so the composable forwards them and keys those rows separately.
  // (This comment previously said "no consumer forwards override through the cache";
  // that stopped being true when the thinking-budget line shipped.) Both halves are
  // pinned here: the query the server receives, and the key isolation that stops a
  // pinned column's row from overwriting the feature chip's own route.
  it("forwards providerId/model overrides and caches them under their OWN key", async () => {
    const fetchMock = vi.fn(async (url) =>
      jsonResponse(String(url).includes("providerId=local-llamacpp")
        ? { providerId: "local-llamacpp", model: "gemma", think: true, value: 4096, valueSource: "class", configured: true }
        : { providerId: "cloud-x", model: "sonnet", configured: true }));
    vi.stubGlobal("fetch", fetchMock);
    await ensureRoute("critique");                                // the chip's own route (no override)
    await ensureRoute("critique", "", "local-llamacpp", "gemma"); // a Lab column's pinned route
    expect(fetchMock).toHaveBeenCalledTimes(2);                   // distinct keys ⇒ two fetches, no false cache hit
    const pinnedUrl = String(fetchMock.mock.calls[1][0]);
    expect(pinnedUrl).toContain("providerId=local-llamacpp");
    expect(pinnedUrl).toContain("model=gemma");
    // Neither row clobbers the other.
    expect(routeFor("critique")).toMatchObject({ model: "sonnet" });
    expect(routeFor("critique", "", "local-llamacpp", "gemma"))
      .toMatchObject({ value: 4096, valueSource: "class" });
  });

  // The source-label map is USER-APPROVED copy and the ONE place both budget surfaces
  // (the feature chip's popover + the Lab column's line) read their layer vocabulary
  // from — pinned so a reword can't drift the two apart silently.
  it("maps every resolved-route valueSource to its approved label", () => {
    expect(resolvedSourceLabel("tune")).toBe("your applied config");
    expect(resolvedSourceLabel("class")).toBe("hardware class default");
    expect(resolvedSourceLabel("base")).toBe("global default");
    expect(resolvedSourceLabel("default")).toBe("built-in default");
    expect(resolvedSourceLabel("invalid")).toBe("invalid value");
    // Cloud's "map" and the no-value "" carry no label: the budget line is local-only.
    expect(resolvedSourceLabel("map")).toBe("");
    expect(resolvedSourceLabel("")).toBe("");
  });
});
