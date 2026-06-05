// Convert raw fetch / HTTP errors from an LLM provider into a single
// short, user-readable line. Each writerAI / critique / entityExtraction
// call wraps its stream loop with friendlyAiError(err, provider) so the
// modals + scene-strip AI dropdown never surface verbose "Chat stream
// error 500: …" to the user.

const PROVIDER_HINTS = {
  401: "Authentication failed — check the API key in Settings → AI providers.",
  402: "Payment required — your provider says you're out of credit.",
  403: "Access denied — the API key may not have permission for this model.",
  404: "Endpoint not found — the Base URL or model name may be wrong.",
  408: "Timed out before the model responded.",
  413: "The prompt is too large for this model.",
  429: "Rate-limited — wait a moment and try again.",
  500: "The provider returned an error. Try a different model.",
  502: "Bad gateway — the provider's upstream is unreachable.",
  503: "Service unavailable — the provider's server may be restarting.",
  504: "Gateway timed out — model took too long to start.",
};

function pickHint(msg, status) {
  if (status && PROVIDER_HINTS[status]) return PROVIDER_HINTS[status];
  if (/connection.*refused|ECONNREFUSED/i.test(msg))
    return "Connection refused — is the LLM server running?";
  if (/ENOTFOUND|getaddrinfo|DNS/i.test(msg))
    return "Couldn't resolve the host — check the Base URL.";
  if (/timed out|timeout/i.test(msg))
    return "Timed out — local models often need to load before the first call.";
  if (/cors|preflight|origin/i.test(msg))
    return "Browser blocked the request — in dev mode the provider needs CORS enabled, or run in the Tauri app.";
  return null;
}

function urlHostname(provider) {
  try { return new URL(provider?.baseUrl || "").host || ""; } catch { return ""; }
}

/**
 * Take a raw error from a chat() / chatStream() call and produce a new
 * Error with a friendlier message. The original message is preserved
 * as `.cause` so debug callers (Writer Lab) can still inspect.
 *
 * Aborts pass through unchanged so callers can branch on cancellation.
 */
export function friendlyAiError(err, provider) {
  const msg = String(err?.message || err || "");
  if (/abort/i.test(msg)) return err;
  // Try to surface an HTTP status code if the message embeds one.
  const m = msg.match(/(\d{3})/);
  const status = m ? parseInt(m[1], 10) : null;
  const host = urlHostname(provider);
  const hint = pickHint(msg, status);
  const lead = host ? `Couldn't reach ${host}` : "Couldn't reach the LLM";
  const friendly = hint ? `${lead} — ${hint}` : `${lead}. ${msg.slice(0, 160)}`;
  const out = new Error(friendly);
  out.cause = err;
  out.statusCode = status;
  return out;
}
