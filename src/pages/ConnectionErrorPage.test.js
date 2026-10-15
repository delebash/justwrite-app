// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
//
// The connection-error page says why the desktop app's server didn't start when its shell knows
// (2026-10-15): another program holds the port (the user's "your rec go" on "Port 17495 is in use
// by another program — close that program, then press Retry."), or another JustWrite server holds
// the data folder (the shell's words, the kit's platform/data_lock.js). Mounted as JustVoice's
// page test is: Quasar installed as in the real app, JustWrite's real vue-i18n instance.
import { afterEach, expect, test, vi } from "vitest";
import { nextTick } from "vue";
import { createTestApp } from "@delebash/llm-ui/quasar/install.js";
import { i18n } from "../i18n/index.js";

const status = vi.fn();
vi.mock("../services/native.js", () => ({ shellServerStatus: () => status() }));
vi.mock("@delebash/llm-ui", async () => ({
  ConnectionError: (await import("@delebash/llm-ui/common/components/ConnectionError.vue")).default,
  serverUrl: () => "http://127.0.0.1:17495",
}));

const { default: ConnectionErrorPage } = await import("./ConnectionErrorPage.vue");

let app;
let el;
afterEach(() => {
  app?.unmount();
  el?.remove();
  status.mockReset();
});

async function mount() {
  el = document.createElement("div");
  document.body.appendChild(el);
  app = createTestApp(ConnectionErrorPage).use(i18n);
  app.mount(el);
  for (let i = 0; i < 5; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
}

test("another program on the port: the approved words, with the port", async () => {
  status.mockResolvedValue({ url: "http://127.0.0.1:17495", portTaken: 17495, dataFolderInUse: null });
  await mount();
  expect(el.textContent).toContain("Port 17495 is in use by another program — close that program, then press Retry.");
});

test("another JustWrite server on the data folder: the shell's words, as they are", async () => {
  const words = "Another JustWrite server is using this data folder (E:\\JW\\data) — stop it first.";
  status.mockResolvedValue({ url: null, portTaken: null, dataFolderInUse: words });
  await mount();
  expect(el.textContent).toContain(words);
  expect(el.textContent).not.toContain("is in use by another program");
});

test("nothing known (a browser, or the server simply down): no extra sentence", async () => {
  status.mockResolvedValue(null);
  await mount();
  expect(el.textContent).toContain("It isn't responding at");
  expect(el.textContent).not.toContain("is in use by another program");
  expect(el.textContent).not.toContain("is using this data folder");
});
