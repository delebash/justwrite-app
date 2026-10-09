// SPDX-License-Identifier: MIT
// The app's routes (Quasar's layout, app-structure §Q.1: router/routes.js holds them,
// router/index.js creates the router).

// Generic event-page route factory. Every entity with an Events button
// (characters / locations / objects / groups / architecture/setting)
// uses the same three pages: timeline, new, edit.
const eventsTimeline = () => import("../pages/EventsTimelinePage.vue");
const eventNew       = () => import("../pages/EventNewPage.vue");
const eventEdit      = () => import("../pages/EventEditPage.vue");

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
const pageRoutes = [
  { path: "",                     name: "Home",          component: () => import("../pages/HomePage.vue"), meta: { undoDomains: ["meta"] } },
  { path: "home-v2",            name: "HomeShelf",     component: () => import("../pages/HomeShelfPage.vue"), meta: { undoDomains: ["meta"] } },

  // Architecture / Setting events — singleton entity id "setting".
  ...entityEventRoutes("architecture/setting", "setting", { fixedId: "setting", namePrefix: "setting" }),

  { path: "architecture/:id?",  name: "Architecture",  component: () => import("../pages/ArchitecturePage.vue"), props: true, meta: { undoDomains: ["architecture"] } },
  { path: "chapters/:id?/:sceneId?", name: "Chapters",      component: () => import("../pages/ChaptersPage.vue"), props: true, meta: { undoDomains: ["manuscript"] } },
  { path: "search",             name: "Search",        component: () => import("../pages/SearchPage.vue") },

  // Per-entity event routes are declared BEFORE the dynamic :id? routes
  // so /characters/c1/events doesn't get swallowed by /characters/:id?.
  ...entityEventRoutes("characters/:id", "character"),
  { path: "characters/:id?",    name: "Characters",    component: () => import("../pages/CharactersPage.vue"), props: true, meta: { undoDomains: ["characters"] } },

  ...entityEventRoutes("locations/:id",  "location"),
  { path: "locations/:id?",     name: "Locations",     component: () => import("../pages/LocationsPage.vue"), props: true, meta: { undoDomains: ["locations"] } },

  ...entityEventRoutes("objects/:id",    "object"),
  { path: "objects/:id?",       name: "Objects",       component: () => import("../pages/ObjectsPage.vue"), props: true, meta: { undoDomains: ["objects"] } },

  ...entityEventRoutes("groups/:id",     "group"),
  { path: "groups/:id?",        name: "Groups",        component: () => import("../pages/GroupsPage.vue"), props: true, meta: { undoDomains: ["groups"] } },

  { path: "worldbuilding/:id?", name: "Worldbuilding", component: () => import("../pages/WorldbuildingPage.vue"), props: true, meta: { undoDomains: ["worldbuilding"] } },
  { path: "strands/:id?",       name: "Strands",       component: () => import("../pages/StrandsPage.vue"), props: true, meta: { undoDomains: ["strands"] } },
  { path: "plotlines/:id?",     redirect: "/strands" },
  { path: "plot",               name: "PlotBoard",     component: () => import("../pages/PlotBoardPage.vue"), meta: { undoDomains: ["strands"] } },
  { path: "timeline",           name: "Timeline",      component: () => import("../pages/TimelinePage.vue"), meta: { undoDomains: ["events"] } },
  { path: "notes/:id?",         name: "Notes",         component: () => import("../pages/NotesPage.vue"), props: true, meta: { undoDomains: ["notes"] } },
  { path: "brainstorm",         name: "Brainstorm",    component: () => import("../pages/BrainstormPage.vue") },
  // Markers edit scene data (updateScene), so they share the manuscript stack.
  { path: "markers",            name: "Markers",       component: () => import("../pages/MarkersPage.vue"), meta: { undoDomains: ["manuscript"] } },
  { path: "relations",          name: "Relations",     component: () => import("../pages/RelationsPage.vue") },
  { path: "analysis",          name: "Analysis",      component: () => import("../pages/AnalysisPage.vue") },
  { path: "reader-knowledge",  name: "ReaderKnowledge", component: () => import("../pages/ReaderKnowledgePage.vue") },
  { path: "import",            name: "Import",        component: () => import("../pages/ImportPage.vue") },
  { path: "export",            name: "Export",        component: () => import("../pages/ExportPage.vue") },
  { path: "trash",             name: "Trash",         component: () => import("../pages/TrashPage.vue") },
  { path: "settings/:section?", name: "Settings",      component: () => import("../pages/SettingsPage.vue"), props: true, meta: { undoDomains: ["meta", "statuses", "tagVocab"] } },
  { path: "help/:slug?",       name: "Help",          component: () => import("../pages/HelpPage.vue"), props: true },

  // QC-46 — the first-run welcome screen (the user's "W-A hero" pick). No
  // undoDomains: it edits no book data, so ⌘Z / the TitleBar Undo stay inert
  // here. The first-run redirect to it lives in boot/jw.js (a run-once guard).
  { path: "welcome",           name: "Welcome",       component: () => import("../pages/WelcomePage.vue") },

  // The SHARED @delebash/llm-ui "AI / Models" area (Providers & models · Features
  // · Usage) — same view JustVoice mounts; appName passed as a static prop. The
  // Features tab now absorbs per-feature prompt editing + a test panel, so the
  // standalone Writer Lab + Feature prompts views were removed (2026-06-24).
  // No undoDomains: the kit Routing-by-task tab owns its own ⌘Z (#233).
  { path: "ai",                  name: "Ai",             component: () => import("../pages/AiPage.vue") },
  // Sync with no book open: a fresh install or a new phone brings its books from another device
  // (project-less, like /ai and /help — boot/jw.js).
  { path: "sync",                name: "Sync",           component: () => import("../pages/SyncPage.vue") },
];

// The CLI's shape: every page inside the app's layout (layouts/MainLayout.vue — the title bar, the
// sidebar as Quasar's drawer, the page container), so their paths are relative to it; the
// connection-error page outside it (boot/jw.js sends every route there while the server is down).
const routes = [
  { path: "/", component: () => import("../layouts/MainLayout.vue"), children: pageRoutes },
  { path: "/offline", name: "Offline", component: () => import("../pages/ConnectionErrorPage.vue") },
];

export default routes;
