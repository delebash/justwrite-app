<script setup>
import { ref, computed } from "vue";
import PaneHeader from "../components/PaneHeader.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";
import JwSelect from "@renderer/components/ui/JwSelect.vue";
import JwTextarea from "@renderer/components/ui/JwTextarea.vue";
import { useUiStore } from "../stores/ui.js";
import { useAiTasksStore } from "../stores/aiTasks.js";
import { runAiStream } from "../services/aiStream.js";
import AiTaskStrip from "../components/AiTaskStrip.vue";
import AiFeatureChip from "../components/AiFeatureChip.vue";

const ui = useUiStore();
const aiTasks = useAiTasksStore();

const myTask = computed(() => aiTasks.runningTasks.find(
  (t) => t.feature === "brainstorm" && t.meta?.category === category.value
));
const running = computed(() => !!myTask.value);

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }

const CATEGORIES = [
  {
    label: "Character names",
    value: "character_name",
    purpose: "Personal names for a character — given names, surnames, full names, nicknames.",
    placeholder: "e.g. Norse-sounding female warrior names, sharp consonants, two syllables.\n\nOr: Reedy academic name for a 1920s English don, slightly ridiculous.",
  },
  {
    label: "Place names",
    value: "place_name",
    purpose: "Toponyms — cities, taverns, neighbourhoods, mountains, ships, kingdoms, planets.",
    placeholder: "e.g. Creepy New England small-town shop names, 1920s setting.\n\nOr: Frontier-town tavern names that suggest both refuge and trouble.",
  },
  {
    label: "Item / object names",
    value: "item_name",
    purpose: "Names for things — swords, books, organisations, spells, drugs, vehicles, recurring objects.",
    placeholder: "e.g. Names for a legendary sword passed down by exiled queens, evocative not ornate.\n\nOr: Old-fashioned names for a banned political pamphlet circulated in the 1840s.",
  },
  {
    label: "Titles (book / chapter / scene)",
    value: "title",
    purpose: "Book titles, chapter titles, or scene titles — short, evocative, register-aware.",
    placeholder: "e.g. Titles for a heist novel set on a generation ship, single word, evocative.\n\nOr: Chapter titles for a slow-burn romance — three-to-five words, melancholy.",
  },
  {
    label: "Next plot beats",
    value: "next_beat",
    purpose: "Brainstorm what could happen next at the plot level — moves, beats, escalations from where the story currently sits. Different from \"Continue\" in the editor: this gives you a menu of options, not finished prose.",
    placeholder: "e.g. Elena has just confirmed Marcus is lying. She has the locket but no allies left. Generate 15–20 possible next plot beats — escalations, complications, reveals, twists, scene moves.\n\nOr: The crew has reached the temple. Tomas wants to enter; Esme wants to wait. Brainstorm where the scene goes next.",
  },
  {
    label: "Plot twists",
    value: "twist",
    purpose: "Twists, reveals, and unexpected turns the story could take — from plausible to wild. Excellent for when the next move feels too obvious, or for a brainstorm even when you reject most options.",
    placeholder: "e.g. Mid-second-act thriller. Detective protagonist is closing in on the killer. Brainstorm 15–20 plot twists — revelations, reversals, identity shifts, betrayals — from plausible to wild.\n\nOr: Quiet literary novel about a daughter caring for an aging father. What could twist the dynamic?",
  },
  {
    label: "Anything (free prompt)",
    value: "free",
    purpose: "Use this when the category list doesn't fit — phrases, taglines, alternate words, ideas.",
    placeholder: "e.g. Twenty short phrases a tired innkeeper might say to a stranger before bed.\n\nOr: Twenty single words that mean both 'home' and 'cage'.",
  },
];

const activeCategory = computed(() => CATEGORIES.find((c) => c.value === category.value) || CATEGORIES[0]);

const category = ref("character_name");
const seed     = ref("");
const results  = ref([]);
const seen     = ref(new Set());
const error    = ref("");

const likedItems  = computed(() => results.value.filter((r) => r.liked).map((r) => r.text));
const canMoreLike = computed(() => likedItems.value.length > 0 && !running.value);
const canGenerate = computed(() => seed.value.trim().length > 0 && !running.value);

function categoryLabel(val) {
  return CATEGORIES.find((c) => c.value === val)?.label || val;
}

function buildSystemPrompt() {
  const label = categoryLabel(category.value);
  // Plot-level brainstorms (next beats, twists) need longer items than
  // names/titles, so we give the model a different length contract.
  if (category.value === "next_beat" || category.value === "twist") {
    const kind = category.value === "twist" ? "plot twists, reveals, or reversals" : "next plot beats — possible moves, escalations, or scene-level developments";
    return `You are a story-craft brainstorming partner for a novelist. The user has described their current situation; you respond with 15-20 distinct ${kind}, each on its own line. Each item is a single sentence (12-25 words) naming a specific, concrete move — not abstract advice. Mix close-to-obvious moves with wilder ones. No numbering, no commentary, no preface, no explanations. Do not repeat items the user has already seen.`;
  }
  return `You are a creative brainstorming partner for a novelist. The user is generating ${label} ideas. Reply with 15–20 short suggestions, one per line, no numbering, no commentary, no explanations. Each suggestion stands alone — a name, a phrase, a title — never more than ~6 words. Do not repeat suggestions the user has already seen.`;
}

function buildUserPrompt(isContinuation) {
  const label = categoryLabel(category.value);
  let msg = `Category: ${label}\nSeed: ${seed.value.trim()}`;

  if (isContinuation && likedItems.value.length) {
    msg += `\n\nThe user liked these suggestions from a previous round. Generate 15–20 new ones in the same direction — same vibe, sound, era, register — but DO NOT repeat any of these:\n`;
    msg += likedItems.value.map((t) => `- ${t}`).join("\n");
  }

  const seenList = Array.from(seen.value);
  if (seenList.length) {
    msg += `\n\nAvoid repeating any of these already-seen suggestions:\n`;
    msg += seenList.map((t) => `- ${t}`).join("\n");
  }

  msg += `\n\nOutput 15–20 fresh suggestions, one per line.`;
  return msg;
}

function parseLines(raw) {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^(\d+[.)]\s*|[-*•]\s*)/, "").trim())
    .filter((l) => l.length > 0 && !seen.value.has(l));
}

async function runGenerate(isContinuation) {
  if (running.value) return;
  error.value = "";
  try {
    let accumulated = "";
    const { content } = await runAiStream({
      feature: "brainstorm",
      usageFeature: `brainstorm:${category.value}`,
      temperature: 0.9,
      onDelta(delta) {
        accumulated += delta;
      },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user",   content: buildUserPrompt(isContinuation) },
      ],
      task: { label: "Brainstorm", meta: { category: category.value } },
    });
    accumulated = content || accumulated;

    const lines = parseLines(accumulated);
    const deduped = [];
    const batchSeen = new Set();
    for (const line of lines) {
      if (!seen.value.has(line) && !batchSeen.has(line)) {
        deduped.push(line);
        batchSeen.add(line);
      }
    }
    for (const t of deduped) seen.value.add(t);
    const newItems = deduped.map((text) => ({ text, liked: false }));
    if (isContinuation) {
      results.value = [...results.value, ...newItems];
    } else {
      results.value = newItems;
    }
  } catch (e) {
    if (!isAbort(e)) error.value = e?.message || "Something went wrong.";
  }
}

function generate() {
  seen.value = new Set();
  results.value = [];
  runGenerate(false);
}

function moreLikeThese() {
  runGenerate(true);
}

function toggleLike(item) {
  item.liked = !item.liked;
}

async function useItem(text) {
  try {
    await navigator.clipboard.writeText(text);
    ui.showToast({ message: `Copied "${text}" to clipboard.` });
  } catch {
    ui.showToast({ message: "Could not access clipboard." });
  }
}

function clear() {
  results.value = [];
  seen.value = new Set();
  error.value = "";
}
</script>

<template>
  <div class="brainstorm-view">
    <PaneHeader eyebrow="Planning" title="Brainstorm" help-key="brainstorm">
      <AiFeatureChip feature="brainstorm" label="Brainstorm" />
    </PaneHeader>

    <div class="brainstorm-controls">
      <p class="bs-desc">
        <strong>Brainstorm</strong> is a transient generator for names and short phrases —
        character names, place names, object/item names, titles, or any free-form list. Pick a
        category, type a seed, hit Generate; thumbs-up the ones you like and click
        <strong>More like these</strong> to steer the next batch. Nothing here persists once you
        leave the panel — copy what you want and move on.
      </p>
      <div class="brainstorm-field">
        <label class="brainstorm-label">Category</label>
        <JwSelect
          v-model="category"
          :options="CATEGORIES"
          placeholder="Pick a category…"
        />
        <p class="brainstorm-cat-purpose">{{ activeCategory.purpose }}</p>
      </div>

      <div class="brainstorm-field">
        <label class="brainstorm-label">Seed prompt</label>
        <JwTextarea
          v-model="seed"
          :rows="4"
          :placeholder="activeCategory.placeholder"
          :disabled="running.value"
        />
        <p class="brainstorm-seed-hint">
          Describe vibe, genre, era, register, sound — the more specific the seed, the less generic the output.
        </p>
      </div>

      <AiTaskStrip :task="myTask" />

      <div class="brainstorm-actions">
        <JwButton
          intent="primary"
          label="Generate"
          :loading="running.value"
          :disabled="!canGenerate"
          v-tooltip.bottom="canGenerate ? 'Generate ideas from your seed prompt' : 'Enter a seed prompt to generate ideas'"
          @click="generate"
        />
        <JwButton
          v-if="results.length > 0"
          intent="ghost"
          label="Clear"
          :disabled="running.value"
          @click="clear"
        />
      </div>

      <p v-if="error" class="brainstorm-error">{{ error }}</p>
    </div>

    <div v-if="results.length > 0" class="brainstorm-results">
      <ul class="brainstorm-list">
        <li
          v-for="(item, i) in results"
          :key="i"
          class="brainstorm-item"
          :class="{ 'is-liked': item.liked }"
        >
          <span class="brainstorm-item-text">{{ item.text }}</span>
          <div class="brainstorm-item-actions">
            <button
              class="brainstorm-icon-btn"
              :class="{ 'is-active': item.liked }"
              :title="item.liked ? 'Unlike' : 'Like'"
              @click="toggleLike(item)"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 2.5C6.5 2.5 5 3.5 5 5.5C5 7.5 8 11 8 11C8 11 11 7.5 11 5.5C11 3.5 9.5 2.5 8 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" :fill="item.liked ? 'currentColor' : 'none'" />
              </svg>
            </button>
            <button
              class="brainstorm-icon-btn"
              title="Copy to clipboard"
              @click="useItem(item.text)"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
                <path d="M3 10.5V3.5C3 2.948 3.448 2.5 4 2.5H10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </li>
      </ul>

      <div class="brainstorm-more-row">
        <JwButton
          intent="accent2"
          label="More like these"
          :loading="running.value"
          :disabled="!canMoreLike"
          v-tooltip.bottom="canMoreLike ? 'Generate more results similar to your liked items' : 'Thumb-up at least one result to steer the next batch'"
          @click="moreLikeThese"
        />
        <span v-if="likedItems.length === 0 && !running.value" class="brainstorm-hint">
          Thumb-up results to steer the next batch.
        </span>
      </div>
    </div>

    <div v-else-if="!running.value && !error" class="brainstorm-empty">
      <p>Pick a category, describe what you need, and hit Generate.</p>
    </div>

    <div v-if="running.value && results.length === 0" class="brainstorm-empty">
      <p class="brainstorm-generating">Generating…</p>
    </div>
  </div>
</template>

<style scoped>
.bs-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0;
}
.bs-desc strong { color: var(--ink-2); font-weight: 600; }

.brainstorm-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.brainstorm-controls {
  padding: 16px 20px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-bottom: 1px solid var(--border);
}

.brainstorm-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.brainstorm-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.brainstorm-cat-purpose {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--ink-2);
  font-style: italic;
  line-height: 1.5;
}

.brainstorm-seed-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
}

.brainstorm-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.brainstorm-error {
  font-size: 13px;
  color: var(--danger);
  margin: 0;
}

.brainstorm-results {
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.brainstorm-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.brainstorm-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--radius-sm, 6px);
  background: var(--surface-raised, var(--surface));
  border: 1px solid var(--border);
  transition: border-color 0.15s;
}

.brainstorm-item.is-liked {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 6%, var(--surface-raised, var(--surface)));
}

.brainstorm-item-text {
  flex: 1;
  font-size: 13.5px;
  color: var(--ink);
  line-height: 1.4;
}

.brainstorm-item-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.brainstorm-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: var(--muted);
  transition: color 0.12s, background 0.12s;
}

.brainstorm-icon-btn:hover {
  color: var(--ink);
  background: var(--hover-overlay, rgba(0,0,0,0.06));
}

.brainstorm-icon-btn.is-active {
  color: var(--accent);
}

.brainstorm-more-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 4px;
}

.brainstorm-hint {
  font-size: 12px;
  color: var(--muted);
}

.brainstorm-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.brainstorm-empty p {
  font-size: 13px;
  color: var(--muted);
  margin: 0;
  max-width: 300px;
}

.brainstorm-generating {
  font-style: italic;
}
</style>
