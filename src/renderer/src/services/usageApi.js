// Client for the LLM cost/token ledger (/v1/llm-usage). The AI store hydrates
// the recent log + lifetime totals on demand (Settings → Usage), records each
// call with a fire-and-forget POST, and clears with DELETE. Replaces the
// justwrite:ai:usage kv blob.

import { serverUrl } from "./serverApi.js";

export async function getUsage(limit = 1000) {
  const res = await fetch(serverUrl(`/v1/llm-usage?limit=${limit}`));
  if (!res.ok) throw new Error(`/v1/llm-usage -> ${res.status}`);
  return res.json();
}

export function postUsage(row) {
  return fetch(serverUrl("/v1/llm-usage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(row),
    keepalive: true,
  }).catch((err) => console.error("usageApi.postUsage failed:", err));
}

export function clearUsage() {
  return fetch(serverUrl("/v1/llm-usage"), { method: "DELETE" })
    .catch((err) => console.error("usageApi.clearUsage failed:", err));
}
