// SPDX-License-Identifier: MIT
// The phone's twin of demo_seed.js — the same exports, the bundled sample read from the app's
// own bundle instead of the disk (the phone's in-app server has no file system; the kit's
// docs/plans/2026-10-08-the-phone.md). The phone's build puts this file where demo_seed.js is
// imported. server/tests/phone_server.test.js keeps the two in step.

import ninthFacet from "../../samples/the-ninth-facet/book.json" with { type: "json" };

export const DEFAULT_SAMPLE = "the-ninth-facet";
export const DEMO_PROJECT_ID = "prj_sample_ninth_facet";

const SAMPLES = { "the-ninth-facet": ninthFacet };

export const listSamples = () => Object.keys(SAMPLES).sort();

export function loadSample(name = DEFAULT_SAMPLE) {
  if (!(name in SAMPLES)) throw new Error(`no sample named ${name}`);
  return structuredClone(SAMPLES[name]);
}

/** The bundled samples ship no images (the desktop's samples/<name>/images/ is absent too). */
export const loadSampleImages = () => new Map();

export const demoBookSnapshot = () => loadSample(DEFAULT_SAMPLE);
export const demoSampleImages = () => loadSampleImages(DEFAULT_SAMPLE);
