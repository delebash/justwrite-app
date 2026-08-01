// Character interview — "talk to your character".
//
// Mirrors askManuscript but builds a character-voice system prompt
// from the character's profile, and asks the model to answer ONLY
// from what the character would actually know (i.e. scenes they were
// present in). The retrieval pulls from the same vector store; the
// model is told to respect the character's knowledge state and not
// leak information from scenes the character wasn't in.
//
// Returns { answer, citations, usage } in the same shape as
// askManuscript so the ChatPanel can render either flavour with one UI.

import { embedTexts, friendlyAiError, runAiFeatureStream } from "@delebash/llm-ui";
import { useAiStore } from "../../stores/ai.js";
import { useProjectStore } from "../../stores/project.js";
import { buildEntityCards } from "./cards.js";
import { combinePinsAndHits, pickPinnedCards } from "./entityMatcher.js";
import { formatExcerpts } from "./excerpts.js";
import { search, status } from "./vectorStore.js";

const MAX_HISTORY_MESSAGES = 8;

// buildCharacterProfile lives in ./profile.js (leaf module — Move 1);
// re-exported here so the QC-35 Lab test-data import site keeps working.
export { buildCharacterProfile } from "./profile.js";
import { buildCharacterProfile } from "./profile.js";

// formatExcerpts lives in ./excerpts.js — shared with manuscript chat and the
// Lab's test-input picker (QC-35: one formatter, no copies).

function buildEmbedQuery(question, history, character) {
  const lastUser = [...history].reverse().find((m) => m?.role === "user");
  const base = lastUser?.content ? `${lastUser.content.trim()}\n\n${question.trim()}` : question.trim();
  // Prepend the character's name so retrieval biases toward scenes
  // mentioning them. Cheap nudge, no schema change.
  if (character?.name) return `${character.name}\n${base}`;
  return base;
}

/**
 * Ask a question to a specific character in the user's novel.
 *
 * @param {object} opts
 * @param {string} opts.characterId
 * @param {string} opts.question
 * @param {Array}  [opts.history=[]]
 * @param {number} [opts.k=6]
 * @param {AbortSignal} [opts.signal]
 * @param {(d,c)=>void} [opts.onDelta]
 * @param {object} [opts.embedProvider]
 * @param {string} [opts.embedModel]
 */
export async function askAsCharacter({
  characterId,
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
  if (!question?.trim()) throw new Error("Question must not be empty.");
  if (!characterId) throw new Error("Pick a character first.");

  const ai = useAiStore();
  const project = useProjectStore();

  const character = (project.characters || []).find((c) => c.id === characterId);
  if (!character) throw new Error("Character not found.");
  const extras = project.characterExtras?.[characterId] || null;

  // Index state decides the MODE (bible-only chat, 2026-07-18 — mirrors
  // askManuscript): no index → skip the embed rail + retrieval entirely and
  // interview from the character's profile (the system prompt) + any pinned
  // cards alone. Empty excerpts are FINE here — unlike book chat, the persona's
  // full profile already grounds the interview.
  const projectId = project.activeProjectId;
  const st = await status(projectId);
  const bibleOnly = !st.exists;

  let hits = [];
  if (!bibleOnly) {
    // The LLM provider/model is NOT resolved here (B5-1, §7.2): the server run
    // path owns it (the characterChat task's preset → dispatch fallback). Only
    // the embedding rail resolves client-side (the embed call below is
    // client-orchestrated), through the self-heal (2026-07-11).
    const resolvedEmbedProvider = embedProvider || (await ai.ensureEmbeddingDefaults());

    if (!resolvedEmbedProvider) throw new Error("No embedding provider configured. Open AI Settings and set an embedding provider.");

    const resolvedEmbedModel = embedModel || ai.embeddingModelFor(resolvedEmbedProvider);

    const embedQuery = buildEmbedQuery(question, history, character);
    let queryVectors;
    try {
      queryVectors = await embedTexts({
        providerId: resolvedEmbedProvider.id,
        providerType: resolvedEmbedProvider.providerType,
        input: embedQuery,
        model: resolvedEmbedModel,
        signal,
        taskType: "query",
      });
    } catch (err) {
      throw friendlyAiError(err, resolvedEmbedProvider);
    }
    const queryVec = Array.isArray(queryVectors?.[0]) ? queryVectors[0] : null;
    if (!queryVec?.length) throw new Error("Embedding the question returned an empty vector.");

    hits = await search(projectId, queryVec, embedQuery, k);
    if (!hits.length) throw new Error("No relevant passages found — the index may be empty or built with a different embedding model.");
  }

  // Move 2: pin cards for OTHER entities named mid-interview ("what does
  // Bren think of you?") — the interviewee is excluded; their full profile
  // already IS the system prompt.
  const combined = combinePinsAndHits(
    pickPinnedCards({
      question, history, project, cards: buildEntityCards(project),
      excludeEntityId: characterId,
    }),
    hits,
  );

  const recentHistory = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));

  // Server renders the "characterChat" prompt (framing + RULES) from
  // {{characterName}} + {{characterProfile}} + {{question}} + {{excerpts}},
  // prepends history, resolves the provider/model (task preset → default —
  // no client override), and records usage.
  const chatMeta = { ...(meta || {}), characterId, characterName: character.name };
  const { content: answer, usage } = await runAiFeatureStream({
    action: "characterChat", feature: "characterChat",
    variables: {
      characterName: character.name,
      characterProfile: buildCharacterProfile(character, extras),
      question,
      excerpts: formatExcerpts(combined),
    },
    history: recentHistory, temperature: 0.7,
    signal, onDelta,
    meta: chatMeta,
    task: task || { label: "Character chat", meta: chatMeta },
  });

  const citations = combined.map((h, i) => ({
    index: i + 1,
    chunk: h.chunk,
    score: h.score ?? 0,
    pinned: !!h.pinned,
  }));

  return { answer, citations, usage, bibleOnly };
}
