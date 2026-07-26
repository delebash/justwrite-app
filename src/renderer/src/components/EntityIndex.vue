<script setup>
// THE entity index — one shell for every "list of things" page in the app.
//
// WHY (the user's ruling, 2026-07-26 "why not standardize it like all the others"):
// Characters, Locations, Objects, Groups, Notes, Strands and Worldbuilding each
// carried their OWN hand-rolled copy of the same three blocks — a search/clear/count
// toolbar, a row of facet chips, and a UiTable. They are not merely similar: with the
// entity nouns normalised away, LocationsView's block and ObjectsView's differ by their
// prose and two comments (157 vs 155 lines, 30 diff lines, all copy). Chapters was the
// one section with NO index at all, and giving it an eighth hand-rolled copy is what
// this component exists to avoid.
//
// The split: everything structural lives here; everything that differs is DATA.
//   · facets are declarative (`{key, label, options, multi, match}`), not markup —
//     they were the largest duplicated block, so a slot would have saved almost
//     nothing;
//   · columns + per-cell rendering stay with the consumer, passed straight through
//     to UiTable (see `cellSlots` — without the pass-through every custom cell would
//     render blank);
//   · the intro paragraph is a slot, because each one is an <i18n-t> with its own
//     named slots.
//
// Styling is the shared global `.entity-*` family in styles.css (NOT scoped to any
// view — verified before extracting, styles.css:1051+), so the markup renders
// identically to the copies it replaces.
import { computed, ref, useSlots } from "vue";
import { Icon, UiButton, UiInput, UiTable } from "@delebash/llm-ui";

const props = defineProps({
  /** Every row, unfiltered. Filtering happens here. */
  rows: { type: Array, required: true },
  /** UiTable column defs, exactly as UiTable wants them. */
  columns: { type: Array, required: true },
  /**
   * Declarative facet chips. One entry per chip row:
   *   key      unique id (also the default row field to compare)
   *   label    the row's caption
   *   options  [{ value, label }] — the chips after "All"
   *   multi    true → chips accumulate (a Set); false/absent → one at a time
   *   match    (row, value) => boolean. Defaults to row[key] === value.
   * A single-select facet is CLEARED with null, never a falsy check — `false` is a
   * legitimate selection (Characters' "Main" facet is exactly that).
   */
  facets: { type: Array, default: () => [] },
  /** Fields UiTable's global filter searches. */
  searchFields: { type: Array, default: () => [] },
  searchPlaceholder: { type: String, default: "" },
  /** Shown by UiTable when the filtered set is empty. */
  emptyText: { type: String, default: "" },
  dataKey: { type: String, default: "id" },
  pageSize: { type: Number, default: 20 },
});

const emit = defineEmits(["row-click"]);
const slots = useSlots();

// Every slot except our own structural ones is a UiTable cell slot to forward.
// `empty` is excluded deliberately: this component renders that slot itself (with
// `emptyText` as the default), so forwarding it too would hand UiTable two #empty
// templates for the same slot.
const cellSlots = computed(() => Object.keys(slots).filter((n) => n !== "intro" && n !== "empty"));

const query = ref("");
// facet key → selected value (single) or Set of values (multi). Replaced
// immutably so Vue sees the change; a mutated Set would not trigger.
const selected = ref({});

function selectionFor(facet) {
  const v = selected.value[facet.key];
  if (facet.multi) return v instanceof Set ? v : new Set();
  return v === undefined ? null : v;
}
function isActive(facet, value) {
  return facet.multi ? selectionFor(facet).has(value) : selectionFor(facet) === value;
}
function isAll(facet) {
  return facet.multi ? selectionFor(facet).size === 0 : selectionFor(facet) === null;
}
function pick(facet, value) {
  const next = { ...selected.value };
  if (facet.multi) {
    const set = new Set(selectionFor(facet));
    if (set.has(value)) set.delete(value); else set.add(value);
    next[facet.key] = set;
  } else {
    // Clicking the active chip clears it — the behaviour every copy had.
    next[facet.key] = selectionFor(facet) === value ? null : value;
  }
  selected.value = next;
}
function clearFacet(facet) {
  selected.value = { ...selected.value, [facet.key]: facet.multi ? new Set() : null };
}
function clearAll() {
  query.value = "";
  selected.value = {};
}

const matcherFor = (facet) => facet.match || ((row, value) => row[facet.key] === value);

const hasActiveFacets = computed(() => props.facets.some((f) => !isAll(f)));

const filteredRows = computed(() => {
  if (!hasActiveFacets.value) return props.rows;
  return props.rows.filter((row) =>
    props.facets.every((facet) => {
      if (isAll(facet)) return true;
      const match = matcherFor(facet);
      // multi = OR within the facet (any chosen tag matches), AND across facets.
      return facet.multi
        ? [...selectionFor(facet)].some((v) => match(row, v))
        : match(row, selectionFor(facet));
    }),
  );
});

function onGlobalInput(e) { query.value = e.target.value; }
function onRowClick(event) { emit("row-click", event); }

defineExpose({ filteredRows, clearAll });
</script>

<template>
  <div class="pane-card">
    <div class="scrollarea" style="padding:18px 22px 40px">
      <slot name="intro" />

      <div class="entity-toolbar">
        <span class="entity-search">
          <Icon name="Search" :size="13" class="entity-search-icon" />
          <UiInput
            :value="query"
            :placeholder="searchPlaceholder"
            @input="onGlobalInput"
            class="entity-search-input"
          />
        </span>
        <UiButton v-if="query || hasActiveFacets" :label="$t('common.clearFilters')"
          intent="ghost" size="small" @click="clearAll" />
        <span class="entity-count">
          {{ $t("common.countOf", { shown: filteredRows.length, total: rows.length }) }}
        </span>
      </div>

      <!-- `?.` on purpose: a facet whose options are still loading (or simply
           omitted) must not take the whole index down. -->
      <div class="entity-facets" v-if="facets.some((f) => f.options?.length)">
        <div v-for="facet in facets.filter((f) => f.options?.length)" :key="facet.key" class="entity-facet">
          <span class="entity-facet-label">{{ facet.label }}</span>
          <!-- A multi-select facet has no "All" chip: clearing it means deselecting,
               which is what every hand-rolled Tags row did. -->
          <button v-if="!facet.multi" class="entity-chip" :class="{ active: isAll(facet) }"
            @click="clearFacet(facet)">{{ $t("common.all") }}</button>
          <button v-for="opt in facet.options" :key="String(opt.value)"
            class="entity-chip" :class="{ active: isActive(facet, opt.value) }"
            @click="pick(facet, opt.value)">
            {{ opt.label }}
          </button>
        </div>
      </div>

      <UiTable
        :data="filteredRows"
        :columns="columns"
        :data-key="dataKey"
        row-hover
        :global-filter="query"
        :global-filter-fields="searchFields"
        :pagination="{ pageSize, pageSizeOptions: [10, 20, 50, 100] }"
        class="entity-table"
        @row-click="onRowClick"
      >
        <!-- Fallback content, so a consumer CAN pass #empty for a richer empty
             state while the common case stays a one-line `emptyText` prop. -->
        <template #empty>
          <slot name="empty"><div class="entity-empty">{{ emptyText }}</div></slot>
        </template>
        <template v-for="name in cellSlots" #[name]="slotProps" :key="name">
          <slot :name="name" v-bind="slotProps" />
        </template>
      </UiTable>
    </div>
  </div>
</template>
