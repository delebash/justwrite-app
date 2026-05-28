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
  return [
    {
      path: `${prefix}/events/new`,
      name: `${namePrefix}-events-new`,
      component: eventNew,
      props: (route) => ({ kind, entityId: idOf(route) }),
    },
    {
      path: `${prefix}/events/:eventId/edit`,
      name: `${namePrefix}-events-edit`,
      component: eventEdit,
      props: (route) => ({ kind, entityId: idOf(route), eventId: route.params.eventId }),
    },
    {
      path: `${prefix}/events`,
      name: `${namePrefix}-events`,
      component: eventsTimeline,
      props: (route) => ({ kind, entityId: idOf(route) }),
    },
  ];
}

const routes = [
  { path: "/",                   name: "Home",          component: () => import("../views/HomeView.vue") },

  // Architecture / Setting events — singleton entity id "setting".
  ...entityEventRoutes("/architecture/setting", "setting", { fixedId: "setting", namePrefix: "setting" }),

  { path: "/architecture/:id?",  name: "Architecture",  component: () => import("../views/ArchitectureView.vue"), props: true },
  { path: "/chapters/:id?/:sceneId?", name: "Chapters",      component: () => import("../views/ChaptersView.vue"), props: true },
  { path: "/search",             name: "Search",        component: () => import("../views/SearchView.vue") },

  // Per-entity event routes are declared BEFORE the dynamic :id? routes
  // so /characters/c1/events doesn't get swallowed by /characters/:id?.
  ...entityEventRoutes("/characters/:id", "character"),
  { path: "/characters/:id?",    name: "Characters",    component: () => import("../views/CharactersView.vue"), props: true },

  ...entityEventRoutes("/locations/:id",  "location"),
  { path: "/locations/:id?",     name: "Locations",     component: () => import("../views/LocationsView.vue"), props: true },

  ...entityEventRoutes("/objects/:id",    "object"),
  { path: "/objects/:id?",       name: "Objects",       component: () => import("../views/ObjectsView.vue"), props: true },

  ...entityEventRoutes("/groups/:id",     "group"),
  { path: "/groups/:id?",        name: "Groups",        component: () => import("../views/GroupsView.vue"), props: true },

  { path: "/worldbuilding/:id?", name: "Worldbuilding", component: () => import("../views/WorldbuildingView.vue"), props: true },
  { path: "/strands/:id?",       name: "Strands",       component: () => import("../views/StrandsView.vue"), props: true },
  { path: "/plotlines/:id?",     redirect: "/strands" },
  { path: "/timeline",           name: "Timeline",      component: () => import("../views/TimelineView.vue") },
  { path: "/notes/:id?",         name: "Notes",         component: () => import("../views/NotesView.vue"), props: true },
  { path: "/relations",          name: "Relations",     component: () => import("../views/RelationsView.vue") },
  { path: "/studio/:tab?",       name: "Studio",        component: () => import("../views/StudioView.vue"), props: true },
  { path: "/analysis",          name: "Analysis",      component: () => import("../views/AnalysisView.vue") },
  { path: "/export",            name: "Export",        component: () => import("../views/ExportView.vue") },
  { path: "/trash",             name: "Trash",         component: () => import("../views/TrashView.vue") },
  { path: "/settings/:section?", name: "Settings",      component: () => import("../views/SettingsView.vue"), props: true },
];

export default createRouter({
  history: createWebHashHistory(),
  routes,
});
