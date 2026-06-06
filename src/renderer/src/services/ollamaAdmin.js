// Ollama native-API helpers (NOT the OpenAI-compat /v1 layer).
// All endpoints are under /api/* at the server root — strip /v1 so these
// work regardless of whether the user typed the base URL with or without it.

function stripV1(baseUrl) {
  return baseUrl.replace(/\/+v1\/?$/, "").replace(/\/+$/, "");
}

// Returns true when Ollama is reachable at baseUrl, false otherwise.
// Never throws — designed for fire-and-forget availability checks.
export async function probeOllama(baseUrl) {
  const host = stripV1(baseUrl);
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${host}/api/tags`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(tid);
  }
}

// Returns the list of locally installed model names, e.g. ["qwen3:14b", "llama3:8b"].
// Returns [] when no models are present. Throws on network error.
export async function listInstalledModels(baseUrl) {
  const host = stripV1(baseUrl);
  const res = await fetch(`${host}/api/tags`);
  if (!res.ok) throw new Error(`Ollama /api/tags returned ${res.status}`);
  const data = await res.json();
  return (data.models || []).map((m) => m.name);
}

// Pulls a model from the Ollama registry, streaming NDJSON progress back
// via onProgress({ status, digest, total, completed }).
// Resolves when the stream ends or a { status: "success" } line arrives.
// Rejects on non-2xx, NDJSON error lines, stream errors, or AbortSignal.
export async function pullModel(baseUrl, modelName, { signal, onProgress } = {}) {
  const host = stripV1(baseUrl);
  const res = await fetch(`${host}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: modelName, stream: true }),
    signal,
  });

  if (!res.ok) throw new Error(`Ollama /api/pull returned ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });

      // NDJSON: split on newlines, keep incomplete last segment in buf.
      const lines = buf.split("\n");
      buf = lines.pop(); // last element may be an incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const obj = JSON.parse(trimmed);

        if (obj.error) throw new Error(obj.error);

        if (onProgress) {
          onProgress({
            status: obj.status,
            digest: obj.digest,
            total: obj.total,
            completed: obj.completed,
          });
        }

        if (obj.status === "success") return;
      }
    }
  } catch (err) {
    // Surface AbortError transparently so callers can distinguish cancel vs failure.
    if (err.name === "AbortError") throw err;
    throw err;
  } finally {
    reader.releaseLock();
  }
}
