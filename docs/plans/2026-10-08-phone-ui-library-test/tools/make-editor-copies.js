// Generates the UI-library test's RichEditor copies (src/ui-test/<lib>/RichEditor.vue) from
// the real src/components/RichEditor.vue: import paths re-rooted, and every toolbar
// <button class="tb-btn…"> in the top toolbar turned into the library's <TbBtn>.
// usage: node make-editor-copies.js <justwrite-app root> quasar element
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [root, ...libs] = process.argv.slice(2);
const src = readFileSync(path.join(root, "src/components/RichEditor.vue"), "utf8");
const nl = src.includes("\r\n") ? "\r\n" : "\n";

const LIB_NAME = { quasar: "Quasar", element: "Element Plus" };

for (const lib of libs) {
  let out = src
    .replace(/from "\.\.\/([^"]+)"/g, 'from "../../$1"')
    .replace(/from "\.\/([^"]+)"/g, 'from "../../components/$1"');

  const start = out.indexOf('<div class="editor-toolbar"');
  const end = out.indexOf("<!-- Find & replace bar -->", start);
  if (start < 0 || end < 0) throw new Error("toolbar block not found");
  let block = out.slice(start, end);
  let converted = 0;
  let open = false;
  block = block.replace(/<button\b[^>]*?\/?>|<\/button>/g, (tag) => {
    if (tag === "</button>") {
      if (open) { open = false; return "</TbBtn>"; }
      return tag;
    }
    if (!/class="tb-btn/.test(tag)) return tag;
    converted++;
    open = !tag.endsWith("/>");
    return tag
      .replace("<button", "<TbBtn")
      .replace(/class="tb-btn-split/, 'class="tb-lib-split')
      .replace(/class="tb-btn tb-btn-split/, 'class="tb-lib-split')
      .replace(/class="tb-btn/, 'class="tb-lib');
  });
  out = out.slice(0, start) + block + out.slice(end);

  const header = [
    "<script setup>",
    "// SPDX-License-Identifier: MIT",
    `// GENERATED for the phone UI-library test from src/components/RichEditor.vue (scratchpad`,
    `// make-editor-copies.js): the same editor, its top toolbar's ${converted} buttons on ${LIB_NAME[lib]}`,
    "// (./TbBtn.vue). Everything else — the bubble menu, find bar, comment and marker popovers —",
    "// is the real editor's markup.",
    'import TbBtn from "./TbBtn.vue";',
  ].join(nl);
  if (!out.startsWith("<script setup>")) throw new Error("unexpected first line");
  out = header + out.slice("<script setup>".length);

  const dest = path.join(root, "src/ui-test", lib, "RichEditor.vue");
  writeFileSync(dest, out);
  console.log(`${lib}: ${converted} toolbar buttons → TbBtn; wrote ${dest}`);
}
