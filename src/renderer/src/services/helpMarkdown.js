// Shared marked renderer for the in-app Help surfaces.
//
// HelpView (the full-pane TOC + reader) and JwHelpDrawer (the
// contextual side panel opened by the per-surface `?` button)
// both render the same docs/*.md corpus, so the rewrite logic
// for intra-doc links lives here.
//
// Rewrites:
//   - "foo.md" / "foo.md#section" → "/help/foo[#section]" with a
//     data-help-link attribute, so callers can intercept clicks and
//     decide whether to push the router (HelpView) or close the
//     drawer + navigate (HelpDrawer).
//   - external "https?:" links get target=_blank + rel=noopener.

import { marked } from "marked";

// Heading text → URL/anchor slug. Mirrors GitHub-style slug rules so
// "## Locations & places" and a docs link like `story-bible.md#locations--places`
// resolve to the same id. Strips emoji + punctuation, collapses whitespace.
export function slugifyHeading(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}☀-➿]/gu, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

const renderer = new marked.Renderer();
const baseLinkRenderer = renderer.link.bind(renderer);
renderer.link = ({ href, title, tokens }) => {
  let h = href || "";
  let internal = false;
  if (/^[^/:#?]+\.md(#.*)?$/.test(h)) {
    const [file, anchor = ""] = h.split("#");
    const slug = file.replace(/\.md$/, "");
    const realSlug = slug === "README" ? "" : slug;
    h = `/help${realSlug ? `/${realSlug}` : ""}${anchor ? `#${anchor}` : ""}`;
    internal = true;
  }
  const html = baseLinkRenderer({ href: h, title, tokens });
  if (internal) return html.replace("<a ", `<a data-help-link="1" `);
  if (/^https?:/i.test(h)) {
    return html.replace("<a ", `<a target="_blank" rel="noopener noreferrer" `);
  }
  return html;
};

// Add id="<slug>" to every heading so the drawer can scrollIntoView for a
// given section. Regular function (not arrow) so `this` binds to the parser
// context — needed to call this.parser.parseInline on the inline tokens.
// Strip tags before slugifying so emojis/links don't pollute the id.
renderer.heading = function headingRenderer({ tokens, depth }) {
  const inner = this.parser.parseInline(tokens);
  const plain = String(inner).replace(/<[^>]+>/g, "");
  const id = slugifyHeading(plain);
  return `<h${depth}${id ? ` id="${id}"` : ""}>${inner}</h${depth}>\n`;
};

marked.setOptions({ renderer, gfm: true, breaks: false });

// Strip the leading H1 since the host surface renders the title in
// its own header bar.
export function renderHelpMarkdown(md) {
  if (!md) return "";
  const stripped = md.replace(/^#\s+.+\n+/, "");
  return marked.parse(stripped);
}
