// Arriving via "+ New" (?new=1): focus and select the page's name so the first keystroke replaces
// the default ("Untitled …"), then strip the query so a reload doesn't re-select. `target` is a
// ref to anything with focus() and select() — the page header (the kit's PaneHeader exposes both
// for its editable title). One home for what eight pages each carried (2026-10-11).
import { nextTick, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

export function useSelectNewName(target) {
  const route = useRoute();
  const router = useRouter();
  watch(() => route.query.new, (isNew) => {
    if (!isNew) return;
    nextTick(() => {
      target.value?.focus();
      target.value?.select?.();
      router.replace({ query: {} });
    });
  }, { immediate: true });
}
