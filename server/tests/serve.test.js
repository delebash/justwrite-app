// SPDX-License-Identifier: MIT
// Port of tests/test_serve.py — the `justwrite-server` entry (serve.js): `serve` is the one
// command, argparse's help and errors. `process.exit` stands in for Python's SystemExit
// (spied to throw, so nothing exits); stdout/stderr are captured as pytest's capsys did.
import { expect, test, vi } from "vitest";
import * as serve from "../src/serve.js";

class SystemExit extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.code = code;
  }
}

async function runMain(argv) {
  const out = [];
  const err = [];
  vi.spyOn(process.stdout, "write").mockImplementation((s) => out.push(String(s)) || true);
  vi.spyOn(process.stderr, "write").mockImplementation((s) => err.push(String(s)) || true);
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new SystemExit(code);
  });
  let exit = null;
  try {
    await serve.main(argv);
  } catch (e) {
    if (!(e instanceof SystemExit)) throw e;
    exit = e;
  } finally {
    vi.restoreAllMocks();
  }
  return { exit, out: out.join(""), err: err.join("") };
}

test("serve_help_names_the_options", async () => {
  const { exit, out } = await runMain(["--help"]);
  expect(exit.code).toBe(0);
  expect(out).toContain("--host");
  expect(out).toContain("--port");
  expect(out).toContain("--data-dir");
});

test("serve_is_the_accepted_command", async () => {
  // `serve` is the canonical (and only) command; an unknown one is rejected before anything
  // boots.
  const { exit, err } = await runMain(["frobnicate"]);
  expect(exit.code).toBe(2);
  expect(err).toContain("serve");
});
