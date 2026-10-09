// SPDX-License-Identifier: MIT
// Data-driven sample loader for the JustWrite demo/tutorial book — the port of
// justwrite_server/database/demo_seed.py.
//
// Samples ship as **exported book folders** under the repo-root `justwrite-app/samples/`:
//
//     samples/<name>/book.json     # the exportSnapshot() / book_io.decompose shape
//     samples/<name>/images/       # optional — the book's image files, when it has any
//
// `book.json` is exactly what the app itself exports, so a sample is just an exported
// project checked into the repo. Adding or swapping a sample = drop a folder in `samples/`;
// no code change. The "Try tutorial project" button seeds `DEFAULT_SAMPLE`
// (POST /v1/projects/demo → `createDemoProject` in seed.js → `book_io.decompose`).
//
// At read time the loader is STATE-INDEPENDENT (`samplesDir()`): it prefers the copy
// `createApp` materializes into `<data_dir>/samples/` (so the samples ride the portable data
// root a relocate carries), and falls back to the bundled source — `JUSTWRITE_SAMPLES_SRC`
// if set, else the repo-root `samples/` — whenever AppState is unset (direct-call tests /
// pre-boot) or the data-dir copy is missing/partial.
//
// The bundled tutorial is "The Ninth Facet" (Tamsin Vale). Its authoring source is not in
// the repo — to edit it, open the sample in the app, edit, and re-export the folder over
// this one.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { RuntimeError } from "@delebash/llm-runner/platform/py";
import { getState } from "../app_state.js";

// Which bundled sample the tutorial button seeds.
export const DEFAULT_SAMPLE = "the-ninth-facet";

// Fixed id so a reset-then-reseed produces the same project (reset-safe, never duplicated)
// and the demo gate is unambiguous.
export const DEMO_PROJECT_ID = "prj_sample_ninth_facet";

const isDir = (p) => statSync(p, { throwIfNoEntry: false })?.isDirectory() === true;
const isFile = (p) => statSync(p, { throwIfNoEntry: false })?.isFile() === true;

/** True when `d` is a dir holding at least one `<name>/book.json` sample. */
export function _dirHasSample(d) {
  if (!isDir(d)) return false;
  return readdirSync(d).some((n) => isDir(path.join(d, n)) && isFile(path.join(d, n, "book.json")));
}

/**
 * The samples source SHIPPED with the app: `JUSTWRITE_SAMPLES_SRC` when set (the packaged
 * build points it at the bundled resource), else the server package's own `samples/` (two
 * folders up from this file, which sits in `src/database/`) — `server/samples/` in a checkout,
 * `node_modules/justwrite-server/samples/` in the packaged app (the Quasar move, 2026-10-08).
 */
export function _bundledSamplesDir() {
  const env = process.env.JUSTWRITE_SAMPLES_SRC;
  if (env) return env;
  return path.resolve(import.meta.dirname, "..", "..", "samples");
}

/**
 * Where to READ bundled samples from — state-independent. Prefer the copy createApp
 * materializes under the live data dir, but `getState()` throws when AppState is unset and
 * a materialize can be absent/partial — so fall back to the bundled source whenever the
 * data-dir copy is unusable.
 */
function samplesDir() {
  try {
    const d = path.join(getState().dataDir, "samples");
    if (_dirHasSample(d)) return d;
  } catch (e) {
    if (!(e instanceof RuntimeError)) throw e;
  }
  return _bundledSamplesDir();
}

/** Every bundled sample name (a folder under samples/ with a book.json), sorted. */
export function listSamples() {
  const d = samplesDir();
  if (!isDir(d)) return [];
  return readdirSync(d)
    .filter((n) => isFile(path.join(d, n, "book.json")))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** A sample's book.json — the snapshot shape `book_io.decompose` consumes (the same shape
 * `assemble` emits and the app's project export produces). */
export function loadSample(name = DEFAULT_SAMPLE) {
  return JSON.parse(readFileSync(path.join(samplesDir(), name, "book.json"), "utf8"));
}

/** Every file under samples/<name>/images/ as a Map filename → bytes — the image payload the
 * export/import format carries alongside book.json. Empty when the sample ships no images/
 * folder (the bundled sample is image-less today). */
export function loadSampleImages(name = DEFAULT_SAMPLE) {
  const imgDir = path.join(samplesDir(), name, "images");
  const out = new Map();
  if (!isDir(imgDir)) return out;
  for (const n of readdirSync(imgDir)) {
    const p = path.join(imgDir, n);
    if (isFile(p)) out.set(n, readFileSync(p));
  }
  return out;
}

/** The tutorial sample as the snapshot `book_io.decompose` consumes. */
export function demoBookSnapshot() {
  return loadSample(DEFAULT_SAMPLE);
}

/** The tutorial sample's image files (empty for the image-less bundled book). */
export function demoSampleImages() {
  return loadSampleImages(DEFAULT_SAMPLE);
}
