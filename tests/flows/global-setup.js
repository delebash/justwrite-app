// The flow tests' server (Playwright's global setup and teardown,
// https://playwright.dev/docs/test-global-setup-teardown): a snapshot of your data and a server on
// it serving the built UI — the smoke's setup (scripts/lib/scratch-server.js) — up for the whole
// run, then stopped with its children and the copy removed (JW_KEEP keeps the copy). Your data and
// your running app are never written.
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { waitReady } from "../lib/smoke-common.js";
import { findDataRoot, killTree, ROOT, snapshotDataRoot, startServer } from "../../scripts/lib/scratch-server.js";

const PORT = Number(process.env.JW_FLOWS_PORT || 17498);
export const FLOWS_URL = `http://127.0.0.1:${PORT}`;

export default async function globalSetup() {
  const ui = join(ROOT, "dist", "spa");
  if (!existsSync(join(ui, "index.html"))) throw new Error("No dist/spa — `npm run test:flows` builds it first.");
  const scratch = snapshotDataRoot(await findDataRoot([17495]), { prefix: "jw-flows-" });
  const server = startServer({ port: PORT, dataDir: scratch, uiDir: ui });
  await waitReady(`${FLOWS_URL}/v1/health`, "flows server");
  return async () => {
    killTree(server);
    if (!process.env.JW_KEEP) rmSync(scratch, { recursive: true, force: true });
  };
}
