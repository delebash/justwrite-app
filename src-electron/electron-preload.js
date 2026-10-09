// SPDX-License-Identifier: MIT
// The renderer's one door into the desktop shell — the kit's preload (`window.appShell`).
// Quasar bundles this file to electron-preload.cjs (sandboxed preloads run as plain scripts).
import "@delebash/llm-runner/shell/preload";
