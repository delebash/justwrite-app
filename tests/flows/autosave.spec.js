// The book's autosave reaches the server whatever the book's size (2026-10-16): it sent `keepalive`,
// which the browser refuses once the request passes 64 KiB — every save of a bigger book failed.
// The kit's transport now drops keepalive when it doesn't fit (transport.js).
import { expect, inStore, test } from "./fixtures.js";

test("a book over 64 KB saves", async ({ page }) => {
  await page.goto("/#/chapters");
  const marker = `big-book-${Date.now()}`;
  const saved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/v1\/projects\/[^/]+\/book$/.test(r.url()));
  await inStore(page, (store, mark) => {
    const ch = store.allChapters[0];
    const scene = store.scenesFor(ch.id)[0];
    store.setSceneBody(ch.id, scene.id, `${scene.body}<p>${mark} ${"The tide came in. ".repeat(4000)}</p>`);
  }, marker);
  const put = await saved;
  expect(put.status()).toBe(204);
  expect(put.request().postData().length).toBeGreaterThan(64 * 1024);

  const book = await page.request.get(put.url());
  const text = await book.text();
  expect(text.length).toBeGreaterThan(64 * 1024);
  expect(text).toContain(marker);
});
