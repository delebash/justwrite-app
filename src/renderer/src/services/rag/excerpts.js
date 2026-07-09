// The cited-excerpt formatter for the two RAG chats ("Ask the book" +
// character chat). Extracted from chat.js / characterChat.js where it lived
// as a duplicated function (QC-35: one source, no copies) — the Lab's chapter
// picker reuses it so a test excerpts block matches a real run's byte-shape.

/**
 * Format ranked hits into the cited excerpt block sent as the {{excerpts}}
 * variable (preserves the [1]/[2] reference numbers the citations panel and
 * the prompts' citation rules use).
 *
 * @param {Array<{ chunk: { chapterNum, chapterTitle, sceneTitle, sceneIdx, text } }>} hits
 * @returns {string}
 */
export function formatExcerpts(hits) {
  return hits
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
}
