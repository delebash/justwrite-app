<script setup>
// The one-time "set up AI features" dialog (2026-07-11). Replaces the AI setup
// band that used to live on the welcome screen. It's opened ONCE — right after the
// user creates/opens their FIRST project (services/projectStart.js sets the
// `aiSetupPrompted` setting so it never fires again). Mounted at App level so it
// survives the OnboardingShell → real-app swap that project creation triggers.
//
// Two setup paths + a skip, mirroring the old band:
//   • Run Quick Setup → /ai?quicksetup=1 (the shared AiModelsArea auto-opens the
//     QuickSetup wizard; a project now exists, so /ai renders inside the real app
//     shell — no dead end).
//   • Connect an online provider → /ai (Providers & models tab).
//   • Skip for now → just dismiss.
import { ref } from "vue";
import { useRouter } from "vue-router";
import { AppModal, UiButton, Icon } from "@delebash/llm-ui";

const emit = defineEmits(["close"]);
const router = useRouter();
const modal = ref(null);

// Close via AppModal so the leave transition plays, then the parent v-if drops us.
function dismiss() {
  modal.value?.close();
}
function onQuickSetup() {
  router.push("/ai?quicksetup=1");
  dismiss();
}
function onConnectProvider() {
  router.push("/ai");
  dismiss();
}
</script>

<template>
  <AppModal
    ref="modal"
    :eyebrow="$t('welcome.aiSetup.eyebrow')"
    :title="$t('welcome.aiSetup.title')"
    @close="emit('close')"
  >
    <p class="as-body">{{ $t("welcome.aiSetup.body") }}</p>

    <div class="as-options">
      <button type="button" class="as-opt" @click="onQuickSetup">
        <span class="as-opt-ic"><Icon name="Cpu" :size="20" /></span>
        <span class="as-opt-txt">
          <b>{{ $t("welcome.aiSetup.quickSetup") }}</b>
          <span>{{ $t("welcome.aiSetup.quickSetupSub") }}</span>
        </span>
        <Icon class="as-opt-go" name="ChevRight" :size="18" />
      </button>

      <button type="button" class="as-opt" @click="onConnectProvider">
        <span class="as-opt-ic"><Icon name="Cloud" :size="20" /></span>
        <span class="as-opt-txt">
          <b>{{ $t("welcome.aiSetup.connectProvider") }}</b>
          <span>{{ $t("welcome.aiSetup.connectProviderSub") }}</span>
        </span>
        <Icon class="as-opt-go" name="ChevRight" :size="18" />
      </button>
    </div>

    <template #footer>
      <UiButton intent="ghost" @click="dismiss">{{ $t("welcome.aiSetup.skip") }}</UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.as-body {
  margin: 0 0 16px;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--muted);
}
.as-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.as-opt {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  text-align: left;
  padding: 14px 16px;
  border: 1px solid var(--border);
  background: var(--surface-2, var(--surface));
  border-radius: 12px;
  cursor: pointer;
  color: inherit;
  font: inherit;
  transition: border-color 130ms ease, background 130ms ease, transform 130ms ease;
}
.as-opt:hover {
  border-color: color-mix(in oklab, var(--accent) 55%, var(--border));
  background: color-mix(in oklab, var(--accent) 7%, var(--surface));
  transform: translateY(-1px);
}
.as-opt-ic {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: 11px;
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 12%, transparent);
}
.as-opt-txt {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.as-opt-txt b {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}
.as-opt-txt span {
  font-size: 12.5px;
  color: var(--muted);
}
.as-opt-go {
  flex: none;
  color: var(--muted);
}
.as-opt:hover .as-opt-go {
  color: var(--accent);
}
</style>
