// @vitest-environment jsdom
// The kit's words through vue-i18n (just-core/docs/plans/2026-10-12-i18n-standard.md, Task 1):
// a kit component reads its `kit.*` keys from the app's instance in the app's language and follows
// a switch live; an app's own `kit.*` key rewords the kit's; a language the kit has no catalog for
// falls back to English, never a raw key; kit code outside a component (kitT) answers in English
// until the app hands its instance over — saying so once in the console — and in the app's
// language after.
import { afterEach, describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";
import { createI18n } from "vue-i18n";

import { kitLocale, kitT, setKitI18n } from "../../../just-core/packages/ui/src/common/services/kitI18n.js";
import { kitMessages } from "../../../just-core/packages/ui/src/i18n/index.js";
import DownloadBar from "@delebash/ui/common/components/DownloadBar.vue";
import { createTestApp } from "@delebash/ui/quasar/install.js";
import { i18n as jwI18n } from "./index.js";

const KIT = kitMessages();
let app;
let host;

function appI18n(appMessages = {}, locale = "en") {
  const i18n = createI18n({ legacy: false, locale, fallbackLocale: "en", messages: kitMessages(), missingWarn: false, fallbackWarn: false });
  for (const [code, msgs] of Object.entries(appMessages)) i18n.global.mergeLocaleMessage(code, msgs);
  return i18n;
}
function mountBar(i18n) {
  host = document.createElement("div");
  document.body.appendChild(host);
  // a failed download: the bar offers Retry and Dismiss
  app = createTestApp({ render: () => h(DownloadBar, { task: { state: "error", retry() {}, dismiss() {} } }) });
  app.use(i18n);
  app.mount(host);
  return host;
}

afterEach(() => {
  app?.unmount();
  host?.remove();
  app = null;
  setKitI18n(jwI18n); // back to what the setup file hands over
  vi.restoreAllMocks();
});

describe("the kit's words from its vue-i18n catalog", () => {
  it("a kit component speaks the app's language and follows a switch live", async () => {
    const i18n = appI18n();
    const el = mountBar(i18n);
    expect(el.textContent).toContain(KIT.en.kit.common.retry);
    i18n.global.locale.value = "es";
    await nextTick();
    expect(el.textContent).toContain(KIT.es.kit.common.retry);
    expect(el.textContent).not.toContain(KIT.en.kit.common.retry);
  });

  it("an app's own kit.* key rewords the kit's, and the kit's catalog stays its own", () => {
    const el = mountBar(appI18n({ en: { kit: { common: { retry: "Try again" } } } }));
    expect(el.textContent).toContain("Try again");
    expect(kitMessages().en.kit.common.retry).toBe(KIT.en.kit.common.retry);
  });

  it("a language the kit has no catalog for falls back to English, never a raw key", () => {
    const el = mountBar(appI18n({}, "fr"));
    expect(el.textContent).toContain(KIT.en.kit.common.retry);
    expect(el.textContent).not.toContain("kit.common");
  });

  it("kit code outside a component answers in English until the app hands its instance over", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setKitI18n(null);
    expect(kitT("kit.fit.no")).toBe(KIT.en.kit.fit.no);
    expect(kitT("kit.fit.no")).toBe(KIT.en.kit.fit.no);
    expect(warn).toHaveBeenCalledTimes(1); // once, not per word
    expect(warn.mock.calls[0][0]).toMatch(/before installLlmUi/);
    setKitI18n(appI18n({}, "es"));
    expect(kitLocale()).toBe("es");
    expect(kitT("kit.common.cancel")).toBe(KIT.es.kit.common.cancel);
  });

  it("a linked message keeps one name for the class layer", () => {
    expect(kitT("kit.tune.badge.class")).toBe(`Tuned by ${KIT.en.kit.tune.classLayer}`);
    expect(kitT("kit.source.class")).toBe(KIT.en.kit.tune.classLayer);
  });
});
