// The Lab test-data registry (§7.3; rebuilt per QC-35, 2026-07-09): JW
// registers (a) its listable book material — chapters + characters (the
// location picker is REMOVED: no prompt consumes a location, the user's
// word) — and (b) the per-ACTION affordance table below, one declaration per
// seeded action, each derived from that action's own prompt contract
// (seed_feature_prompts.py "You will be given:") and built on the feature's
// OWN composer (QC-35's law: the test input is what a real run sends —
// never a hand-rolled copy). Adapters read the LIVE stores lazily.
import { useProjectStore } from "../stores/project";
import { useSessionsStore } from "../stores/sessions.js";
import { t } from "../i18n/index.js";
import { composeCharacterAuditInput } from "./analysis/characterAudit.js";
import { composeSuggestInput } from "./analysis/characterDraft.js";
import { composeSuggestLocationsInput } from "./analysis/sheetDraft.js";
import { composeEntitySweepInput } from "./analysis/entityExtraction.js";
import { composeBeatSheetInput } from "./analysis/beatSheet.js";
import { composeMarketingPackInput } from "./analysis/marketingPack.js";
import { composePlotHolesInput } from "./analysis/plotHoleScan.js";
import { composeReaderKnowledgeInput } from "./analysis/readerKnowledge.js";
import { composeReverseOutlineInput } from "./analysis/reverseOutline.js";
import { composeVoiceDriftInput } from "./analysis/voiceDrift.js";
import { buildCharacterProfile } from "./rag/characterChat.js";
import { formatExcerpts } from "./rag/excerpts.js";
import { buildBriefingContext } from "./resumeBriefing.js";
import { buildRecapContext } from "./sessionRecap.js";
import { composeUnstuckInput } from "./stuckDiagnostic.js";
import { proseStoryContext } from "./storyContext.js";
import { storyContextVar, voiceCanonVar } from "./writerAI.js";

// TipTap scene bodies are HTML — strip to prose the way the run-path services
// do (pending AI-diff marks + scene markers removed, so the test input never
// carries editor scaffolding a real run strips).
function htmlToText(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  div.querySelectorAll(".ai-del").forEach((el) => { el.remove(); });
  div.querySelectorAll(".ai-ins").forEach((el) => { el.replaceWith(...el.childNodes); });
  div.querySelectorAll(".scene-mark").forEach((el) => { el.remove(); });
  return (div.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

function findChapter(project, chapterId) {
  return (project.allChapters || []).find((c) => c.id === chapterId) || null;
}

function chapterScenes(project, chapterId) {
  return (project.scenesFor?.(chapterId) || []).map((s, i) => ({
    scene: s,
    idx: i,
    text: htmlToText(s.body),
  }));
}

function chapterText(project, chapterId) {
  return chapterScenes(project, chapterId).map((s) => s.text).filter(Boolean).join("\n\n");
}

// The run-path chapter header (critique.js / entityExtraction.js et al.):
// "Chapter N — Title\n\n" — the seeded templates concatenate
// "{{chapter_label}}--- BEGIN CHAPTER ---", so the trailing blank line is
// part of the contract (the old bare-title fill rendered them fused).
/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
function chapterHeader(chapter) {
  if (!chapter?.title) return "";
  return `Chapter ${chapter.num != null ? `${chapter.num} — ` : ""}${chapter.title}\n\n`;
}
/* eslint-enable i18next/no-literal-string */

// ── the two listable sources ──
export const LAB_TEST_SOURCES = [
  {
    id: "chapters",
    labelKey: "lab.source.chapter",
    kindKey: "lab.source.chapter",
    list() {
      const p = useProjectStore();
      return (p.allChapters || []).map((c, i) => ({ id: c.id, label: c.title || t("chapters.read.chapterN", { num: i + 1 }) }));
    },
  },
  {
    id: "characters",
    labelKey: "characters.introTerms.character",
    kindKey: "characters.introTerms.character",
    list() {
      const p = useProjectStore();
      return (p.characters || []).map((c) => ({ id: c.id, label: c.name || t("batchFill.unnamed") }));
    },
  },
];

// ── picker fills ──

// A-group (chapter-prose prompts): the whole chapter behind the run's header.
function fillChapterProse(chapterId) {
  const p = useProjectStore();
  const c = findChapter(p, chapterId);
  const text = chapterText(p, chapterId);
  if (!text) throw new Error("This chapter has no prose yet.");
  return { chapter_label: chapterHeader(c), chapter_text: text };
}

// B-group (writerAI passage prompts): PASSAGE grain — the chapter's first
// non-empty scene, not the whole-chapter dump (a real run sends a selection),
// plus the same voiceCanon a real writer run sends (writerAI.js).
function fillPassage(chapterId) {
  const p = useProjectStore();
  const first = chapterScenes(p, chapterId).find((s) => s.text);
  if (!first) throw new Error("This chapter has no prose yet.");
  return { passage: first.text, voiceCanon: voiceCanonVar() };
}

// The prose actions (slice 2): the passage fill plus that scene's story context, composed within
// the budget of the model `action` is routed to — the same block a real run sends (writerAI.js
// storyContextVar, storyContext.js proseStoryContext). Line edits keep fillPassage (spec §9.5).
async function fillProsePassage(chapterId, action) {
  const p = useProjectStore();
  const first = chapterScenes(p, chapterId).find((s) => s.text);
  if (!first) throw new Error("This chapter has no prose yet.");
  const context = await proseStoryContext(p, { chapterId, sceneId: first.scene.id, action });
  return { passage: first.text, voiceCanon: voiceCanonVar(), storyContext: storyContextVar(context.text) };
}

// unstuck: the chapter TAIL — the honest "prose leading up to the cursor".
// The editor grabs ~1800 chars before the cursor (ChaptersView
// grabUnstuckContext(1800)); the tail of the chapter is the same grain.
function fillUnstuck(chapterId) {
  const p = useProjectStore();
  const c = findChapter(p, chapterId);
  const text = chapterText(p, chapterId);
  const tail = text.length > 1800 ? `…${text.slice(-1800)}` : text;
  return composeUnstuckInput({
    contextText: tail,
    chapterTitle: c?.title || "",
    chapterNum: c?.num ?? null,
  }).variables;
}

// chat pair: a chapter's scenes as the retrieved excerpts, through the run
// path's OWN formatter so the block carries the [1]/[2] cited byte-shape
// (rag/excerpts.js; capped at the run's default k=6 chunks).
function fillExcerpts(chapterId) {
  const p = useProjectStore();
  const c = findChapter(p, chapterId);
  const hits = chapterScenes(p, chapterId)
    .filter((s) => s.text)
    .slice(0, 6)
    .map((s) => ({
      chunk: {
        chapterNum: c?.num,
        chapterTitle: c?.title || "",
        sceneTitle: s.scene.title || "",
        sceneIdx: s.idx,
        text: s.text,
      },
    }));
  if (!hits.length) throw new Error("This chapter has no prose yet.");
  return { excerpts: formatExcerpts(hits) };
}

// characterChat's character leg: the SAME profile block a real run sends.
function fillCharacterChat(characterId) {
  const p = useProjectStore();
  const c = (p.characters || []).find((x) => x.id === characterId);
  if (!c) throw new Error("Character not found.");
  return {
    characterName: c.name || "",
    characterProfile: buildCharacterProfile(c, p.characterExtras?.[characterId] || null),
  };
}

// readerKnowledge: the composer over the picked chapter, with the going-in
// fact lists accumulated from the PERSISTED per-chapter results of the
// chapters before it (mirrors scanReaderKnowledge's own accumulation; an
// unscanned book degrades to the composer's honest "(nothing — first
// chapter…)" lines).
function fillReaderKnowledge(chapterId) {
  const p = useProjectStore();
  const all = p.allChapters || [];
  const priorReaderFacts = [];
  const priorPovFacts = [];
  for (const ch of all) {
    if (ch.id === chapterId) break;
    const rk = ch.readerKnowledge;
    if (!rk) continue;
    for (const f of rk.newReaderFacts || []) {
      if (!priorReaderFacts.includes(f)) priorReaderFacts.push(f);
    }
    for (const f of rk.newPovFacts || []) {
      if (!priorPovFacts.includes(f)) priorPovFacts.push(f);
    }
  }
  const c = findChapter(p, chapterId);
  const composed = composeReaderKnowledgeInput({
    html: p.chapterBody[chapterId] || "",
    chapterTitle: c?.title || "",
    chapterNum: c?.num ?? null,
    priorReaderFacts,
    priorPovFacts,
  });
  if (!composed) throw new Error("This chapter has no prose yet.");
  return composed.variables;
}

function fillEntitySweep(chapterId) {
  const p = useProjectStore();
  const c = findChapter(p, chapterId);
  return composeEntitySweepInput({
    html: p.chapterBody[chapterId] || "",
    chapterTitle: c?.title || "",
    chapterNum: c?.num ?? null,
    existingCharacters: p.characters || [],
    existingLocations: p.locations || [],
    existingObjects: p.objects || [],
  }).variables;
}

function fillCharacterAudit(characterId) {
  const p = useProjectStore();
  const composed = composeCharacterAuditInput(p, characterId);
  if (!composed) {
    throw new Error("This character isn't linked to any scenes yet — link them to a scene first.");
  }
  return composed.variables;
}

function fillVoiceDrift(chapterId) {
  const p = useProjectStore();
  return composeVoiceDriftInput(p, chapterId).variables;
}

// "From this book" composers — the book is the argument; each button runs
// the feature's own composer over the live project. A composer's honest
// refusal ("Need at least three chapters…") surfaces as the Lab's toast.
function composeRecap() {
  const { meta, prompt } = buildRecapContext({ project: useProjectStore(), sessions: useSessionsStore() });
  if (!meta.eligible || !prompt) {
    throw new Error(
      meta.reason === "no-writing-today"
        ? "No writing recorded today yet — the recap composes from today's session."
        : "Today's chapter has no prose to recap yet.",
    );
  }
  return { user_content: prompt };
}

function composeBriefing() {
  const { meta, prompt } = buildBriefingContext({ project: useProjectStore(), sessions: useSessionsStore() });
  if (!meta.eligible || !prompt) {
    throw new Error(
      meta.reason === "no-last-edit"
        ? "No previous writing session yet — the briefing composes from your last session."
        : "The last chapter has no prose to brief on yet.",
    );
  }
  return { user_content: prompt };
}

// ── the per-action affordance table (all 37 seeded actions) ──
/* eslint-disable i18next/no-literal-string -- names of the seeded Lab samples, matched exactly */
const chapterProse = { pickers: [{ source: "chapters", fill: fillChapterProse }], samples: ["Chapter for critique"] };
const passageEdit = { pickers: [{ source: "chapters", fill: fillPassage }], samples: ["Flabby paragraph"] };
/* eslint-enable i18next/no-literal-string */
const proseFill = (action, samples) => ({
  pickers: [{ source: "chapters", fill: (id) => fillProsePassage(id, action) }],
  samples,
});
/* eslint-disable i18next/no-literal-string -- names of the seeded Lab samples, matched exactly */
const proseEdit = (action) => proseFill(action, ["Flabby paragraph", "With story context"]);
const proseGenerate = (action) => proseFill(action, ["Storm at the lighthouse", "Guided continuation", "With story context"]);
/* eslint-enable i18next/no-literal-string */

export const LAB_TEST_ACTIONS = {
  // A — chapter-prose prompts ({{chapter_label}}/{{chapter_text}})
  critique: chapterProse,
  critiqueStructure: chapterProse,
  foreshadowing: { pickers: [{ source: "chapters", fill: fillChapterProse }], samples: ["Chapter for foreshadowing"] },
  multiReaderGenre: chapterProse,
  multiReaderLiterary: chapterProse,
  multiReaderAgent: chapterProse,
  multiReaderBookClub: chapterProse,

  // B — writerAI passage prompts ({{passage}} at selection grain)
  "writerAI.rewrite": proseEdit("writerAI.rewrite"),
  "writerAI.expand": proseGenerate("writerAI.expand"),
  "writerAI.tighten": proseEdit("writerAI.tighten"),
  "writerAI.continue": proseGenerate("writerAI.continue"),
  "writerAI.describe": proseGenerate("writerAI.describe"),
  "writerAI.guided-continue": proseGenerate("writerAI.guided-continue"), // {{direction}} stays typed; the samples provide one
  "writerAI.guided-rewrite": proseFill("writerAI.guided-rewrite", ["Rewrite with a direction", "With story context"]),
  "writerAI.dialogue": proseFill("writerAI.dialogue", ["Dialogue at the lamp", "With story context"]),
  "writerAI.rule.show-dont-tell": passageEdit,
  "writerAI.rule.passive-voice": passageEdit,
  "writerAI.rule.filter-words": passageEdit,
  "writerAI.rule.dialogue-tags": passageEdit,
  "writerAI.rule.sensory-grounding": passageEdit,
  "writerAI.rule.sentence-variety": passageEdit,
  "writerAI.rule.prose-tightening": passageEdit,

  // C — composed-from-book digests ({{user_content}} via each feature's composer)
  readerKnowledge: { pickers: [{ source: "chapters", fill: fillReaderKnowledge }], samples: ["Reader knowledge chapter"] },
  entitySweep: { pickers: [{ source: "chapters", fill: fillEntitySweep }], samples: ["Chapter for entity sweep"] },
  characterAudit: { pickers: [{ source: "characters", fill: fillCharacterAudit }], samples: ["Character audit scenes"] },
  // Fill from book's two passes ride the audit's composer (characterProfile.js) — declared
  // 2026-10-11; they had been seeded without a Lab entry since 2026-07-18/19.
  characterProfile: { pickers: [{ source: "characters", fill: fillCharacterAudit }], samples: ["Character audit scenes"] },
  characterVoice: { pickers: [{ source: "characters", fill: fillCharacterAudit }], samples: ["Character audit scenes"] },
  voiceDrift: { pickers: [{ source: "chapters", fill: fillVoiceDrift }], samples: ["Voice drift comparison"] },
  plotHoles: {
    compose: { run: () => composePlotHolesInput(useProjectStore()).variables },
    samples: ["Book digest (plot holes)"],
  },
  beatSheet: {
    // The modal's default framework (TEMPLATE_OPTIONS[0] — the user's decided
    // default for the compose button; composeBeatSheetInput defaults to it).
    compose: { run: () => composeBeatSheetInput(useProjectStore()).variables },
    samples: ["Beat sheet framework"],
  },
  reverseOutline: {
    compose: { run: () => composeReverseOutlineInput(useProjectStore()).variables },
    samples: ["Reverse outline digest"],
  },
  marketingPack: {
    compose: { run: () => composeMarketingPackInput(useProjectStore()).variables },
    samples: ["Marketing pack digest"],
  },
  recap: { compose: { run: composeRecap }, samples: ["Session recap context"] },
  // Suggest characters: the book's frame + the cast (characterDraft.js), with no story-context
  // ceiling — the Lab has no routed window to take a share of.
  suggestCharacters: { compose: { run: () => composeSuggestInput(useProjectStore()).variables }, samples: ["Suggest characters"] },
  // Suggest locations (2026-10-16): the book's frame + the locations it has (sheetDraft.js).
  suggestLocations: { compose: { run: () => composeSuggestLocationsInput(useProjectStore()).variables }, samples: ["Suggest locations"] },
  briefing: { compose: { run: composeBriefing }, samples: ["Resume briefing context"] },
  // relationshipArc: a single dropdown can't honestly pick a PAIR —
  // sample + type only (the user's decided word).
  relationshipArc: { samples: ["Relationship arc pair"] },

  // D — freeform user intent (no book data belongs; type it or Sample)
  brainstorm: { samples: ["Brainstorm seed"] },
  brainstormPlot: { samples: ["Brainstorm seed"] },
  sensory: { samples: ["Sensory subject"] },
  // The AI drafting from a description — the writer types it (2026-10-11).
  characterProfileDraft: { samples: ["Character from a description"] },
  characterVoiceDraft: { samples: ["Character from a description"] },
  characterSection: { samples: ["Character sheet section"] },
  // The story-world sheets and a worldbuilding article (2026-10-16) — the writer describes them.
  locationDraft: { samples: ["Location from a description"] },
  objectDraft: { samples: ["Object from a description"] },
  groupDraft: { samples: ["Group from a description"] },
  worldbuildingDraft: { samples: ["Worldbuilding article"] },
  // unstuck is book prose in disguise — the chapter TAIL is where they're stuck.
  unstuck: { pickers: [{ source: "chapters", fill: fillUnstuck }], samples: ["Stuck prose"] },

  // E — the chat pair ({{question}} typed; excerpts through the run formatter)
  chat: { pickers: [{ source: "chapters", fill: fillExcerpts }], samples: ["Cited excerpts question"] },
  characterChat: {
    pickers: [
      { source: "chapters", fill: fillExcerpts },
      { source: "characters", fill: fillCharacterChat },
    ],
    samples: ["Ask Mira in character (cited)"],
  },
};
