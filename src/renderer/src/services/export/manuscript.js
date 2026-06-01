// ============================================================
// manuscript.js — normalize project data into a renderer-agnostic
// "manuscript model" so the PDF / DOCX / EPUB adapters all consume
// the same shape.
//
//   {
//     title, author, subtitle, genre,
//     parts: [{ id, title, chapters: [{ id, num, title, blocks }] }],
//   }
//
// Each block is `{ kind, text }` where kind is one of:
//   "h1" | "h2" | "p" | "blockquote" | "scene-break" | "ul-item"
//
// Chapters with empty bodies get a synthetic h1 from the chapter title
// so downstream renderers always have at least a heading to lay out.
// ============================================================

export function buildManuscript(project, { stripSceneStructure = false } = {}) {
  return {
    title:    project.project.title || "Untitled",
    author:   project.project.author || "",
    subtitle: project.project.subtitle || "",
    genre:    project.project.genre || "",
    // Optional cover image (imageStore record). EPUB / PDF adapters
    // resolve it to bytes via `readImageBytes` so this stays serializable.
    coverImage: project.project.coverImage || null,
    parts: project.parts.map((p) => ({
      id: p.id,
      title: p.title,
      chapters: p.chapters.map((c) => ({
        id: c.id,
        num: c.num,
        title: c.title,
        blocks: blocksFromHtml(project.chapterBody[c.id], c.title, { stripSceneStructure }),
      })),
    })),
  };
}

/**
 * Walk a chapter's HTML body and emit a flat list of blocks. We don't
 * use a full HTML parser — the rich editor produces a constrained set
 * of node types (StarterKit), so a straightforward DOM traversal in a
 * detached div is sufficient and avoids bundling an XML parser.
 */
function blocksFromHtml(html, fallbackTitle = "", { stripSceneStructure = false } = {}) {
  const blocks = [];
  const div = document.createElement("div");
  div.innerHTML = html || "";

  // Continuous-prose mode: drop scene titles and "* * *" marks before
  // walking, so the chapter flows as one uninterrupted body.
  if (stripSceneStructure) {
    div.querySelectorAll("h2.scene-title, p.scene-mark").forEach((el) => el.remove());
  }

  // Pending AI revisions are authoring chrome and never belong in a
  // published export. Drop deletions outright; unwrap insertions so the
  // proposed prose ships as plain text. Same policy as Read mode.
  div.querySelectorAll("del[data-ai-del], .ai-del").forEach((el) => el.remove());
  div.querySelectorAll("ins[data-ai-ins], .ai-ins").forEach((el) => el.replaceWith(...el.childNodes));
  // Editorial comments are inline notes, not prose — strip the mark but
  // keep the underlying text (the comment text itself lives in a data-attr
  // and is invisible in the exported document).
  div.querySelectorAll("span.comment-mark").forEach((el) => el.replaceWith(...el.childNodes));

  // Ensure every chapter has a top-level heading.
  let sawHeading = false;
  for (const node of div.childNodes) {
    if (node.nodeType !== 1) continue;
    const tag = node.tagName.toLowerCase();
    const text = node.textContent?.replace(/\s+/g, " ").trim();
    if (!text && tag !== "hr") continue;

    if (tag === "h1") { blocks.push({ kind: "h1", text }); sawHeading = true; }
    else if (tag === "h2") blocks.push({ kind: "h2", text });
    else if (tag === "h3") blocks.push({ kind: "h2", text }); // promote h3 to h2
    else if (tag === "blockquote") blocks.push({ kind: "blockquote", text });
    else if (tag === "hr") blocks.push({ kind: "scene-break", text: "" });
    else if (tag === "ul" || tag === "ol") {
      for (const li of node.querySelectorAll("li")) {
        const t = li.textContent?.replace(/\s+/g, " ").trim();
        if (t) blocks.push({ kind: "ul-item", text: t });
      }
    }
    else if (tag === "p") {
      // The seed data marks scene breaks as <p class="scene-mark">i</p>.
      // Translate those into structural scene-break blocks.
      if (node.classList.contains("scene-mark")) {
        blocks.push({ kind: "scene-break", text });
      } else {
        blocks.push({ kind: "p", text });
      }
    }
    else if (text) blocks.push({ kind: "p", text });
  }

  if (!sawHeading && fallbackTitle) {
    blocks.unshift({ kind: "h1", text: fallbackTitle });
  }
  return blocks;
}

/**
 * Convenience: yield every chapter across all parts as a flat array,
 * each entry tagged with its parent part. Useful for renderers that
 * want one long iteration loop.
 */
export function flattenChapters(manuscript) {
  const out = [];
  for (const part of manuscript.parts) {
    for (const ch of part.chapters) {
      out.push({ ...ch, partId: part.id, partTitle: part.title });
    }
  }
  return out;
}

/** Filename slug — lowercase, alnum + hyphen, no leading/trailing dash. */
export function slug(s = "untitled") {
  return s.toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "untitled";
}
