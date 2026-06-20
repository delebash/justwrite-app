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

import { OpenAICompatClient } from "../openai-compat.js";
import { friendlyAiError } from "../aiErrors.js";
import { runAiStream } from "../aiStream.js";
import { useAiStore } from "../../stores/ai.js";
import { useProjectStore } from "../../stores/project.js";
import { search, status } from "./vectorStore.js";

const MAX_HISTORY_MESSAGES = 8;

// Build the character's system prompt from their profile fields. We
// inline as much of the writer's established psychology as we have so
// the model can stay in voice and refuse questions the character
// genuinely couldn't answer.
function buildCharacterSystem(character, extras) {
  const parts = [];
  parts.push(`You ARE ${character.name}, a character in a novel. Speak in first person. Answer as this character would actually answer — in their voice, with their knowledge, biases, blind spots, and unspoken fears.`);
  parts.push("");
  parts.push("YOUR PROFILE:");
  if (character.role) parts.push(`Role: ${character.role}`);
  if (character.gender) parts.push(`Gender: ${character.gender}`);
  if (character.pronouns) parts.push(`Pronouns: ${character.pronouns}`);
  if (character.lifeStatus) parts.push(`Life status: ${character.lifeStatus}`);
  if ((character.aliases || []).length) parts.push(`Also known as: ${character.aliases.join(", ")}`);
  if (character.age) parts.push(`Age: ${character.age}`);
  if (character.oneLiner) parts.push(`Self-image (one line): ${character.oneLiner}`);

  if (extras) {
    if (extras.voice) {
      const v = extras.voice;
      const vParts = [];
      if (v.accent) vParts.push(`accent: ${v.accent}`);
      if (v.vocabulary) vParts.push(`vocabulary: ${v.vocabulary}`);
      if (v.speechTic) vParts.push(`speech tic: ${v.speechTic}`);
      if (vParts.length) parts.push(`Voice: ${vParts.join("; ")}`);
      if (v.sampleLine) parts.push(`Sample of your speech: "${v.sampleLine}"`);
    }
    if (extras.motivation) {
      const m = extras.motivation;
      if (m.want) parts.push(`What you want: ${m.want}`);
      if (m.need) parts.push(`What you actually need: ${m.need}`);
      if (m.lie) parts.push(`The lie you believe: ${m.lie}`);
      if (m.truth) parts.push(`The truth you eventually meet: ${m.truth}`);
    }
    if (extras.arc) {
      const a = extras.arc;
      if (a.start) parts.push(`Where you begin the story: ${a.start}`);
      if (a.midpoint) parts.push(`Where you stand at the midpoint: ${a.midpoint}`);
      if (a.end) parts.push(`Where you end up: ${a.end}`);
    }
    if (extras.backstory) {
      parts.push(`Backstory (private, never told the reader directly): ${String(extras.backstory).slice(0, 800)}`);
    }
    if (Array.isArray(extras.quotes) && extras.quotes.length) {
      parts.push(`Lines you've actually said in the novel:`);
      for (const q of extras.quotes.slice(0, 4)) parts.push(`  - "${q}"`);
    }
  }

  parts.push("");
  parts.push("RULES OF THE INTERVIEW:");
  parts.push("- Answer in first person, in your established voice.");
  parts.push("- Use the provided excerpts as your memory of what's happened in the book so far. Cite them by bracketed index ([1], [2]) when you reference a specific moment.");
  parts.push("- You only know what YOU would actually know. If an excerpt describes a scene you weren't present in, DO NOT use its content as your own knowledge. You can acknowledge that you don't know (\"I wasn't there\" / \"I haven't heard about that yet\") if pressed.");
  parts.push("- Stay in character even when speculating. If you'd lie, lie. If you'd dodge, dodge. If you'd refuse to answer, refuse.");
  parts.push("- Don't break the fourth wall. Don't refer to the writer, the manuscript, the chapters, or the narrative as a construct. You're a person who exists in this story.");
  parts.push("- Keep answers reasonably short — usually 1-3 sentences, sometimes a paragraph. Don't lecture.");
  parts.push("- Never deny being this character. Never call yourself an AI or assistant.");
  return parts.join("\n");
}

function buildUserMessage(question, hits) {
  const excerpts = hits
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

  return `The reader is asking you something. Use the excerpts as your memory of events. Answer in character.

Question: ${question}

Memory excerpts (you may or may not have been present for each — judge accordingly):
${excerpts}

Answer now, as ${"yourself"}.`;
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
  const resolvedLlmModel = llmModel || ai.modelForFeature("characterChat") || ai.modelForFeature("chat") || resolvedLlmProvider?.chatModel;
  const resolvedEmbedProvider = embedProvider || ai.embeddingProvider;

  if (!resolvedLlmProvider) throw new Error("No LLM provider configured. Open Settings → AI providers and set a chat provider.");
  if (!resolvedEmbedProvider) throw new Error("No embedding provider configured. Open Settings → AI providers and set an embedding provider.");

  const resolvedEmbedModel = embedModel || resolvedEmbedProvider.embeddingModel || "";

  const projectId = project.activeProjectId;
  const st = await status(projectId);
  if (!st.exists) {
    throw new Error("No index built yet — open Settings → AI providers, configure an embedding provider, then use the RAG panel to build the manuscript index.");
  }

  const embedClient = new OpenAICompatClient(resolvedEmbedProvider);
  const embedQuery = buildEmbedQuery(question, history, character);
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
  if (!queryVec?.length) throw new Error("Embedding the question returned an empty vector.");

  const hits = await search(projectId, queryVec, embedQuery, k);
  if (!hits.length) throw new Error("No relevant passages found — the index may be empty or built with a different embedding model.");

  const recentHistory = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));

  const messages = [
    { role: "system", content: buildCharacterSystem(character, extras) },
    ...recentHistory,
    { role: "user", content: buildUserMessage(question, hits) },
  ];

  const chatMeta = { ...(meta || {}), characterId, characterName: character.name };
  const { content: answer, usage } = await runAiStream({
    feature: "characterChat", usageFeature: "character-chat",
    messages, temperature: 0.7,
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
