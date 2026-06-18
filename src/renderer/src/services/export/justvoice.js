// ============================================================
// justvoice.js — build + send the justwrite/v1 export document.
//
// JustVoice (the standalone voice-production server, CONTRACT.md in
// its repo) ingests a whole book via
//   POST {base}/v1/projects/import?source=justwrite[&dry_run=true]
// with this raw JSON body:
//
//   {
//     schema: "justwrite/v1",
//     book: { title, author, language, description },
//     characters: [{ id, name, voice_hint, notes }],
//     chapters: [{ id, title, lines: [{ character_id, text,
//                                       delivery, pause_after_ms }] }],
//     lexicon: []
//   }
//
// Line sources, per chapter:
//   1. studio.scripts[chapterId] when the writer has run Script
//      analysis — speaker attribution travels with each line; scene
//      markers become a longer pause on the preceding line.
//   2. Fallback: the normalized manuscript model (same builder the
//      PDF/DOCX/EPUB adapters use) — every paragraph is a narrator
//      line, scene breaks become pauses.
//
// JustVoice creates one Persona per character (create-or-reuse) and
// one Block per line, so the book arrives fully cast-ready.
// ============================================================

import { buildManuscript } from "./manuscript.js";

export const DEFAULT_JUSTVOICE_URL = "http://127.0.0.1:17494";
const URL_STORAGE_KEY = "jw.justvoice.url";

export function loadJustVoiceUrl() {
  try {
    return localStorage.getItem(URL_STORAGE_KEY) || DEFAULT_JUSTVOICE_URL;
  } catch {
    return DEFAULT_JUSTVOICE_URL;
  }
}

export function saveJustVoiceUrl(url) {
  try {
    localStorage.setItem(URL_STORAGE_KEY, url || DEFAULT_JUSTVOICE_URL);
  } catch { /* storage unavailable — non-fatal */ }
}

// Pause used where a scene break / scene marker sat between lines.
const SCENE_BREAK_PAUSE_MS = 1200;

/** A short human voice-casting hint from the roster fields. */
function voiceHint(c) {
  const bits = [];
  if (c.gender) bits.push(c.gender);
  if (c.age != null && c.age !== "") bits.push(`age ${c.age}`);
  if (c.role) bits.push(c.role);
  return bits.length ? bits.join(", ") : null;
}

/** Lines from the normalized manuscript blocks — every paragraph is a
 * narrator line, scene breaks become pauses. (JustWrite is writing-only;
 * JustVoice runs its own speaker analysis + casting on import.) */
function linesFromManuscriptBlocks(blocks) {
  const lines = [];
  for (const b of blocks || []) {
    if (b.kind === "scene-break") {
      if (lines.length) lines[lines.length - 1].pause_after_ms = SCENE_BREAK_PAUSE_MS;
      continue;
    }
    // Headings are structure, not narration — the chapter title already
    // travels as chapters[].title.
    if (b.kind === "h1" || b.kind === "h2" || b.kind === "page-break") continue;
    const text = (b.text || "").trim();
    if (!text) continue;
    lines.push({ character_id: "narrator", text, delivery: null, pause_after_ms: null });
  }
  return lines;
}

/**
 * Build the justwrite/v1 document from the project store.
 * Pure — no network, no store mutation. Chapters travel as narrator prose;
 * JustVoice does its own speaker attribution + casting on import.
 */
export function buildJustVoiceDoc(project) {
  const manuscript = buildManuscript(project);
  const blocksByChapter = {};
  for (const part of manuscript.parts) {
    for (const ch of part.chapters) blocksByChapter[ch.id] = ch.blocks;
  }

  const chapters = project.allChapters.map((c) => ({
    id: c.id,
    title: c.title || null,
    lines: linesFromManuscriptBlocks(blocksByChapter[c.id]),
  }));

  const characters = [
    { id: "narrator", name: "Narrator", voice_hint: null, notes: "Narration voice for unattributed prose." },
    ...project.characters.map((c) => ({
      id: c.id,
      name: c.name || c.id,
      voice_hint: voiceHint(c),
      notes: c.oneLiner || null,
    })),
  ];

  return {
    schema: "justwrite/v1",
    book: {
      title: project.project.title || "Untitled",
      author: project.project.author || "",
      language: "en-US",
      description: project.project.subtitle || null,
    },
    characters,
    chapters,
    lexicon: [],
  };
}

/** Stats the Export pane shows before sending. */
export function describeJustVoiceDoc(doc) {
  const lines = doc.chapters.reduce((n, c) => n + c.lines.length, 0);
  const attributed = doc.chapters.reduce(
    (n, c) => n + c.lines.filter((l) => l.character_id && l.character_id !== "narrator").length,
    0,
  );
  return {
    chapters: doc.chapters.length,
    lines,
    attributed,
    characters: doc.characters.length,
  };
}

/**
 * POST the document to a JustVoice server. Returns the server's
 * ImportRunResponse: { committed, project_id, standard, warnings }.
 */
export async function sendToJustVoice({ doc, baseUrl, dryRun = false, signal } = {}) {
  const base = (baseUrl || DEFAULT_JUSTVOICE_URL).replace(/\/$/, "");
  const qs = `source=justwrite${dryRun ? "&dry_run=true" : ""}`;
  let res;
  try {
    res = await fetch(`${base}/v1/projects/import?${qs}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
      signal,
    });
  } catch (err) {
    throw new Error(
      `Couldn't reach JustVoice at ${base} — is the server running? (${err.message})`,
    );
  }
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.detail || ""; } catch { /* non-JSON error body */ }
    throw new Error(`JustVoice rejected the import (${res.status}${detail ? `: ${detail}` : ""})`);
  }
  return res.json();
}
