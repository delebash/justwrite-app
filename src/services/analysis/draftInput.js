// The pieces every AI drafting input is composed of (moved out of characterDraft.js 2026-10-16,
// when the location / object / group sheets and Worldbuilding gained drafting — sheetDraft.js):
// headed blocks, the book's frame from the story-context composer, and the clamp the sanitizers
// share. Text the model reads stays English (ruled 2026-10-13).

import { composeBookContext } from "../storyContext.js";
import { cutToLength } from "@delebash/core/platform/text";

/** A headed block — "" when the body is empty, so an absent part leaves no heading behind. */
export const block = (heading, body) => (String(body || "").trim() ? `${heading}\n${String(body).trim()}` : "");

/** The non-empty blocks, a blank line apart. */
export const join = (...blocks) => blocks.filter(Boolean).join("\n\n");

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
/** The book's frame (premise, genre, world rules, Setting, main cast), within the budget. */
export function bookBlock(project, budgetTokens) {
  return block("BOOK CONTEXT", composeBookContext(project, { budgetTokens }).text);
}
/* eslint-enable i18next/no-literal-string */

/** A model's string → trimmed and capped; anything else → "". */
export const clamp = (v, max) => (typeof v === "string" ? cutToLength(v.trim(), max) : "");
