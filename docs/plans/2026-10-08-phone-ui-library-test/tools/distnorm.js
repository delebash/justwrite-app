// Pairs chunks by name (hash stripped) and compares contents with every hashed file
// reference normalised — so a difference that is only a renamed neighbour does not count.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
const [before, after] = process.argv.slice(2);
const strip = (f) => f.replace(/-[A-Za-z0-9_-]{8}(\.(?:js|css))$/, "$1");
const norm = (s) => s.replace(/-[A-Za-z0-9_-]{8}\.(js|css)/g, "-HASH.$1");
const list = (d) => readdirSync(path.join(d, "assets"));
const A = new Map(list(before).map((f) => [strip(f), f]));
const B = new Map(list(after).map((f) => [strip(f), f]));
let same = 0;
const differ = [];
for (const [k, fa] of A) {
  const fb = B.get(k);
  if (!fb) { differ.push(`${k} (missing after)`); continue; }
  const a = norm(readFileSync(path.join(before, "assets", fa), "utf8"));
  const b = norm(readFileSync(path.join(after, "assets", fb), "utf8"));
  if (a === b) same++; else differ.push(k);
}
for (const k of B.keys()) if (!A.has(k)) differ.push(`${k} (new)`);
console.log(`chunks equal after hash-normalising: ${same}; different: ${differ.length}`);
console.log(differ.join("\n"));
