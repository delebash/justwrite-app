// @vitest-environment jsdom
//
// The character draft window runs BOTH passes of a description draft (2026-10-11, found
// driving Save to sheet in a browser). A watcher used to abort the window's controller whenever
// no task was running while it was loading — and between the two passes no task runs: the
// description draft's voice pass first awaits its route (characterDraft.js budgetFor), so the
// watcher fired in that gap and the voice pass was cancelled before it began. Every unit test
// stubbed the draft calls whole, so none saw it; this one mounts the window with a voice pass
// that awaits before its task exists, as the real one does.
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, nextTick, reactive } from "vue";
import { createI18n } from "vue-i18n";
import { createPinia } from "pinia";
import en from "../i18n/locales/en.json";

const tasks = reactive({ runningTasks: [] });
vi.mock("@delebash/llm-ui", async (importOriginal) => ({
  ...(await importOriginal()),
  useAiTasksStore: () => tasks,
}));
vi.mock("./AiFeatureChip.vue", () => ({ default: { render: () => null } }));
vi.mock("../stores/project.js", () => ({
  useProjectStore: () => ({ characters: [{ id: "c1", name: "Mira" }], characterExtras: {} }),
}));

const tick = () => new Promise((r) => setTimeout(r, 0));
// A pass as the real ones run: an optional await first (the route), then a task while it calls.
async function pass(feature, fields, { awaitFirst = false, signal } = {}) {
  if (awaitFirst) await tick();
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  tasks.runningTasks.push({ feature });
  await tick();
  tasks.runningTasks.splice(0);
  return { fields, model: "stub" };
}
const voice = vi.fn((a) => pass("characterVoice", { voice: { register: "clipped" } }, { awaitFirst: true, signal: a.signal }));
vi.mock("../services/analysis/characterDraft.js", () => ({
  profileFromDescription: (a) => pass("characterProfile", { oneLiner: "A clerk." }, { signal: a.signal }),
  voiceFromDescription: (a) => voice(a),
  draftSection: vi.fn(),
}));

const { createTestApp } = await import("@delebash/llm-ui/quasar/install.js");
const { default: CharacterDraftModal } = await import("./CharacterDraftModal.vue");

let app;
let host;
afterEach(() => {
  app?.unmount();
  host?.remove();
  document.body.innerHTML = "";
});

describe("a description draft", () => {
  it("runs the voice pass after the profile pass, and shows both groups", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    app = createTestApp({ render: () => h(CharacterDraftModal, { characterId: "c1", source: "description", description: "a clerk" }) });
    app.use(createPinia());
    app.use(createI18n({ legacy: false, locale: "en", messages: { en } }));
    app.mount(host);
    for (let i = 0; i < 20; i++) { await tick(); await nextTick(); }

    expect(voice).toHaveBeenCalledTimes(1);
    expect(voice.mock.calls[0][0].signal.aborted).toBe(false);
    const text = document.body.textContent;
    expect(text).toContain(en.characterDraft.groupProfile);
    expect(text).toContain(en.characterDraft.groupVoice);
  });
});
