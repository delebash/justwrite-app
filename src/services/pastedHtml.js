// What a paste brings into the editor, before the editor reads it (ProseMirror's
// transformPastedHTML: prosemirror.net/docs/ref/#view.EditorProps.transformPastedHTML).
//
// Black text loses its colour. A word processor writes its automatic black on every run — a Google
// Doc's `color:#000000`, Word's `windowtext` — and the editor would keep it as a text colour: the
// page's own ink on a light page, invisible on a dark one.

const BLACK = new Set(["black", "windowtext", "rgb(0, 0, 0)"]);

export function dropBlackTextColor(html) {
  if (!/color/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  let dropped = false;
  for (const el of doc.body.querySelectorAll("[style]")) {
    if (!BLACK.has(el.style.color.toLowerCase())) continue;
    el.style.removeProperty("color");
    if (!el.getAttribute("style").trim()) el.removeAttribute("style");
    dropped = true;
  }
  return dropped ? doc.body.innerHTML : html;
}
