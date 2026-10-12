// The kit's words through vue-i18n — step A of the i18n plan
// (just-llm-runner/docs/plans/2026-10-12-i18n-standard.md, Task 1): installLlmUi({ i18n }) fills
// the kit's label store from the `kit.*` keys in the app's language, an app's own `kit.*` key
// winning, and fills it again on every language change.
import { nextTick } from "vue";
import { createI18n } from "vue-i18n";
import { describe, expect, it } from "vitest";

import { FAMILY_LABELS } from "../../../just-llm-runner/ui/src/common/familyContract.js";
import { familyLabels } from "../../../just-llm-runner/ui/src/common/services/familyLabels.js";
import { catalogCopyFrom, fillKitWords } from "../../../just-llm-runner/ui/src/common/services/kitI18n.js";
import { quickSetupCopy } from "../../../just-llm-runner/ui/src/common/services/quickSetupCopy.js";
import { kitMessages } from "../../../just-llm-runner/ui/src/i18n/index.js";

const KIT = kitMessages();

function appI18n(appMessages = {}, locale = "en") {
  const i18n = createI18n({ legacy: false, locale, fallbackLocale: "en", messages: kitMessages() });
  for (const [code, msgs] of Object.entries(appMessages)) i18n.global.mergeLocaleMessage(code, msgs);
  return i18n;
}

describe("the kit's words from its vue-i18n catalog", () => {
  it("the kit's English catalog carries the canon words unchanged", () => {
    for (const [group, words] of Object.entries(FAMILY_LABELS)) {
      for (const [field, english] of Object.entries(words)) expect(KIT.en.kit[group][field]).toBe(english);
    }
  });

  it("an app's own kit.* key rewords the kit's", async () => {
    fillKitWords(appI18n({ en: { kit: { aiTabs: { providers: "LLM providers" }, quickSetup: { chatRole: "attributes speakers" } } } }));
    await nextTick();
    expect(familyLabels.aiTabs.providers).toBe("LLM providers");
    expect(familyLabels.aiTabs.routing).toBe(FAMILY_LABELS.aiTabs.routing);
    expect(quickSetupCopy.chatRole).toBe("attributes speakers");
    // vue-i18n merges into the objects it is given: the kit's own catalog must stay unreworded.
    expect(kitMessages().en.kit.aiTabs.providers).toBe(FAMILY_LABELS.aiTabs.providers);
  });

  it("follows a language switch, and placeholders the component fills pass through", async () => {
    const i18n = appI18n();
    fillKitWords(i18n);
    await nextTick();
    expect(familyLabels.aiTabs.providers).toBe(FAMILY_LABELS.aiTabs.providers);
    i18n.global.locale.value = "es";
    await nextTick();
    expect(familyLabels.downloadBar.retry).toBe(KIT.es.kit.downloadBar.retry);
    expect(familyLabels.downloadBar.retry).not.toBe(FAMILY_LABELS.downloadBar.retry);
    expect(familyLabels.connectionError.title).toContain("{appName}");
  });

  it("a language the kit has no catalog for falls back to English, never a raw key", async () => {
    fillKitWords(appI18n({}, "fr"));
    await nextTick();
    expect(familyLabels.downloadBar.retry).toBe(FAMILY_LABELS.downloadBar.retry);
  });

  it("the model catalog's wording comes from kit.catalog.* keys, the app's winning", () => {
    const copy = catalogCopyFrom(appI18n({ en: { kit: { catalog: { chatSectionLabel: "Translation models" } } } }));
    expect(copy.chatSectionLabel).toBe("Translation models");
    expect(copy.generalUse).toBe(KIT.en.kit.catalog.generalUse);
  });
});
