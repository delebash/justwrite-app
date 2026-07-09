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
import { composeCharacterAuditInput } from "./analysis/characterAudit.js";
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
import { voiceCanonVar } from "./writerAI.js";

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
function chapterHeader(chapter) {
  if (!chapter?.title) return "";
  return `Chapter ${chapter.num != null ? `${chapter.num} — ` : ""}${chapter.title}\n\n`;
}

// ── the two listable sources ──
export const LAB_TEST_SOURCES = [
  {
    id: "chapters",
    label: "chapter",
    kind: "chapter",
    list() {
      const p = useProjectStore();
      return (p.allChapters || []).map((c, i) => ({ id: c.id, label: c.title || `Chapter ${i + 1}` }));
    },
  },
  {
    id: "characters",
    label: "character",
    kind: "character",
    list() {
      const p = useProjectStore();
      return (p.characters || []).map((c) => ({ id: c.id, label: c.name || "Unnamed" }));
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
const chapterProse = { pickers: [{ source: "chapters", fill: fillChapterProse }], samples: ["Chapter for critique"] };
const passageEdit = { pickers: [{ source: "chapters", fill: fillPassage }], samples: ["Flabby paragraph"] };
const passageGenerate = {
  pickers: [{ source: "chapters", fill: fillPassage }],
  samples: ["Storm at the lighthouse", "Guided continuation"],
};

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
  "writerAI.rewrite": passageEdit,
  "writerAI.expand": passageGenerate,
  "writerAI.tighten": passageEdit,
  "writerAI.continue": passageGenerate,
  "writerAI.describe": passageGenerate,
  "writerAI.guided-continue": passageGenerate, // {{direction}} stays typed; the samples provide one
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
  briefing: { compose: { run: composeBriefing }, samples: ["Resume briefing context"] },
  // relationshipArc: a single dropdown can't honestly pick a PAIR —
  // sample + type only (the user's decided word).
  relationshipArc: { samples: ["Relationship arc pair"] },

  // D — freeform user intent (no book data belongs; type it or Sample)
  brainstorm: { samples: ["Brainstorm seed"] },
  brainstormPlot: { samples: ["Brainstorm seed"] },
  sensory: { samples: ["Sensory subject"] },
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
