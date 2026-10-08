// Compares two renderer builds file by file and greps the after-build for any test code.
// usage: node distdiff.js <beforeDir> <afterDir>
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const [before, after] = process.argv.slice(2);
const walk = (d, b = d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name), b) : [path.relative(b, path.join(d, e.name)).split(path.sep).join("/")]);
const A = walk(before);
const B = walk(after);
const sA = new Set(A);
const sB = new Set(B);
let same = 0;
const diff = [];
for (const f of A) {
  if (!sB.has(f)) continue;
  if (readFileSync(path.join(before, f)).equals(readFileSync(path.join(after, f)))) same++;
  else diff.push(f);
}
console.log(`files before ${A.length} after ${B.length} identical ${same} differ ${diff.length}`);
console.log("differ:", diff.join(" ") || "-");
console.log("only before:", A.filter((f) => !sB.has(f)).join(" ") || "-");
console.log("only after:", B.filter((f) => !sA.has(f)).join(" ") || "-");
const hits = B.filter((f) => /\.(js|css)$/.test(f))
  .filter((f) => /quasar|element-plus|\bq-btn\b|\bel-button\b|ui-test/i.test(readFileSync(path.join(after, f), "utf8")));
console.log("after-build files mentioning quasar / element-plus / ui-test:", hits.join(" ") || "none");
