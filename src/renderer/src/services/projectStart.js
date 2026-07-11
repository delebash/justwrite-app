// The two "start a project" flows — ONE source of truth (QC-46 / T3).
// Shared by the sidebar's project switcher (Sidebar.vue) and the first-run
// welcome screen (WelcomeView.vue): the New-project prompt dialog (shape +
// i18n keys + createProject wiring) and the open-the-tutorial flow live HERE,
// so the two surfaces can never drift. Callers run their own pre-step first
// (Sidebar closes its menu; Welcome marks the screen seen), then call these.
//
// Uses the router singleton (the same instance main.js installs — the
// configureHelp onOpenFull precedent, main.js:63) and the imperative i18n
// `t` (i18n/index.js:46); the stores are resolved lazily so this module can be
// imported before Pinia is active.

import { promptDialog } from "@delebash/llm-ui";
import router from "../router/index.js";
import { t } from "../i18n/index.js";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { readSetting, writeSetting } from "./settings.js";

/**
 * Offer AI setup ONCE, right after the user's very first project is created or
 * opened. `wasFirstProject` is captured BEFORE the create/open so an existing
 * user adding a second project never sees it; the `aiSetupPrompted` setting is
 * the once-ever gate (survives reloads and a delete-all-then-recreate). Opening
 * the dialog is deferred to the ui store so it mounts at App level (surviving
 * the OnboardingShell → real-app swap the new project triggers).
 */
function maybePromptAiSetup(wasFirstProject) {
  if (!wasFirstProject) return;
  if (readSetting("aiSetupPrompted")) return;
  writeSetting("aiSetupPrompted", true);
  useUiStore().openAiSetupPrompt();
}

/**
 * Prompt for a title/author and create a fresh project, then go Home.
 * Resolves true when a project was created, false on cancel/empty title.
 */
export async function promptNewProject() {
  const store = useProjectStore();
  const wasFirstProject = store.projectsList.length === 0;
  const values = await promptDialog({
    title: t("sidebar.projectSwitcher.newProjectTitle"),
    confirmLabel: t("sidebar.projectSwitcher.newProjectConfirm"),
    fields: [
      { key: "title", label: t("sidebar.projectSwitcher.fieldTitle"), placeholder: t("sidebar.projectSwitcher.fieldTitlePlaceholder") },
      { key: "author", label: t("sidebar.projectSwitcher.fieldAuthor"), placeholder: t("sidebar.projectSwitcher.fieldAuthorPlaceholder"), optional: true },
    ],
  });
  if (!values?.title) return false;
  store.createProject({ title: values.title, author: values.author || "" });
  router.push("/");
  maybePromptAiSetup(wasFirstProject);
  return true;
}

/**
 * Open the tutorial book (QC-40: the FULL demo, created on demand by the
 * server), then go Home. Resolves true when it opened.
 */
export async function openTutorialProject() {
  const store = useProjectStore();
  const wasFirstProject = store.projectsList.length === 0;
  const id = await store.openDemoProject();
  if (id) {
    router.push("/");
    maybePromptAiSetup(wasFirstProject);
  }
  return !!id;
}
