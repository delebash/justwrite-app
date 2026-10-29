// Settings → Server (the kit's ServerPanel since 2026-10-29): turning on "Require a token on this computer
// too" keeps this window signed in — it keeps one of the tokens. Before 2026-10-20 it kept none: every
// /v1 call answered 401 and a reload opened on Welcome as if there were no books.
import { expect, test } from "./fixtures.js";

test.afterEach(async ({ request }) => {
  // the server's auth door always answers on this computer (the lockout escape): back to no tokens
  await request.put("/v1/server-auth", { data: { tokens: [], requireForLoopback: false } });
});

test("Require a token on this computer too keeps this window signed in", async ({ page }) => {
  const refused = [];
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (r.status() === 401 && path.startsWith("/v1/")) refused.push(path);
  });
  await page.goto("/#/settings/server");
  await page.getByRole("button", { name: /^Generate/ }).click();
  await page.getByRole("button", { name: /^Add token/ }).click();
  const tokensCard = page.locator(".card", { hasText: "Access tokens" });
  await tokensCard.locator('[role="switch"], .q-toggle').first().click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("just.serverToken"))).toBeTruthy();

  await page.goto("/#/");
  await page.reload();
  await expect(page).not.toHaveURL(/#\/welcome/);
  await page.waitForLoadState("networkidle");
  expect(refused, "requests refused for want of a token").toEqual([]);
});
