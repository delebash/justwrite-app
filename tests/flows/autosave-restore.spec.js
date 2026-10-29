// Restoring an autosave brings back its workspace settings too (2026-10-29). Every autosave carries
// them (`_workspace`), and the reload that applies them called `flushPending`, deleted with
// services/storage.js on 2026-06-18 (cf328442): from then on every restore showed "flushPending is
// not defined" under the list and never reloaded. Now the settings and the book are sent first,
// then the page reloads on them.
import { expect, inStore, navigate, test } from "./fixtures.js";

test("restoring an autosave saves its settings and reloads", async ({ page }) => {
  await page.goto("/#/chapters");
  const snap = await inStore(page, (store) => store.exportSnapshot());
  const settings = await (await page.request.get("/v1/settings")).json();
  const marker = `restored-${Date.now()}`;
  // an autosave of this book whose workspace carries a setting the live one doesn't
  const saved = await page.request.post(`/v1/projects/${settings.activeProjectId}/autosave`, {
    data: { ...snap, _workspace: { settings: { ...settings, flowRestoreMarker: marker } } },
  });
  expect(saved.ok()).toBe(true);

  await navigate(page, "/settings/backups");
  await page.getByRole("button", { name: "Restore from autosave…" }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).first().click();
  const reloaded = page.waitForEvent("load");
  await page.getByRole("dialog").getByRole("button", { name: "Restore from autosave" }).click();
  await reloaded;

  const after = await (await page.request.get("/v1/settings")).json();
  expect(after.flowRestoreMarker).toBe(marker);
  await inStore(page, () => true); // the reloaded app opens its book
});

// The list holds every book's autosaves, and the restore loaded the chosen one into whichever book
// was open: restoring book B's autosave while book A was open replaced A with B, and A's own
// autosaves then rotated away. Now the restore opens the autosave's own book.
test("restoring another book's autosave restores that book and leaves the open one alone", async ({ page }) => {
  await page.goto("/#/chapters");
  const title = `Restore test ${Date.now()}`;
  const { openId, openTitle, otherId, otherSnap } = await inStore(page, async (store, t) => {
    const openId = store.activeProjectId;
    const openTitle = store.project.title;
    const otherId = store.createProject({ title: t });
    const otherSnap = store.exportSnapshot();
    await store.switchProject(openId);
    return { openId, openTitle, otherId, otherSnap };
  }, title);
  // the autosave holds an earlier state of book B, under its own title
  const autosaved = `${title} (autosaved)`;
  const saved = await page.request.post(`/v1/projects/${otherId}/autosave`, {
    data: { ...otherSnap, project: { ...otherSnap.project, title: autosaved } },
  });
  expect(saved.ok()).toBe(true);

  try {
    await navigate(page, "/settings/backups");
    await page.getByRole("button", { name: "Restore from autosave…" }).click();
    await page.getByRole("listitem").filter({ hasText: autosaved }).first().getByRole("button", { name: "Restore", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Restore from autosave" }).click();
    await expect(page.getByText(`Restored "${autosaved}".`).first()).toBeVisible();

    // the open book is now B, restored (read directly: it has no chapters, which inStore waits for)
    const open = await page.evaluate(() => {
      const store = document.querySelector("#q-app").__vue_app__.config.globalProperties.$pinia._s.get("project");
      return { id: store.activeProjectId, title: store.project.title };
    });
    expect(open).toEqual({ id: otherId, title: autosaved });
    // B's restored state reaches the server (it saves on a short delay); A's is untouched
    const book = async (id) => (await page.request.get(`/v1/projects/${id}/book`)).json();
    await expect.poll(async () => (await book(otherId)).project.title).toBe(autosaved);
    expect((await book(openId)).project.title).toBe(openTitle);
  } finally {
    // the flows share one server: leave it as it was, the first book open and B gone
    await page.evaluate(async ({ openId, otherId }) => {
      const store = document.querySelector("#q-app").__vue_app__.config.globalProperties.$pinia._s.get("project");
      await store.switchProject(openId);
      await store.deleteProject(otherId);
    }, { openId, otherId });
    await expect.poll(async () => (await (await page.request.get("/v1/settings")).json()).activeProjectId).toBe(openId);
  }
});
