// SPDX-License-Identifier: MIT
// What the installed app's server can load: electron-builder packs the server's declared dependency
// tree into app.asar, and a required peer dependency nobody declares is left out — npm installs it in
// the checkout, so everything works there, and the installed server stops at start. Found by the
// release dry run, 2026-10-20: @tiptap/extension-mention's peer @tiptap/suggestion, missing from the
// AppImage ("Cannot find package '@tiptap/suggestion'"), and from an installed Windows copy alike.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const SERVER = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => JSON.parse(readFileSync(file, "utf8"));

/** A package's package.json as the server finds it: its own node_modules, then the workspace's. */
function manifest(name) {
  for (const base of [join(SERVER, "node_modules"), join(SERVER, "..", "node_modules")]) {
    const file = join(base, name, "package.json");
    if (existsSync(file)) return read(file);
  }
  return null;
}

test("every required peer dependency in the server's tree is declared (electron-builder packs only those)", () => {
  const declared = Object.keys(read(join(SERVER, "package.json")).dependencies ?? {});
  const tree = new Set();
  const walk = (name) => {
    if (tree.has(name)) return;
    tree.add(name);
    for (const dep of Object.keys(manifest(name)?.dependencies ?? {})) walk(dep);
  };
  for (const name of declared) walk(name);
  const missing = [];
  for (const name of tree) {
    const m = manifest(name);
    const optional = m?.peerDependenciesMeta ?? {};
    for (const peer of Object.keys(m?.peerDependencies ?? {})) {
      if (!optional[peer]?.optional && !tree.has(peer)) missing.push(`${peer} (a peer of ${name})`);
    }
  }
  expect(missing).toEqual([]);
});
