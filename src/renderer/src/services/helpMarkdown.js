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

const renderer = new marked.Renderer();
const baseLinkRenderer = renderer.link.bind(renderer);
renderer.link = ({ href, title, tokens }) => {
  let h = href || "";
  let internal = false;
  if (/^[^/:#?]+\.md(#.*)?$/.test(h)) {
    const [file, anchor = ""] = h.split("#");
    const slug = file.replace(/\.md$/, "");
    const realSlug = slug === "README" ? "" : slug;
    h = `/help${realSlug ? "/" + realSlug : ""}${anchor ? "#" + anchor : ""}`;
    internal = true;
  }
  const html = baseLinkRenderer({ href: h, title, tokens });
  if (internal) return html.replace("<a ", `<a data-help-link="1" `);
  if (/^https?:/i.test(h)) {
    return html.replace("<a ", `<a target="_blank" rel="noopener noreferrer" `);
  }
  return html;
};

marked.setOptions({ renderer, gfm: true, breaks: false });

// Strip the leading H1 since the host surface renders the title in
// its own header bar.
export function renderHelpMarkdown(md) {
  if (!md) return "";
  const stripped = md.replace(/^#\s+.+\n+/, "");
  return marked.parse(stripped);
}
