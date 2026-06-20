// In-app Help docs loader.
//
// docs/*.md and docs/toc.json live at the repo root (one level above
// the vite root, `src/renderer/`). Both are bundled at build time —
// markdown via import.meta.glob as raw strings, the TOC as a plain
// JSON import. The same docs/ folder is packed into docs.tar.gz at
// release time and consumed by the marketing site, so this file and
// the website's DocsLayout.astro share a single source of truth.

import HELP_TOC_DATA from "../../../../docs/toc.json";

// Lazy (no `eager`): a doc's markdown is fetched only when something opens it,
// not bundled into / fetched on the boot path. Loaded docs are cached.
const loaders = import.meta.glob("../../../../docs/*.md", {
  query: "?raw",
  import: "default",
});

// slug → () => Promise<rawMarkdown>
const DOC_LOADERS = {};
for (const path in loaders) {
  const slug = path.split("/").pop().replace(/\.md$/, "");
  const key = slug === "README" ? "index" : slug;
  DOC_LOADERS[key] = loaders[path];
}

const _cache = {};

export const HELP_TOC = HELP_TOC_DATA;

// Public web URL for the same docs. The "Open on the web" button in
// HelpView links here. Update the base if the marketing site moves.
export const HELP_WEB_BASE = "https://delebash.github.io/justwrite-website/docs";

// Async: loads (and caches) a doc's markdown on demand. Returns null if absent.
export async function loadDoc(slug) {
  const key = slug || "index";
  if (key in _cache) return _cache[key];
  const loader = DOC_LOADERS[key];
  if (!loader) return null;
  const raw = await loader();
  _cache[key] = raw;
  return raw;
}

export function hasDoc(slug) {
  return Boolean(DOC_LOADERS[slug || "index"]);
}

export function titleForSlug(slug) {
  if (!slug || slug === "index") return "Help";
  for (const group of HELP_TOC) {
    const hit = group.items.find((i) => i.slug === slug);
    if (hit) return hit.title;
  }
  return slug;
}

export function webUrlFor(slug) {
  if (!slug || slug === "index") return HELP_WEB_BASE;
  return `${HELP_WEB_BASE}/${slug}`;
}
