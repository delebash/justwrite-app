// SPDX-License-Identifier: MIT
// What JustWrite gives the kit's SyncPanel — in Settings → Sync, and on the project-less Sync page a
// fresh install reaches from the welcome screen (pages/SyncPage.vue): the books for the by-hand
// export picker, their noun, the desktop's folder picker, and the phone's ways (it scans a pairing
// code, nothing reaches it, it has no cloud folder until it can sign in to OneDrive or Dropbox).
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { hasShell, isPhone, pickDirectory, scanCode } from "../services/native.js";
import { useProjectStore } from "../stores/project.js";

export function useSyncPanel() {
  const { t } = useI18n();
  const project = useProjectStore();
  return computed(() => ({
    appName: "JustWrite",
    fileExtension: "jwsync",
    // the books, for the by-hand export picker (savedAt = the book's last change)
    units: project.projectsList.map((p) => ({ id: p.id, title: p.title, updatedAt: p.savedAt })),
    unitNoun: { one: t("settings.sync.unitOne"), many: t("settings.sync.unitMany") },
    // the desktop's folder picker; a browser types the folder's path instead
    pickFolder: hasShell() ? () => pickDirectory({ title: t("settings.sections.sync") }) : null,
    scanCode: isPhone() ? scanCode : null,
    reachable: !isPhone(),
    cloudFolder: !isPhone(),
  }));
}
