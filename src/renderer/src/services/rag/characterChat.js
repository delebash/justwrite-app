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

import { embedTexts } from "../embedApi.js";
import { friendlyAiError } from "../aiErrors.js";
import { runAiFeatureStream } from "../aiFeature.js";
import { useAiStore } from "../../stores/ai.js";
import { useProjectStore } from "../../stores/project.js";
import { search, status } from "./vectorStore.js";

const MAX_HISTORY_MESSAGES = 8;

// Build the per-character PROFILE block sent as the {{characterProfile}}
// variable. The framing line + interview RULES live in the server "characterChat"
// prompt (Lab-editable); this is just the dynamic profile data, prefixed with a
// newline when present (the template is "YOUR PROFILE:{{characterProfile}}", so an
// empty profile renders byte-identically to the old client system).
function buildCharacterProfile(character, extras) {
  const lines = [];
  if (character.role) lines.push(`Role: ${character.role}`);
  if (character.gender) lines.push(`Gender: ${character.gender}`);
  if (character.pronouns) lines.push(`Pronouns: ${character.pronouns}`);
  if (character.lifeStatus) lines.push(`Life status: ${character.lifeStatus}`);
  if ((character.aliases || []).length) lines.push(`Also known as: ${character.aliases.join(", ")}`);
  if (character.age) lines.push(`Age: ${character.age}`);
  if (character.oneLiner) lines.push(`Self-image (one line): ${character.oneLiner}`);

  if (extras) {
    if (extras.voice) {
      const v = extras.voice;
      const vParts = [];
      if (v.accent) vParts.push(`accent: ${v.accent}`);
      if (v.vocabulary) vParts.push(`vocabulary: ${v.vocabulary}`);
      if (v.speechTic) vParts.push(`speech tic: ${v.speechTic}`);
      if (vParts.length) lines.push(`Voice: ${vParts.join("; ")}`);
      if (v.sampleLine) lines.push(`Sample of your speech: "${v.sampleLine}"`);
    }
    if (extras.motivation) {
      const m = extras.motivation;
      if (m.want) lines.push(`What you want: ${m.want}`);
      if (m.need) lines.push(`What you actually need: ${m.need}`);
      if (m.lie) lines.push(`The lie you believe: ${m.lie}`);
      if (m.truth) lines.push(`The truth you eventually meet: ${m.truth}`);
    }
    if (extras.arc) {
      const a = extras.arc;
      if (a.start) lines.push(`Where you begin the story: ${a.start}`);
      if (a.midpoint) lines.push(`Where you stand at the midpoint: ${a.midpoint}`);
      if (a.end) lines.push(`Where you end up: ${a.end}`);
    }
    if (extras.backstory) {
      lines.push(`Backstory (private, never told the reader directly): ${String(extras.backstory).slice(0, 800)}`);
    }
    if (Array.isArray(extras.quotes) && extras.quotes.length) {
      lines.push(`Lines you've actually said in the novel:`);
      for (const q of extras.quotes.slice(0, 4)) lines.push(`  - "${q}"`);
    }
  }

  return lines.length ? `\n${lines.join("\n")}` : "";
}

// Format ranked hits into the cited excerpt block sent as the {{excerpts}}
// variable (same shape as manuscript chat; keeps the [1]/[2] refs).
function formatExcerpts(hits) {
  return hits
    .map(({ chunk }, i) => {
      const sceneLabel = chunk.sceneTitle
        ? `, scene "${chunk.sceneTitle}"`
        : chunk.sceneIdx != null
          ? `, scene ${chunk.sceneIdx + 1}`
          : "";
      const header = `Ch. ${chunk.chapterNum} "${chunk.chapterTitle}"${sceneLabel}`;
      const excerpt = chunk.text.length > 1200 ? `${chunk.text.slice(0, 1200)}…` : chunk.text;
      return `[${i + 1}] ${header}:\n${excerpt}`;
    })
    .join("\n\n");
}

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
 * @param {object} [opts.llmProvider]
 * @param {string} [opts.llmModel]
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
  llmProvider,
  llmModel,
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

  const resolvedLlmProvider = llmProvider || ai.providerForFeature("characterChat") || ai.providerForFeature("chat");
  const resolvedLlmModel = llmModel || ai.modelForFeature("characterChat") || ai.modelForFeature("chat") || resolvedLlmProvider?.defaultModel;
  const resolvedEmbedProvider = embedProvider || ai.embeddingProvider;

  if (!resolvedLlmProvider) throw new Error("No LLM provider configured. Open Settings → AI providers and set a chat provider.");
  if (!resolvedEmbedProvider) throw new Error("No embedding provider configured. Open Settings → AI providers and set an embedding provider.");

  const resolvedEmbedModel = embedModel || ai.embeddingModelFor(resolvedEmbedProvider);

  const projectId = project.activeProjectId;
  const st = await status(projectId);
  if (!st.exists) {
    throw new Error("No index built yet — open Settings → AI providers, configure an embedding provider, then use the RAG panel to build the manuscript index.");
  }

  const embedQuery = buildEmbedQuery(question, history, character);
  let queryVectors;
  try {
    queryVectors = await embedTexts({
      providerId: resolvedEmbedProvider.id,
      input: embedQuery,
      model: resolvedEmbedModel,
      signal,
    });
  } catch (err) {
    throw friendlyAiError(err, resolvedEmbedProvider);
  }
  const queryVec = Array.isArray(queryVectors?.[0]) ? queryVectors[0] : null;
  if (!queryVec?.length) throw new Error("Embedding the question returned an empty vector.");

  const hits = await search(projectId, queryVec, embedQuery, k);
  if (!hits.length) throw new Error("No relevant passages found — the index may be empty or built with a different embedding model.");

  const recentHistory = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));

  // Server renders the "characterChat" prompt (framing + RULES) from
  // {{characterName}} + {{characterProfile}} + {{question}} + {{excerpts}},
  // prepends history, resolves the provider/model, and records usage.
  const chatMeta = { ...(meta || {}), characterId, characterName: character.name };
  const { content: answer, usage } = await runAiFeatureStream({
    action: "characterChat", feature: "characterChat",
    variables: {
      characterName: character.name,
      characterProfile: buildCharacterProfile(character, extras),
      question,
      excerpts: formatExcerpts(hits),
    },
    history: recentHistory, temperature: 0.7,
    signal, onDelta,
    provider: resolvedLlmProvider, model: resolvedLlmModel,
    meta: chatMeta,
    task: task || { label: "Character chat", meta: chatMeta },
  });

  const citations = hits.map((h, i) => ({
    index: i + 1,
    chunk: h.chunk,
    score: h.score,
  }));

  return { answer, citations, usage };
}
