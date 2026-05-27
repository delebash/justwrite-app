import { createRouter, createWebHashHistory } from "vue-router";

const routes = [
  { path: "/",                   name: "Home",          component: () => import("../views/HomeView.vue") },
  { path: "/architecture/:id?",  name: "Architecture",  component: () => import("../views/ArchitectureView.vue"), props: true },
  { path: "/chapters/:id?",      name: "Chapters",      component: () => import("../views/ChaptersView.vue"), props: true },
  { path: "/search",             name: "Search",        component: () => import("../views/SearchView.vue") },
  { path: "/characters/:id?",    name: "Characters",    component: () => import("../views/CharactersView.vue"), props: true },
  { path: "/locations/:id?",     name: "Locations",     component: () => import("../views/LocationsView.vue"), props: true },
  { path: "/objects/:id?",       name: "Objects",       component: () => import("../views/ObjectsView.vue"), props: true },
  { path: "/groups/:id?",        name: "Groups",        component: () => import("../views/GroupsView.vue"), props: true },
  { path: "/worldbuilding/:id?", name: "Worldbuilding", component: () => import("../views/WorldbuildingView.vue"), props: true },
  { path: "/plotlines/:id?",     name: "Plotlines",     component: () => import("../views/PlotlinesView.vue"), props: true },
  { path: "/strands",            redirect: "/plotlines" },
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
