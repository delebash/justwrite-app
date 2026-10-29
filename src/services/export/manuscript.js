// ============================================================
// manuscript.js — normalize project data into a renderer-agnostic
// "manuscript model" so the PDF / DOCX / EPUB adapters all consume
// the same shape.
//
//   {
//     title, author, subtitle, genre, language,
//     parts: [{ id, title, chapters: [{ id, num, title, blocks }] }],
//   }
//
// Each block is `{ kind, text, runs }` where kind is one of:
//   "h1" | "h2" | "p" | "blockquote" | "scene-break" | "page-break" | "ul-item" | "image"
// `text` is the block's plain text; `runs` is the same text with its inline formatting — each
// `{ text, italic, bold, underline, strike, sup, sub }`, a line break `{ br: true }` — which the
// exporters write as their own (2026-10-29: every export used to keep the plain text alone, so a
// novel's italics, bold and line breaks were lost). An "image" block is `{ kind, src, alt }`: a
// picture in a scene (exportImages.js loads it).
//
// Chapters with empty bodies get a synthetic h1 from the chapter title
// so downstream renderers always have at least a heading to lay out.
// ============================================================

import { tBook } from "../../i18n/index.js";

export function buildManuscript(project, { stripSceneStructure = false } = {}) {
  // The book's language (Settings → Project): the exporters write their own words in it.
  const language = project.project.language || "en";
  return {
    title:    project.project.title || tBook(language, "common.untitled"),
    author:   project.project.author || "",
    subtitle: project.project.subtitle || "",
    genre:    project.project.genre || "",
    language,
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
    div.querySelectorAll("h2.scene-title, p.scene-mark").forEach((el) => { el.remove(); });
  }

  // Pending AI revisions are authoring chrome and never belong in a
  // published export. Drop deletions outright; unwrap insertions so the
  // proposed prose ships as plain text. Same policy as Read mode.
  div.querySelectorAll("del[data-ai-del], .ai-del").forEach((el) => { el.remove(); });
  div.querySelectorAll("ins[data-ai-ins], .ai-ins").forEach((el) => { el.replaceWith(...el.childNodes); });
  // Editorial comments are inline notes, not prose — strip the mark but
  // keep the underlying text (the comment text itself lives in a data-attr
  // and is invisible in the exported document).
  div.querySelectorAll("span.comment-mark").forEach((el) => { el.replaceWith(...el.childNodes); });
  // The AI-text mark is the writer's own record, never part of the published text (2026-10-18).
  div.querySelectorAll("span[data-ai-text]").forEach((el) => { el.replaceWith(...el.childNodes); });

  // Ensure every chapter has a top-level heading.
  let sawHeading = false;
  // A block with text: its runs, and the plain text they spell (a line break reads as a space).
  const textBlock = (kind, el) => {
    const runs = inlineRuns(el);
    return { kind, text: plainText(runs), runs };
  };
  for (const node of div.childNodes) {
    if (node.nodeType !== 1) continue;
    const tag = node.tagName.toLowerCase();
    // a picture: the scene's own image node, or one inside a paragraph (pasted HTML)
    if (tag === "img") { pushImage(blocks, node); continue; }
    if (tag === "p" && node.querySelector("img")) for (const img of node.querySelectorAll("img")) pushImage(blocks, img);
    const text = node.textContent?.replace(/\s+/g, " ").trim();
    if (!text && tag !== "hr") continue;

    if (tag === "h1") { blocks.push(textBlock("h1", node)); sawHeading = true; }
    else if (tag === "h2") blocks.push(textBlock("h2", node));
    else if (tag === "h3") blocks.push(textBlock("h2", node)); // promote h3 to h2
    else if (tag === "blockquote") blocks.push(textBlock("blockquote", node));
    else if (tag === "hr") blocks.push({ kind: "scene-break", text: "" });
    else if (tag === "div" && node.classList.contains("page-break")) blocks.push({ kind: "page-break", text: "" });
    else if (tag === "ul" || tag === "ol") {
      for (const li of node.querySelectorAll("li")) {
        if (li.textContent?.trim()) blocks.push(textBlock("ul-item", li));
      }
    }
    else if (tag === "p") {
      // The seed data marks scene breaks as <p class="scene-mark">i</p>.
      // Translate those into structural scene-break blocks.
      if (node.classList.contains("scene-mark")) {
        blocks.push({ kind: "scene-break", text });
      } else {
        blocks.push(textBlock("p", node));
      }
    }
    else if (text) blocks.push(textBlock("p", node));
  }

  if (!sawHeading && fallbackTitle) {
    blocks.unshift({ kind: "h1", text: fallbackTitle });
  }
  return blocks;
}

// The inline formatting a run can carry, by the editor's tags (StarterKit's em/strong/s, Underline's u,
// Subscript's sub, Superscript's sup; i/b/del/strike from pasted HTML).
const FORMAT_BY_TAG = {
  em: "italic", i: "italic", strong: "bold", b: "bold", u: "underline",
  s: "strike", del: "strike", strike: "strike", sup: "sup", sub: "sub",
};
const FORMATS = ["italic", "bold", "underline", "strike", "sup", "sub"];

/**
 * An element's text as runs: `{ text, italic?, bold?, underline?, strike?, sup?, sub? }` and
 * `{ br: true }` for a line break. Whitespace collapses as HTML does; neighbouring runs with the
 * same formatting merge; the block's leading and trailing spaces go. Pictures aren't text.
 */
export function inlineRuns(el) {
  const runs = [];
  const walk = (node, fmt) => {
    if (node.nodeType === 3) {
      const text = node.nodeValue.replace(/\s+/g, " ");
      if (!text) return;
      const last = runs[runs.length - 1];
      if (last && !last.br && FORMATS.every((k) => !!last[k] === !!fmt[k])) last.text += text;
      else runs.push({ text, ...fmt });
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === "br") { runs.push({ br: true }); return; }
    if (tag === "img") return;
    const own = FORMAT_BY_TAG[tag];
    const next = own ? { ...fmt, [own]: true } : fmt;
    for (const child of node.childNodes) walk(child, next);
  };
  walk(el, {});
  // one space between runs, none at either end of the block or around a line break
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    if (r.br) continue;
    const prev = runs[i - 1];
    if (!prev || prev.br || prev.text.endsWith(" ")) r.text = r.text.replace(/^ +/, "");
    const after = runs[i + 1];
    if (!after || after.br) r.text = r.text.replace(/ +$/, "");
  }
  return runs.filter((r) => r.br || r.text);
}

/** The runs' plain text — a line break reads as a space. */
export function plainText(runs) {
  return runs.map((r) => (r.br ? " " : r.text)).join("").replace(/\s+/g, " ").trim();
}

function pushImage(blocks, img) {
  const src = img.getAttribute("src");
  if (src) blocks.push({ kind: "image", src, alt: (img.getAttribute("alt") || "").trim() });
}

/** A rich field's HTML (a description, an article) as blocks — a chapter's without its heading. */
export const htmlBlocks = (html) => blocksFromHtml(html, "");

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
