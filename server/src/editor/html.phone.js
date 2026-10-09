// SPDX-License-Identifier: MIT
// The phone's twin of html.js: TipTap's server conversion (`@tiptap/html/server`) step for step —
// the HTML wrapped in a document, parsed by ProseMirror's DOMParser from the schema; a document
// serialized by its DOMSerializer into a <div> — with linkedom (ISC, pure JavaScript; decided
// 2026-10-08, JustWrite's TASKS, Sync decision 9) as the DOM, since a worker has none.
// server/tests/scene_html.test.js keeps the two equal on real scenes.
import { getSchema } from "@tiptap/core";
import { Node, DOMParser as PMDOMParser, DOMSerializer } from "@tiptap/pm/model";
import { parseHTML } from "linkedom";

// linkedom answers getAttribute("class") with "" when the element has none (linkedom 0.18.13); the
// DOM standard — and happy-dom, the server's — answer null, which is what TipTap's attribute parsing
// reads (a link with no class must keep `class: null`). The twin asks the standard's question.
{
  const { document } = parseHTML("<!DOCTYPE html><html><body><a></a></body></html>");
  let proto = Object.getPrototypeOf(document.querySelector("a"));
  while (proto && !Object.hasOwn(proto, "getAttribute")) proto = Object.getPrototypeOf(proto);
  const getAttribute = proto.getAttribute;
  proto.getAttribute = function (name) {
    return this.hasAttribute(name) ? getAttribute.call(this, name) : null;
  };
}

export function generateJSON(html, extensions, options) {
  const schema = getSchema(extensions);
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
  return PMDOMParser.fromSchema(schema).parse(document.body, options).toJSON();
}

export function generateHTML(doc, extensions) {
  const schema = getSchema(extensions);
  const contentNode = Node.fromJSON(schema, doc);
  const { document } = parseHTML("<!DOCTYPE html><html><body></body></html>");
  const wrap = document.createElement("div");
  DOMSerializer.fromSchema(schema).serializeFragment(contentNode.content, { document }, wrap);
  return wrap.innerHTML;
}
