// Slice 3's planning with AI (the AI drafting plan 2026-10-15, Tasks P1–P3): a scene's Summary from
// its prose (the Links panel; the chapter's Cards show it), a strand's ✨ menu on the Plot board
// (Fill this template for my story; Suggest next beats in the Brainstorm window → Add as beat),
// Architecture's Draft from the premise (a diff in the Fabula; not offered on the Premise itself).
import { stubAi } from "../lib/smoke-common.js";
import { expect, expectNoSidewaysScroll, navigate, openSceneWithProse, test } from "./fixtures.js";

const SUMMARY = "Cael tests the lamp and finds it lying.";
const BEATS = JSON.stringify(Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`beat${i + 1}`, `Beat ${i + 1} for this book.`])));
const NEXT = "1. The guild calls in Cael's debt\n2. The lamp goes dark mid-job\n3. A rival party bids for the commission";
const PREMISE_DRAFT = "The war ends.\n\nThe guild rises.";
const REPLIES = { sceneSummary: SUMMARY, templateFill: BEATS, brainstormPlot: NEXT, premiseDraft: PREMISE_DRAFT };

test("Summarize this scene fills the Summary, and the Cards show it", async ({ page }) => {
  await stubAi(page, (b) => REPLIES[b.action] ?? "{}");
  const chapterId = await openSceneWithProse(page);
  await page.getByRole("button", { name: /Links/ }).first().click();
  await page.getByRole("button", { name: /Summarize this scene/ }).click();
  const row = page.locator(".cpf-row").first();
  await expect(row).toBeVisible();
  // A Summary already written comes unticked — nothing overwrites it unless ticked.
  if (await page.locator(".cpf-row.dropped").count()) await row.locator(".cpf-check").click();
  await page.getByRole("button", { name: /Apply/ }).click();
  await expect(page.locator(".links-summary textarea")).toHaveValue(SUMMARY);
  await expectNoSidewaysScroll(page);

  await navigate(page, `/chapters/${chapterId}`);
  await page.getByRole("button", { name: /Card view/ }).first().click();
  await expect(page.getByText(SUMMARY).first()).toBeVisible();
  await page.getByRole("button", { name: /List view/ }).first().click();
});

test("A strand's ✨ menu: Fill this template, then Suggest next beats → Add as beat", async ({ page }) => {
  const asked = await stubAi(page, (b) => REPLIES[b.action] ?? "{}");
  await page.goto("/#/plot");
  await page.getByRole("button", { name: /Apply template/ }).first().click();
  await page.locator(".tmpl-item").first().click();
  const strand = page.locator(".strand-label-cell").last();
  await strand.scrollIntoViewIfNeeded();

  await strand.locator(".strand-ai-btn").click();
  await page.getByText("Fill this template for my story", { exact: true }).click();
  await expect(page.locator(".cpf-row").first()).toBeVisible();
  await page.getByRole("button", { name: /Apply \d+ notes?/ }).click();
  await expect(page.locator(".q-dialog")).toHaveCount(0);

  const before = await page.locator(".beat-card").count();
  await strand.locator(".strand-ai-btn").click();
  await page.getByText("Suggest next beats", { exact: true }).click();
  // the Brainstorm window (2026-10-28): nothing runs on open; Generate with the seed left empty
  expect(asked.filter((b) => b.action === "brainstormPlot")).toHaveLength(0);
  await page.locator(".q-dialog").getByRole("button", { name: "Generate" }).click();
  const ideas = page.locator(".bsr-item");
  await expect(ideas).toHaveCount(3);
  expect(asked.find((b) => b.action === "brainstormPlot").variables.user_content).toContain("Seed: next beats for the strand in THE STRAND");
  // the window stays open for more; an added idea reads Added
  await ideas.nth(2).getByRole("button", { name: "Add as beat" }).click();
  await expect(ideas.nth(2).getByRole("button", { name: "Added" })).toBeDisabled();
  await ideas.nth(0).getByRole("button", { name: "Add as beat" }).click();
  await expect(page.locator(".beat-card")).toHaveCount(before + 2);
  await page.locator(".q-dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".q-dialog")).toHaveCount(0);
  await expect(page.getByText("A rival party bids for the commission").first()).toBeVisible();
  await expect(page.getByText("The guild calls in Cael's debt").first()).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("Draft from the premise lands as a diff in the Fabula, and isn't offered on the Premise", async ({ page }) => {
  await stubAi(page, (b) => REPLIES[b.action] ?? "{}");
  await page.goto("/#/architecture/fabula");
  await page.getByRole("button", { name: /Draft from the premise/ }).click();
  await expect(page.locator("ins").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Reject all/ })).toBeVisible();
  await page.getByRole("button", { name: /Reject all/ }).click();
  await navigate(page, "/architecture/premise");
  await expect(page.getByRole("heading").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Draft from the premise/ })).toHaveCount(0);
});
