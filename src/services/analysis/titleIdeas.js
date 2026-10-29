// Title ideas (Brainstorm where it's used, 2026-10-28): Brainstorm's Titles category at the book's
// title (Settings → Project), a chapter's and a scene's (the editor's header) — a round for the
// Brainstorm panel (useBrainstorm): the writer's seed, then what the title is for — the book, the
// chapter and its scenes, the scene's Summary and opening — never a title already in use. The same
// shape as Name ideas (characterDraft.js nameIdeasRequest, sheetDraft.js sheetNameIdeasRequest).
import { brainstormAction, brainstormPrompt, seedFor } from "../brainstorm.js";
import { storyBudgetFor } from "../storyContext.js";
import { htmlToText } from "../text.js";
import { block, bookBlock, join } from "./draftInput.js";

const CATEGORY = "title";
// how much of a scene's prose says how it opens
const OPENING_CHARS = 600;

const sceneLine = (scn) => scn.title || htmlToText(scn.summary || "") || htmlToText(scn.body || "").slice(0, 120);

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
/** The round's input for one title: `target` "book" | "chapter" | "scene" (the scene's chapter in
 *  `chapterId`). */
export function composeTitleIdeasInput(project, { target, chapterId, sceneId, seed: own = "", liked = [], seen = [], budgetTokens = null } = {}) {
  const action = brainstormAction(CATEGORY);
  const book = bookBlock(project, budgetTokens);
  const fits = book ? ", fitting the book in BOOK CONTEXT" : "";
  let about = "";
  let what = "titles for the book in BOOK CONTEXT";
  if (target === "chapter" || target === "scene") {
    const ch = project.chapterById(chapterId);
    if (!ch) throw new Error(`No chapter ${chapterId}.`);
    const scenes = project.scenesFor(chapterId);
    if (target === "chapter") {
      const lines = scenes.map((s, i) => `- Scene ${i + 1}: ${sceneLine(s)}`);
      about = block("THE CHAPTER", [`Chapter ${ch.num}`, ch.title ? `Its title now: ${ch.title}` : "", lines.length ? `Its scenes:\n${lines.join("\n")}` : ""].filter(Boolean).join("\n"));
      what = `titles for the chapter in THE CHAPTER${fits}`;
    } else {
      const scn = scenes.find((s) => s.id === sceneId);
      if (!scn) throw new Error(`No scene ${sceneId}.`);
      const opening = htmlToText(scn.body || "").slice(0, OPENING_CHARS);
      about = block("THE SCENE", [
        `In chapter ${ch.num}${ch.title ? `: ${ch.title}` : ""}`,
        scn.title ? `Its title now: ${scn.title}` : "",
        scn.summary ? `Summary: ${htmlToText(scn.summary)}` : "",
        opening ? `How it opens: ${opening}` : "",
      ].filter(Boolean).join("\n"));
      what = `titles for the scene in THE SCENE${fits}`;
    }
  }
  const user_content = join(book, about, brainstormPrompt({ category: CATEGORY, seed: seedFor(own, what), liked, seen }));
  return { action, variables: { user_content } };
}
/* eslint-enable i18next/no-literal-string */

/** The titles already in use for that kind of title — never shown as ideas. */
function takenTitles(project, target, chapterId) {
  if (target === "chapter") return project.allChapters.map((c) => c.title);
  if (target === "scene") return project.scenesFor(chapterId).map((s) => s.title);
  return [project.project?.title];
}

/** Title ideas' request for useBrainstorm. */
export async function titleIdeasRequest({ project, target, chapterId, sceneId, seed = "", liked = [], seen = [], budgetTokens } = {}) {
  const budget = await storyBudgetFor("brainstorm", brainstormAction(CATEGORY), budgetTokens);
  const request = composeTitleIdeasInput(project, { target, chapterId, sceneId, seed, liked, seen, budgetTokens: budget });
  return { ...request, exclude: takenTitles(project, target, chapterId).filter(Boolean) };
}
