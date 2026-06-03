// Imperative, promise-based dialog API that replaces the browser's
// built-in prompt() / confirm() (which leak the "from localhost" chrome
// in dev and look out of place in the packaged Tauri shell).
//
// Usage:
//   const title = await promptDialog({
//     title: "New chapter", label: "Chapter title", confirmLabel: "Create"
//   });
//   if (!title) return; // user cancelled
//
//   const values = await promptDialog({
//     title: "New article",
//     fields: [
//       { key: "title", label: "Title" },
//       { key: "category", label: "Category", type: "select",
//         defaultValue: "geography",
//         options: [{ value: "geography", label: "Geography" }, ...] },
//     ],
//   });
//   if (!values) return;
//
//   const yes = await confirmDialog({
//     title: "Delete chapter?",
//     message: 'Delete "Chapter 7"? This can\'t be undone.',
//     confirmLabel: "Delete", danger: true,
//   });
//
// A single dialog at a time. The host component (AppDialog.vue) reads
// `dialogState` and calls _resolveDialog(...) on confirm / cancel.

import { reactive } from "vue";

export const dialogState = reactive({
  open: false,
  kind: null,        // "prompt" | "confirm"
  options: null,
  _resolve: null,
});

function openDialog(kind, options) {
  // If something is already open, cancel it first so the new prompt wins.
  if (dialogState.open && dialogState._resolve) {
    dialogState._resolve(kind === "confirm" ? false : null);
  }
  return new Promise((resolve) => {
    dialogState.kind = kind;
    dialogState.options = options;
    dialogState._resolve = resolve;
    dialogState.open = true;
  });
}

export function promptDialog(options = {}) {
  return openDialog("prompt", options);
}

export function confirmDialog(options = {}) {
  return openDialog("confirm", options);
}

// Called by the dialog host on confirm / cancel.
//
// We deliberately keep `kind` and `options` set after closing — the
// dialog host renders its body off those, and Reka UI's DialogContent
// keeps the dialog frame mounted during its close animation (~150ms).
// Clearing kind/options synchronously made the body content disappear
// mid-fade ("dialog collapses to just the header + footer for a frame"
// before disappearing entirely). The next openDialog call overwrites
// both fields atomically, so the stale data is harmless until then.
export function _resolveDialog(value) {
  const r = dialogState._resolve;
  dialogState.open = false;
  dialogState._resolve = null;
  if (r) r(value);
}