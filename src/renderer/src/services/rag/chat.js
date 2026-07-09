// RAG chat — question answering over the indexed manuscript, with optional
// multi-turn history.
//
// askManuscript({ question, history, k, signal, onDelta, llmProvider, llmModel,
//                 embedProvider, embedModel })
//   1. Loads the vector store for the active project.
//   2. Embeds a query (prior user turn + current question, so follow-ups like
//      "what about her sister?" still retrieve the right scenes).
//   3. Builds a chat prompt with cited excerpts AND any prior turns.
//   4. Streams the answer; returns { answer, citations, usage }.

import { embedTexts, friendlyAiError, runAiFeatureStream } from "@delebash/llm-ui";
import { useAiStore } from "../../stores/ai.js";
import { useProjectStore } from "../../stores/project.js";
import { formatExcerpts } from "./excerpts.js";
import { search, status } from "./vectorStore.js";

// ─── Prompt ──────────────────────────────────────────────────────────────
// The system + outer user template live server-side ("chat" feature_prompts,
// Lab-editable). The client retrieves chunks and formats the cited {{excerpts}}
// block (about live data); the server renders the rest from {{question}} +
// {{excerpts}} and prepends the prior turns.

// Truncation policy: keep at most the last 8 messages (≈ 4 Q/A pairs) from
// history. Beyond that, retrieval handles long-range memory anyway.
const MAX_HISTORY_MESSAGES = 8;

// formatExcerpts lives in ./excerpts.js — shared with characterChat and the
// Lab's test-input picker (QC-35: one formatter, no copies).

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Build the history-aware embedding query.
 *
 * For a stand-alone question we just embed the question. For a follow-up
 * (history non-empty) we prepend the most recent prior USER turn so terms
 * like "she" / "the same chapter" / "what about her sister?" still pull
 * back entity-relevant scenes. Cheaper than a query-rewrite LLM call and
 * empirically good enough.
 *
 * @param {string} question
 * @param {Array<{role:string, content:string}>} history
 * @returns {string}
 */
function buildEmbedQuery(question, history) {
  const lastUser = [...history].reverse().find((m) => m?.role === "user");
  if (!lastUser?.content) return question.trim();
  return `${lastUser.content.trim()}\n\n${question.trim()}`;
}

/**
 * Answer a question about the manuscript using RAG.
 *
 * @param {object} opts
 * @param {string}      opts.question
 * @param {Array<{role:"user"|"assistant", content:string}>} [opts.history=[]]
 *                                            — prior turns; the latest user
 *                                              question should NOT be included
 *                                              (pass it as `question`).
 * @param {number}      [opts.k=6]            — number of chunks to retrieve
 * @param {AbortSignal} [opts.signal]
 * @param {Function}    [opts.onDelta]         — (delta: string, content: string) => void
 * @param {object}      [opts.embedProvider]   — override; defaults to ai.embeddingProvider
 * @param {string}      [opts.embedModel]      — override
 * @returns {Promise<{ answer: string, citations: Array<{ index: number, chunk: object, score: number }>, usage: object | null }>}
 */
export async function askManuscript({
  question,
  history = [],
  k = 6,
  signal,
  onDelta,
  embedProvider,
  embedModel,
  task,
  meta,
} = {}) {
  // ── 1. Validate ──────────────────────────────────────────────────────────
  if (!question?.trim()) {
    throw new Error("Question must not be empty.");
  }

  const ai      = useAiStore();
  const project = useProjectStore();

  // The LLM provider/model is NOT resolved here (B5-1, §7.2): the server run
  // path owns it (the chat task's preset → dispatch fallback). A client-side
  // pin resolution here used to silently bypass the task preset. Embeddings
  // are a different rail — the embed call below is client-orchestrated, so
  // its provider still resolves here.
  const resolvedEmbedProvider = embedProvider || ai.embeddingProvider;

  if (!resolvedEmbedProvider) {
    throw new Error(
      "No embedding provider configured. Open AI Settings and set an embedding provider.",
    );
  }

  const resolvedEmbedModel = embedModel || ai.embeddingModelFor(resolvedEmbedProvider);

  // ── 2. Confirm an index exists (server-side) ─────────────────────────────
  const projectId = project.activeProjectId;
  const st = await status(projectId);
  if (!st.exists) {
    throw new Error(
      "No index built yet — open Ask the book and build the manuscript index first.",
    );
  }

  // ── 3. Embed the (history-aware) query ───────────────────────────────────
  const embedQuery = buildEmbedQuery(question, history);
  let queryVectors;
  try {
    queryVectors = await embedTexts({
      providerId: resolvedEmbedProvider.id,
      providerType: resolvedEmbedProvider.providerType,
      input: embedQuery,
      model: resolvedEmbedModel,
      signal,
    });
  } catch (err) {
    throw friendlyAiError(err, resolvedEmbedProvider);
  }

  const queryVec = Array.isArray(queryVectors?.[0]) ? queryVectors[0] : null;
  if (!queryVec?.length) {
    throw new Error("Embedding the question returned an empty vector.");
  }

  // ── 4. Retrieve top-k chunks (hybrid: BM25 + cosine, blended via RRF) ────
  const hits = await search(projectId, queryVec, embedQuery, k);

  if (!hits.length) {
    throw new Error(
      "No relevant passages found — the index may be empty or built with a different embedding model.",
    );
  }

  // ── 5. Recent history — the server prepends these turns; the system + outer
  //      template are the DB "chat" prompt (Lab-editable). ───────────────────
  const recentHistory = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));

  // ── 6. Stream the answer ─────────────────────────────────────────────────
  // Server renders the "chat" prompt from {{question}} + {{excerpts}}, prepends
  // history, resolves the chat provider/model (task preset → default — no
  // client override), and records usage (host sink).
  const ragMeta = { ...(meta || {}), question: question.slice(0, 120) };
  const { content: answer, usage } = await runAiFeatureStream({
    action: "chat", feature: "chat",
    variables: { question, excerpts: formatExcerpts(hits) },
    history: recentHistory, temperature: 0.3,
    signal, onDelta,
    meta: ragMeta,
    task: task || { label: "Ask the book", meta: ragMeta },
  });

  // ── 8. Return ────────────────────────────────────────────────────────────
  // The citation "score" surfaced to the UI is the cosine similarity
  // (the most human-interpretable number — "85% match"). The RRF blend
  // score is what determined RANK, but it'd display as ~0.02 which
  // isn't meaningful to a reader. bmScore is kept for debugging only.
  const citations = hits.map(({ chunk, cosScore, bmScore }, i) => ({
    index: i + 1,   // 1-based to match the [1] refs in the prompt
    chunk,
    score: cosScore ?? 0,
    bmScore,
  }));

  return { answer, citations, usage };
}
