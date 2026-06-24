// Client for the shared embeddings endpoint (POST /v1/ai/embeddings) — the
// runner-stack replacement for the old /v1/llm/{id}/embeddings proxy. The server
// holds the key + the live registry adapter; we pass the embedding provider id
// (the routing default) + model. Returns one vector per input, in order.
// HTTP via the shared kit transport.

import { post } from "@delebash/llm-ui";

export async function embedTexts({ providerId, model, input, signal } = {}) {
  if (!providerId) throw new Error("embed: providerId is required.");
  if (input == null) throw new Error("embed: input is required.");
  const arr = Array.isArray(input) ? input : [input];
  if (!arr.length) return [];
  const json = await post(
    "/v1/ai/embeddings",
    { providerId, model: model || "", input: arr },
    { signal },
  );
  return Array.isArray(json?.embeddings) ? json.embeddings.filter(Array.isArray) : [];
}
