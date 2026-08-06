// SPDX-License-Identifier: MIT
// THE FAMILY SURFACE CONTRACT — JW's gate twin (2026-08-04). The canon lives in the
// kit (common/familyContract.js); docgen asserts its rendered sources via a node:test
// scan, JW asserts its ENGLISH catalog carries the same words (its locales map them).
// Imported by relative path on purpose: the manifest is pure ESM with no kit
// side-effects (the index would drag styles.css into the test environment).
import { describe, expect, it } from "vitest";

import { FAMILY_LABELS } from "../../../just-llm-runner/ui/src/common/familyContract.js";
import en from "./locales/en.json";

const flat = JSON.stringify(en);

describe("family surface contract — canon words present in the English catalog", () => {
  it("carries the nav trio exactly", () => {
    expect(en.nav.settings).toBe(FAMILY_LABELS.nav.appSettings);
    expect(flat).toContain(`"${FAMILY_LABELS.nav.aiSettings}"`);
    expect(flat).toContain(`"${FAMILY_LABELS.nav.aiTasks}"`);
  });

  it("keeps the dialog verbs canonical", () => {
    for (const verb of Object.values(FAMILY_LABELS.dialog)) {
      expect(flat).toContain(`"${verb}"`);
    }
  });

  it("quick-setup canon: the run button's words", () => {
    expect(flat).toContain(`"${FAMILY_LABELS.quickSetup.runButton}"`);
  });

  // Settings-section canon (family parity batch 2026-08-05): the shared concepts'
  // exact words — including the batch's new Backups + Updates — must exist in the
  // English catalog (JW renders its own sections; the locales map these words).
  it("settings sections carry every canon word incl. backups + updates", () => {
    for (const word of Object.values(FAMILY_LABELS.settingsSections)) {
      expect(flat).toContain(`"${word}"`);
    }
  });

  // The family.* block is the catalog's 1:1 image of the kit-rendered groups the
  // locale feed maps (familyLabelsFeed.js) — exact equality, so a reworded canon
  // or a drifted catalog fails here, not on a user's screen.
  it("the family.* block mirrors the kit-rendered groups exactly", () => {
    expect(en.family.aiTabs).toEqual(FAMILY_LABELS.aiTabs);
    expect(en.family.downloadBar).toEqual(FAMILY_LABELS.downloadBar);
    expect(en.family.connectionError).toEqual(FAMILY_LABELS.connectionError);
    expect(en.family.lab).toEqual(FAMILY_LABELS.lab);
  });
});
