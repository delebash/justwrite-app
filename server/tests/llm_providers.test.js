// SPDX-License-Identifier: MIT
// Port of tests/test_llm_providers.py — /v1/llm-providers: JustWrite mounts the SHARED
// provider-CRUD router over its llm_providers-table store, the same router JustVoice mounts.
// This proves JW's store + mount end-to-end through its app. The router's own unit tests
// live in the kit (provider_api.test.js).
//
// `test_provider_columns_persist` read the row through the SQLAlchemy model; here the row
// is read with SQL from the same table (`llm_providers`), its booleans converted by the
// captured column map as SQLAlchemy did.
import { getLlmRegistry } from "@delebash/llm-runner/llm";
import { expect, test } from "vitest";
import { state } from "../src/database/session.js";
import { clearRegistry, client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

async function c_() {
  // The registry is a process singleton; reset it so a leaked registration from another test
  // can't make `registered` flaky.
  clearRegistry();
  return client(tmpPath());
}

test("list_starts_empty", async () => {
  const body = (await (await c_()).get("/v1/llm-providers")).json();
  expect(body.providers).toEqual([]);
  expect(body.providerTypes).toContain("openai");
  expect(body.providerTypes).toContain("ollama");
});

test("crud_lifecycle", async () => {
  const c = await c_();

  // create — persisted + registered live; the key is never echoed.
  let r = await c.post("/v1/llm-providers", {
    json: { id: "openai", name: "OpenAI", providerType: "openai", apiKey: "sk-x", defaultModel: "gpt-4o-mini" },
  });
  expect(r.statusCode).toBe(201);
  const body = r.json();
  expect(body.hasApiKey === true && !("apiKey" in body)).toBe(true);
  expect(body.registered === true && body.providerType === "openai").toBe(true);
  expect(getLlmRegistry().ids()).toContain("openai");

  // list round-trips the camel shape, incl. the stored Local/Online flag.
  const lst = (await c.get("/v1/llm-providers")).json();
  expect(lst.providers.map((p) => p.id)).toEqual(["openai"]);
  expect(lst.providers[0].defaultModel).toBe("gpt-4o-mini");
  expect(lst.providers[0].local).toBe(true);

  // duplicate id + unknown providerType rejected.
  expect((await c.post("/v1/llm-providers", { json: { id: "openai", name: "x", providerType: "openai" } })).statusCode).toBe(400);
  expect((await c.post("/v1/llm-providers", { json: { id: "z", name: "x", providerType: "nope" } })).statusCode).toBe(400);

  // patch — empty apiKey preserves the stored key (write-only field).
  r = await c.patch("/v1/llm-providers/openai", {
    json: { id: "openai", name: "OpenAI 2", providerType: "openai", apiKey: "", defaultModel: "gpt-4o" },
  });
  expect(r.statusCode === 200 && r.json().name === "OpenAI 2").toBe(true);
  expect(r.json().hasApiKey === true && r.json().defaultModel === "gpt-4o").toBe(true);

  // patch missing -> 404.
  expect((await c.patch("/v1/llm-providers/nope", { json: { id: "nope", name: "x", providerType: "openai" } })).statusCode).toBe(404);

  // delete -> removed + deregistered; second delete -> 404.
  expect((await c.delete("/v1/llm-providers/openai")).json()).toEqual({ deleted: true });
  expect((await c.get("/v1/llm-providers")).json().providers).toEqual([]);
  expect(getLlmRegistry().ids()).not.toContain("openai");
  expect((await c.delete("/v1/llm-providers/openai")).statusCode).toBe(404);
});

test("provider_columns_persist", async () => {
  // Provider config lands in REAL columns (no JSON blob): base URL, provider type, the
  // write-only key, and the Local/Online flag. The id is derived from the name when the
  // client doesn't send one (#6).
  const c = await c_();
  await c.post("/v1/llm-providers", {
    json: { name: "My Ollama", providerType: "ollama", baseUrl: "http://example.test:11434/v1", apiKey: "sk-1", local: true },
  });
  const row = state.handle.one("SELECT * FROM llm_providers WHERE id = ?", ["my-ollama"], "llm_providers");
  expect(row.base_url).toBe("http://example.test:11434/v1");
  expect(row.provider_type).toBe("ollama");
  expect(row.api_key).toBe("sk-1");
  expect(row.local).toBe(true);
  expect("data" in row).toBe(false); // the JSON blob column is gone
});
