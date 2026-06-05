// Manuscript chunker — splits a project into per-scene Chunk objects for RAG
// indexing. Two exports:
//   chunkProject(project)       — sync, no sha (fast path for diff checks)
//   chunkProjectAsync(project)  — async, fills sha via crypto.subtle

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
        sha: "",
      });
    }
  }

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
      chunk.sha = await sha1Hex(chunk.text);
    }),
  );
  return chunks;
}
