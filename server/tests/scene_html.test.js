// SPDX-License-Identifier: MIT
// The phone's HTML conversion (server/src/editor/html.phone.js, on linkedom) gives what the
// server's gives (html.js — TipTap's own, on happy-dom) on real scenes: the tutorial book's, and
// the editor's harder shapes (marks, a mention, an image, a table, a link, a task list). The sync's
// scene-text adapter uses one or the other, so a scene merged on the phone renders as on a computer.
import { expect, test } from "vitest";
import { demoBookSnapshot } from "../src/database/demo_seed.js";
import * as phone from "../src/editor/html.phone.js";
import * as server from "../src/editor/html.js";
import { bodyToHtml, editorExtensions, schemaMention } from "../src/editor/editorSchema.js";

const extensions = editorExtensions({ mention: schemaMention() });

const HARD = [
  '<p>Plain <strong>bold</strong> <em>it</em> <u>under</u> <s>strike</s> <code>code</code> <a href="https://example.com" rel="noopener nofollow" target="_blank">link</a></p>',
  '<h2>A heading</h2><blockquote><p>Quoted.</p></blockquote><ul><li><p>one</p></li><li><p>two</p></li></ul>',
  '<p>Before.</p><img src="/v1/images/img_1" alt="the map"><p>After &amp; more — “quotes”.</p>',
  '<table><tbody><tr><th><p>H</p></th><th><p>I</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>',
  '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>done</p></li></ul>',
  '<p style="text-align: center">Centered <mark data-color="#fde68a" style="background-color: #fde68a; color: inherit">marked</mark></p>',
];

test("the phone's conversion equals the server's on every tutorial scene and the harder shapes", () => {
  const scenes = Object.values(demoBookSnapshot().scenes).flat().map((s) => bodyToHtml(s.body ?? ""));
  expect(scenes.length).toBeGreaterThan(5);
  for (const html of [...scenes, ...HARD]) {
    const json = server.generateJSON(html, extensions);
    expect(phone.generateJSON(html, extensions)).toEqual(json);
    // the HTML each writes reads back to the same document; an element's attributes may come in
    // another order (linkedom and happy-dom list them differently — order carries no meaning), so
    // the text is compared exactly only where no element has two or more
    const fromPhone = phone.generateHTML(json, extensions);
    const fromServer = server.generateHTML(json, extensions);
    expect(server.generateJSON(fromPhone, extensions)).toEqual(server.generateJSON(fromServer, extensions));
    if (!/<\w+(\s+[\w-]+="[^"]*"){2,}/.test(fromServer)) expect(fromPhone).toBe(fromServer);
  }
});
