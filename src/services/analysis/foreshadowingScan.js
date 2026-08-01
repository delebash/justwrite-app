// Whole-book foreshadowing / dangling-thread sweep.
//
// Runs extractThreads() per chapter in a bounded-concurrency pool, then
// classifies each setup as likely-paid-off or dangling by searching
// later chapters for the setup's keyTerm. The classification is a
// heuristic — the user has the final say in the review modal — but a
// keyTerm that NEVER reappears in any later chapter is a strong signal
// of an unresolved promise worth surfacing.
//
// Returns the proposals enriched with:
//   - chapterId / chapterNum / chapterTitle (where the setup was planted)
//   - sceneId (located by matching the snippet to scene HTML)
//   - laterMentions: [{ chapterNum, chapterTitle }] (where keyTerm appears later)
//   - status: "dangling" | "mentioned-later" — heuristic
//
// Already-pinned setups (existing Loose-thread markers whose snippet or
// label overlaps with a proposal) are filtered out so the sweep doesn't
// surface threads the writer has already noted.

import { useAiTasksStore } from "@delebash/llm-ui";

import { normalizeName as norm, textMentionsTerm } from "../text.js";
import { extractThreads } from "./threadExtraction.js";
import { scanProjectMarkers } from "../markers.js";

const DEFAULT_CONCURRENCY = 4;

function stripText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll(".ai-del").forEach((el) => { el.remove(); });
  div.querySelectorAll(".ai-ins").forEach((el) => { el.replaceWith(...el.childNodes); });
  return div.textContent || "";
}

function findSceneIdForSnippet(project, chapterId, snippet) {
  const clean = String(snippet || "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const scenes = project.scenesFor(chapterId) || [];
  for (const scn of scenes) {
    const text = stripText(scn.body).replace(/\s+/g, " ");
    if (text.includes(clean)) return scn.id;
  }
  return null;
}

// norm() + chapterMentionsTerm() converged into services/text.js
// (normalizeName / textMentionsTerm — the RAG-build panel catch, 2026-07-11):
// this file's word-boundary "key"/"monkey" guard IS the shared primitive now.
const chapterMentionsTerm = (chapterText, keyTerm) => textMentionsTerm(chapterText, keyTerm);

// Skip a proposal if an existing Loose-thread / TODO marker already
// covers it — overlap by snippet substring or by label match.
function isAlreadyPinned(existingMarkers, proposal) {
  const pSnip = norm(proposal.snippet);
  const pLab  = norm(proposal.label);
  for (const m of existingMarkers) {
    if (m.category !== "thread" && m.category !== "todo") continue;
    const mSnip = norm(m.snippet);
    const mLab  = norm(m.label);
    if (pSnip && mSnip && (pSnip.includes(mSnip) || mSnip.includes(pSnip))) return true;
    if (pLab && mLab && pLab === mLab) return true;
  }
  return false;
}

/**
 * Scan every chapter for setups, then cross-reference later chapters to
 * classify each as dangling or likely-paid-off. Returns a flat list of
 * proposals sorted by chapter order.
 */
export async function scanForDanglingThreads({
  project,
  signal,
  onProgress,
  provider,
  model,
  chapterFilter,
  concurrency = DEFAULT_CONCURRENCY,
} = {}) {
  if (!project) throw new Error("scanForDanglingThreads: project store is required.");

  const allChapters = project.allChapters.filter((c) => {
    if (chapterFilter?.ids) return chapterFilter.ids.has(c.id);
    return true;
  });

  // QC-31 batch owner — the SAME shape as scanAllChapters + readerKnowledge:231-244
  // (one user action → ONE task entry whose handle owns the ONE controller; every
  // per-chapter call rides `runSignal` with task:false). Fixed 2026-07-17 alongside the
  // entity sweep: this pool had the identical defect — no owner, a rival task per
  // chapter, and a Cancel that reached only the first of them.
  const aiTasks = useAiTasksStore();
  const handle = aiTasks.start({
    feature: "foreshadowing",
    label: "Foreshadowing scan",
    meta: { kind: "foreshadowing" },
  });
  handle.setProgress(0, allChapters.length);
  if (signal) {
    if (signal.aborted) handle.cancel();
    else signal.addEventListener?.("abort", () => handle.cancel(), { once: true });
  }
  const runSignal = handle.signal;

  // Per-chapter plain-text bodies, computed once. Used both as input to
  // the LLM (via extractThreads) and for the later-mention sweep.
  const chapterTexts = new Map();
  for (const ch of allChapters) {
    const html = project.chapterBody[ch.id] || "";
    chapterTexts.set(ch.id, stripText(html));
  }

  // Existing marker snapshot — we filter dupes out before returning so
  // the review modal doesn't show threads the writer already pinned.
  const existingMarkers = (() => {
    try { return scanProjectMarkers(project); } catch { return []; }
  })();

  // Per-chapter LLM results, keyed by chapter id.
  const perChapter = new Map();
  const skipped = [];
  let completed = 0;

  async function processChapter(ch) {
    const text = chapterTexts.get(ch.id) || "";
    if (!text.trim()) {
      skipped.push({ id: ch.id, num: ch.num, title: ch.title, reason: "empty" });
      completed += 1;
      onProgress?.({
        phase: "skip",
        chapter: { id: ch.id, num: ch.num, title: ch.title },
        completed, total: allChapters.length, reason: "empty",
      });
      return;
    }

    onProgress?.({
      phase: "start",
      chapter: { id: ch.id, num: ch.num, title: ch.title },
      completed, total: allChapters.length,
    });

    try {
      const html = project.chapterBody[ch.id] || "";
      const fresh = await extractThreads({
        html,
        chapterTitle: ch.title,
        chapterNum: ch.num,
        signal: runSignal, provider, model,
        // task:false — the owner handle above IS this scan's one entry (QC-31).
        task: false,
        meta: { chapterId: ch.id, kind: "foreshadowing" },
      });
      perChapter.set(ch.id, fresh.setups || []);
      completed += 1;
      handle.setProgress(completed, allChapters.length);
      onProgress?.({
        phase: "done",
        chapter: { id: ch.id, num: ch.num, title: ch.title },
        completed, total: allChapters.length,
      });
    } catch (err) {
      // A CANCEL IS NOT AN ERROR — `runSignal.aborted` is the authority (the caller's
      // `signal` was never the one the calls ride). The string sniff stays only as a
      // belt: a cancelled call's message reads "…Request cancelled." with no "abort"
      // in it, so the sniff ALONE painted user-requested cancels as red ERROR rows.
      const msg = String(err?.message || err || "");
      if (runSignal.aborted || /abort/i.test(msg)) throw err;
      skipped.push({ id: ch.id, num: ch.num, title: ch.title, reason: msg.slice(0, 200) });
      completed += 1;
      handle.setProgress(completed, allChapters.length);
      onProgress?.({
        phase: "error",
        chapter: { id: ch.id, num: ch.num, title: ch.title },
        completed, total: allChapters.length, reason: msg.slice(0, 200),
      });
    }
  }

  // Bounded pool — same shape as scanAllChapters.
  const queue = [...allChapters];
  async function worker() {
    while (queue.length) {
      if (runSignal.aborted) return;
      const ch = queue.shift();
      try { await processChapter(ch); }
      catch { return; }
    }
  }
  const poolSize = Math.max(1, Math.min(concurrency | 0 || DEFAULT_CONCURRENCY, allChapters.length));
  try {
    await Promise.all(Array.from({ length: poolSize }, () => worker()));
  } finally {
    if (!runSignal.aborted) handle.finish({});
  }
  // A cancel stops here: the cross-reference pass below is pure JS over whatever was
  // gathered, and running it on a half-scanned book would present partial evidence as
  // a complete "dangling threads" verdict — the one result where absence IS the finding.
  if (runSignal.aborted) {
    return { proposals: [], skipped, totalChapters: allChapters.length, scanned: 0, cancelled: true };
  }

  // ─── Cross-reference: which setups appear in later chapters ───────
  // Pure-JS keyTerm search. No LLM.
  const proposals = [];
  for (let i = 0; i < allChapters.length; i++) {
    const ch = allChapters[i];
    const setups = perChapter.get(ch.id) || [];
    const laterChapters = allChapters.slice(i + 1);

    for (const setup of setups) {
      // Resolve the snippet to a sceneId (so the review modal's Pin
      // action knows where to write).
      const sceneId = findSceneIdForSnippet(project, ch.id, setup.snippet);

      // Walk every later chapter looking for the keyTerm.
      const laterMentions = [];
      if (setup.keyTerm) {
        for (const lc of laterChapters) {
          const text = chapterTexts.get(lc.id) || "";
          if (chapterMentionsTerm(text, setup.keyTerm)) {
            laterMentions.push({
              chapterId: lc.id,
              chapterNum: lc.num,
              chapterTitle: lc.title || "",
            });
            if (laterMentions.length >= 6) break;
          }
        }
      }

      const status = laterMentions.length ? "mentioned-later" : "dangling";

      const proposal = {
        id: `th_${ch.id}_${proposals.length}`,
        snippet: setup.snippet,
        label: setup.label,
        kind: setup.kind,
        keyTerm: setup.keyTerm,
        chapterId: ch.id,
        chapterNum: ch.num,
        chapterTitle: ch.title || "",
        sceneId,
        locatable: !!sceneId,
        laterMentions,
        status,
      };

      // Skip if an existing marker already covers this.
      if (isAlreadyPinned(existingMarkers, proposal)) continue;

      proposals.push(proposal);
    }
  }

  return {
    proposals,
    skipped,
    totalChapters: allChapters.length,
    scanned: allChapters.length - skipped.length,
  };
}
