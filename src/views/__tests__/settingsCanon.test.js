// SPDX-License-Identifier: MIT
// The Settings canon contract (parity batch slice 11): the family sections keep
// the kit's RELATIVE order wherever they appear (Appearance · Backups · Storage ·
// Server · Logs · Updates · About); app-own sections (Project) may lead or
// interleave. The view renders SETTINGS_SECTION_IDS directly, so this asserts
// exactly what the user sees. Manifest imported by relative path on purpose —
// the kit barrel would drag styles.css into the test environment.
import { describe, expect, it } from "vitest";

import { SETTINGS_SECTION_ORDER } from "../../../../just-llm-runner/ui/src/common/familyContract.js";
import { SETTINGS_SECTION_IDS } from "../settingsSections.js";

describe("settings canon — section order", () => {
  it("keeps the family sections in the canon relative order", () => {
    const rendered = SETTINGS_SECTION_IDS.filter((id) => SETTINGS_SECTION_ORDER.includes(id));
    const canon = SETTINGS_SECTION_ORDER.filter((id) => SETTINGS_SECTION_IDS.includes(id));
    expect(rendered).toEqual(canon);
  });

  it("renders every family section", () => {
    for (const id of SETTINGS_SECTION_ORDER) {
      expect(SETTINGS_SECTION_IDS).toContain(id);
    }
  });
});
