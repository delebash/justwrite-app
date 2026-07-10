<script setup>
// QC-46 — the first-run "W-A Paper hero" welcome screen (the user's pick,
// 2026-07-10: "W-A hero"). A normal router-outlet view (lives inside .main,
// beside the sidebar): a centred column highlighting the app's major features
// and introducing the two AI setup paths (Quick Setup local / connect online).
// Ported from the picked mockup scratchpad/qc4546-mockups.mjs (the W-A block +
// FEATURES + AI_BLOCK constants) onto the real kit (UiButton + Icon) and i18n.
//
// First-run detection lives in main.js (a run-once router guard on the initial
// root navigation, gated on the `welcomeSeen` setting). Every CTA exit here
// first marks the screen seen, so a reload BEFORE choosing shows it again
// (correct-once) but a reload AFTER any choice does not.
import { useRouter } from "vue-router";
import { Icon, UiButton } from "@delebash/llm-ui";
import { promptNewProject, openTutorialProject } from "../services/projectStart.js";
import { writeSetting } from "../services/settings.js";

const router = useRouter();

// The 3×2 feature grid. Icons are kit Icon names (not emoji) where a sensible
// one exists — picks mirror the app's own nav icons: Book (chapters), Users
// (story bible), Strands (plot), Sparkle (AI, the app's AI glyph), Target
// (goals), Export. Copy lives under welcome.features.<key> in en.json.
const FEATURES = [
  { icon: "Book", key: "chapters" },
  { icon: "Users", key: "bible" },
  { icon: "Strands", key: "plot" },
  { icon: "Sparkle", key: "ai" },
  { icon: "Target", key: "goals" },
  { icon: "Export", key: "export" },
];

// Mark the welcome screen dismissed. Called FIRST on every CTA/link exit — the
// "seen" write must land before we navigate away (settings.writeSetting is
// debounced + flushed on pagehide, so the in-SPA push doesn't drop it).
function markSeen() {
  writeSetting("welcomeSeen", true);
}

// "Start a new project" / "Try the tutorial project" — the SAME shared flows
// the sidebar's project switcher runs (services/projectStart.js: ONE source
// for the dialog shape + i18n keys + create/open-demo + go Home).
async function onStartNew() {
  markSeen();
  await promptNewProject();
}

async function onTryTutorial() {
  markSeen();
  await openTutorialProject();
}

// "Run Quick Setup" — deep-link the AI page with ?quicksetup=1; AiView passes it
// to AiModelsArea, which opens the QuickSetup wizard once after its first load.
function onQuickSetup() {
  markSeen();
  router.push("/ai?quicksetup=1");
}

// "Connect an online provider" — the AI page (Providers & models tab).
function onConnectProvider() {
  markSeen();
  router.push("/ai");
}

// The skip line's "AI settings" link — the AI page.
function onAiSettings() {
  markSeen();
  router.push("/ai");
}
</script>

<template>
  <div class="wv-page">
    <div class="wv-col">
      <!-- Hero: mono eyebrow · serif wordmark · one-line pitch · start CTAs -->
      <div class="wv-hero">
        <div class="wv-eyebrow">{{ $t("welcome.eyebrow") }}</div>
        <h1 class="wv-wordmark">{{ $t("welcome.wordmark") }}</h1>
        <p class="wv-tagline">{{ $t("welcome.tagline") }}</p>
        <div class="wv-cta-row">
          <div class="wv-cta">
            <UiButton intent="primary" @click="onStartNew">{{ $t("welcome.startNew") }}</UiButton>
          </div>
          <div class="wv-cta">
            <UiButton intent="secondary" @click="onTryTutorial">{{ $t("welcome.tutorial") }}</UiButton>
            <span class="wv-cta-sub">{{ $t("welcome.tutorialSub") }}</span>
          </div>
        </div>
      </div>

      <!-- Major features — the 3×2 grid (kit Icon glyphs, not emoji) -->
      <div class="wv-features">
        <div v-for="f in FEATURES" :key="f.key" class="wv-feat">
          <span class="wv-feat-ic"><Icon :name="f.icon" :size="18" /></span>
          <div class="wv-feat-txt">
            <b>{{ $t(`welcome.features.${f.key}.title`) }}</b>
            <span>{{ $t(`welcome.features.${f.key}.body`) }}</span>
          </div>
        </div>
      </div>

      <!-- AI setup band — optional; the two setup paths + the skip line -->
      <div class="wv-ai">
        <div class="wv-ai-head">
          <b>{{ $t("welcome.aiHeading") }}</b>
          <span>{{ $t("welcome.aiBody") }}</span>
        </div>
        <div class="wv-ai-btns">
          <div class="wv-cta">
            <UiButton intent="primary" @click="onQuickSetup">{{ $t("welcome.quickSetup") }}</UiButton>
            <span class="wv-cta-sub">{{ $t("welcome.quickSetupSub") }}</span>
          </div>
          <div class="wv-cta">
            <UiButton intent="secondary" @click="onConnectProvider">{{ $t("welcome.connectProvider") }}</UiButton>
            <span class="wv-cta-sub">{{ $t("welcome.connectProviderSub") }}</span>
          </div>
        </div>
        <!-- The skip line carries an inline "AI settings" link → /ai. -->
        <i18n-t keypath="welcome.skip" tag="div" class="wv-ai-skip" scope="global">
          <template #link>
            <a class="wv-link" role="button" tabindex="0" @click="onAiSettings" @keydown.enter="onAiSettings">{{ $t("welcome.skipLink") }}</a>
          </template>
        </i18n-t>
      </div>

      <div class="wv-footer">{{ $t("welcome.footer") }}</div>
    </div>
  </div>
</template>

<style scoped>
/* The view fills the content area (flex child of .main) and owns the ONE
   scroller here, so a short window scrolls the hero rather than the app shell. */
.wv-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: var(--bg);
  color: var(--ink);
}
.wv-col {
  max-width: 880px;
  margin: 0 auto;
  padding: 64px 40px 40px;
  display: flex;
  flex-direction: column;
  gap: 34px;
}

/* Hero */
.wv-hero { text-align: center; }
.wv-eyebrow {
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 10px;
}
.wv-wordmark {
  font-family: var(--font-serif);
  font-weight: 600;
  font-size: 46px;
  line-height: 1.1;
  color: var(--ink);
  margin: 0;
}
.wv-tagline {
  font-size: 15px;
  color: var(--ink-2);
  margin: 8px 0 0;
}
.wv-cta-row {
  display: flex;
  gap: 12px;
  justify-content: center;
  align-items: flex-start;
  margin-top: 22px;
}
/* Each CTA is a column so an optional sub-line sits directly under its button
   (UiButton is single-line; the mockup's in-button sub becomes a caption). */
.wv-cta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
.wv-cta-sub {
  font-size: 11.5px;
  color: var(--muted);
}

/* Feature grid — 3×2, divided from the hero by a hairline. */
.wv-features {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 18px 26px;
  border-top: 1px solid var(--border-soft);
  padding-top: 26px;
}
.wv-feat {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.wv-feat-ic {
  color: var(--accent);
  line-height: 1.3;
  flex: none;
}
.wv-feat-txt b {
  display: block;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ink);
}
.wv-feat-txt span {
  display: block;
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.45;
  margin-top: 1px;
}

/* AI setup band — a surface card. */
.wv-ai {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 14px;
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.wv-ai-head b {
  display: block;
  font-size: 14px;
  margin-bottom: 3px;
  color: var(--ink);
}
.wv-ai-head span {
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.5;
}
.wv-ai-btns {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.wv-ai-skip {
  font-size: 12px;
  color: var(--muted);
}
.wv-link {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

/* Footer — subtle, centred. */
.wv-footer {
  font-size: 11.5px;
  color: var(--subtle);
  text-align: center;
}

@media (max-width: 720px) {
  .wv-features { grid-template-columns: 1fr 1fr; }
  .wv-col { padding: 44px 24px 32px; }
}
</style>
