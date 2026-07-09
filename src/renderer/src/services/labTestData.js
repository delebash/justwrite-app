// The Lab test-data sources (§7.3, 2026-07-08): JW registers its book material —
// chapters, characters, locations — with the kit's testData registry so the AI
// Lab's Test input offers "Insert from…" pickers. Adapters read the LIVE project
// store lazily (list()/fetch() run when the Lab uses them, well after boot).
// Variables use the prompts' dominant names ({user_content}); the kit's
// single-variable bridge covers prompts with one differently-named var.
import { useProjectStore } from "../stores/project";

// TipTap scene bodies are HTML — the Lab wants prose text.
function htmlToText(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return (div.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

function chapterText(project, chapterId) {
  const scenes = project.scenes?.[chapterId] || [];
  return scenes.map((s) => htmlToText(s.body)).filter(Boolean).join("\n\n");
}

export const LAB_TEST_SOURCES = [
  {
    id: "chapters",
    label: "chapter",
    kind: "chapter",
    // QC-9: the names fetch() emits. The Lab renders this picker only on
    // features with at least one of these boxes (or via the 1×1 bridge) —
    // keep in lockstep with fetch()'s variables. `excerpts` (QC-24): the two
    // chat features ({question, excerpts}) had NO insertable source at all —
    // a chapter's prose is the natural test stand-in for retrieved excerpts.
    provides: ["passage", "user_content", "chapter_text", "chapter_label", "excerpts"],
    list() {
      // Chapters live inside parts — `allChapters` (project.js getter) is the
      // one flat view; there is no root `chapters` state.
      const p = useProjectStore();
      return (p.allChapters || []).map((c, i) => ({ id: c.id, label: c.title || `Chapter ${i + 1}` }));
    },
    fetch(id) {
      const p = useProjectStore();
      const c = (p.allChapters || []).find((x) => x.id === id);
      const text = chapterText(p, id);
      // Emit EVERY name the features expose (checker-caught 2026-07-08: the
      // writing features use {{passage}}, not {{user_content}} — same fix as
      // the seeded samples): the merge fills only what the open prompt has.
      return { variables: { passage: text, user_content: text, chapter_text: text, chapter_label: c?.title || "", excerpts: text } };
    },
  },
  {
    id: "characters",
    label: "character",
    kind: "character",
    // QC-9: a profile is user_content-shaped — it can't fill a prose passage,
    // so the picker stays OFF prose features (the user's "does it make sense
    // to drop character info for generate prose?" — no). characterName /
    // characterProfile (QC-24): In-character chat exposes exactly those two
    // boxes and had NO insertable source — a real character fills them.
    provides: ["user_content", "characterName", "characterProfile"],
    list() {
      const p = useProjectStore();
      return (p.characters || []).map((c) => ({ id: c.id, label: c.name || "Unnamed" }));
    },
    fetch(id) {
      const p = useProjectStore();
      const c = (p.characters || []).find((x) => x.id === id) || {};
      const profile = [c.role, c.description, c.notes].filter(Boolean).join("\n");
      return { variables: {
        user_content: `${c.name || ""}\n${profile}`.trim(),
        characterName: c.name || "",
        characterProfile: profile,
      } };
    },
  },
  {
    id: "locations",
    label: "location",
    kind: "location",
    provides: ["user_content"],
    list() {
      const p = useProjectStore();
      return (p.locations || []).map((l) => ({ id: l.id, label: l.name || "Unnamed" }));
    },
    fetch(id) {
      const p = useProjectStore();
      const l = (p.locations || []).find((x) => x.id === id) || {};
      return { variables: { user_content: `${l.name || ""}\n${l.description || ""}`.trim() } };
    },
  },
];
