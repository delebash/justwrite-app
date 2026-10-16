// A location drafted from a description (the AI drafting spec §9.1; SheetDraftModal.vue): the review
// lists the page's own Description first, ticked, while it has none (TASKS, the sixth round
// 2026-10-16); Apply fills it and the sheet in one step; once it has one, a draft never offers it.
import { stubAi } from "../lib/smoke-common.js";
import { expect, expectNoSidewaysScroll, test } from "./fixtures.js";

const DRAFT = JSON.stringify({
  description: "A tide-cut stair under the archive.\n\nWet stone.",
  atmosphere: "Brine and lamp oil.",
  history: "",
});

test("From a description proposes the empty Description, then the sheet", async ({ page }) => {
  const asked = await stubAi(page, (b) => (b.action === "locationDraft" ? DRAFT : "{}"));
  await page.goto("/#/locations");
  await page.getByRole("button", { name: /New location/ }).first().click();
  await page.locator("textarea").first().fill("a tide-cut stair under the archive, where notes are passed");
  await page.getByRole("button", { name: /^Draft$/ }).first().click();

  const rows = page.locator(".cpf-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(/description/i);
  await expect(rows.nth(1)).toContainText(/atmosphere/i);
  await expect(page.locator(".cpf-row.dropped")).toHaveCount(0);
  expect(asked.at(-1).variables.user_content).toContain("FIELDS TO DRAFT\n- description — Description: ");
  await expectNoSidewaysScroll(page);

  await page.getByRole("button", { name: /Apply 2 fields/ }).click();
  const note = page.locator(".ProseMirror").first();
  await expect(note).toContainText("A tide-cut stair under the archive.");
  await expect(note.locator("p")).toHaveCount(2);

  // Now that it has a Description, a draft asks only for the sheet.
  await page.getByRole("button", { name: /Draft with AI/ }).first().click();
  await page.getByText("From a description", { exact: true }).click();
  await page.locator("textarea").first().fill("smugglers use it at low tide");
  await page.getByRole("button", { name: /^Draft$/ }).first().click();
  await expect(rows.first()).toBeVisible();
  expect(asked.at(-1).variables.user_content).not.toContain("- description — ");
  await expect(page.locator(".cpf-row", { hasText: /^description/i })).toHaveCount(0);
});
