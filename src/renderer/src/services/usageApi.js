// Client for the LLM cost/token ledger (/v1/llm-usage). The AI store hydrates
// the recent log + lifetime totals on demand (Settings → Usage), records each
// call with a fire-and-forget POST, and clears with DELETE. Replaces the
// justwrite:ai:usage kv blob. HTTP via the shared kit transport.

import { get, post, del } from "@delebash/llm-ui";

export async function getUsage(limit = 1000) {
  return get(`/v1/llm-usage?limit=${limit}`);
}

export function postUsage(row) {
  return post("/v1/llm-usage", row, { keepalive: true }).catch((err) =>
    console.error("usageApi.postUsage failed:", err),
  );
}

export function clearUsage() {
  return del("/v1/llm-usage").catch((err) => console.error("usageApi.clearUsage failed:", err));
}
