// SPDX-License-Identifier: MIT
// The editor's HTML ↔ document conversion on the server — TipTap's own (`@tiptap/html/server`, on
// happy-dom), used by the sync's scene-text adapter (sync.js). Its own module so the phone's
// in-app server can put its twin in its place: html.phone.js, the same conversion on linkedom (a
// worker has no DOM, and happy-dom needs Node).
export { generateHTML, generateJSON } from "@tiptap/html/server";
