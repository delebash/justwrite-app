<script setup>
// The first-run welcome screen (QC-46, redesigned 2026-07-11). A router-outlet
// view rendered inside the projectless OnboardingShell (full width — no sidebar),
// so it uses the whole content area: a centred hero (serif wordmark + one-line
// pitch + the two start CTAs) over a wide 3×3 grid of compact feature cards, sized
// to fit a normal window without scrolling.
//
// AI setup is NO LONGER on this screen. The old "Run Quick Setup / Connect online"
// band moved into a one-time AiSetupDialog that opens right after the user's FIRST
// project is created/opened (services/projectStart.js). Here, AI is just one of the
// nine feature cards — a description, not a setup step.
//
// First-run detection lives in main.js (a run-once router guard on the initial root
// navigation, gated on the `welcomeSeen` setting). Both CTAs mark the screen seen
// FIRST, so a reload before choosing shows it again (correct-once) but a reload
// after any choice does not.
import { Icon, UiButton } from "@delebash/llm-ui";
import { promptNewProject, openTutorialProject } from "../services/projectStart.js";
import { writeSetting } from "../services/settings.js";

// The 3×3 feature grid. Icons are kit Icon names (mirroring the app's own nav
// glyphs). Copy lives under welcome.features.<key> in en.json.
const FEATURES = [
  { icon: "Book", key: "chapters" },
  { icon: "Users", key: "bible" },
  { icon: "Strands", key: "plot" },
  { icon: "Timeline", key: "timeline" },
  { icon: "Sparkle", key: "ai" },
  { icon: "Target", key: "goals" },
  { icon: "Search", key: "search" },
  { icon: "Note", key: "notes" },
  { icon: "Export", key: "export" },
];

// Mark the welcome screen dismissed. Called FIRST on both CTA exits — the "seen"
// write must land before we navigate away (settings.writeSetting is debounced +
// flushed on pagehide, so the in-SPA push doesn't drop it).
function markSeen() {
  writeSetting("welcomeSeen", true);
}

// "Start a new project" / "Try the tutorial project" — the SAME shared flows the
// sidebar's project switcher runs (services/projectStart.js: ONE source for the
// dialog shape + create/open-demo + go Home + the first-project AI setup dialog).
async function onStartNew() {
  markSeen();
  await promptNewProject();
}

async function onTryTutorial() {
  markSeen();
  await openTutorialProject();
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

      <!-- Major features — a wide 3×3 grid of compact cards under a section label. -->
      <div class="wv-section">
        <div class="wv-section-label">{{ $t("welcome.sectionLabel") }}</div>
        <div class="wv-grid">
          <div v-for="f in FEATURES" :key="f.key" class="wv-card">
            <span class="wv-card-ic"><Icon :name="f.icon" :size="20" /></span>
            <div class="wv-card-txt">
              <div class="wv-card-title">{{ $t(`welcome.features.${f.key}.title`) }}</div>
              <div class="wv-card-body">{{ $t(`welcome.features.${f.key}.body`) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The view fills the content area (flex child of OnboardingShell's body) and owns
   the ONE scroller here. The inner column centres and caps its width, using the
   full stage horizontally while staying readable. */
.wv-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: var(--bg);
  color: var(--ink);
  display: flex;
}
.wv-col {
  width: 100%;
  max-width: 1180px;
  margin: auto;
  padding: 44px 48px;
  display: flex;
  flex-direction: column;
  gap: 36px;
}

/* Hero */
.wv-hero { text-align: center; }
.wv-eyebrow {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 10px;
}
.wv-wordmark {
  font-family: var(--font-serif);
  font-weight: 600;
  font-size: 52px;
  line-height: 1.05;
  color: var(--ink);
  margin: 0;
}
.wv-tagline {
  font-size: 16px;
  color: var(--ink-2);
  margin: 12px auto 0;
  max-width: 540px;
  line-height: 1.5;
}
.wv-cta-row {
  display: flex;
  gap: 14px;
  justify-content: center;
  align-items: flex-start;
  margin-top: 26px;
}
/* Each CTA is a column so an optional sub-line sits directly under its button
   (UiButton is single-line; the sub becomes a caption). */
.wv-cta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.wv-cta-sub {
  font-size: 12px;
  color: var(--muted);
}

/* Feature section — section label + wide 3×3 grid of horizontal cards. */
.wv-section-label {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  text-align: center;
  margin-bottom: 20px;
}
.wv-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}
.wv-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 14px;
  transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}
.wv-card:hover {
  transform: translateY(-3px);
  border-color: color-mix(in oklab, var(--accent) 45%, var(--border));
  box-shadow: 0 10px 24px -16px color-mix(in oklab, var(--accent) 60%, transparent);
}
.wv-card-ic {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: none;
  border-radius: 12px;
  color: var(--accent);
  background: color-mix(in oklab, var(--accent) 12%, transparent);
}
.wv-card-txt {
  min-width: 0;
}
.wv-card-title {
  font-family: var(--font-serif);
  font-size: 17px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 3px;
}
.wv-card-body {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
}

@media (max-width: 940px) {
  .wv-grid { grid-template-columns: 1fr 1fr; }
  .wv-wordmark { font-size: 44px; }
  .wv-col { padding: 36px 28px; gap: 30px; }
}
@media (max-width: 600px) {
  .wv-grid { grid-template-columns: 1fr; }
  .wv-cta-row { flex-direction: column; align-items: center; }
}
</style>
