// Status label + UiTag intent — the ONE mapping, shared.
//
// Every entity view renders a status the same way: the label from the project's
// own status definitions, and a UiTag intent that tracks the editorial palette.
// Six views carried byte-identical private copies of these two functions, and
// Worldbuilding's differed only by a comment (checked, 2026-07-26).
//
// This exists because ChaptersView needed them for its new index. Adding an
// eighth copy is exactly the habit the EntityIndex extraction was about, so the
// shared one is created FIRST and the new consumer uses it. The seven existing
// copies are pre-existing duplication, filed with the whole-repo "extraction vs
// copies" audit in docs/TASKS.md — they are a drop-in swap for this composable
// whenever that sweep runs.
import { useProjectStore } from "../stores/project.js";

export function useStatusDisplay() {
  const project = useProjectStore();

  /** The status's display label, falling back to its raw id. */
  const statusLabel = (id) => project.statusById(id)?.label || id || "";

  /** Map a status id onto a UiTag intent so colours track the editorial palette. */
  const statusSeverity = (id) => {
    if (id === "done") return "success";
    if (id === "revise") return "accent2";
    if (id === "draft") return "info";
    if (id === "todo") return "secondary";
    return "secondary";
  };

  return { statusLabel, statusSeverity };
}
