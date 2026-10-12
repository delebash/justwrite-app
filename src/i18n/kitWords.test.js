// @vitest-environment jsdom
// The kit's words through vue-i18n (just-llm-runner/docs/plans/2026-10-12-i18n-standard.md, Task 1):
// a kit component reads its `kit.*` keys from the app's instance in the app's language and follows
// a switch live; an app's own `kit.*` key rewords the kit's; a language the kit has no catalog for
// falls back to English, never a raw key; kit code outside a component (kitT) answers in English
// until the app hands its instance over, and in the app's language after.
import { afterEach, describe, expect, it } from "vitest";
import { h, nextTick } from "vue";
import { createI18n } from "vue-i18n";

import { kitLocale, kitT, setKitI18n } from "../../../just-llm-runner/ui/src/common/services/kitI18n.js";
import { kitMessages } from "../../../just-llm-runner/ui/src/i18n/index.js";
import DownloadBar from "@delebash/llm-ui/common/components/DownloadBar.vue";
import { createTestApp } from "@delebash/llm-ui/quasar/install.js";

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
  setKitI18n(null);
});

describe("the kit's words from its vue-i18n catalog", () => {
  it("a kit component speaks the app's language and follows a switch live", async () => {
    const i18n = appI18n();
    const el = mountBar(i18n);
    expect(el.textContent).toContain(KIT.en.kit.downloadBar.retry);
    i18n.global.locale.value = "es";
    await nextTick();
    expect(el.textContent).toContain(KIT.es.kit.downloadBar.retry);
    expect(el.textContent).not.toContain(KIT.en.kit.downloadBar.retry);
  });

  it("an app's own kit.* key rewords the kit's, and the kit's catalog stays its own", () => {
    const el = mountBar(appI18n({ en: { kit: { downloadBar: { retry: "Try again" } } } }));
    expect(el.textContent).toContain("Try again");
    expect(kitMessages().en.kit.downloadBar.retry).toBe(KIT.en.kit.downloadBar.retry);
  });

  it("a language the kit has no catalog for falls back to English, never a raw key", () => {
    const el = mountBar(appI18n({}, "fr"));
    expect(el.textContent).toContain(KIT.en.kit.downloadBar.retry);
    expect(el.textContent).not.toContain("kit.downloadBar");
  });

  it("kit code outside a component answers in English until the app hands its instance over", () => {
    expect(kitT("kit.fit.no")).toBe(KIT.en.kit.fit.no);
    setKitI18n(appI18n({}, "es"));
    expect(kitLocale()).toBe("es");
    expect(kitT("kit.dialog.cancel")).toBe(KIT.es.kit.dialog.cancel);
  });

  it("a linked message keeps one name for the class layer", () => {
    expect(kitT("kit.tune.badge.class")).toBe(`Tuned by ${KIT.en.kit.tune.classLayer}`);
    expect(kitT("kit.source.class")).toBe(KIT.en.kit.tune.classLayer);
  });
});
