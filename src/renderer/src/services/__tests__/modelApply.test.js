// The KIT modelApply writer (B2-9, queue §7.2) — the ONE set-as-default path shared
// by the catalog Default button, QuickSetup, and the provider rows' "Set as default".
// Under test: the §7.2 overwrite choice — keep-my-customized (default: a task whose
// preset provider/model differs from the CURRENT default pair is hand-picked and
// keeps its routing) vs overwrite (every task preset repoints). The kit module is
// imported REAL via the alias subpath (the embedApi.test.js precedent); only the kit
// client transport + the routing composable are mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@delebash/llm-ui/client.js", () => ({ request: vi.fn() }));
vi.mock("@delebash/llm-ui/composables/useRouting.js", () => ({
  useRouting: () => ({
    loadRouting: vi.fn(),
    setDefaultEmbedding: vi.fn(),
  }),
}));

import { request } from "@delebash/llm-ui/client.js";

import {
  currentDefaultId,
  currentDefaultProviderId,
  refreshApplied,
  setAsDefault,
} from "@delebash/llm-ui/services/modelApply.js";

const ASSIGN_URL = "/v1/ai/preset-assignments";
const PRESETS_URL = "/v1/ai/engine-presets";
const ROUTING_URL = "/v1/ai/routing";

// The seeded-ish shape: three presets on the current default pair (local gemma),
// one hand-picked to OpenAI, one on the SAME model name under a DIFFERENT provider
// (the §7.2 pair rule: provider OR model differing = customized).
function fixture() {
  return {
    assignments: {
      defaultPresetId: "p-default",
      taskKinds: { write: "p-write", chat: "p-chat", custom: "p-custom", same: "p-samename" },
    },
    presets: [
      { id: "p-default", name: "Default", position: 0, providerId: "local-llamacpp", model: "gemma" },
      { id: "p-write", name: "Write", position: 1, providerId: "local-llamacpp", model: "gemma" },
      { id: "p-chat", name: "Chat", position: 2, providerId: "local-llamacpp", model: "gemma" },
      { id: "p-custom", name: "Custom", position: 3, providerId: "openai", model: "gpt-4.1" },
      { id: "p-samename", name: "SameName", position: 4, providerId: "other", model: "gemma" },
    ],
  };
}

function putCalls() {
  return request.mock.calls
    .filter(([u, o]) => u.startsWith(`${PRESETS_URL}/`) && o?.method === "PUT")
    .map(([u, o]) => ({ id: u.slice(PRESETS_URL.length + 1), body: o.body }));
}

beforeEach(() => {
  vi.clearAllMocks();
  const fx = fixture();
  request.mockImplementation(async (url, opts) => {
    if (url === ASSIGN_URL) return fx.assignments;
    if (url === PRESETS_URL) return { presets: fx.presets };
    if (url === ROUTING_URL) return { default: {} };
    if (url.startsWith(`${PRESETS_URL}/`) && opts?.method === "PUT") return { presets: fx.presets };
    throw new Error(`unmocked ${url}`);
  });
});

describe("setAsDefault — §7.2 overwrite choice", () => {
  it("keep-my-customized (default): only presets on the current default PAIR move", async () => {
    await setAsDefault("openrouter", "kimi");
    const puts = putCalls();
    // The three (local-llamacpp, gemma) presets repoint; the hand-picked OpenAI one
    // AND the same-model-different-provider one are kept (the pair comparison).
    expect(puts.map((p) => p.id).sort()).toEqual(["p-chat", "p-default", "p-write"]);
    for (const p of puts) {
      expect(p.body.providerId).toBe("openrouter");
      expect(p.body.model).toBe("kimi");
    }
  });

  it("keeps every other per-task setting on the PUT body (only routing changes)", async () => {
    await setAsDefault("openrouter", "kimi");
    const def = putCalls().find((p) => p.id === "p-default");
    expect(def.body.name).toBe("Default");
    expect(def.body.position).toBe(0);
  });

  it("overwrite: EVERY task preset repoints, customized included", async () => {
    await setAsDefault("openrouter", "kimi", { overwrite: true });
    expect(putCalls().map((p) => p.id).sort()).toEqual(
      ["p-chat", "p-custom", "p-default", "p-samename", "p-write"],
    );
  });

  it("already-the-target presets are not re-PUT", async () => {
    await setAsDefault("local-llamacpp", "gemma", { overwrite: true });
    // The three already on (local-llamacpp, gemma) are skipped; the two others move.
    expect(putCalls().map((p) => p.id).sort()).toEqual(["p-custom", "p-samename"]);
  });
});

// QC-20 (2026-07-09, "the default provider is not set for llama after running
// quicksetup"): the provider LIST tags its current-default row via the UNGATED
// currentDefaultProviderId — the local gate stays on currentDefaultId only (it
// exists so a cloud default can't false-match a same-id LOCAL catalog row).
describe("refreshApplied — currentDefaultProviderId (QC-20)", () => {
  it("exposes a LOCAL dominant pair on both refs", async () => {
    await refreshApplied();
    expect(currentDefaultProviderId.value).toBe("local-llamacpp");
    expect(currentDefaultId.value).toBe("gemma");
  });

  it("exposes an ONLINE dominant's provider ungated while the model badge stays gated", async () => {
    const fx = fixture();
    for (const p of fx.presets) {
      if (p.providerId === "local-llamacpp") Object.assign(p, { providerId: "openrouter", model: "kimi" });
    }
    request.mockImplementation(async (url) => {
      if (url === ASSIGN_URL) return fx.assignments;
      if (url === PRESETS_URL) return { presets: fx.presets };
      if (url === ROUTING_URL) return { default: {} };
      throw new Error(`unmocked ${url}`);
    });
    await refreshApplied();
    expect(currentDefaultProviderId.value).toBe("openrouter"); // the row tag follows it
    expect(currentDefaultId.value).toBe("");                   // the catalog badge stays local-gated
  });
});
