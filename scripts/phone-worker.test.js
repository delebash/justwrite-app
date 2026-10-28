// SPDX-License-Identifier: MIT
// The phone's in-app server must bundle. esbuild refuses a named import that the browser stand-ins of
// Node's built-ins don't have, and nothing else builds this bundle short of a phone build — kit 2a5cf14's
// `import { statfsSync } from "node:fs"` broke it on 2026-10-24 and went unseen until 2026-10-27
// (docs/dev/RESEARCH.md, "The phone bundle stopped building"). The build's own options, in memory
// (esbuild's `write: false`): a build error fails here; a warning doesn't.
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { phoneWorkerOptions } from "./phone-worker.js";

describe("phone-worker", () => {
  it("bundles the phone's in-app server", async () => {
    const result = await build({ ...phoneWorkerOptions(), write: false, logLevel: "silent" });
    expect(result.errors).toEqual([]);
    expect(result.outputFiles.some((f) => f.path.endsWith("server-worker.js") && f.contents.length > 0)).toBe(true);
  }, 20_000);
});
