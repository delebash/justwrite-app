// The two "start a project" flows — ONE source of truth (QC-46 / T3).
// Shared by the sidebar's project switcher (Sidebar.vue) and the first-run
// welcome screen (WelcomeView.vue): the New-project prompt dialog (shape +
// i18n keys + createProject wiring) and the open-the-tutorial flow live HERE,
// so the two surfaces can never drift. Callers run their own pre-step first
// (Sidebar closes its menu; Welcome marks the screen seen), then call these.
//
// Uses the router singleton (the same instance main.js installs — the
// configureHelp onOpenFull precedent, main.js:63) and the imperative i18n
// `t` (i18n/index.js:46); the store is resolved lazily so this module can be
// imported before Pinia is active.

import { promptDialog } from "@delebash/llm-ui";
import router from "../router/index.js";
import { t } from "../i18n/index.js";
import { useProjectStore } from "../stores/project.js";

/**
 * Prompt for a title/author and create a fresh project, then go Home.
 * Resolves true when a project was created, false on cancel/empty title.
 */
export async function promptNewProject() {
  const values = await promptDialog({
    title: t("sidebar.projectSwitcher.newProjectTitle"),
    confirmLabel: t("sidebar.projectSwitcher.newProjectConfirm"),
    fields: [
      { key: "title", label: t("sidebar.projectSwitcher.fieldTitle"), placeholder: t("sidebar.projectSwitcher.fieldTitlePlaceholder") },
      { key: "author", label: t("sidebar.projectSwitcher.fieldAuthor"), placeholder: t("sidebar.projectSwitcher.fieldAuthorPlaceholder"), optional: true },
    ],
  });
  if (!values?.title) return false;
  useProjectStore().createProject({ title: values.title, author: values.author || "" });
  router.push("/");
  return true;
}

/**
 * Open the tutorial book (QC-40: the FULL demo, created on demand by the
 * server), then go Home. Resolves true when it opened.
 */
export async function openTutorialProject() {
  const id = await useProjectStore().openDemoProject();
  if (id) router.push("/");
  return !!id;
}
