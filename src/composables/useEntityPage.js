// What every story-world page does the same way with its entries — characters, locations, objects,
// groups, strands, worldbuilding, architecture, notes: open an entry (select it in the sidebar and
// go to its route) from the table, after "+ New" (?new=1, the name selected: useSelectNewName) and
// after a delete; the status facet's options; Ask the book about the open entry. Each page carried
// its own copy until the copies audit (2026-10-28; the deep audit's useEntityCrudView, 2026-06-20).
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";

/** @param {string} section the sidebar section and the route's first segment ("locations") */
export function useEntityPage(section) {
  const project = useProjectStore();
  const ui = useUiStore();
  const router = useRouter();

  function open(id, { isNew = false } = {}) {
    ui.select(section, id);
    router.push(`/${section}/${id}${isNew ? "?new=1" : ""}`);
  }

  return {
    open,
    /** The table's row click (EntityIndex's row-click). */
    onRowClick(event) {
      const id = event?.data?.id;
      if (id) open(id);
    },
    /** After a delete: the first entry left, or the list when none is. */
    openFirst(entries) {
      if (entries[0]) open(entries[0].id);
      else router.push(`/${section}`);
    },
    /** The status facet's options: the book's shown statuses. */
    statusOptions: computed(() => project.statusesShown.map((s) => ({ value: s.id, label: s.label }))),
    /** Ask the book: the chat panel, in book mode, with the question asked. */
    askBook(question, sourceKey) {
      ui.openChatPanelFor({ mode: "book", question, sourceKey });
    },
  };
}

/** Every tag on the entries in their order, repeats kept — TagEditor's pool (it drops repeats). */
export function tagPoolOf(entries) {
  return entries.flatMap((e) => e.tags || []);
}

/** Every tag on the entries, once each and sorted — a facet's options. */
export function tagsIn(entries) {
  return [...new Set(tagPoolOf(entries))].sort();
}

/** Every kind in use on the entries, once each and sorted — a facet's options. */
export function kindsIn(entries) {
  return [...new Set(entries.map((e) => e.kind).filter(Boolean))].sort();
}
