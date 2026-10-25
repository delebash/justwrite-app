// Per-chapter foreshadowing / dangling-thread extraction.
//
// Asks the model to identify *setups* in a chapter — narrative
// promises that demand later payoff. Returns structured proposals that
// downstream code can match against later chapters (to flag what's
// dangling) and the user can review one-by-one (to drop Loose-thread
// markers).
//
// Setup categories (the LLM picks one per item):
//   - promise:  "they vowed to find him"
//   - object:   "she pocketed the locket"
//   - question: "why was the door locked from inside?"
//   - ability:  "he could hear thoughts when tired"
//   - secret:   "Marcus hadn't told anyone about the basement"
//   - threat:   "the council would learn of this"
//   - debt:     "I owe you one"
//
// JSON return shape per proposal:
//   {
//     snippet:  string,   // verbatim phrase from the chapter, 4-15 words
//     label:    string,   // short reminder, what's being set up
//     kind:     string,   // one of the categories above
//     keyTerm:  string,   // a distinctive noun/phrase to grep later chapters with
//   }

import { runJsonAnalysis } from "../runJson.js";
import { htmlToText } from "../text.js";
import { t } from "../../i18n/index.js";
import { cutToLength } from "@delebash/core/platform/text";

const ALLOWED_KINDS = new Set([
  "promise", "object", "question", "ability", "secret", "threat", "debt",
]);

// The prompt lives server-side (features.py, action "foreshadowing").

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
export async function extractThreads({
  html,
  chapterTitle = "",
  chapterNum = null,
  signal,
  provider,
  model,
  meta = {},
  task,
} = {}) {
  const text = htmlToText(html, { stripSceneMarks: false, tidyLines: true }).trim();
  if (!text) {
    return { setups: [], raw: "" };
  }

  const header = chapterTitle
    ? `Chapter ${chapterNum != null ? `${chapterNum} — ` : ""}${chapterTitle}\n\n`
    : "";

  const { result, parsed } = await runJsonAnalysis({
    action: "foreshadowing",
    feature: "foreshadowing",
    variables: { chapter_label: header, chapter_text: text },
    signal,
    provider,
    model,
    meta,
    task: task || { label: t("sessionRecap.threadTaskLabel"), meta },
  });

  const rawSetups = Array.isArray(parsed.setups) ? parsed.setups : Array.isArray(parsed) ? parsed : [];

  const setups = [];
  for (const s of rawSetups) {
    if (!s || typeof s.snippet !== "string") continue;
    const snippet = s.snippet.trim();
    if (snippet.length < 4) continue;
    const label = typeof s.label === "string" ? cutToLength(s.label.trim(), 120) : "";
    const kind = ALLOWED_KINDS.has(s.kind) ? s.kind : "promise";
    const keyTerm = typeof s.keyTerm === "string"
      ? cutToLength(s.keyTerm.trim(), 80)
      : "";
    setups.push({ snippet, label, kind, keyTerm });
    if (setups.length >= 12) break;
  }

  return {
    setups,
    raw: result.content,
    model: result.model,
    providerId: result.providerId,
  };
}
/* eslint-enable i18next/no-literal-string */
