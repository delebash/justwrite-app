<script setup>
// Entity-extraction review list.
//
// Receives proposals as a prop, lets the user tick which ones to keep,
// edit names/details inline, then commits accepted items via the
// project store's existing add* actions. Nothing auto-saves — every
// commit is an explicit confirm.

import { ref, computed, watch } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { proposeSceneLinks } from "../services/rag/entityMatcher.js";
import { isLikelyNonStoryTitle } from "../services/analysis/entitySweep.js";
import { Icon } from "@delebash/llm-ui";
import { AppModal } from "@delebash/llm-ui";
import { EmptyState } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";
import { UiCheckbox } from "@delebash/llm-ui";

const props = defineProps({
  // { characters: [...], locations: [...], objects: [...] }
  proposals: { type: Object, required: true },
  // Chapter context shown in the header.
  chapterTitle: { type: String, default: "" },
});
const emit = defineEmits(["close", "committed"]);

const project = useProjectStore();
const ui = useUiStore();

// Local editable rows so the user can tweak names/blurbs before
// committing. Mirrors the prop shape and adds an "accept" flag.
const rows = ref({ characters: [], locations: [], objects: [] });

function reset(p) {
  rows.value = {
    characters: (p?.characters || []).map((c, i) => ({ ...c, _id: `c${i}`, accept: true })),
    locations:  (p?.locations  || []).map((l, i) => ({ ...l, _id: `l${i}`, accept: true })),
    objects:    (p?.objects    || []).map((o, i) => ({ ...o, _id: `o${i}`, accept: true })),
  };
}
watch(() => props.proposals, (p) => reset(p), { immediate: true });

const counts = computed(() => ({
  characters: rows.value.characters.filter((r) => r.accept).length,
  locations:  rows.value.locations.filter((r) => r.accept).length,
  objects:    rows.value.objects.filter((r) => r.accept).length,
}));
const totalSelected = computed(() => counts.value.characters + counts.value.locations + counts.value.objects);
const totalProposed = computed(() =>
  rows.value.characters.length + rows.value.locations.length + rows.value.objects.length);
const anyProposed = computed(() => totalProposed.value > 0);

function setAll(kind, on) {
  rows.value[kind] = rows.value[kind].map((r) => ({ ...r, accept: on }));
}

// Aliases arrive from the sweep as an array (E3) and are edited here as a
// comma-separated string — normalize either shape.
function parseAliases(value) {
  if (Array.isArray(value)) return value.map((a) => String(a).trim()).filter(Boolean);
  return String(value || "").split(",").map((a) => a.trim()).filter(Boolean);
}

function commit() {
  let added = 0;
  // E1 (RAG build): the sweep KNOWS which chapters each entity came from —
  // keep that provenance through accept by scanning the origin chapters'
  // scenes for the accepted names/aliases (the shared matcher, no LLM) and
  // setting the scene presence links in ONE batched store action.
  const accepted = [];
  for (const r of rows.value.characters) {
    if (!r.accept) continue;
    const aliases = parseAliases(r.aliases);
    const id = project.addCharacter({ name: r.name, role: r.role, oneLiner: r.oneLiner, aliases });
    accepted.push({ kind: "character", entityId: id, name: r.name, aliases, origins: r.originChapters || [] });
    added++;
  }
  for (const r of rows.value.locations) {
    if (!r.accept) continue;
    const id = project.addLocation({ name: r.name, kind: r.kind, note: r.note });
    accepted.push({ kind: "location", entityId: id, name: r.name, aliases: [], origins: r.originChapters || [] });
    added++;
  }
  for (const r of rows.value.objects) {
    if (!r.accept) continue;
    const id = project.addObject({ name: r.name, kind: r.kind, note: r.note });
    accepted.push({ kind: "object", entityId: id, name: r.name, aliases: [], origins: r.originChapters || [] });
    added++;
  }

  // Scene-link backfill scans the origin chapters for the accepted names, but
  // NOT reference pages: linking "Gavin Guile" to the Character-List chapter's
  // scenes is provenance noise. Accepted entities keep every origin for display
  // (the chips) — only the link scan drops the non-story ones (WS7, 2026-07-18).
  const originIds = new Set(
    accepted.flatMap((a) => a.origins.filter((oc) => !isLikelyNonStoryTitle(oc.title)).map((oc) => oc.id)),
  );
  let linked = 0;
  if (originIds.size) {
    const proposals = proposeSceneLinks(project, accepted, { chapterIds: originIds });
    linked = project.applyScenePresenceLinks(proposals);
  }

  ui.showToast({
    message: `Added ${added} ${added === 1 ? "entity" : "entities"} to the story bible.` +
      (linked ? ` Linked to ${linked} scene${linked === 1 ? "" : "s"}.` : ""),
  });
  // WS-C: the accepted characters' ids so the caller can offer to draft their
  // profiles in one batch (Fill from book) right after the sweep.
  const characterIds = accepted.filter((a) => a.kind === "character").map((a) => a.entityId);
  emit("committed", { added, linked, characterIds });
  emit("close");
}

const SECTIONS = [
  { key: "characters", label: "Characters", icon: "Users", primary: "role",     blurb: "oneLiner" },
  { key: "locations",  label: "Locations",  icon: "Pin",   primary: "kind",     blurb: "note" },
  { key: "objects",    label: "Objects",    icon: "Cube",  primary: "kind",     blurb: "note" },
];

// Tooltip listing every chapter an entity was found in. Used when more
// origins overflow the chip cap of 6.
function originTitle(originChapters) {
  if (!originChapters?.length) return "";
  return originChapters.map((oc) => `Ch. ${oc.num} — ${oc.title || "Untitled"}`).join("\n");
}
</script>

<template>
  <AppModal
    :eyebrow="$t('entityReview.eyebrow')"
    :title="chapterTitle ? $t('entityReview.titleFrom', { chapter: chapterTitle }) : $t('entityReview.titleFallback')"
    @close="emit('close')"
  >
    <p v-if="anyProposed" class="er-desc">
      {{ $t("entityReview.desc") }}
    </p>

    <EmptyState v-if="!anyProposed"
      icon="Check"
      :title="$t('entityReview.emptyTitle')"
      :message="$t('entityReview.emptyMessage')" />

    <div v-else class="er-body">
      <section v-for="sec in SECTIONS" :key="sec.key" v-show="rows[sec.key].length" class="er-section">
        <header class="er-section-h">
          <Icon :name="sec.icon" :size="13" />
          <h3>{{ sec.label }}</h3>
          <span class="t-muted">{{ $t("common.selectedOf", { selected: counts[sec.key], total: rows[sec.key].length }) }}</span>
          <!-- .tb-text has no global definition (it lives only in RichEditor's
               scoped block) — the resolving modifier is .tb-btn.wide, which
               sizes the button to its text (checker note, 2026-07-11). -->
          <div class="er-section-h-actions">
            <button type="button" class="tb-btn wide" @click="setAll(sec.key, true)">{{ $t("common.all") }}</button>
            <button type="button" class="tb-btn wide" @click="setAll(sec.key, false)">{{ $t("common.none") }}</button>
          </div>
        </header>
        <div class="er-list">
          <div v-for="r in rows[sec.key]" :key="r._id" class="er-row" :class="{ dropped: !r.accept }">
            <UiCheckbox v-model="r.accept" class="er-check" />
            <div class="er-fields">
              <div class="er-fields-row">
                <input class="er-name" v-model="r.name" :placeholder="$t('entityReview.namePlaceholder')" :disabled="!r.accept" />
                <input class="er-primary" v-model="r[sec.primary]" :placeholder="sec.primary" :disabled="!r.accept" />
              </div>
              <input class="er-blurb" v-model="r[sec.blurb]" :placeholder="sec.blurb" :disabled="!r.accept" />
              <!-- E3: the sweep proposes aliases for characters — editable
                   (comma-separated) before accept; they feed dedupe, pinning,
                   and the scene-link matcher. -->
              <input v-if="sec.key === 'characters'" class="er-blurb"
                :value="Array.isArray(r.aliases) ? r.aliases.join(', ') : (r.aliases || '')"
                :placeholder="$t('entityReview.aliasesPlaceholder')" :disabled="!r.accept"
                @input="r.aliases = $event.target.value" />
              <div v-if="r.originChapters?.length" class="er-origins" v-tooltip.bottom="originTitle(r.originChapters)">
                <span class="er-origin-lbl">{{ $t("entityReview.foundIn") }}</span>
                <span v-for="oc in r.originChapters.slice(0, 6)" :key="oc.id" class="er-origin-chip">{{ $t("entityReview.chapterChip", { num: oc.num }) }}</span>
                <span v-if="r.originChapters.length > 6" class="er-origin-more">+{{ r.originChapters.length - 6 }}</span>
              </div>
              <div v-if="r.evidence" class="er-evidence">
                <span class="er-evidence-lbl">{{ $t("entityReview.quote") }}</span>
                <span class="er-evidence-q">"{{ r.evidence }}"</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <span class="t-muted">{{ $t("common.selectedOf", { selected: totalSelected, total: totalProposed }) }}</span>
      <span style="flex:1"></span>
      <UiButton intent="ghost" @click="emit('close')">{{ $t("common.cancel") }}</UiButton>
      <UiButton intent="primary" :disabled="totalSelected === 0" @click="commit">
        <Icon name="Check" :size="13" />
        {{ $t("entityReview.addAction", { n: totalSelected }) }}
      </UiButton>
    </template>
  </AppModal>
</template>

<style scoped>

.er-desc {
  font-size: 12px; line-height: 1.55; color: var(--muted);
  margin: 0 0 14px;
}

.er-body { display: flex; flex-direction: column; gap: 20px; }

.er-section { display: flex; flex-direction: column; gap: 8px; }
.er-section-h {
  display: flex; align-items: center; gap: 8px;
  padding-bottom: 6px; border-bottom: 1px solid var(--border-soft);
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted);
}
.er-section-h h3 { margin: 0; font-size: 11px; font-weight: 600; color: var(--ink); letter-spacing: inherit; text-transform: inherit; }
.er-section-h-actions { display: flex; gap: 4px; margin-left: auto; }
.er-section-h .t-muted { font-weight: 400; }

.er-list { display: flex; flex-direction: column; gap: 8px; }
.er-row {
  display: grid; grid-template-columns: auto 1fr; gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border-soft); border-radius: 8px;
  background: var(--surface);
  transition: opacity .15s, background .15s;
}
.er-row.dropped { opacity: 0.5; background: var(--surface-2); }
.er-check { display: flex; align-items: flex-start; padding-top: 6px; cursor: pointer; }
.er-fields { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.er-fields-row { display: grid; grid-template-columns: 1.4fr 1fr; gap: 8px; }
.er-name, .er-primary, .er-blurb {
  appearance: none;
  font-family: var(--font-ui); font-size: 13px;
  padding: 5px 9px;
  border: 1px solid var(--border-soft); border-radius: 5px;
  background: var(--surface); color: var(--ink);
}
.er-name { font-family: var(--font-serif); font-size: 14.5px; font-weight: 500; }
.er-name:focus, .er-primary:focus, .er-blurb:focus { border-color: var(--accent); outline: none; box-shadow: 0 0 0 2px var(--accent-soft); }
.er-name:disabled, .er-primary:disabled, .er-blurb:disabled { background: var(--surface-2); color: var(--muted); }
.er-evidence {
  display: flex; gap: 8px; align-items: baseline;
  font-size: 11.5px; line-height: 1.4;
  padding: 4px 8px; border-radius: 4px;
  background: var(--surface-2);
}
.er-evidence-lbl {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted);
  flex-shrink: 0;
}
.er-evidence-q { font-family: var(--font-serif); font-style: italic; color: var(--ink-2); }

.er-origins {
  display: flex; flex-wrap: wrap; gap: 5px; align-items: center;
  margin-top: 2px;
}
.er-origin-lbl {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted);
  margin-right: 2px;
}
.er-origin-chip {
  font-family: var(--font-mono); font-size: 10px;
  padding: 1px 6px; border-radius: 999px;
  background: var(--surface-2); color: var(--ink-2);
  border: 1px solid var(--border-soft);
  white-space: nowrap;
}
.er-origin-more {
  font-family: var(--font-mono); font-size: 10px;
  color: var(--muted);
}

@media (max-width: 640px) {
  .er-fields-row { grid-template-columns: 1fr; }
}
</style>
