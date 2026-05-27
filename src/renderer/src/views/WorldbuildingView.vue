<script setup>
import { computed } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useRouter } from "vue-router";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import RichEditor from "../components/RichEditor.vue";
import { promptDialog, confirmDialog } from "../services/dialog.js";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const router = useRouter();
const article = computed(() => props.id ? project.worldbuildingById(props.id) : null);
const cat = computed(() => article.value ? project.worldbuildingCategories.find((c) => c.id === article.value.category) : null);

function update(k, v) { project.updateWorldbuilding(article.value.id, { [k]: v }); }
async function addArticle() {
  const values = await promptDialog({
    title: "New article",
    confirmLabel: "Create article",
    fields: [
      { key: "title", label: "Article title", placeholder: "e.g. The North Coast" },
      {
        key: "category",
        label: "Category",
        type: "select",
        defaultValue: "geography",
        options: project.worldbuildingCategories.map((c) => ({ value: c.id, label: c.label })),
      },
    ],
  });
  if (!values || !values.title) return;
  const id = project.addWorldbuilding({ title: values.title, category: values.category || "geography" });
  router.push(`/worldbuilding/${id}`);
}
async function deleteArticle() {
  if (!article.value) return;
  const yes = await confirmDialog({
    title: `Delete "${article.value.title}"?`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!yes) return;
  project.removeWorldbuilding(article.value.id);
  router.push("/worldbuilding");
}
</script>

<template>
  <template v-if="!article">
    <PaneHeader eyebrow="Story world" title="Worldbuilding">
      <button class="btn primary" @click="addArticle"><Icon name="Plus" :size="14" /> New article</button>
    </PaneHeader>
    <div class="scrollarea" style="flex:1;padding:22px 26px 40px">
      <section v-for="catX in project.worldbuildingCategories" :key="catX.id" style="margin-bottom:26px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <span :style="`width:30px;height:30px;border-radius:8px;background:oklch(var(--tile-bg-l) var(--tile-bg-c) ${catX.hue});color:oklch(var(--tile-ink-l) var(--tile-ink-c) ${catX.hue});display:grid;place-items:center`">
            <Icon :name="catX.icon" :size="15" />
          </span>
          <h3 style="font-family:var(--font-serif);font-size:18px;font-weight:600;margin:0">{{ catX.label }}</h3>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:10px">
          <router-link v-for="a in project.worldbuilding.filter(x => x.category === catX.id)" :key="a.id"
            :to="`/worldbuilding/${a.id}`"
            class="card tight" style="text-decoration:none;color:inherit;padding:14px;display:flex;flex-direction:column;gap:6px">
            <div style="font-family:var(--font-serif);font-size:15px;font-weight:600">{{ a.title }}</div>
            <div class="t-muted" style="font-size:12px;line-height:1.5">{{ a.summary }}</div>
          </router-link>
        </div>
      </section>
    </div>
  </template>

  <template v-else>
    <PaneHeader :eyebrow="cat?.label || 'Worldbuilding'" :title="article.title">
      <router-link to="/worldbuilding" custom v-slot="{ navigate }">
        <button class="btn ghost sm" @click="navigate"><Icon name="ChevRight" :size="12" style="transform:rotate(180deg)" /> Back</button>
      </router-link>
      <button class="btn ghost" @click="deleteArticle">Delete</button>
      <button class="btn primary" @click="addArticle"><Icon name="Plus" :size="14" /> New article</button>
    </PaneHeader>

    <div class="pane-body">
      <!-- Title + summary strip above the manuscript editor. -->
      <div style="padding:14px 22px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:6px">
        <input class="input" style="font-family:var(--font-serif);font-weight:600;font-size:18px;border:0;background:transparent;padding:0"
          placeholder="Article title"
          :value="article.title" @input="update('title', $event.target.value)" />
        <input class="input"
          style="font-style:italic;color:var(--muted);font-size:13.5px;border:0;background:transparent;padding:0;font-family:var(--font-serif)"
          placeholder="Summary"
          :value="article.summary" @input="update('summary', $event.target.value)" />
      </div>

      <RichEditor
        :model-value="article.body"
        placeholder="Write the article…"
        @change="(html) => update('body', html)"
      />
    </div>
  </template>
</template>
