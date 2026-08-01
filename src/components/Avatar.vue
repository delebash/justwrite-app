<script setup>
import { computed, ref, watchEffect } from "vue";
import { urlFor } from "../services/imageStore.js";

const props = defineProps({
  name:  { type: String, required: true },
  size:  { type: [Number, String], default: 40 },
  image: { type: Object, default: null }, // optional image record from imageStore
});

const initials = computed(() => props.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join(""));

// Hash the name into a hue so the gradient fallback is stable per-character.
const hue = computed(() => {
  let h = 0;
  for (const ch of props.name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
});

// Resolve the image record to a usable URL. Disk-backed images hop through
// IPC asynchronously; data URLs resolve immediately.
const imgSrc = ref(null);
watchEffect(async () => {
  if (!props.image) { imgSrc.value = null; return; }
  try {
    imgSrc.value = await urlFor(props.image);
  } catch (err) {
    console.error("Avatar urlFor failed:", err);
    imgSrc.value = null;
  }
});

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius: Number(props.size) > 60 ? "14px" : "8px",
  background: imgSrc.value
    ? "var(--surface-3)"
    : `linear-gradient(135deg, oklch(0.85 0.06 ${hue.value}), oklch(0.72 0.07 ${(hue.value + 60) % 360}))`,
  color: "white",
  display: "grid",
  placeItems: "center",
  fontFamily: "var(--font-serif)",
  fontWeight: 600,
  fontSize: `${Number(props.size) * 0.36}px`,
  boxShadow: "inset 0 -1px 0 rgba(0,0,0,.1)",
  flexShrink: 0,
  overflow: "hidden",
}));
</script>

<template>
  <div :style="style">
    <img v-if="imgSrc" :src="imgSrc" :alt="name" class="avatar-img" />
    <template v-else>{{ initials }}</template>
  </div>
</template>

<style scoped>
.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
