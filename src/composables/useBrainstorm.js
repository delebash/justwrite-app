// One brainstorm list (2026-10-11, the AI drafting plan Task 10): its rounds, its likes and its
// error — for the Brainstorm page and for Name ideas at a name box, which ask alike
// (services/brainstorm.js) and show the same list (components/BrainstormResults.vue).
//
// `request({ liked, seen })` → `{ action, variables, exclude? }` (may be async): the caller's
// prompt for a round — `liked` is set only on a "More like these" round, `seen` is every idea
// already shown; `exclude` lists names never to show (a cast's). `meta` names this list's runs in
// the AI tasks store, which the running state is read from (AGENTS.md §2: a list that remounts
// mid-run still shows it running); `label` is the run's name in the AI tasks panel.
import { computed, ref, toValue } from "vue";
import { runAiFeature, useAiTasksStore } from "@delebash/llm-ui";
import { freshIdeas, parseBrainstormLines } from "../services/brainstorm.js";

const isAbort = (e) => e?.name === "AbortError" || /abort/i.test(e?.message || "");

export function useBrainstorm({ request, meta, label }) {
  const aiTasks = useAiTasksStore();
  const results = ref([]); // [{ text, liked }]
  const error = ref("");
  let seen = [];

  const myTask = computed(() => {
    const want = toValue(meta);
    return aiTasks.runningTasks.find((task) => task.feature === "brainstorm"
      && Object.entries(want).every(([k, v]) => task.meta?.[k] === v));
  });
  const running = computed(() => !!myTask.value);
  const liked = computed(() => results.value.filter((r) => r.liked).map((r) => r.text));

  // Set while the round's prompt is composed, before its task exists (a double click would
  // start two rounds); the running state itself is the store's.
  let composing = false;
  async function run(more) {
    if (running.value || composing) return;
    error.value = "";
    composing = true;
    try {
      const { action, variables, exclude = [] } = await request({ liked: more ? liked.value : [], seen: [...seen] });
      composing = false;
      const { content } = await runAiFeature({
        action, feature: "brainstorm", variables,
        task: { label: toValue(label), meta: toValue(meta) },
      });
      const ideas = freshIdeas(parseBrainstormLines(content), { seen, exclude });
      seen = [...seen, ...ideas];
      const items = ideas.map((text) => ({ text, liked: false }));
      results.value = more ? [...results.value, ...items] : items;
    } catch (e) {
      if (!isAbort(e)) error.value = e?.message || String(e);
    } finally {
      composing = false;
    }
  }

  /** A fresh list: forgets what was shown and liked. */
  function generate() {
    seen = [];
    results.value = [];
    return run(false);
  }
  /** Another round, steered by the liked ideas; the new ones join the list. */
  function moreLikeThese() {
    return run(true);
  }
  function toggleLike(item) {
    item.liked = !item.liked;
  }
  function clear() {
    results.value = [];
    seen = [];
    error.value = "";
  }

  return { results, error, myTask, running, liked, generate, moreLikeThese, toggleLike, clear };
}
