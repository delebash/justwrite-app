// In-app Help docs loader — the app half of the kit Help system.
//
// docs/*.md and docs/toc.json live at the repo root (one level above the vite
// root). The adapter LOGIC (README→index aliasing, lazy load + cache, TOC
// titles, web URLs) is the kit's makeDocsHelpAdapter — one implementation for
// the family. What stays here is what vite resolves relative to THIS file: the
// import.meta.glob over the corpus and the toc import, plus JustWrite's public
// docs base. The same docs/ folder is packed into docs.tar.gz at release time
// and consumed by the marketing site, so this corpus and the website's
// DocsLayout.astro share a single source of truth.

import { makeDocsHelpAdapter } from "@delebash/llm-ui";
import HELP_TOC_DATA from "../../docs/toc.json";

export const HELP_TOC = HELP_TOC_DATA;

// Public web URL for the same docs. The "Open on the web" button in HelpView
// links here. Update the base if the marketing site moves.
export const HELP_WEB_BASE = "https://delebash.github.io/justwrite-website/docs";

// Lazy (no `eager`): a doc's markdown is fetched only when something opens it,
// not bundled into / fetched on the boot path. Loaded docs are cached.
export const { loadDoc, hasDoc, titleForSlug, webUrlFor } = makeDocsHelpAdapter(
  import.meta.glob("../../docs/*.md", { query: "?raw", import: "default" }),
  HELP_TOC_DATA,
  { webBase: HELP_WEB_BASE },
);
