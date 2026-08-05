// The family-labels feed — maps JustWrite's locale catalog onto the kit's ONE
// reactive labels store (familyLabels). main.js installs it behind a watch on the
// active locale (immediate), so boot AND every runtime language switch re-feed —
// the old configureDialog call fed once at boot and went stale the day the
// switcher shipped. The pre-boot ConnectionError (server unreachable) mounts
// before any locale resolves and deliberately shows the kit's English canon.
//
// Every t() call is a LITERAL key on purpose: vue-i18n-extract's report only sees
// static keys, so this file is what keeps family.* out of the "unused" column.
import { t } from "./index.js";

export function buildFamilyLabels() {
  return {
    dialog: {
      defaultTitle: t("dialog.defaultTitle"),
      confirm: t("dialog.confirmLabel"),
      ok: t("dialog.okLabel"),
      cancel: t("dialog.cancelLabel"),
      close: t("dialog.closeLabel"),
    },
    aiTabs: {
      providers: t("family.aiTabs.providers"),
      routing: t("family.aiTabs.routing"),
      usage: t("family.aiTabs.usage"),
      console: t("family.aiTabs.console"),
    },
    downloadBar: {
      cancel: t("family.downloadBar.cancel"),
      retry: t("family.downloadBar.retry"),
      dismiss: t("family.downloadBar.dismiss"),
      ready: t("family.downloadBar.ready"),
    },
    connectionError: {
      // {appName} is a real i18n slot in the catalog; feeding the literal token
      // back through it hands the kit its own "{appName}" template untouched
      // (ConnectionError.vue does the .replace with the host's brand).
      title: t("family.connectionError.title", { appName: "{appName}" }),
      retry: t("family.connectionError.retry"),
    },
    lab: {
      generatedPrompt: t("family.lab.generatedPrompt"),
      generatedNote: t("family.lab.generatedNote"),
      refresh: t("family.lab.refresh"),
      editCopies: t("family.lab.editCopies"),
      lockCopies: t("family.lab.lockCopies"),
      restoreGenerated: t("family.lab.restoreGenerated"),
    },
  };
}
