// Manuscript chunker — splits a project into per-scene Chunk objects for RAG
// indexing, plus the story-bible CARD chunks (Move 1 — cards.js builds them;
// one chunk per entity, ids "card:<kind>:<entityId>"). Two exports:
//   chunkProject(project)       — sync, no sha (fast path for diff checks)
//   chunkProjectAsync(project)  — async, fills sha via crypto.subtle

import { buildEntityCards, sceneLinksLine } from "./cards.js";

// Strip all AI diff marks and scene-break decorations from an HTML string,
// returning trimmed plain text with runs of whitespace collapsed to a single
// space.
function stripText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;

  // Remove deleted AI content entirely.
  div.querySelectorAll("del[data-ai-del], .ai-del").forEach((el) => { el.remove(); });

  // Remove scene-break markers entirely (the "* * *" paragraphs).
  div.querySelectorAll(".scene-mark").forEach((el) => { el.remove(); });

  // Unwrap inserted AI content — keep text, remove tags.
  div.querySelectorAll("ins[data-ai-ins], .ai-ins").forEach((el) => { el.replaceWith(...el.childNodes); });

  // Unwrap mention chips — keep text, remove tags.
  div.querySelectorAll(".mention, [data-mention]").forEach((el) => { el.replaceWith(...el.childNodes); });

  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

async function sha1Hex(text) {
  const buf = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Synchronous form — no sha field (sha is the empty string "").
 * Use this when you only need chunk ids + text without the async overhead.
 *
 * @param {object} project — a live Pinia project store instance
 * @returns {Array<Chunk>}
 */
export function chunkProject(project) {
  const chunks = [];
  const allChapters = project.allChapters;

  for (let ci = 0; ci < allChapters.length; ci++) {
    const chapter = allChapters[ci];
    const scenes = project.scenesFor(chapter.id);

    for (let si = 0; si < scenes.length; si++) {
      const scene = scenes[si];
      // Honor the per-scene "Exclude from AI" flag — used for spoiler
      // protection, unfinished drafts the writer doesn't want surfaced
      // in Ask-the-Book answers, and any scene the writer wants kept
      // out of retrieval context. Skipping here means it never embeds
      // and never appears in RAG results.
      if (scene.excludeFromAi) continue;
      const text = stripText(scene.body || "");
      if (!text) continue;

      chunks.push({
        id: `${chapter.id}:${scene.id}`,
        chapterId: chapter.id,
        sceneId: scene.id,
        chapterNum: ci + 1,
        chapterTitle: chapter.title || "",
        partTitle: chapter.partTitle || "",
        sceneIdx: si,
        sceneTitle: scene.title || "",
        text,
        // Move 3: the scene's entity links as names — BM25 scores over
        // text+links server-side and the excerpt shows the line; the
        // EMBEDDED text stays pure prose (vectors unpolluted).
        links: sceneLinksLine(project, scene),
        sha: "",
      });
    }
  }

  // Story-bible cards ride the same index (Move 1). The sha-diff adds them
  // incrementally and the all-mutations auto-watcher re-embeds an edited
  // entity's card like any changed chunk; deleting an entity removes its
  // card via the same diff (toRemove).
  chunks.push(...buildEntityCards(project));

  return chunks;
}

/**
 * Async form — identical to chunkProject() but fills `sha` with the SHA-1
 * of each chunk's plain text. The indexer always uses this form.
 *
 * @param {object} project — a live Pinia project store instance
 * @returns {Promise<Array<Chunk>>}
 */
export async function chunkProjectAsync(project) {
  const chunks = chunkProject(project);
  await Promise.all(
    chunks.map(async (chunk) => {
      // Scene shas cover text + links so a link edit re-uploads the chunk
      // (the server copy can never go stale; the redundant same-text re-embed
      // is one scene per edit — negligible). Cards sha their text alone.
      chunk.sha = await sha1Hex(chunk.links != null ? `${chunk.text}\n${chunk.links}` : chunk.text);
    }),
  );
  return chunks;
}
