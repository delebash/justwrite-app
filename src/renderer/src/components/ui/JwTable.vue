<script setup>
// Custom data table — replaces PrimeVue DataTable. Built on TanStack Vue
// Table for headless sort/filter/pagination state; visuals live in
// tokens.css under the ".jw-table" section.
//
// API surface (covers the patterns we actually use):
//   :data            — row array
//   :columns         — column defs: { id, accessorKey, header, sortable, headerStyle, cellStyle, dataType }
//   data-key         — id field on rows (drives :key)
//   :global-filter   — text to match across global-filter-fields
//   :global-filter-fields — array of column ids/accessors to search
//   :pagination      — false | { pageSize: N, pageSizeOptions: [...] }
//   :default-sort    — { id: 'col', desc: true } applied on mount
//   row-hover        — boolean for hover highlight
//   @row-click       — emits the original row
//
// Cell rendering:
//   - default: renders the cell value via String coercion
//   - custom: provide a slot named after column.id, e.g.
//       <template #title="{ row, value }">…</template>
//
// Slots:
//   #{columnId}="{ row, value }" — custom cell renderer
//   #empty — shown when filtered rows are zero

import { computed, ref, watch, useSlots } from "vue";
import {
  useVueTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  FlexRender,
} from "@tanstack/vue-table";
import Icon from "../Icon.vue";

const props = defineProps({
  data:               { type: Array, default: () => [] },
  columns:            { type: Array, required: true },
  dataKey:            { type: String, default: "id" },
  globalFilter:       { type: String, default: "" },
  globalFilterFields: { type: Array, default: () => [] },
  pagination:         { type: [Boolean, Object], default: false },
  defaultSort:        { type: Object, default: null }, // { id, desc }
  rowHover:           { type: Boolean, default: false },
});
const emit = defineEmits(["row-click"]);
const slots = useSlots();

const sorting = ref(props.defaultSort ? [props.defaultSort] : []);
const filtering = ref(props.globalFilter || "");
watch(() => props.globalFilter, (v) => { filtering.value = v || ""; });

const paginationCfg = computed(() => {
  if (!props.pagination) return null;
  if (props.pagination === true) return { pageSize: 25, pageSizeOptions: [10, 25, 50] };
  return {
    pageSize: props.pagination.pageSize ?? 25,
    pageSizeOptions: props.pagination.pageSizeOptions ?? [10, 25, 50],
  };
});
const paginationState = ref({ pageIndex: 0, pageSize: paginationCfg.value?.pageSize ?? 25 });
watch(paginationCfg, (cfg) => {
  if (cfg) paginationState.value = { ...paginationState.value, pageSize: cfg.pageSize };
});

// Convert our column shape into TanStack columnDefs.
const tableColumns = computed(() =>
  props.columns.map((c) => ({
    id: c.id || c.accessorKey,
    accessorKey: c.accessorKey,
    header: c.header,
    enableSorting: !!c.sortable,
    enableGlobalFilter: c.enableGlobalFilter !== false,
  })),
);

// Custom global filter — matches any of the globalFilterFields by
// case-insensitive substring on the stringified value. Default behaviour
// (when no fields given) is to match every column.
function globalFilterFn(row, _columnId, value) {
  const needle = String(value || "").toLowerCase().trim();
  if (!needle) return true;
  const fields = props.globalFilterFields.length
    ? props.globalFilterFields
    : props.columns.map((c) => c.accessorKey).filter(Boolean);
  for (const f of fields) {
    const v = row.original?.[f];
    if (v != null && String(v).toLowerCase().includes(needle)) return true;
  }
  return false;
}

const table = useVueTable({
  get data() { return props.data; },
  get columns() { return tableColumns.value; },
  state: {
    get sorting() { return sorting.value; },
    get globalFilter() { return filtering.value; },
    get pagination() { return paginationState.value; },
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === "function" ? updater(sorting.value) : updater;
  },
  onGlobalFilterChange: (v) => { filtering.value = v; },
  onPaginationChange: (updater) => {
    paginationState.value = typeof updater === "function" ? updater(paginationState.value) : updater;
  },
  globalFilterFn,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getPaginationRowModel: paginationCfg.value ? getPaginationRowModel() : undefined,
});

function onHeaderClick(header) {
  if (!header.column.getCanSort()) return;
  header.column.toggleSorting();
}

function headerSortIcon(header) {
  const dir = header.column.getIsSorted();
  if (dir === "asc")  return "ChevDown";  // visually up arrow via rotation
  if (dir === "desc") return "ChevDown";
  return null;
}

function rowKey(row) {
  return row.original?.[props.dataKey] ?? row.id;
}

function onRowClick(row, event) {
  emit("row-click", { data: row.original, originalEvent: event });
}

// Pagination helpers
const pageIndex = computed(() => table.getState().pagination.pageIndex);
const pageCount = computed(() => table.getPageCount());
const totalRows = computed(() => table.getFilteredRowModel().rows.length);
const pageStart = computed(() => totalRows.value === 0 ? 0 : pageIndex.value * paginationState.value.pageSize + 1);
const pageEnd = computed(() => Math.min(totalRows.value, (pageIndex.value + 1) * paginationState.value.pageSize));

function setPageSize(n) {
  paginationState.value = { pageIndex: 0, pageSize: Number(n) };
}
</script>

<template>
  <div class="jw-table-wrap" :class="{ 'jw-table-hover': rowHover }">
    <table class="jw-table">
      <thead>
        <tr v-for="hg in table.getHeaderGroups()" :key="hg.id">
          <th
            v-for="header in hg.headers"
            :key="header.id"
            :class="[
              { 'is-sortable': header.column.getCanSort(), 'is-sorted': !!header.column.getIsSorted() },
              header.column.columnDef.meta?.headerClass,
            ]"
            :style="props.columns.find(c => (c.id || c.accessorKey) === header.column.id)?.headerStyle"
            @click="onHeaderClick(header)"
          >
            <span class="jw-th-inner">
              <FlexRender :render="header.column.columnDef.header" :props="header.getContext()" />
              <span v-if="header.column.getIsSorted()" class="jw-sort-ind" :class="{ desc: header.column.getIsSorted() === 'desc' }">
                <Icon name="ChevDown" :size="11" />
              </span>
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!table.getRowModel().rows.length" class="jw-empty-row">
          <td :colspan="props.columns.length">
            <slot name="empty"><span class="t-muted">No results.</span></slot>
          </td>
        </tr>
        <tr
          v-for="row in table.getRowModel().rows"
          :key="rowKey(row)"
          class="jw-row"
          @click="onRowClick(row, $event)"
        >
          <td
            v-for="cell in row.getVisibleCells()"
            :key="cell.id"
            :style="props.columns.find(c => (c.id || c.accessorKey) === cell.column.id)?.cellStyle"
          >
            <slot
              :name="cell.column.id"
              :row="row.original"
              :value="cell.getValue()"
            >{{ cell.getValue() }}</slot>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="paginationCfg" class="jw-pager">
      <span class="jw-pager-count">{{ pageStart }}–{{ pageEnd }} of {{ totalRows }}</span>
      <span class="jw-pager-controls">
        <button class="jw-pager-btn" :disabled="!table.getCanPreviousPage()" @click="table.firstPage()" v-tooltip.bottom="'First page'">
          <Icon name="ChevLeft" :size="12" /><Icon name="ChevLeft" :size="12" />
        </button>
        <button class="jw-pager-btn" :disabled="!table.getCanPreviousPage()" @click="table.previousPage()" v-tooltip.bottom="'Previous page'">
          <Icon name="ChevLeft" :size="12" />
        </button>
        <span class="jw-pager-page">Page {{ pageIndex + 1 }} / {{ Math.max(1, pageCount) }}</span>
        <button class="jw-pager-btn" :disabled="!table.getCanNextPage()" @click="table.nextPage()" v-tooltip.bottom="'Next page'">
          <Icon name="ChevRight" :size="12" />
        </button>
        <button class="jw-pager-btn" :disabled="!table.getCanNextPage()" @click="table.lastPage()" v-tooltip.bottom="'Last page'">
          <Icon name="ChevRight" :size="12" /><Icon name="ChevRight" :size="12" />
        </button>
        <select class="jw-pager-size" :value="paginationState.pageSize" @change="setPageSize($event.target.value)">
          <option v-for="n in paginationCfg.pageSizeOptions" :key="n" :value="n">{{ n }} / page</option>
        </select>
      </span>
    </div>
  </div>
</template>
