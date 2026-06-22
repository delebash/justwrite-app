// Client for the shared embeddings endpoint (POST /v1/ai/embeddings) — the
// runner-stack replacement for the old /v1/llm/{id}/embeddings proxy. The server
// holds the key + the live registry adapter; we pass the embedding provider id
// (the routing default) + model. Returns one vector per input, in order.

import { serverUrl } from "./serverApi.js";

export async function embedTexts({ providerId, model, input, signal } = {}) {
  if (!providerId) throw new Error("embed: providerId is required.");
  if (input == null) throw new Error("embed: input is required.");
  const arr = Array.isArray(input) ? input : [input];
  if (!arr.length) return [];
  const res = await fetch(serverUrl("/v1/ai/embeddings"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ providerId, model: model || "", input: arr }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Embeddings error ${res.status}: ${text || res.statusText}`);
  }
  const json = await res.json();
  return Array.isArray(json?.embeddings) ? json.embeddings.filter(Array.isArray) : [];
}
