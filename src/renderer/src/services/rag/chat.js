// RAG chat — single-turn question answering over the indexed manuscript.
//
// askManuscript({ question, k, signal, onDelta, llmProvider, llmModel,
//                 embedProvider, embedModel })
//   1. Loads the vector store for the active project.
//   2. Embeds the question and retrieves the top-k closest scenes.
//   3. Builds a chat prompt with cited excerpts.
//   4. Streams the answer; returns { answer, citations, usage }.

import { OpenAICompatClient } from "../openai-compat.js";
import { friendlyAiError } from "../aiErrors.js";
import { useAiStore } from "../../stores/ai.js";
import { useProjectStore } from "../../stores/project.js";
import { load, topK } from "./vectorStore.js";

// ─── Prompt templates ────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You are an assistant answering questions about a novel manuscript. " +
  "Use ONLY the provided excerpts. Cite each claim by chapter using the " +
  "bracketed reference numbers (e.g. [1], [2]) that appear before each excerpt.";

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
        ? chunk.text.slice(0, 1200) + "…"
        : chunk.text;
      return `[${i + 1}] ${header}:\n${excerpt}`;
    })
    .join("\n\n");

  return `Question: ${question}\n\nExcerpts:\n${excerpts}\n\nAnswer with citations.`;
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Answer a question about the manuscript using RAG.
 *
 * @param {object} opts
 * @param {string}      opts.question
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
  k = 6,
  signal,
  onDelta,
  llmProvider,
  llmModel,
  embedProvider,
  embedModel,
} = {}) {
  // ── 1. Validate ──────────────────────────────────────────────────────────
  if (!question || !question.trim()) {
    throw new Error("Question must not be empty.");
  }

  const ai      = useAiStore();
  const project = useProjectStore();

  const resolvedLlmProvider   = llmProvider   || ai.llmProvider;
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

  const resolvedLlmModel   = llmModel   || resolvedLlmProvider.chatModel   || "";
  const resolvedEmbedModel = embedModel || resolvedEmbedProvider.embeddingModel || "";

  // ── 2. Load vector store ─────────────────────────────────────────────────
  const projectId = project.activeProjectId;
  const store = load(projectId);

  if (!store || Object.keys(store.entries || {}).length === 0) {
    throw new Error(
      "No index built yet — open Settings → AI providers, configure an embedding " +
      "provider, then use the RAG panel to build the manuscript index.",
    );
  }

  // ── 3. Embed the question ────────────────────────────────────────────────
  const embedClient = new OpenAICompatClient(resolvedEmbedProvider);
  let queryVectors;
  try {
    queryVectors = await embedClient.embed({
      input: question.trim(),
      model: resolvedEmbedModel,
      signal,
    });
  } catch (err) {
    throw friendlyAiError(err, resolvedEmbedProvider);
  }

  const queryVec = Array.isArray(queryVectors?.[0]) ? queryVectors[0] : null;
  if (!queryVec || !queryVec.length) {
    throw new Error("Embedding the question returned an empty vector.");
  }

  // ── 4. Retrieve top-k chunks ─────────────────────────────────────────────
  const hits = topK(store, queryVec, k);

  if (!hits.length) {
    throw new Error(
      "No relevant passages found — the index may be empty or built with a different embedding model.",
    );
  }

  // ── 5. Build prompt ──────────────────────────────────────────────────────
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user",   content: buildUserMessage(question, hits) },
  ];

  // ── 6. Stream the answer ─────────────────────────────────────────────────
  const llmClient = new OpenAICompatClient(resolvedLlmProvider);
  let answer = "";
  let usage  = null;

  const stream = llmClient.chatStream({
    messages,
    model: resolvedLlmModel,
    temperature: 0.3,
    signal,
  });

  try {
    for await (const chunk of stream) {
      if (chunk.delta && onDelta) onDelta(chunk.delta, chunk.content);
      if (chunk.content) answer = chunk.content;
      if (chunk.usage)   usage  = chunk.usage;
    }
  } catch (err) {
    throw friendlyAiError(err, resolvedLlmProvider);
  }

  // ── 7. Record usage ──────────────────────────────────────────────────────
  if (usage) {
    ai.recordUsage({
      feature: "rag-chat",
      providerId: resolvedLlmProvider.id,
      model: resolvedLlmModel,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      meta: { question: question.slice(0, 120) },
    });
  }

  // ── 8. Return ────────────────────────────────────────────────────────────
  const citations = hits.map(({ chunk, score }, i) => ({
    index: i + 1,   // 1-based to match the [1] refs in the prompt
    chunk,
    score,
  }));

  return { answer, citations, usage };
}
