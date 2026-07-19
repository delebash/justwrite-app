// useWritingNav — the ONE place that answers "where does the writer land when
// they open a chapter / hit Quick write / hit Resume". Every writing-entry
// surface (Home CTAs, the sidebar chapter row) goes through here so they behave
// identically: you drop straight onto a SCENE editor, never the chapter overview.
//
// The overview is still a valid state (breadcrumb, chapter-notes scope, ?new=1
// chapter creation) — this composable just never routes you there; it only ever
// pushes /chapters/<id>/<sceneId>.
//
// "Where you left off" is real: ChaptersView records the active scene via
// ui.noteScene, and resolveSceneFor / resume read it back (persisted through
// /v1/settings, so resume survives a reload).
import { useRouter } from "vue-router";

import { useProjectStore } from "../stores/project.js";
import { useSessionsStore } from "../stores/sessions.js";
import { useUiStore } from "../stores/ui.js";

// A scene with no prose (tags stripped) — a fresh/untouched scene. Its title may
// be seeded from the chapter (addScene does this for a chapter's first scene),
// so blank is judged on the BODY only.
function isBlankScene(scene) {
  if (!scene) return false;
  return (scene.body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length === 0;
}

export function useWritingNav() {
  const router = useRouter();
  const project = useProjectStore();
  const ui = useUiStore();
  const sessions = useSessionsStore();

  const scenesFor = (chapterId) => project.scenesFor(chapterId) || [];

  // The scene a chapter should open to: the remembered last-edited scene if it
  // still exists, else the first scene. null ⇒ the chapter has no scenes yet.
  function resolveSceneFor(chapterId) {
    const scenes = scenesFor(chapterId);
    if (!scenes.length) return null;
    const remembered = ui.lastSceneByChapter?.[chapterId];
    if (remembered && scenes.some((s) => s.id === remembered)) return remembered;
    return scenes[0].id;
  }

  function go(chapterId, sceneId) {
    ui.select("chapters", chapterId);
    router.push(`/chapters/${chapterId}/${sceneId}`);
  }

  // Click a chapter → drop into its last-edited scene. A one-scene chapter opens
  // that scene; an empty chapter gets a fresh scene 1. Never the overview.
  function openChapter(chapterId) {
    if (!chapterId) return;
    const sid = resolveSceneFor(chapterId) || project.addScene(chapterId, {});
    go(chapterId, sid);
  }

  // "Quick write" → a fresh blank scene, cursor in it. Appends to your current
  // chapter (or a brand-new Chapter 1 if the book is empty). Reuses a trailing
  // empty scene so repeated clicks don't pile up empties.
  function quickWrite() {
    let chapterId = ui.selections.chapters;
    if (!chapterId || !project.chapterById(chapterId)) {
      const all = project.allChapters;
      chapterId = all[all.length - 1]?.id;
    }
    if (!chapterId) chapterId = project.addChapter({});
    const scenes = scenesFor(chapterId);
    const last = scenes[scenes.length - 1];
    const sid = isBlankScene(last) ? last.id : project.addScene(chapterId, {});
    go(chapterId, sid);
  }

  // "Resume writing" → exactly where you left off (the global last scene). Falls
  // back gracefully: if the remembered chapter still exists we open it (its
  // remembered scene, or its first); otherwise today's chapter / the selection /
  // chapter one; an empty book starts a fresh scene.
  function resume() {
    const g = ui.lastScene;
    if (g?.chapterId && project.chapterById(g.chapterId)) {
      const scenes = scenesFor(g.chapterId);
      if (scenes.length) {
        go(g.chapterId, scenes.some((s) => s.id === g.sceneId) ? g.sceneId : scenes[0].id);
        return;
      }
    }
    const fallback = sessions.todayChapterId || ui.selections.chapters || project.allChapters[0]?.id;
    if (fallback) openChapter(fallback);
    else quickWrite();
  }

  return { resolveSceneFor, openChapter, quickWrite, resume };
}
