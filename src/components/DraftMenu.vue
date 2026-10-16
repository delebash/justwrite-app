<script setup>
// The header's **Draft with AI ▾** (the AI drafting spec §1.1) — the kit's UiMenu as a ghost header
// button; the page puts its items in the slot (a character: From a description, Fill from book;
// a location, object or group: From a description). One component since 2026-10-16, when the
// three sheet pages gained it beside the character page.
import { Icon, UiMenu } from "@delebash/llm-ui";

defineProps({
  // The button's tooltip.
  title: { type: String, default: "" },
});
</script>

<template>
  <UiMenu :label="$t('characters.draft.menu')" :title="title"
    trigger-class="ui-btn ui-btn--ghost ui-btn--small" content-class="lu-mmenu" align="end">
    <template #trigger><Icon name="Sparkle" :size="14" /> {{ $t("characters.draft.menu") }} <Icon name="ChevDown" :size="12" /></template>
    <slot />
  </UiMenu>
</template>
