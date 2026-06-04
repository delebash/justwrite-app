<script setup>
// Speaker-analysis debug lab. Hidden route: /#/debug/speaker-lab
//
// Lets you paste/load text, run a 1- or 2-stage LLM pipeline against any
// configured OpenAI-compatible provider (Ollama, OpenAI, etc.), tweak the
// prompts live, and watch streaming output with token/word/elapsed counters.
// Pipelines run independently per column so different models can be A/B'd.
//
// Stage 1 = entity extraction (who appears?). Its parsed JSON is summarized
// and interpolated into Stage 2 = quote attribution (who said what?) via
// the {{cast}} template variable. {{text}} is always the input passage.

import { ref, reactive, computed, watch } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useAiStore } from "../stores/ai.js";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import ModelPicker from "../components/ModelPicker.vue";
import ProviderSelect from "../components/ProviderSelect.vue";
import { OpenAICompatClient } from "../services/openai-compat.js";
import { TIERS, TIER_IDS } from "../services/modelMeta.js";
import JwButton from "@renderer/components/ui/JwButton.vue";
import JwInput from "@renderer/components/ui/JwInput.vue";
import JwTextarea from "@renderer/components/ui/JwTextarea.vue";
import JwNumber from "@renderer/components/ui/JwNumber.vue";
import JwCheckbox from "@renderer/components/ui/JwCheckbox.vue";
import JwSelect from "@renderer/components/ui/JwSelect.vue";

const project = useProjectStore();
const ai = useAiStore();

// ─── Input ───────────────────────────────────────────────────────────
const inputText = ref("");
const loadedChapterId = ref("");
// Cached raw HTML for the loaded chapter so Studio-mode pre-processing
// (h2.scene-title / p.scene-mark removal, <p>-based splitting) has the
// original markup, not the flattened plain text.
const loadedChapterHtml = ref("");
const inputWordCount = computed(() => countWords(inputText.value));
const inputCharCount = computed(() => inputText.value.length);
const approxInputTokens = computed(() => Math.ceil(inputCharCount.value / 4));

function loadChapter(id) {
  loadedChapterId.value = id;
  if (!id) { loadedChapterHtml.value = ""; return; }
  const html = project.chapterBody?.[id] || "";
  loadedChapterHtml.value = html;
  inputText.value = stripHtml(html).trim();
}

function clearInput() {
  inputText.value = "";
  loadedChapterId.value = "";
  loadedChapterHtml.value = "";
}

// One-click load of the built-in chapter 3 fixture.
function loadSampleCh3() {
  loadedChapterId.value = "";
  loadedChapterHtml.value = "";
  inputText.value = SAMPLE_CH3_TEXT;
}

// Live segment counts shown in the inline-tag info banner — recomputes on
// every inputText change so users see what their text would split into
// before running anything.
const inlinePreview = computed(() => {
  if (!inputText.value.trim()) return { paragraphs: 0, dialogue: 0, narration: 0 };
  const paras = loadedChapterHtml.value
    ? extractStudioParagraphs(loadedChapterHtml.value)
    : splitTextToParagraphs(inputText.value);
  let dialogue = 0, narration = 0;
  for (const p of paras) {
    for (const s of splitByQuotes(p)) {
      if (s.kind === "dialogue") dialogue++;
      else narration++;
    }
  }
  return { paragraphs: paras.length, dialogue, narration };
});

// If the user edits the textarea away from the loaded chapter, drop the
// cached HTML so Studio-mode falls back to splitting the visible text
// rather than running against a stale source.
watch(inputText, (v) => {
  if (loadedChapterHtml.value && v !== stripHtml(loadedChapterHtml.value).trim()) {
    loadedChapterHtml.value = "";
    loadedChapterId.value = "";
  }
});

// ─── Default prompts ─────────────────────────────────────────────────
const DEFAULT_ENTITY_SYSTEM = `You are a literary analysis assistant. Read the passage and list every distinct character who appears or is referred to by name.

Return ONLY a JSON array, no commentary, no markdown fence:
[
  { "name": "<canonical name>", "aliases": ["nicknames", "pronouns used"], "role": "<one-line description>" }
]

Rules:
- Include named characters only. Skip generic labels ("the man", "a soldier") unless they recur with that exact label.
- Merge variants of the same person under one entry (e.g. "Jon", "Jonathan", "Mr. Hale" → one entry).
- Do NOT include the narrator unless they are a named character in the text.
- If no named characters appear, return [].`;

const DEFAULT_ENTITY_USER = `Passage:

{{text}}

Return only the JSON array.`;

const DEFAULT_QUOTE_SYSTEM = `You are a dialogue attribution assistant for a novelist.

For each paragraph of the passage, identify the speaker. Return ONLY a JSON array (no commentary, no markdown fence), one object per paragraph, in order:
[
  { "speaker": "<name or 'narrator' or 'unknown'>", "kind": "narration" | "dialogue" | "interior", "confidence": <0..1> }
]

Rules:
- Prefer names from the provided Cast list when attributing dialogue.
- "narration" for prose describing action/setting. "dialogue" for quoted speech. "interior" for unspoken thoughts of a character.
- Be conservative: if the speaker is genuinely ambiguous, use "unknown" and set confidence below 0.6.`;

const DEFAULT_QUOTE_USER = `Cast:
{{cast}}

Passage:
{{text}}

Return only the JSON array, one entry per paragraph in order.`;

// ─── Studio-mode pipeline ────────────────────────────────────────────
// Mirrors services/llm.js → detectSpeakers + StudioView's pre-processing
// exactly, so prompt/model tweaks can be A/B'd against actual production
// behavior. Single LLM call: paragraphs in, JSON array out, one entry per
// paragraph. Project characters are injected by ID — no entity extraction.

const STRUCTURAL_MARKER_RE = /^(scene|chapter|part|book|act|prologue|epilogue|interlude)\s*[ivxlcdm0-9]*\.?$/i;

const STUDIO_SPEAKER_SYSTEM = `You are a dialogue analysis assistant for a novelist.
For each paragraph the user gives you, identify the speaker.
Return a JSON array, one object per paragraph, in order, with fields:
  { "speaker": <id>, "confidence": <0..1>, "kind": "narration"|"dialogue"|"interior" }
Use "narrator" for narration. Use the character id (e.g. "c1") for dialogue.
Use "interior" for unspoken thoughts of a character. Be conservative — if
you are uncertain, set confidence below 0.85.`;

const STUDIO_SPEAKER_USER = `Characters in this novel:
{{characters}}

Paragraphs:
{{paragraphs}}

Return only the JSON array, no commentary.`;

function extractStudioParagraphs(html) {
  const div = document.createElement("div");
  div.innerHTML = String(html || "");
  div.querySelectorAll("h2.scene-title, p.scene-mark").forEach((el) => el.remove());
  return Array.from(div.querySelectorAll("p"))
    .map((el) => el.textContent.trim())
    .filter((t) => t && !STRUCTURAL_MARKER_RE.test(t));
}

// Fallback when there's no source HTML (raw paste). Splits on blank lines
// and applies the same structural-marker filter so behavior tracks Studio.
function splitTextToParagraphs(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((t) => t && !STRUCTURAL_MARKER_RE.test(t));
}

function studioCharacterList(chars) {
  if (!chars?.length) return "(no characters configured in this project)";
  return chars
    .map((c) => `- id=${c.id}, name="${c.name}", role="${c.role || ""}"`)
    .join("\n");
}

// Ported from services/llm.js parseJsonArray — falls back to one narrator
// line per paragraph so the parsed table always lines up with the input.
function parseSpeakerArrayTolerant(text, paragraphCount) {
  const fallback = () => Array.from({ length: paragraphCount }, () =>
    ({ speaker: "narrator", confidence: 0.5, kind: "narration" }),
  );
  const m = String(text || "").match(/\[[\s\S]*\]/);
  if (!m) return fallback();
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return fallback();
    return arr.map((a) => ({
      speaker: a?.speaker || "narrator",
      confidence: typeof a?.confidence === "number" ? a.confidence : 0.5,
      kind: a?.kind || "narration",
    }));
  } catch {
    return fallback();
  }
}

// ─── Inline-tag pipeline ─────────────────────────────────────────────
// Fixes the inline-dialogue-tag problem: a paragraph like
//   "This is your father," she said, "to about page sixty."
// is currently classified as one speaker, but the "she said" middle
// should read in the narrator's voice. We split each paragraph into
// alternating dialogue/narration segments by quote marks (deterministic,
// no LLM) and only ask the model to attribute the dialogue segments —
// narration is always the narrator.

// Two prompt bodies, consumed by the three-tier system in services/modelMeta.js:
//   • DIRECT — strict rules only. Used by Direct (no think) and Reasoned
//     (think on) tiers. Verified 12/12 on Halvard/Elen ch6 with Reasoned
//     (Qwen3:14B + think:true).
//   • GUIDED — DIRECT plus four worked examples that scaffold reasoning
//     for sub-12B models:
//       1. Tagged dialogue → cast id
//       2. Off-cast role label semantically near a cast role → unknown
//       3. Bare-quote turn-taking with no name or tag → unknown
//       4. Mid-paragraph continuation through "he said," → same speaker
//     Example 4 balances Example 3 — without it, smaller models over-apply
//     "bare-quote = unknown/turn-flip" to legitimate continuations like
//       "I'll give you what the case is worth," he said, "and a little more for the trouble."
//     where the bare-quote second span continues the same speaker.

const INLINE_SPEAKER_SYSTEM_DIRECT = `You are a dialogue attribution assistant for an audiobook producer.

Narration (everything outside quotation marks) is always read by the narrator. Your job is to attribute each quoted dialogue segment to a character.

You will receive a list of project characters and the chapter's paragraphs, with each quoted segment of dialogue tagged inline as [D1]...[/D1], [D2]...[/D2], and so on.

Return ONLY a JSON array, no commentary, with one object per dialogue segment in order from [D1] onward:
  { "speaker": <character id or "unknown">, "confidence": <0..1> }

Rules:
- Use a character id ONLY when a dialogue tag, name, alias, or surrounding context clearly identifies that specific character. Do not substitute the closest-fitting cast member.
- If the passage names a speaker who is not in the cast — by name OR by role like "the waiter", "a stranger" — return "unknown". Do not map them to a cast id, even when a cast member's name or role sounds semantically similar.
- Use "unknown" with confidence below 0.6 when the speaker is genuinely ambiguous (an unnamed reply with no dialogue tag and no clear turn-taking pattern).
- Use dialogue tags ("she said", "Tom answered"), turn-taking, and surrounding narration to disambiguate.
- Do NOT include entries for narration — only dialogue segments tagged [D#].`;

const INLINE_SPEAKER_SYSTEM_GUIDED = `${INLINE_SPEAKER_SYSTEM_DIRECT}

Worked examples:

Example 1 — Tagged dialogue uses the named cast id.
Cast:
- id=c1, name="Maya Chen"
- id=c2, name="Detective Hayes"
Passage:
[D1]"What did you find?"[/D1] Hayes asked.
Output: [{"speaker": "c2", "confidence": 1.0}]

Example 2 — Off-cast role label that semantically resembles a cast role → unknown.
Cast:
- id=c1, name="Maya Chen", role="reporter"
- id=c2, name="The Investigator", role="federal agent"
Passage:
A stranger leaned in from the next booth. [D1]"Are you the reporter from the Tribune?"[/D1]
Output: [{"speaker": "unknown", "confidence": 0.5}]

Example 3 — Bare-quote turn-taking with no name or tag → unknown.
Cast:
- id=c1, name="Maya Chen"
- id=c2, name="Detective Hayes"
Passage:
[D1]"You're late."[/D1]
[D2]"Twenty minutes."[/D2]
Output: [{"speaker": "unknown", "confidence": 0.5}, {"speaker": "unknown", "confidence": 0.5}]

Example 4 — Mid-paragraph continuation through a pronoun tag → same speaker.
A bare-quote segment in the same paragraph as a tagged segment, separated only by narration like "he said," / "she said,", continues the prior speaker. This is NOT turn-taking — the pronoun tag identifies who said both spans.
Cast:
- id=c1, name="Maya Chen"
- id=c2, name="Detective Hayes"
Passage:
Hayes paused at the door. [D1]"This is your case,"[/D1] he said, [D2]"and you're going to close it."[/D2]
Output: [{"speaker": "c2", "confidence": 1.0}, {"speaker": "c2", "confidence": 0.9}]`;

// Backwards-compat aliases — old profile names kept in case anything
// imports them. New code uses the tier system in services/modelMeta.js.
const INLINE_SPEAKER_SYSTEM_14B = INLINE_SPEAKER_SYSTEM_DIRECT;
const INLINE_SPEAKER_SYSTEM_8B = INLINE_SPEAKER_SYSTEM_GUIDED;
const INLINE_SPEAKER_SYSTEM = INLINE_SPEAKER_SYSTEM_GUIDED;

// Map TIER.systemKey → prompt body. Single source of truth for which
// prompt a tier uses. Guided gets the scaffolded prompt; Direct and
// Reasoned both use the strict prompt (they only differ in `think`).
const SYSTEM_BY_TIER_KEY = {
  guided: INLINE_SPEAKER_SYSTEM_GUIDED,
  direct: INLINE_SPEAKER_SYSTEM_DIRECT,
};

const INLINE_SPEAKER_USER = `Characters in this novel:
{{characters}}

Paragraphs (dialogue segments tagged inline):

{{paragraphs}}

Return only the JSON array, one entry per [D#] in order.`;

// Splits one paragraph into alternating dialogue/narration segments by
// quote marks. Treats both straight (") and curly (" ") double-quote
// characters as state-toggle markers. Single quotes are intentionally
// ignored — too many apostrophe false-positives ("it's", "don't").
function splitByQuotes(text) {
  const QUOTE_RE = /["“”]/;
  const segments = [];
  let bufStart = 0;
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    if (!QUOTE_RE.test(text[i])) continue;
    if (!inQuote) {
      if (i > bufStart) segments.push({ kind: "narration", text: text.slice(bufStart, i) });
      bufStart = i;
      inQuote = true;
    } else {
      segments.push({ kind: "dialogue", text: text.slice(bufStart, i + 1) });
      bufStart = i + 1;
      inQuote = false;
    }
  }
  if (bufStart < text.length) {
    segments.push({
      kind: inQuote ? "dialogue" : "narration",
      text: text.slice(bufStart),
    });
  }
  return segments.filter((s) => s.text.trim().length > 0);
}

// Returns [{ paragraphIdx, segments: [{ kind, text, tagNum?: number }] }, …].
// tagNum is chapter-wide so the LLM sees stable [D1], [D2], … markers we
// can zip back against on the way out.
function segmentParagraphs(paragraphs) {
  let counter = 0;
  return paragraphs.map((para, paragraphIdx) => {
    const segments = splitByQuotes(para).map((seg) =>
      seg.kind === "dialogue" ? { ...seg, tagNum: ++counter } : seg,
    );
    return { paragraphIdx, segments };
  });
}

// Renders the {{paragraphs}} prompt block: each paragraph is prefixed with
// its 1-based index, dialogue spans wrapped in [D#]…[/D#].
function renderInlineTaggedPrompt(segmented) {
  return segmented.map(({ paragraphIdx, segments }) => {
    const body = segments.map((s) =>
      s.kind === "dialogue" ? `[D${s.tagNum}]${s.text}[/D${s.tagNum}]` : s.text,
    ).join("");
    return `${paragraphIdx + 1}. ${body}`;
  }).join("\n\n");
}

function parseInlineAttributions(text, dialogueCount) {
  const fallback = () => Array.from({ length: dialogueCount }, () =>
    ({ speaker: "unknown", confidence: 0.4 }),
  );
  const m = String(text || "").match(/\[[\s\S]*\]/);
  if (!m) return fallback();
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return fallback();
    const out = arr.map((a) => ({
      speaker: typeof a?.speaker === "string" ? a.speaker : "unknown",
      confidence: typeof a?.confidence === "number" ? a.confidence : 0.5,
    }));
    while (out.length < dialogueCount) out.push({ speaker: "unknown", confidence: 0.4 });
    return out.slice(0, dialogueCount);
  } catch {
    return fallback();
  }
}

// ─── Anchor propagation (deterministic, pre-LLM) ─────────────────────
// Within a paragraph, look for dialogue-tag verbs ("X said", "answered Y")
// next to cast character names. Anchor the nearest dialogue segment to
// that speaker, then propagate the anchor across adjacent untagged
// dialogue segments in the same paragraph. The LLM is still asked for
// every segment so the parsed view can surface disagreements, but
// anchors win on tie-break. Within-paragraph only.

const DIALOGUE_TAG_VERBS = [
  "said", "says", "asked", "asks", "replied", "replies", "answered", "answers",
  "responded", "returned", "retorted", "whispered", "shouted", "called",
  "cried", "exclaimed", "gasped", "hissed", "muttered", "murmured", "added",
  "continued", "began", "agreed", "disagreed", "admitted", "insisted",
  "protested", "argued", "noted", "observed", "remarked", "commented",
  "offered", "suggested", "proposed", "demanded", "ordered", "breathed",
  "sighed", "laughed", "chuckled", "repeated", "echoed",
];

function buildNameIndex(characters) {
  const idx = new Map();
  const add = (name, id) => {
    if (!name) return;
    const key = String(name).trim().toLowerCase();
    if (key) idx.set(key, id);
  };
  for (const c of characters || []) {
    add(c.name, c.id);
    const parts = String(c.name || "").trim().split(/\s+/);
    if (parts.length > 1) { add(parts[0], c.id); add(parts[parts.length - 1], c.id); }
    if (Array.isArray(c.aliases)) c.aliases.forEach((a) => add(a, c.id));
  }
  return idx;
}

// Scan a narration string for a dialogue-tag verb adjacent to a
// capitalized token that matches a cast name. Returns a cast id or null.
// Pronouns ("she said") are intentionally ignored — they require
// resolution we don't attempt at v1.
function findTaggedSpeakerInText(text, nameIndex) {
  if (!text || !nameIndex.size) return null;
  const verbs = DIALOGUE_TAG_VERBS.join("|");
  // "<Name> <verb>" — prose-normal form ("June said").
  const nameVerbRE = new RegExp(`\\b(\\w[\\w'-]*)\\s+(?:${verbs})\\b`, "gi");
  for (const m of text.matchAll(nameVerbRE)) {
    if (!/^[A-Z]/.test(m[1])) continue; // pronouns and lowercase tokens are not names
    const id = nameIndex.get(m[1].toLowerCase());
    if (id) return id;
  }
  // "<verb> <Name>" — inversion form ("said John", "Said John").
  const verbNameRE = new RegExp(`\\b(?:${verbs})\\s+(\\w[\\w'-]*)\\b`, "gi");
  for (const m of text.matchAll(verbNameRE)) {
    if (!/^[A-Z]/.test(m[1])) continue;
    const id = nameIndex.get(m[1].toLowerCase());
    if (id) return id;
  }
  return null;
}

// Returns Map<tagNum, { speaker, source: "tag" | "propagated" }>.
function buildAnchors(segmented, characters) {
  const nameIndex = buildNameIndex(characters);
  const anchors = new Map();
  if (!nameIndex.size) return anchors;

  for (const { segments } of segmented) {
    // Pass 1: tag detection. For each narration segment containing a
    // recognizable dialogue tag, anchor the dialogue segment immediately
    // before it (standard "..." she said. form). If there is no preceding
    // dialogue in this paragraph, fall back to the next one.
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].kind !== "narration") continue;
      const speaker = findTaggedSpeakerInText(segments[i].text, nameIndex);
      if (!speaker) continue;
      let target = null;
      for (let j = i - 1; j >= 0; j--) {
        if (segments[j].kind === "dialogue") { target = segments[j]; break; }
      }
      if (!target) {
        for (let j = i + 1; j < segments.length; j++) {
          if (segments[j].kind === "dialogue") { target = segments[j]; break; }
        }
      }
      if (target && !anchors.has(target.tagNum)) {
        anchors.set(target.tagNum, { speaker, source: "tag" });
      }
    }

    // Pass 2: propagation. Forward sweep — untagged dialogue inherits the
    // most recent tagged speaker in this paragraph. Backward sweep — any
    // still-unanchored leading segments inherit from the first later tag.
    const dialogues = segments.filter((s) => s.kind === "dialogue");
    let last = null;
    for (const d of dialogues) {
      const a = anchors.get(d.tagNum);
      if (a && a.source === "tag") last = a.speaker;
      else if (last) anchors.set(d.tagNum, { speaker: last, source: "propagated" });
    }
    let next = null;
    for (let i = dialogues.length - 1; i >= 0; i--) {
      const d = dialogues[i];
      const a = anchors.get(d.tagNum);
      if (a && a.source === "tag") next = a.speaker;
      else if (next && !a) anchors.set(d.tagNum, { speaker: next, source: "propagated" });
    }
  }

  return anchors;
}

// Builds the parsed table from segmented paragraphs + attributions. One row
// per segment; narration rows are hard-coded to the narrator with `auto:true`
// so the UI can render them differently from model-decided rows. When an
// anchor is present for a dialogue segment, it wins over the LLM and the
// LLM's vote is stashed for the disagreement indicator. When the LLM names
// a character below `options.floor`, the row is demoted to "unknown" and
// the original pick is stashed in `flooredFrom` for the indicator.
function buildInlineRows(segmented, attributions, chapter, anchors, options) {
  const rows = [];
  if (chapter?.num != null || chapter?.title) {
    const introParts = [];
    if (chapter?.num != null) introParts.push(`Chapter ${chapter.num}.`);
    if (chapter?.title) introParts.push(`${chapter.title}.`);
    if (introParts.length) {
      rows.push({
        paragraphIdx: -1, intro: true, kind: "narration",
        speaker: "narrator", confidence: 1.0, auto: true,
        text: introParts.join(" "),
      });
    }
  }
  segmented.forEach(({ paragraphIdx, segments }) => {
    segments.forEach((seg) => {
      if (seg.kind === "narration") {
        rows.push({
          paragraphIdx, kind: "narration",
          speaker: "narrator", confidence: 1.0, auto: true,
          text: seg.text,
        });
      } else {
        const anchor = anchors?.get(seg.tagNum);
        const llmAttr = attributions[seg.tagNum - 1] || { speaker: "unknown", confidence: 0.4 };
        if (anchor) {
          rows.push({
            paragraphIdx, kind: "dialogue",
            speaker: anchor.speaker, confidence: 1.0, source: anchor.source,
            llmSpeaker: llmAttr.speaker, llmConfidence: llmAttr.confidence,
            text: seg.text,
          });
        } else {
          const floor = options?.floor;
          const shouldFloor = floor != null
            && llmAttr.speaker !== "unknown"
            && llmAttr.confidence < floor;
          if (shouldFloor) {
            rows.push({
              paragraphIdx, kind: "dialogue",
              speaker: "unknown", confidence: llmAttr.confidence, source: "floored",
              flooredFrom: llmAttr.speaker,
              text: seg.text,
            });
          } else {
            rows.push({
              paragraphIdx, kind: "dialogue",
              speaker: llmAttr.speaker, confidence: llmAttr.confidence, source: "llm",
              text: seg.text,
            });
          }
        }
      }
    });
  });
  return rows;
}

// Built-in test fixture: chapter 3 sample for validating inline-tag
// attribution. Expected: every dialogue segment → June Asari (except
// "No." which is the protagonist's reply — likely "unknown" without a
// named protagonist in the cast).
const SAMPLE_CH3_TEXT = `June was already there, because June was always already there. She had brought the small electric kettle she carried everywhere and the printer's apron she did not need.

"You haven't slept," she said, without looking up.

"No."

"Tea. Then the case. In that order."

June opened the leather case at the table. She turned the pages slowly, the way one turns the pages of a book one already knows.

"This is your father," she said, "to about page sixty. After that, it isn't. Whoever it is uses the same ink. They've gone to some trouble."`;

// ─── Presets (localStorage) ──────────────────────────────────────────
const PRESETS_KEY = "justwrite:speakerlab:presets";
const presets = ref(loadPresetsFromStorage());
const presetName = ref("");
const presetPickerValue = ref("");

function loadPresetsFromStorage() {
  try {
    const v = JSON.parse(localStorage.getItem(PRESETS_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function persistPresets() {
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets.value)); } catch {}
}

function savePresetFor(run) {
  const name = (presetName.value || prompt("Preset name?") || "").trim();
  if (!name) return;
  const snapshot = {
    name,
    savedAt: Date.now(),
    twoStage: run.twoStage,
    stage1: { ...run.stage1 },
    stage2: { ...run.stage2 },
  };
  const idx = presets.value.findIndex((p) => p.name === name);
  if (idx >= 0) presets.value.splice(idx, 1, snapshot);
  else presets.value.push(snapshot);
  persistPresets();
  presetName.value = "";
}

function applyPreset(run, preset) {
  run.twoStage = !!preset.twoStage;
  Object.assign(run.stage1, preset.stage1);
  Object.assign(run.stage2, preset.stage2);
}

function deletePreset(name) {
  presets.value = presets.value.filter((p) => p.name !== name);
  persistPresets();
}

// ─── Run columns ─────────────────────────────────────────────────────
const labels = ["A", "B", "C", "D"];

function makeRun(idx) {
  return reactive({
    label: `Run ${labels[idx] || idx + 1}`,
    twoStage: true,
    stage1: {
      providerId: ai.defaultLlmId,
      model: "",
      temperature: 0.2,
      system: DEFAULT_ENTITY_SYSTEM,
      user: DEFAULT_ENTITY_USER,
      collapsed: false,
      think: false,           // see streamStage think note below
    },
    stage2: {
      providerId: ai.defaultLlmId,
      model: "",
      temperature: 0.2,
      system: DEFAULT_QUOTE_SYSTEM,
      user: DEFAULT_QUOTE_USER,
      collapsed: false,
      think: false,
    },
    studio: {
      providerId: ai.defaultLlmId,
      model: "",
      temperature: 0.3,  // matches OpenAICompatClient.chat() default used by detectSpeakers
      system: STUDIO_SPEAKER_SYSTEM,
      user: STUDIO_SPEAKER_USER,
      collapsed: false,
      think: false,
    },
    inline: (() => {
      // Initial tier derived from the resolved tier of the default LLM's
      // chat model. If the user has Qwen3:14B configured by default, the
      // lab opens in Reasoned; Qwen3:8B opens in Guided; etc. No model
      // selected yet → Guided as the safe fallback.
      const defaultModel = ai.llmProvider?.chatModel || "";
      const initialTier = defaultModel ? ai.resolveTier(defaultModel) : TIERS.guided;
      return {
        providerId: ai.defaultLlmId,
        model: "",
        temperature: 0.2,       // lower for stricter JSON output
        tier: initialTier.id,   // "guided" | "direct" | "reasoned" — picks prompt + think + floor
        system: SYSTEM_BY_TIER_KEY[initialTier.systemKey] || INLINE_SPEAKER_SYSTEM_GUIDED,
        user: INLINE_SPEAKER_USER,
        collapsed: false,
        propagate: true,        // deterministic dialogue-tag anchoring before the LLM call
        useFloor: true,         // demote low-confidence LLM character picks to "unknown"
        confidenceFloor: initialTier.floor,
        think: initialTier.think, // Ollama think param — set by the current tier; no UI override.
      };
    })(),
    mode: "inline",      // "lab" | "studio" | "inline"
    state: "idle",       // idle | streaming | done | error
    activeStage: 0,      // 0 = none, 1 = stage 1 running, 2 = stage 2 running
    viewStage: 1,        // 1 | 2 — which lab stage's output to display
    studioView: "raw",   // "raw" | "parsed"
    inlineView: "raw",   // "raw" | "parsed"
    stage1Output: "",
    stage2Output: "",
    studioOutput: "",
    inlineOutput: "",
    parsedRows: [],          // populated after studio run (per-paragraph)
    inlineParsedRows: [],    // populated after inline run (per-segment)
    paragraphsUsed: [],      // last input paragraphs seen, for inspection
    metrics: emptyMetrics(),
    error: "",
    abort: null,
  });
}

function emptyMetrics() {
  return { startedAt: 0, elapsed: 0, tokens: 0, tokensPerSec: 0, words: 0, usage: null, source: "approx" };
}

const runs = ref([makeRun(0)]);

function addRun() {
  if (runs.value.length >= 4) return;
  // Seed the new column from the first column's current config so the user
  // can quickly tweak one knob and compare.
  const first = runs.value[0];
  const next = makeRun(runs.value.length);
  next.twoStage = first.twoStage;
  Object.assign(next.stage1, { ...first.stage1, collapsed: false });
  Object.assign(next.stage2, { ...first.stage2, collapsed: false });
  runs.value.push(next);
}

function removeRun(run) {
  if (run.abort) try { run.abort.abort(); } catch {}
  runs.value = runs.value.filter((r) => r !== run);
  if (runs.value.length === 0) runs.value.push(makeRun(0));
}

function runAll() {
  for (const r of runs.value) runPipeline(r);
}

function abortRun(run) {
  if (run.abort) { try { run.abort.abort(); } catch {} }
}

// ─── Execution ───────────────────────────────────────────────────────
function interpolate(template, vars) {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : `{{${k}}}`));
}

// Pull a compact cast list out of stage 1's raw output. Tolerates extra
// commentary by grabbing the first JSON array in the response.
function extractCastSummary(rawStage1) {
  const m = String(rawStage1).match(/\[[\s\S]*\]/);
  if (!m) return "(no cast extracted)";
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr) || arr.length === 0) return "(no named characters identified)";
    return arr.map((c) => {
      const name = c?.name || "?";
      const aliases = Array.isArray(c?.aliases) && c.aliases.length ? ` (aka ${c.aliases.join(", ")})` : "";
      const role = c?.role ? ` — ${c.role}` : "";
      return `- ${name}${aliases}${role}`;
    }).join("\n");
  } catch {
    return rawStage1.slice(0, 600);
  }
}

async function runPipeline(run) {
  if (!inputText.value.trim()) { run.error = "Paste or load text first."; return; }
  if (run.mode === "studio") return runStudio(run);
  if (run.mode === "inline") return runInline(run);
  run.error = "";
  run.stage1Output = "";
  run.stage2Output = "";
  run.state = "streaming";
  run.abort = new AbortController();
  const signal = run.abort.signal;

  try {
    // Stage 1 — entity extraction
    run.activeStage = 1;
    run.viewStage = 1;
    run.metrics = { ...emptyMetrics(), startedAt: performance.now() };
    const s1Text = await streamStage({
      run,
      stage: run.stage1,
      vars: { text: inputText.value, cast: "" },
      signal,
      onContent: (c) => { run.stage1Output = c; },
    });

    if (!run.twoStage) {
      run.activeStage = 0;
      run.state = "done";
      return;
    }

    // Stage 2 — quote attribution, with stage 1 cast injected
    run.activeStage = 2;
    run.viewStage = 2;
    run.metrics = { ...emptyMetrics(), startedAt: performance.now() };
    const castSummary = extractCastSummary(s1Text);
    await streamStage({
      run,
      stage: run.stage2,
      vars: { text: inputText.value, cast: castSummary },
      signal,
      onContent: (c) => { run.stage2Output = c; },
    });

    run.activeStage = 0;
    run.state = "done";
  } catch (e) {
    if (e?.name === "AbortError" || /aborted/i.test(e?.message || "")) {
      run.state = "idle";
    } else {
      run.error = e?.message || String(e);
      run.state = "error";
    }
    run.activeStage = 0;
  } finally {
    run.abort = null;
  }
}

// Studio-mode execution path. Single LLM call; mirrors detectSpeakers +
// StudioView pre-processing and post-processing exactly.
async function runStudio(run) {
  run.error = "";
  run.studioOutput = "";
  run.stage1Output = "";
  run.stage2Output = "";
  run.parsedRows = [];
  run.paragraphsUsed = [];
  run.state = "streaming";
  run.studioView = "raw";
  run.abort = new AbortController();
  const signal = run.abort.signal;

  try {
    const paragraphs = loadedChapterHtml.value
      ? extractStudioParagraphs(loadedChapterHtml.value)
      : splitTextToParagraphs(inputText.value);

    if (paragraphs.length === 0) {
      throw new Error("No paragraphs extracted from the input (after removing structural markers).");
    }
    run.paragraphsUsed = paragraphs;

    const characters = project.characters || [];
    const vars = {
      characters: studioCharacterList(characters),
      paragraphs: paragraphs.map((p, i) => `${i + 1}. ${p}`).join("\n"),
    };

    run.activeStage = 1;
    run.metrics = { ...emptyMetrics(), startedAt: performance.now() };
    const finalContent = await streamStage({
      run,
      stage: run.studio,
      vars,
      signal,
      onContent: (c) => { run.studioOutput = c; },
    });

    // Post-process: tolerant JSON parse + chapter intro + zip with source paragraphs.
    const parsed = parseSpeakerArrayTolerant(finalContent, paragraphs.length);
    const chapter = loadedChapterId.value ? project.chapterById?.(loadedChapterId.value) : null;
    const introParts = [];
    if (chapter?.num != null) introParts.push(`Chapter ${chapter.num}.`);
    if (chapter?.title) introParts.push(`${chapter.title}.`);
    const rows = [];
    if (introParts.length) {
      rows.push({ speaker: "narrator", kind: "narration", confidence: 1.0, text: introParts.join(" "), intro: true });
    }
    parsed.forEach((a, i) => rows.push({ ...a, text: paragraphs[i] || "" }));
    run.parsedRows = rows;
    run.studioView = "parsed";
    run.activeStage = 0;
    run.state = "done";
  } catch (e) {
    if (e?.name === "AbortError" || /aborted/i.test(e?.message || "")) {
      run.state = "idle";
    } else {
      run.error = e?.message || String(e);
      run.state = "error";
    }
    run.activeStage = 0;
  } finally {
    run.abort = null;
  }
}

function resetStudioPrompts(run) {
  run.studio.system = STUDIO_SPEAKER_SYSTEM;
  run.studio.user = STUDIO_SPEAKER_USER;
}

// Inline-tag execution path. Splits each paragraph into segments by quote
// marks (deterministic), asks the model to attribute ONLY the dialogue
// segments, then renders a per-segment table where narration is always
// the narrator. Fixes the inline-dialogue-tag problem.
async function runInline(run) {
  run.error = "";
  run.inlineOutput = "";
  run.stage1Output = "";
  run.stage2Output = "";
  run.studioOutput = "";
  run.inlineParsedRows = [];
  run.paragraphsUsed = [];
  run.state = "streaming";
  run.inlineView = "raw";
  run.abort = new AbortController();
  const signal = run.abort.signal;

  try {
    const paragraphs = loadedChapterHtml.value
      ? extractStudioParagraphs(loadedChapterHtml.value)
      : splitTextToParagraphs(inputText.value);

    if (paragraphs.length === 0) {
      throw new Error("No paragraphs extracted from the input (after removing structural markers).");
    }
    run.paragraphsUsed = paragraphs;

    const segmented = segmentParagraphs(paragraphs);
    const characters = project.characters || [];
    const anchors = run.inline.propagate ? buildAnchors(segmented, characters) : new Map();
    const chapter = loadedChapterId.value ? project.chapterById?.(loadedChapterId.value) : null;
    const floor = run.inline.useFloor ? (Number(run.inline.confidenceFloor) || 0.7) : null;

    const dialogueCount = segmented.reduce(
      (n, p) => n + p.segments.filter((s) => s.kind === "dialogue").length,
      0,
    );

    if (dialogueCount === 0) {
      // Nothing for the model to attribute — emit narrator-only rows so
      // the parsed view still shows the chapter laid out paragraph by
      // paragraph (all attributed to the narrator).
      run.inlineParsedRows = buildInlineRows(segmented, [], chapter, anchors, { floor });
      run.inlineView = "parsed";
      run.activeStage = 0;
      run.state = "done";
      return;
    }

    const vars = {
      characters: studioCharacterList(characters),
      paragraphs: renderInlineTaggedPrompt(segmented),
    };

    run.activeStage = 1;
    run.metrics = { ...emptyMetrics(), startedAt: performance.now() };
    const finalContent = await streamStage({
      run,
      stage: run.inline,
      vars,
      signal,
      onContent: (c) => { run.inlineOutput = c; },
    });

    const attributions = parseInlineAttributions(finalContent, dialogueCount);
    run.inlineParsedRows = buildInlineRows(segmented, attributions, chapter, anchors, { floor });
    run.inlineView = "parsed";
    run.activeStage = 0;
    run.state = "done";
  } catch (e) {
    if (e?.name === "AbortError" || /aborted/i.test(e?.message || "")) {
      run.state = "idle";
    } else {
      run.error = e?.message || String(e);
      run.state = "error";
    }
    run.activeStage = 0;
  } finally {
    run.abort = null;
  }
}

function resetInlinePrompts(run) {
  applyTier(run, run.inline.tier || "guided");
  run.inline.user = INLINE_SPEAKER_USER;
}

// Applies a tier's prompt + think + floor defaults to the inline-tag
// stage. Leaves propagate/useFloor toggles alone since those are user
// preference and orthogonal to tier. Persists the user's pick as a
// model-level override in the ai store so the same model gets the same
// tier on subsequent runs (and other surfaces — Settings, future
// production paths — pick it up too).
function applyTier(run, tierId) {
  const tier = TIERS[tierId] || TIERS.guided;
  run.inline.tier = tier.id;
  run.inline.system = SYSTEM_BY_TIER_KEY[tier.systemKey] || INLINE_SPEAKER_SYSTEM_GUIDED;
  run.inline.confidenceFloor = tier.floor;
  run.inline.think = tier.think;
  // Persist user pick for the currently-selected model so it sticks.
  const modelId = run.inline.model || ai.providerById(run.inline.providerId)?.chatModel;
  if (modelId) ai.setModelTier(modelId, tier.id);
}

function speakerName(id) {
  if (!id || id === "narrator") return "Narrator";
  if (id === "unknown") return "Unknown";
  const c = project.characterById?.(id);
  return c?.name || id;
}

function confBucket(c) {
  if (c == null || c < 0.5) return "low";
  if (c < 0.85) return "med";
  return "high";
}

// Compact source label for the inline parsed view: "auto" for narration,
// "tag" / "prop" for deterministic anchors, "NN%" for LLM votes.
function inlineSourceLabel(row) {
  if (row.auto) return "auto";
  if (row.source === "tag") return "tag";
  if (row.source === "propagated") return "prop";
  if (row.source === "floored") return `↓ ${Math.round((row.confidence || 0) * 100)}%`;
  return Math.round((row.confidence || 0) * 100) + "%";
}

async function streamStage({ run, stage, vars, signal, onContent }) {
  const provider = ai.providerById(stage.providerId);
  if (!provider) throw new Error(`Provider not found for stage`);

  const client = new OpenAICompatClient(provider);
  const messages = [
    { role: "system", content: interpolate(stage.system, vars) },
    { role: "user",   content: interpolate(stage.user,   vars) },
  ];

  let lastContent = "";
  for await (const chunk of client.chatStream({
    messages,
    model: stage.model || provider.chatModel,
    temperature: Number(stage.temperature) || 0,
    signal,
    // Per-stage `think` (Ollama-only). false (default) suppresses
    // <think> blocks — wanted for JSON-output stages and reasoning-first
    // models like Qwen3.5 / DeepSeek-R1. true forces reasoning on for
    // hybrid models (Qwen3:14B-class) where implicit chain-of-thought
    // measurably helps tasks like dialogue attribution. Non-Ollama
    // providers ignore the field per OpenAI spec.
    extra: { think: stage.think === true },
  })) {
    lastContent = chunk.content;
    onContent(chunk.content);

    const elapsed = (performance.now() - run.metrics.startedAt) / 1000;
    const reportedTokens = chunk.usage?.completion_tokens;
    const tokens = reportedTokens ?? Math.ceil(chunk.content.length / 4);
    run.metrics.elapsed = elapsed;
    run.metrics.tokens = tokens;
    run.metrics.tokensPerSec = elapsed > 0 ? tokens / elapsed : 0;
    run.metrics.words = countWords(chunk.content);
    run.metrics.source = reportedTokens != null ? "exact" : "approx";
    if (chunk.usage) run.metrics.usage = chunk.usage;
  }
  return lastContent;
}

// ─── Helpers ─────────────────────────────────────────────────────────
function countWords(s) {
  const m = String(s || "").trim().match(/\S+/g);
  return m ? m.length : 0;
}

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = String(html || "");
  // Preserve paragraph breaks so the LLM sees them.
  div.querySelectorAll("p, div, br").forEach((el) => {
    if (el.tagName === "BR") el.replaceWith("\n");
    else el.append("\n");
  });
  return div.textContent.replace(/\n{3,}/g, "\n\n");
}

function fmtNum(n) {
  if (!isFinite(n)) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toString();
}

function fmtRate(n) {
  if (!isFinite(n) || n === 0) return "—";
  return n.toFixed(1);
}

function fmtTime(s) {
  if (!isFinite(s) || s === 0) return "0.0s";
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60); const r = (s - m * 60).toFixed(0);
  return `${m}m ${r}s`;
}

function activeOutput(run) {
  if (run.mode === "studio") return run.studioOutput;
  if (run.mode === "inline") return run.inlineOutput;
  return run.viewStage === 2 ? run.stage2Output : run.stage1Output;
}

function copyOutput(run) {
  const text = activeOutput(run);
  if (text) navigator.clipboard?.writeText(text).catch(() => {});
}
</script>

<template>
  <PaneHeader :eyebrow="$t('panes.speakerLab.eyebrow')" :title="$t('panes.speakerLab.title')" />

  <div class="lab scrollarea">
    <!-- ── INPUT ──────────────────────────────────────────────────── -->
    <section class="card">
      <div class="card-head">
        <div class="t-eyebrow">Input passage</div>
        <div class="stat-row">
          <span class="stat"><b>{{ inputWordCount }}</b> words</span>
          <span class="stat"><b>{{ inputCharCount }}</b> chars</span>
          <span class="stat" title="Rough estimate: chars ÷ 4">~<b>{{ approxInputTokens }}</b> tokens</span>
        </div>
      </div>
      <div class="toolbar">
        <JwSelect class="input sm"
          :model-value="loadedChapterId"
          @update:model-value="(v) => loadChapter(v)"
          :options="[{ label: 'Load from chapter…', value: '' }, ...project.allChapters.map(c => ({ label: `Ch. ${c.num} — ${c.title}`, value: c.id }))]" />
        <JwButton intent="secondary" size="small" @click="clearInput" :disabled="!inputText"><Icon name="Close" :size="12" /> Clear</JwButton>
        <JwButton intent="secondary" size="small" @click="loadSampleCh3" v-tooltip.bottom="'Built-in test fixture for Inline-tag mode (speaker: June Asari)'">
          <Icon name="Sparkle" :size="12" /> Sample: Ch. 3
        </JwButton>
        <span class="t-muted" style="font-size:11.5px;margin-left:auto">Paste a few chapters, or load one from this project.</span>
      </div>
      <JwTextarea
        v-model="inputText"
        class="input mono"
        :rows="10"
        placeholder="Paste manuscript text here, or load a chapter above…"
      />
    </section>

    <!-- ── RUN BAR ────────────────────────────────────────────────── -->
    <div class="run-bar">
      <JwButton intent="primary" @click="runAll" :disabled="!inputText.trim()">
        <Icon name="Sparkle" :size="13" />
        Run {{ runs.length > 1 ? `all ${runs.length}` : "" }}
      </JwButton>
      <JwButton intent="secondary" size="small" @click="addRun" :disabled="runs.length >= 4">
        <Icon name="Plus" :size="12" /> Add column
      </JwButton>
      <span v-if="presets.length" class="t-muted" style="font-size:11.5px;margin-left:auto">
        Presets: {{ presets.length }} saved
      </span>
    </div>

    <!-- ── RUN COLUMNS ────────────────────────────────────────────── -->
    <div class="columns" :class="`cols-${runs.length}`">
      <article v-for="(run, idx) in runs" :key="idx" class="col card">
        <header class="col-head">
          <JwInput v-model="run.label" class="input col-label" />
          <div class="mode-seg" title="Pipeline mode">
            <button type="button" class="mode-seg-btn" :class="{ active: run.mode === 'lab' }" @click="run.mode = 'lab'">Lab</button>
            <button type="button" class="mode-seg-btn" :class="{ active: run.mode === 'studio' }" @click="run.mode = 'studio'">Studio</button>
            <button type="button" class="mode-seg-btn" :class="{ active: run.mode === 'inline' }" @click="run.mode = 'inline'">Inline-tag</button>
          </div>
          <JwCheckbox v-if="run.mode === 'lab'" v-model="run.twoStage" class="toggle" :title="run.twoStage ? 'Two-stage pipeline' : 'Single stage'">Two-stage</JwCheckbox>
          <JwButton v-if="runs.length > 1" intent="ghost" size="small" @click="removeRun(run)" v-tooltip.bottom="'Remove this run'">
            <template #icon><Icon name="Trash" :size="13" /></template>
          </JwButton>
        </header>

        <!-- Studio mode -->
        <fieldset v-if="run.mode === 'studio'" class="stage studio-stage" :class="{ active: run.activeStage === 1 }">
          <legend @click="run.studio.collapsed = !run.studio.collapsed">
            <Icon :name="run.studio.collapsed ? 'ChevRight' : 'ChevDown'" :size="11" />
            <b>Studio pipeline</b> — single-call speaker attribution
          </legend>
          <div v-if="!run.studio.collapsed" class="stage-body">
            <div class="studio-info">
              <Icon name="Alert" :size="12" />
              <span>
                Mirrors <code>services/llm.js → detectSpeakers</code>. Input is split into paragraphs
                ({{ loadedChapterHtml ? '<p> tags from the loaded chapter' : 'blank-line splits' }}),
                structural markers (<i>Chapter 7</i>, <i>Scene 1</i>) are dropped, the model is given
                <b>{{ project.characters?.length || 0 }}</b> project character{{ (project.characters?.length || 0) === 1 ? '' : 's' }}
                by id and returns one speaker per paragraph.
              </span>
            </div>
            <div class="row">
              <ProviderSelect v-model="run.studio.providerId" kind="llm" />
              <ModelPicker v-model="run.studio.model" :provider-id="run.studio.providerId" />
              <label class="temp">
                <span class="t-muted">temp</span>
                <JwNumber class="input sm temp-input" :step="0.05" :min="0" :max="2" v-model="run.studio.temperature" />
              </label>
              <JwButton intent="secondary" size="small" @click="resetStudioPrompts(run)" v-tooltip.bottom="'Restore the exact Studio prompt'">
                <Icon name="Refresh" :size="11" /> Reset
              </JwButton>
            </div>
            <label class="t-muted small">System prompt</label>
            <JwTextarea class="input mono" :rows="7" v-model="run.studio.system" />
            <label class="t-muted small">User prompt <span class="hint">— variables: <code v-pre>{{characters}}</code>, <code v-pre>{{paragraphs}}</code></span></label>
            <JwTextarea class="input mono" :rows="5" v-model="run.studio.user" />
          </div>
        </fieldset>

        <!-- Inline-tag mode -->
        <fieldset v-if="run.mode === 'inline'" class="stage inline-stage" :class="{ active: run.activeStage === 1 }">
          <legend @click="run.inline.collapsed = !run.inline.collapsed">
            <Icon :name="run.inline.collapsed ? 'ChevRight' : 'ChevDown'" :size="11" />
            <b>Inline-tag pipeline</b> — segment-aware attribution
          </legend>
          <div v-if="!run.inline.collapsed" class="stage-body">
            <div class="studio-info">
              <Icon name="Alert" :size="12" />
              <span>
                Splits each paragraph into segments by double-quote marks (deterministic, no LLM). Narration (outside quotes) is auto-attributed to the narrator; the model only attributes the dialogue segments.
                <template v-if="inlinePreview.paragraphs">
                  <br>This input → <b>{{ inlinePreview.paragraphs }}</b> paragraph{{ inlinePreview.paragraphs === 1 ? '' : 's' }} ·
                  <b>{{ inlinePreview.dialogue }}</b> dialogue segment{{ inlinePreview.dialogue === 1 ? '' : 's' }} ·
                  <b>{{ inlinePreview.narration }}</b> narration segment{{ inlinePreview.narration === 1 ? '' : 's' }}.
                </template>
                Project characters: <b>{{ project.characters?.length || 0 }}</b>.
                <br><b>Tier:</b> <b>Guided</b> = scaffolded examples for sub-12B models. <b>Direct</b> = strict rules only, no thinking — for 12B-class non-reasoning (Mistral-Small 24B, Phi-4, Llama 3.x 70B). <b>Reasoned</b> = strict rules + implicit reasoning for hybrid models (Qwen3:14B+, Qwen3:32B+) — currently the only tier landing 12/12 on hard chapters, at 2× the time. Auto-picked from the selected model; override if you know better.
              </span>
            </div>
            <div class="row">
              <ProviderSelect v-model="run.inline.providerId" kind="llm" />
              <ModelPicker v-model="run.inline.model" :provider-id="run.inline.providerId" />
              <label class="temp">
                <span class="t-muted">temp</span>
                <JwNumber class="input sm temp-input" :step="0.05" :min="0" :max="2" v-model="run.inline.temperature" />
              </label>
              <JwButton intent="secondary" size="small" @click="resetInlinePrompts(run)" v-tooltip.bottom="'Restore the current profile\'s default prompt'">
                <Icon name="Refresh" :size="11" /> Reset
              </JwButton>
            </div>
            <div class="row" style="align-items:center">
              <span class="t-muted" style="font-size:11px">Tier:</span>
              <div class="mode-seg" title="Picks prompt + think + floor defaults sized to the model class. Guided = scaffolded examples (sub-12B). Direct = strict rules, no thinking (12B-class non-reasoning, e.g. Mistral-Small 24B). Reasoned = strict rules + implicit reasoning (hybrid models like Qwen3:14B+ — slowest but most accurate).">
                <button type="button" class="mode-seg-btn" :class="{ active: run.inline.tier === 'guided' }" @click="applyTier(run, 'guided')">Guided</button>
                <button type="button" class="mode-seg-btn" :class="{ active: run.inline.tier === 'direct' }" @click="applyTier(run, 'direct')">Direct</button>
                <button type="button" class="mode-seg-btn" :class="{ active: run.inline.tier === 'reasoned' }" @click="applyTier(run, 'reasoned')">Reasoned</button>
              </div>
            </div>
            <JwCheckbox v-model="run.inline.propagate" class="toggle" title="Deterministic pre-LLM pass: match dialogue tags ('X said') against cast names and propagate the speaker across adjacent untagged dialogue in the same paragraph. Anchors win over LLM.">Use anchor propagation (pre-LLM)</JwCheckbox>
            <label class="toggle" title="Demote any LLM character pick below this confidence to 'unknown'. Keeps the model's would-be pick visible as 'was: X' so demotions are auditable.">
              <JwCheckbox v-model="run.inline.useFloor">Confidence floor</JwCheckbox>
              <JwNumber
                v-if="run.inline.useFloor"
                class="input sm temp-input"
                :step="0.05" :min="0" :max="1"
                v-model="run.inline.confidenceFloor"
              />
            </label>
            <label class="t-muted small">System prompt</label>
            <JwTextarea class="input mono" :rows="8" v-model="run.inline.system" />
            <label class="t-muted small">User prompt <span class="hint">— variables: <code v-pre>{{characters}}</code>, <code v-pre>{{paragraphs}}</code></span></label>
            <JwTextarea class="input mono" :rows="5" v-model="run.inline.user" />
          </div>
        </fieldset>

        <!-- Stage 1 -->
        <fieldset v-if="run.mode === 'lab'" class="stage" :class="{ active: run.activeStage === 1 }">
          <legend @click="run.stage1.collapsed = !run.stage1.collapsed">
            <Icon :name="run.stage1.collapsed ? 'ChevRight' : 'ChevDown'" :size="11" />
            <b>Stage 1</b> — Entity extraction
          </legend>
          <div v-if="!run.stage1.collapsed" class="stage-body">
            <div class="row">
              <ProviderSelect v-model="run.stage1.providerId" kind="llm" />
              <ModelPicker v-model="run.stage1.model" :provider-id="run.stage1.providerId" />
              <label class="temp">
                <span class="t-muted">temp</span>
                <JwNumber class="input sm temp-input" :step="0.05" :min="0" :max="2" v-model="run.stage1.temperature" />
              </label>
            </div>
            <label class="t-muted small">System prompt</label>
            <JwTextarea class="input mono" :rows="5" v-model="run.stage1.system" />
            <label class="t-muted small">User prompt <span class="hint">— variables: <code v-pre>{{text}}</code></span></label>
            <JwTextarea class="input mono" :rows="3" v-model="run.stage1.user" />
          </div>
        </fieldset>

        <!-- Stage 2 -->
        <fieldset v-if="run.mode === 'lab' && run.twoStage" class="stage" :class="{ active: run.activeStage === 2 }">
          <legend @click="run.stage2.collapsed = !run.stage2.collapsed">
            <Icon :name="run.stage2.collapsed ? 'ChevRight' : 'ChevDown'" :size="11" />
            <b>Stage 2</b> — Quote attribution
          </legend>
          <div v-if="!run.stage2.collapsed" class="stage-body">
            <div class="row">
              <ProviderSelect v-model="run.stage2.providerId" kind="llm" />
              <ModelPicker v-model="run.stage2.model" :provider-id="run.stage2.providerId" />
              <label class="temp">
                <span class="t-muted">temp</span>
                <JwNumber class="input sm temp-input" :step="0.05" :min="0" :max="2" v-model="run.stage2.temperature" />
              </label>
            </div>
            <label class="t-muted small">System prompt</label>
            <JwTextarea class="input mono" :rows="5" v-model="run.stage2.system" />
            <label class="t-muted small">User prompt <span class="hint">— variables: <code v-pre>{{text}}</code>, <code v-pre>{{cast}}</code></span></label>
            <JwTextarea class="input mono" :rows="3" v-model="run.stage2.user" />
          </div>
        </fieldset>

        <!-- Presets -->
        <div class="preset-row">
          <JwInput class="input sm" v-model="presetName" placeholder="Preset name…" style="flex:1" />
          <JwButton intent="secondary" size="small" @click="savePresetFor(run)" :disabled="!presetName.trim()" v-tooltip.bottom="'Save current config as preset'">
            <Icon name="Pencil" :size="11" /> Save
          </JwButton>
          <JwSelect class="input sm"
            :model-value="presetPickerValue"
            @update:model-value="(v) => { const p = presets.find(x => x.name === v); if (p) applyPreset(run, p); presetPickerValue = ''; }"
            :options="[{ label: 'Load preset…', value: '' }, ...presets.map(p => ({ label: p.name, value: p.name }))]" />
        </div>

        <!-- Action row -->
        <div class="action-row">
          <JwButton v-if="run.state !== 'streaming'" intent="primary" @click="runPipeline(run)" :disabled="!inputText.trim()">
            <Icon name="Play" :size="11" /> Run
          </JwButton>
          <JwButton v-else intent="danger" @click="abortRun(run)">
            <Icon name="Stop" :size="11" /> Stop
          </JwButton>
          <span v-if="run.activeStage" class="badge pulse">Stage {{ run.activeStage }}…</span>
          <span v-else-if="run.state === 'done'" class="badge ok"><Icon name="Check" :size="10" /> Done</span>
          <span v-else-if="run.state === 'error'" class="badge err">Error</span>
        </div>

        <!-- Metrics -->
        <div class="metrics">
          <div class="metric"><span class="t-muted">tokens</span><b>{{ fmtNum(run.metrics.tokens) }}</b><i v-if="run.metrics.source === 'approx'" class="t-muted">~</i></div>
          <div class="metric"><span class="t-muted">tok/s</span><b>{{ fmtRate(run.metrics.tokensPerSec) }}</b></div>
          <div class="metric"><span class="t-muted">elapsed</span><b>{{ fmtTime(run.metrics.elapsed) }}</b></div>
          <div class="metric"><span class="t-muted">words</span><b>{{ fmtNum(run.metrics.words) }}</b></div>
        </div>
        <div v-if="run.metrics.usage" class="usage-line t-muted">
          usage: prompt {{ run.metrics.usage.prompt_tokens }} + completion {{ run.metrics.usage.completion_tokens }} = {{ run.metrics.usage.total_tokens }}
        </div>

        <!-- Output tabs -->
        <div class="out-tabs" v-if="run.mode === 'lab' && run.twoStage">
          <button class="tab" :class="{ active: run.viewStage === 1 }" @click="run.viewStage = 1">Stage 1 output</button>
          <button class="tab" :class="{ active: run.viewStage === 2 }" @click="run.viewStage = 2">Stage 2 output</button>
          <JwButton intent="ghost" size="small" @click="copyOutput(run)" style="margin-left:auto" v-tooltip.bottom="'Copy raw output'">
            <template #icon><Icon name="Note" :size="12" /></template>
          </JwButton>
        </div>
        <div class="out-tabs" v-else-if="run.mode === 'studio'">
          <button class="tab" :class="{ active: run.studioView === 'raw' }" @click="run.studioView = 'raw'">Raw</button>
          <button class="tab" :class="{ active: run.studioView === 'parsed' }" :disabled="!run.parsedRows.length" @click="run.studioView = 'parsed'">
            Parsed{{ run.parsedRows.length ? ` (${run.parsedRows.length})` : '' }}
          </button>
          <JwButton intent="ghost" size="small" @click="copyOutput(run)" style="margin-left:auto" v-tooltip.bottom="'Copy raw output'">
            <template #icon><Icon name="Note" :size="12" /></template>
          </JwButton>
        </div>
        <div class="out-tabs" v-else-if="run.mode === 'inline'">
          <button class="tab" :class="{ active: run.inlineView === 'raw' }" @click="run.inlineView = 'raw'">Raw</button>
          <button class="tab" :class="{ active: run.inlineView === 'parsed' }" :disabled="!run.inlineParsedRows.length" @click="run.inlineView = 'parsed'">
            Parsed{{ run.inlineParsedRows.length ? ` (${run.inlineParsedRows.length})` : '' }}
          </button>
          <JwButton intent="ghost" size="small" @click="copyOutput(run)" style="margin-left:auto" v-tooltip.bottom="'Copy raw output'">
            <template #icon><Icon name="Note" :size="12" /></template>
          </JwButton>
        </div>

        <!-- Raw streaming output (lab, studio-raw, inline-raw) -->
        <pre
          v-if="run.mode === 'lab' || (run.mode === 'studio' && run.studioView === 'raw') || (run.mode === 'inline' && run.inlineView === 'raw')"
          class="output mono"
        >{{ activeOutput(run) || (run.state === 'streaming' ? '…' : '(no output yet)') }}</pre>

        <!-- Studio parsed view (per paragraph) -->
        <div v-else-if="run.mode === 'studio' && run.studioView === 'parsed'" class="parsed-output">
          <div v-for="(row, i) in run.parsedRows" :key="i" class="parsed-row" :class="`conf-${confBucket(row.confidence)}`">
            <span class="parsed-num">{{ row.intro ? '⋆' : i }}</span>
            <div class="parsed-meta">
              <div class="parsed-speaker">{{ speakerName(row.speaker) }}</div>
              <div class="parsed-kc">
                <span class="parsed-kind">{{ row.kind }}</span>
                <span class="parsed-conf">{{ Math.round((row.confidence || 0) * 100) }}%</span>
              </div>
            </div>
            <p class="parsed-text">{{ row.text }}</p>
          </div>
        </div>

        <!-- Inline parsed view (per segment, grouped by paragraph) -->
        <div v-else-if="run.mode === 'inline' && run.inlineView === 'parsed'" class="parsed-output inline-parsed">
          <template v-for="(row, i) in run.inlineParsedRows" :key="i">
            <div
              class="parsed-row"
              :class="[
                `conf-${confBucket(row.confidence)}`,
                `kind-${row.kind}`,
                { 'paragraph-start': i === 0 || run.inlineParsedRows[i - 1].paragraphIdx !== row.paragraphIdx },
              ]"
            >
              <span class="parsed-num">{{ row.intro ? '⋆' : row.paragraphIdx + 1 }}</span>
              <div class="parsed-meta">
                <div class="parsed-speaker">{{ speakerName(row.speaker) }}</div>
                <div class="parsed-kc">
                  <span class="parsed-kind">{{ row.kind }}</span>
                  <span class="parsed-conf" :class="`src-${row.source || (row.auto ? 'auto' : 'llm')}`">{{ inlineSourceLabel(row) }}</span>
                  <span
                    v-if="row.llmSpeaker && row.llmSpeaker !== row.speaker"
                    class="parsed-disagree"
                    :title="`LLM disagreed: ${speakerName(row.llmSpeaker)} ${Math.round((row.llmConfidence || 0) * 100)}%`"
                  >≠ LLM</span>
                  <span
                    v-if="row.source === 'floored' && row.flooredFrom"
                    class="parsed-floored"
                    :title="`Demoted to unknown by confidence floor — LLM picked ${speakerName(row.flooredFrom)}`"
                  >was: {{ speakerName(row.flooredFrom) }}</span>
                </div>
              </div>
              <p class="parsed-text">{{ row.text }}</p>
            </div>
          </template>
        </div>

        <div v-if="run.error" class="banner danger">{{ run.error }}</div>
      </article>
    </div>

    <!-- ── Preset manager ─────────────────────────────────────────── -->
    <section v-if="presets.length" class="card preset-mgr">
      <div class="t-eyebrow" style="margin-bottom:8px">Saved presets</div>
      <div class="preset-list">
        <div v-for="p in presets" :key="p.name" class="preset-chip">
          <span><b>{{ p.name }}</b> · {{ p.twoStage ? '2-stage' : '1-stage' }} · <span class="t-muted">{{ p.stage1.model || '(default)' }}{{ p.twoStage ? ` → ${p.stage2.model || '(default)'}` : '' }}</span></span>
          <JwButton intent="ghost" size="small" @click="deletePreset(p.name)" v-tooltip.bottom="'Delete preset'">
            <template #icon><Icon name="Trash" :size="11" /></template>
          </JwButton>
        </div>
      </div>
    </section>
  </div>
</template>

<style>
.lab { padding: 18px 22px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
.lab .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
.lab .card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.lab .stat-row { display: flex; gap: 14px; }
.lab .stat { font-size: 11.5px; color: var(--muted); }
.lab .stat b { color: var(--ink); font-weight: 600; }
.lab .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
.lab textarea.mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 12.5px; line-height: 1.5; width: 100%; resize: vertical; }
.lab .input.sm { padding: 4px 8px; font-size: 12px; height: 28px; }
.lab .input.mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }

.lab .run-bar { display: flex; gap: 8px; align-items: center; }

.lab .columns { display: grid; gap: 14px; }
.lab .columns.cols-1 { grid-template-columns: 1fr; }
.lab .columns.cols-2 { grid-template-columns: 1fr 1fr; }
.lab .columns.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
.lab .columns.cols-4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
@media (max-width: 1100px) { .lab .columns { grid-template-columns: 1fr !important; } }

.lab .col { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; }
.lab .col-head { display: flex; align-items: center; gap: 10px; }
.lab .col-label { flex: 1; font-weight: 600; font-size: 13px; padding: 4px 8px; height: 28px; }
.lab .toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--muted); cursor: pointer; user-select: none; }
.lab .toggle input { margin: 0; }
.lab .icon-btn { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); display: grid; place-items: center; color: var(--muted); cursor: pointer; }
.lab .icon-btn:hover { color: var(--ink); border-color: var(--border-strong); }

.lab .stage { border: 1px solid var(--border); border-radius: 10px; padding: 0; background: var(--surface-2); margin: 0; }
.lab .stage.active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.lab .stage legend { padding: 8px 12px; font-size: 11.5px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; color: var(--ink-2); }
.lab .stage-body { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 6px; }
.lab .stage-body .row { display: flex; gap: 6px; align-items: center; margin-bottom: 4px; flex-wrap: wrap; }
.lab .stage-body .row .input.sm { flex: 1; min-width: 90px; }
.lab .temp { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; }
.lab .temp-input { width: 64px; flex: 0 0 auto !important; }
.lab .small { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; }
.lab .hint { text-transform: none; letter-spacing: 0; font-size: 10.5px; }
.lab .hint code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; background: var(--surface-3); padding: 1px 5px; border-radius: 4px; color: var(--ink-2); }

.lab .preset-row { display: flex; gap: 6px; align-items: center; padding-top: 4px; border-top: 1px dashed var(--border-soft); }
.lab .action-row { display: flex; gap: 8px; align-items: center; }

.lab .badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--surface-3); color: var(--ink-2); display: inline-flex; align-items: center; gap: 4px; }
.lab .badge.ok { background: var(--accent-soft); color: var(--accent-ink); }
.lab .badge.err { background: var(--danger-bg); color: var(--danger-ink); }
.lab .badge.pulse { background: var(--accent); color: var(--on-accent); animation: lab-pulse 1.2s ease-in-out infinite; }
@keyframes lab-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }

.lab .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; padding: 8px 0; border-top: 1px solid var(--border-soft); border-bottom: 1px solid var(--border-soft); }
@media (max-width: 900px) { .lab .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.lab .metric { display: flex; flex-direction: column; gap: 1px; font-size: 11px; align-items: flex-start; }
.lab .metric b { font-size: 16px; font-weight: 600; color: var(--ink); }
.lab .metric i { font-style: normal; font-size: 10px; }
.lab .usage-line { font-size: 10.5px; }

.lab .out-tabs { display: flex; gap: 4px; align-items: center; }
.lab .tab { background: none; border: 0; padding: 4px 8px; font-size: 11.5px; color: var(--muted); border-bottom: 2px solid transparent; cursor: pointer; }
.lab .tab.active { color: var(--ink); border-bottom-color: var(--accent); }

.lab .output { background: var(--surface-3); border: 1px solid var(--border-soft); border-radius: 8px; padding: 10px 12px; font-size: 12px; line-height: 1.5; max-height: 360px; overflow: auto; white-space: pre-wrap; word-break: break-word; margin: 0; min-height: 80px; }

.lab .banner.danger { background: var(--danger-bg); color: var(--danger-ink); border-radius: 8px; padding: 8px 12px; font-size: 12px; }

.lab .preset-mgr .preset-list { display: flex; flex-wrap: wrap; gap: 6px; }
.lab .preset-chip { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 999px; font-size: 11.5px; }

/* Studio mode */
.lab .studio-toggle { color: var(--accent-ink); }
.lab .studio-stage legend b { color: var(--accent-ink); }
.lab .studio-info {
  display: flex; gap: 8px; align-items: flex-start;
  padding: 8px 10px;
  background: var(--accent-soft);
  border-radius: 6px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--accent-ink);
  margin-bottom: 4px;
}
.lab .studio-info code {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 10.5px;
  background: var(--surface);
  padding: 1px 5px;
  border-radius: 4px;
  color: var(--ink);
}
.lab .studio-info i { font-style: italic; }
.lab .out-tabs .tab[disabled] { opacity: 0.4; cursor: not-allowed; }

.lab .parsed-output {
  background: var(--surface-3);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  max-height: 480px;
  overflow: auto;
  display: flex; flex-direction: column;
}
.lab .parsed-row {
  display: grid;
  grid-template-columns: 24px 110px 1fr;
  gap: 10px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-soft);
  align-items: start;
}
.lab .parsed-row:last-child { border-bottom: 0; }
.lab .parsed-num { font-size: 10px; color: var(--muted); text-align: right; padding-top: 2px; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
.lab .parsed-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.lab .parsed-speaker { font-size: 12px; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lab .parsed-kc { display: flex; gap: 6px; align-items: center; font-size: 10.5px; color: var(--muted); }
.lab .parsed-kind { text-transform: uppercase; letter-spacing: 0.04em; font-size: 9.5px; }
.lab .parsed-conf { font-variant-numeric: tabular-nums; }
.lab .parsed-text { margin: 0; font-family: var(--font-serif); font-size: 12.5px; line-height: 1.5; color: var(--ink); word-break: break-word; }
.lab .parsed-row.conf-low  { background: color-mix(in oklch, var(--danger-bg), transparent 40%); }
.lab .parsed-row.conf-low  .parsed-conf { color: var(--danger-ink); }
.lab .parsed-row.conf-med  .parsed-conf { color: var(--ink-2); }
.lab .parsed-row.conf-high .parsed-conf { color: var(--accent-ink); }

/* Mode segmented control */
.lab .mode-seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--surface-2);
}
.lab .mode-seg-btn {
  padding: 4px 10px;
  font-size: 11px;
  border: 0;
  border-right: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-weight: 500;
}
.lab .mode-seg-btn:last-child { border-right: 0; }
.lab .mode-seg-btn:hover { color: var(--ink); }
.lab .mode-seg-btn.active { background: var(--accent); color: var(--on-accent); }

/* Inline-tag mode */
.lab .inline-stage legend b { color: var(--accent-ink); }
.lab .inline-parsed .parsed-row.paragraph-start { border-top: 2px solid var(--border); }
.lab .inline-parsed .parsed-row.paragraph-start:first-child { border-top: 0; }
.lab .parsed-row.kind-narration { opacity: 0.62; }
.lab .parsed-row.kind-narration .parsed-text { font-style: italic; color: var(--muted); }
.lab .parsed-row.kind-narration .parsed-speaker { color: var(--muted); }
.lab .parsed-row.kind-dialogue .parsed-speaker { color: var(--ink); font-weight: 600; }
.lab .parsed-conf.src-tag, .lab .parsed-conf.src-propagated { color: var(--accent-ink); font-weight: 600; }
.lab .parsed-disagree { font-size: 9.5px; padding: 1px 5px; border-radius: 4px; background: var(--danger-bg); color: var(--danger-ink); margin-left: 4px; cursor: help; }
.lab .parsed-floored { font-size: 9.5px; padding: 1px 5px; border-radius: 4px; background: var(--surface-3); color: var(--muted); margin-left: 4px; font-style: italic; cursor: help; }
.lab .parsed-conf.src-floored { color: var(--muted); font-style: italic; }
</style>
