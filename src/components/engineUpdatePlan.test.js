// SPDX-License-Identifier: MIT
// The engine update's two pure decisions, from the kit (plan
// just-llm-runner/docs/plans/2026-09-19-engine-update-safety-and-stable-channel.md §4 Slice 2).
// Tested HERE because the kit's ui/ has no vitest of its own — the same precedent as
// classMembership.test.js importing @delebash/llm-ui/classTunes.js.
//
// WHY THEY EXIST: upstream renames its release files between builds (Windows AMD went
// hip-radeon → rocm-7.14 → rocm-10.0; Linux AMD had no file at all for ~180 builds), so the
// old "swap the tag into the stored URL" produced 404s mid-update — after the new pin had
// already been written, with nothing to put it back.
import { describe, expect, it } from "vitest";

import { applyBuildToUrl, planBinaries, shouldRollback } from "@delebash/llm-ui/common/services/engineUrl.js";

const DL = "https://github.com/ggml-org/llama.cpp/releases/download";

const rows = [
  { platform: "windows", gpu: "cuda12", assetUrl: `${DL}/b10437/llama-b10437-bin-win-cuda-12.4-x64.zip`, runtimeUrl: `${DL}/b10437/cudart-llama-bin-win-cuda-12.4-x64.zip` },
  { platform: "windows", gpu: "rocm", assetUrl: `${DL}/b10437/llama-b10437-bin-win-rocm-7.14-x64.zip`, runtimeUrl: "" },
  { platform: "linux", gpu: "vulkan", assetUrl: `${DL}/b10437/llama-b10437-bin-ubuntu-vulkan-x64.tar.gz`, runtimeUrl: "" },
];

const plan = {
  build: "b10964",
  binaries: [
    // The renamed one: 7.14 → 10.0. Substitution alone would 404 here.
    { platform: "windows", gpu: "rocm", resolved: true, assetUrl: `${DL}/b10964/llama-b10964-bin-win-rocm-10.0-x64.zip`, runtimeUrl: "" },
    { platform: "windows", gpu: "cuda12", resolved: true, assetUrl: `${DL}/b10964/llama-b10964-bin-win-cuda-12.4-x64.zip`, runtimeUrl: `${DL}/b10964/cudart-llama-bin-win-cuda-12.4-x64.zip` },
  ],
};

describe("planBinaries", () => {
  it("takes the real filename for a row the server resolved", () => {
    const out = planBinaries(rows, plan, "b10964");
    const rocm = out.find((r) => r.gpu === "rocm");
    expect(rocm.assetUrl).toContain("win-rocm-10.0-x64.zip");
    expect(rocm.assetUrl).not.toContain("7.14");
  });

  it("substitutes the tag for a row the plan does not cover", () => {
    const out = planBinaries(rows, plan, "b10964");
    const vulkan = out.find((r) => r.gpu === "vulkan");
    expect(vulkan.assetUrl).toBe(`${DL}/b10964/llama-b10964-bin-ubuntu-vulkan-x64.tar.gz`);
  });

  it("keeps the CUDA runtime companion beside its asset", () => {
    const cuda = planBinaries(rows, plan, "b10964").find((r) => r.gpu === "cuda12");
    expect(cuda.assetUrl).toContain("b10964");
    expect(cuda.runtimeUrl).toContain("cudart-llama-bin-win-cuda-12.4-x64.zip");
  });

  it("falls back to plain substitution when the lookup failed (offline)", () => {
    const out = planBinaries(rows, null, "b10964");
    expect(out.map((r) => r.assetUrl)).toEqual(
      rows.map((r) => applyBuildToUrl(r.assetUrl, "b10964")),
    );
  });

  it("never mutates the rows it was given", () => {
    const before = JSON.parse(JSON.stringify(rows));
    planBinaries(rows, plan, "b10964");
    expect(rows).toEqual(before);
  });

  it("leaves a row the server marked unresolved to substitution", () => {
    const unresolved = { build: "b10437", binaries: [{ platform: "windows", gpu: "rocm", resolved: false, assetUrl: "", runtimeUrl: "" }] };
    const rocm = planBinaries(rows, unresolved, "b10437").find((r) => r.gpu === "rocm");
    expect(rocm.assetUrl).toContain("b10437");
  });
});

describe("shouldRollback", () => {
  const pending = { target: "b10964", previous: { pinnedBuild: "b10437", binaries: [] } };

  it("waits while the install is still running", () => {
    expect(shouldRollback(pending, { status: "installing", build: "b10437" })).toBe(false);
  });

  it("keeps the new pin once the target is what landed on disk", () => {
    expect(shouldRollback(pending, { status: "installed", build: "b10964" })).toBe(false);
  });

  it("restores the pin when the install left the old build in place", () => {
    // The whole point: the kit's install-time checks kept b10437, so the DB must not be
    // left pointing at b10964.
    expect(shouldRollback(pending, { status: "error", build: "b10437" })).toBe(true);
    expect(shouldRollback(pending, { status: "idle", build: "b10437" })).toBe(true);
  });

  it("is inert with no update in flight, or no status yet", () => {
    expect(shouldRollback(null, { status: "error", build: "b10437" })).toBe(false);
    expect(shouldRollback(pending, null)).toBe(false);
  });
});
