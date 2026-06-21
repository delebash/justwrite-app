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

import { OpenAICompatClient } from "../openai-compat.js";
import { friendlyAiError } from "../aiErrors.js";
import { runAiStream } from "../aiStream.js";
import { useAiStore } from "../../stores/ai.js";
import { useProjectStore } from "../../stores/project.js";
import { search, status } from "./vectorStore.js";

// ─── Prompt templates ────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You are an assistant answering questions about a novel manuscript. " +
  "Use ONLY the provided excerpts. Cite each claim by chapter using the " +
  "bracketed reference numbers (e.g. [1], [2]) that appear before each excerpt. " +
  "When the user asks a follow-up, use prior turns for pronoun/entity context but " +
  "still cite only from the freshly retrieved excerpts.";

// Truncation policy: keep at most the last 8 messages (≈ 4 Q/A pairs) from
// history. Beyond that, retrieval handles long-range memory anyway.
const MAX_HISTORY_MESSAGES = 8;

/**
 * Build the user message from a question and an array of ranked hits.
 *
 * @param {string} question
 * @param {Array<{ chunk: object, score: number }>} hits
 * @returns {string}
 */
function buildUserMessage(question, hits) {
  const excerpts = hits
    .map(({ chunk }, i) => {
      const sceneLabel = chunk.sceneTitle
        ? `, scene "${chunk.sceneTitle}"`
        : chunk.sceneIdx != null
          ? `, scene ${chunk.sceneIdx + 1}`
          : "";
      const header = `Ch. ${chunk.chapterNum} "${chunk.chapterTitle}"${sceneLabel}`;
      // Truncate very long scenes so we don't blow the context window.
      const excerpt = chunk.text.length > 1200
        ? `${chunk.text.slice(0, 1200)}…`
        : chunk.text;
      return `[${i + 1}] ${header}:\n${excerpt}`;
    })
    .join("\n\n");

  return `Question: ${question}\n\nExcerpts:\n${excerpts}\n\nAnswer with citations.`;
}

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
 * @param {object}      [opts.llmProvider]     — override; defaults to ai.llmProvider
 * @param {string}      [opts.llmModel]        — override
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
  llmProvider,
  llmModel,
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

  const resolvedLlmProvider   = llmProvider   || ai.providerForFeature("chat");
  const resolvedLlmModel      = llmModel      || ai.modelForFeature("chat") || resolvedLlmProvider?.defaultModel;
  const resolvedEmbedProvider = embedProvider || ai.embeddingProvider;

  if (!resolvedLlmProvider) {
    throw new Error(
      "No LLM provider configured. Open Settings → AI providers and set a chat provider.",
    );
  }
  if (!resolvedEmbedProvider) {
    throw new Error(
      "No embedding provider configured. Open Settings → AI providers and set an embedding provider.",
    );
  }

  const resolvedEmbedModel = embedModel || resolvedEmbedProvider.embeddingModel || "";

  // ── 2. Confirm an index exists (server-side) ─────────────────────────────
  const projectId = project.activeProjectId;
  const st = await status(projectId);
  if (!st.exists) {
    throw new Error(
      "No index built yet — open Settings → AI providers, configure an embedding " +
      "provider, then use the RAG panel to build the manuscript index.",
    );
  }

  // ── 3. Embed the (history-aware) query ───────────────────────────────────
  const embedClient = new OpenAICompatClient(resolvedEmbedProvider);
  const embedQuery = buildEmbedQuery(question, history);
  let queryVectors;
  try {
    queryVectors = await embedClient.embed({
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

  // ── 5. Build prompt (system + truncated history + final user msg) ────────
  const recentHistory = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...recentHistory,
    { role: "user",   content: buildUserMessage(question, hits) },
  ];

  // ── 6. Stream the answer ─────────────────────────────────────────────────
  // Lookup is "chat" (provider/model per the user's Settings); ledger
  // records "rag-chat" so manuscript Q&A shows up distinctly from any
  // future plain-chat feature.
  const ragMeta = { ...(meta || {}), question: question.slice(0, 120) };
  const { content: answer, usage } = await runAiStream({
    feature: "chat", usageFeature: "rag-chat",
    messages, temperature: 0.3,
    signal, onDelta,
    provider: resolvedLlmProvider, model: resolvedLlmModel,
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
