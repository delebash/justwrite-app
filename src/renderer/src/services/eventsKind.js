// Generic events page routing — every entity kind that exposes an
// "Events" button uses the same three-page flow (timeline / new / edit)
// driven by these descriptors. Centralised here so the views and router
// stay in lock-step.

export const EVENTS_KIND_META = {
  character: {
    label: "Character",
    sectionUrl: () => `/characters`,
    detailUrl: (id) => `/characters/${id}`,
    eventsUrl: (id) => `/characters/${id}/events`,
    newUrl:    (id) => `/characters/${id}/events/new`,
    editUrl:   (id, evId) => `/characters/${id}/events/${evId}/edit`,
    getEntity: (project, id) => project.characterById(id),
    entityName: (e) => e?.name || "Character",
  },
  location: {
    label: "Location",
    sectionUrl: () => `/locations`,
    detailUrl: (id) => `/locations/${id}`,
    eventsUrl: (id) => `/locations/${id}/events`,
    newUrl:    (id) => `/locations/${id}/events/new`,
    editUrl:   (id, evId) => `/locations/${id}/events/${evId}/edit`,
    getEntity: (project, id) => project.locationById(id),
    entityName: (e) => e?.name || "Location",
  },
  object: {
    label: "Object",
    sectionUrl: () => `/objects`,
    detailUrl: (id) => `/objects/${id}`,
    eventsUrl: (id) => `/objects/${id}/events`,
    newUrl:    (id) => `/objects/${id}/events/new`,
    editUrl:   (id, evId) => `/objects/${id}/events/${evId}/edit`,
    getEntity: (project, id) => project.objectById(id),
    entityName: (e) => e?.name || "Object",
  },
  group: {
    label: "Group",
    sectionUrl: () => `/groups`,
    detailUrl: (id) => `/groups/${id}`,
    eventsUrl: (id) => `/groups/${id}/events`,
    newUrl:    (id) => `/groups/${id}/events/new`,
    editUrl:   (id, evId) => `/groups/${id}/events/${evId}/edit`,
    getEntity: (project, id) => project.groupById(id),
    entityName: (e) => e?.name || "Group",
  },
  setting: {
    // Architecture/Setting is a singleton — the id is always "setting".
    label: "Setting",
    sectionUrl: () => `/architecture`,
    detailUrl: () => `/architecture/setting`,
    eventsUrl: () => `/architecture/setting/events`,
    newUrl:    () => `/architecture/setting/events/new`,
    editUrl:   (_id, evId) => `/architecture/setting/events/${evId}/edit`,
    getEntity: (project) => project.architecture?.setting,
    entityName: (e) => e?.title || "Setting",
  },
};
