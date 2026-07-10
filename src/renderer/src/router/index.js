import { createRouter, createWebHashHistory } from "vue-router";

// Generic event-page route factory. Every entity with an Events button
// (characters / locations / objects / groups / architecture/setting)
// uses the same three pages: timeline, new, edit.
const eventsTimeline = () => import("../views/EventsTimelineView.vue");
const eventNew       = () => import("../views/EventNewView.vue");
const eventEdit      = () => import("../views/EventEditView.vue");

function entityEventRoutes(prefix, kind, opts = {}) {
  const idParam = opts.idParam || "id";
  const fixedId = opts.fixedId; // when set, the entityId is constant (Setting case).
  const idOf = (route) => fixedId ?? route.params[idParam];
  const namePrefix = opts.namePrefix || prefix.replace(/^\/+|\/+$/g, "").replace(/\W+/g, "-");
  // All event pages edit the events slice — one undo domain (#235).
  const meta = { undoDomains: ["events"] };
  return [
    {
      path: `${prefix}/events/new`,
      name: `${namePrefix}-events-new`,
      component: eventNew,
      props: (route) => ({ kind, entityId: idOf(route) }),
      meta,
    },
    {
      path: `${prefix}/events/:eventId/edit`,
      name: `${namePrefix}-events-edit`,
      component: eventEdit,
      props: (route) => ({ kind, entityId: idOf(route), eventId: route.params.eventId }),
      meta,
    },
    {
      path: `${prefix}/events`,
      name: `${namePrefix}-events`,
      component: eventsTimeline,
      props: (route) => ({ kind, entityId: idOf(route) }),
      meta,
    },
  ];
}

// meta.undoDomains (#235, the page-related-undo law): the data domains a
// page's ⌘Z / TitleBar Undo may pop — see stores/project.js DOMAIN_SLICES
// and docs/plans/2026-07-10-page-related-undo.md. A route WITHOUT the key is
// undo-inert (Search, Import, Export, Trash, Analysis, Brainstorm, Relations,
// Reader knowledge, Help): changes made from global surfaces there land in
// their data's domain and are undone from that data's page. /ai also carries
// none — the kit's Routing-by-task tab owns its own page-local stack (#233).
const routes = [
  { path: "/",                   name: "Home",          component: () => import("../views/HomeView.vue"), meta: { undoDomains: ["meta"] } },
  { path: "/home-v2",            name: "HomeShelf",     component: () => import("../views/HomeShelfView.vue"), meta: { undoDomains: ["meta"] } },

  // Architecture / Setting events — singleton entity id "setting".
  ...entityEventRoutes("/architecture/setting", "setting", { fixedId: "setting", namePrefix: "setting" }),

  { path: "/architecture/:id?",  name: "Architecture",  component: () => import("../views/ArchitectureView.vue"), props: true, meta: { undoDomains: ["architecture"] } },
  { path: "/chapters/:id?/:sceneId?", name: "Chapters",      component: () => import("../views/ChaptersView.vue"), props: true, meta: { undoDomains: ["manuscript"] } },
  { path: "/search",             name: "Search",        component: () => import("../views/SearchView.vue") },

  // Per-entity event routes are declared BEFORE the dynamic :id? routes
  // so /characters/c1/events doesn't get swallowed by /characters/:id?.
  ...entityEventRoutes("/characters/:id", "character"),
  { path: "/characters/:id?",    name: "Characters",    component: () => import("../views/CharactersView.vue"), props: true, meta: { undoDomains: ["characters"] } },

  ...entityEventRoutes("/locations/:id",  "location"),
  { path: "/locations/:id?",     name: "Locations",     component: () => import("../views/LocationsView.vue"), props: true, meta: { undoDomains: ["locations"] } },

  ...entityEventRoutes("/objects/:id",    "object"),
  { path: "/objects/:id?",       name: "Objects",       component: () => import("../views/ObjectsView.vue"), props: true, meta: { undoDomains: ["objects"] } },

  ...entityEventRoutes("/groups/:id",     "group"),
  { path: "/groups/:id?",        name: "Groups",        component: () => import("../views/GroupsView.vue"), props: true, meta: { undoDomains: ["groups"] } },

  { path: "/worldbuilding/:id?", name: "Worldbuilding", component: () => import("../views/WorldbuildingView.vue"), props: true, meta: { undoDomains: ["worldbuilding"] } },
  { path: "/strands/:id?",       name: "Strands",       component: () => import("../views/StrandsView.vue"), props: true, meta: { undoDomains: ["strands"] } },
  { path: "/plotlines/:id?",     redirect: "/strands" },
  { path: "/plot",               name: "PlotBoard",     component: () => import("../views/PlotBoardView.vue"), meta: { undoDomains: ["strands"] } },
  { path: "/timeline",           name: "Timeline",      component: () => import("../views/TimelineView.vue"), meta: { undoDomains: ["events"] } },
  { path: "/notes/:id?",         name: "Notes",         component: () => import("../views/NotesView.vue"), props: true, meta: { undoDomains: ["notes"] } },
  { path: "/brainstorm",         name: "Brainstorm",    component: () => import("../views/BrainstormView.vue") },
  // Markers edit scene data (updateScene), so they share the manuscript stack.
  { path: "/markers",            name: "Markers",       component: () => import("../views/MarkersView.vue"), meta: { undoDomains: ["manuscript"] } },
  { path: "/relations",          name: "Relations",     component: () => import("../views/RelationsView.vue") },
  { path: "/analysis",          name: "Analysis",      component: () => import("../views/AnalysisView.vue") },
  { path: "/reader-knowledge",  name: "ReaderKnowledge", component: () => import("../views/ReaderKnowledgeView.vue") },
  { path: "/import",            name: "Import",        component: () => import("../views/ImportView.vue") },
  { path: "/export",            name: "Export",        component: () => import("../views/ExportView.vue") },
  { path: "/trash",             name: "Trash",         component: () => import("../views/TrashView.vue") },
  { path: "/settings/:section?", name: "Settings",      component: () => import("../views/SettingsView.vue"), props: true, meta: { undoDomains: ["meta", "statuses", "tagVocab"] } },
  { path: "/help/:slug?",       name: "Help",          component: () => import("../views/HelpView.vue"), props: true },

  // The SHARED @delebash/llm-ui "AI / Models" area (Providers & models · Features
  // · Usage) — same view JustVoice mounts; appName passed as a static prop. The
  // Features tab now absorbs per-feature prompt editing + a test panel, so the
  // standalone Writer Lab + Feature prompts views were removed (2026-06-24).
  // No undoDomains: the kit Routing-by-task tab owns its own ⌘Z (#233).
  { path: "/ai",                  name: "Ai",             component: () => import("../views/AiView.vue") },
];

export default createRouter({
  history: createWebHashHistory(),
  routes,
});
