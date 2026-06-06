<script setup>
import { computed } from "vue";

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
  sw: { type: [Number, String], default: 1.6 },
  fill: { type: Boolean, default: false },
});

const PATHS = {
  Home:       "M3 11.5 12 4l9 7.5M5 10v10h14V10",
  Book:       "M6 4h11a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2V4ZM6 4v14M9 8h7M9 11h5",
  Users:      "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 1a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-7 8c0-3 2.5-5 7-5s7 2 7 5m-1-5c3.5 0 6 1.5 6 4.5",
  Pin:        "M12 2 9 9 3 11l5 4-1.5 7L12 18l5.5 4L16 15l5-4-6-2-3-7Z",
  Cube:       "m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v18m0-9 8-4.5M12 12 4 7.5",
  Strands:    "M4 5c4 0 4 14 8 14s4-14 8-14M4 12c4 0 4 7 8 7M12 5c4 0 4 7 8 7",
  Timeline:   "M4 7h16M4 12h16M4 17h16M8 5v4M14 10v4M11 15v4",
  Note:       "M5 4h11l3 3v13H5V4Zm11 0v3h3M8 11h8M8 14h8M8 17h5",
  Chat:       "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 4v-4H6a2 2 0 0 1-2-2V6Z",
  Network:    "M6 6.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm17 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm-9 11a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm9 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM6 6.5h12M11.5 17.5h6M9 8 4 16M15 8l5 8",
  Chart:      "M4 20V8m6 12V4m6 16v-8m6 8V12",
  Export:     "M12 4v12m0-12-4 4m4-4 4 4M5 20h14",
  Settings:   "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm7-1-1.5-2.5-3 .5-1.5-2.5h-2L9.5 6.5l-3-.5L5 8.5 6.5 11l-1.5 2.5 1.5 2.5 3-.5 1.5 2.5h2l1.5-2.5 3 .5 1.5-2.5L17.5 11 19 8.5Z",
  Search:     "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm6-2 4 4",
  Plus:       "M5 12h14M12 5v14",
  ChevDown:   "m6 9 6 6 6-6",
  ChevRight:  "m9 6 6 6-6 6",
  ChevLeft:   "m15 6-6 6 6 6",
  DragHandle: "M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01",
  Folder:     "M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z",
  Calendar:   "M5 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v13H5V6Zm0 4h14M8 2v4m8-4v4",
  Bold:       "M7 5h6a3.5 3.5 0 0 1 0 7H7V5Zm0 7h7a3.5 3.5 0 0 1 0 7H7v-7Z",
  Italic:     "M10 5h9M5 19h9M14 5l-4 14",
  Quote:      "M6 8h4v4H6c0 3 1 4 3 4M14 8h4v4h-4c0 3 1 4 3 4",
  List:       "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  Eye:        "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  Comment:    "M4 5h16v11H8l-4 4V5Z",
  Mic:        "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3M9 22h6",
  Play:       "M7 5v14l12-7L7 5Z",
  Pause:      "M7 5h4v14H7zM13 5h4v14h-4z",
  Stop:       "M6 6h12v12H6z",
  Waveform:   "M3 12h2M7 9v6M10 5v14M13 8v8M16 11v2M19 9v6M22 12h-1",
  Headphones: "M4 14v4a2 2 0 0 0 2 2h2v-7H5a3 3 0 0 1-1-2v-1a8 8 0 0 1 16 0v1a3 3 0 0 1-1 2h-3v7h2a2 2 0 0 0 2-2v-4",
  Sparkle:    "M12 3v5M12 16v5M3 12h5M16 12h5M5.6 5.6l3.5 3.5M14.9 14.9l3.5 3.5M5.6 18.4l3.5-3.5M14.9 9.1l3.5-3.5",
  Refresh:    "M4 4v6h6M20 20v-6h-6M20 9A8 8 0 0 0 5 6M4 15a8 8 0 0 0 15 3",
  Cloud:      "M7 18a5 5 0 0 1-1-9.8 6 6 0 0 1 11.6 1.6A4.5 4.5 0 0 1 18 19H7Z",
  Cpu:        "M6 6h12v12H6zM9 9h6v6H9ZM2 9h2M2 15h2M20 9h2M20 15h2M9 2v2M15 2v2M9 20v2M15 20v2",
  Check:      "M5 12l4 4 10-10",
  Alert:      "M12 4 2 20h20L12 4ZM12 11v4M12 18v.01",
  Download:   "M12 4v12m0 0 5-5m-5 5-5-5M5 20h14",
  GroupIcon:  "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm9 1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2 19c0-2.5 3-5 7-5s7 2.5 7 5m1-1c.6-1.6 2-3 4-3s3.5 1.4 4 3",
  Building:   "M4 21V5l8-2v18M12 21V8l8 2v11M4 21h16",
  SidebarToggle: "M4 5h16v14H4zM10 5v14M7 9h.01M7 12h.01M7 15h.01",
  Image:      "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Zm0 11 5-5 4 4 3-3 4 4M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  Filter:     "M3 5h18l-7 9v6l-4-2v-4L3 5Z",
  Sort:       "M3 7h13M3 12h9M3 17h5M17 7v12m0 0-3-3m3 3 3-3",
  Star:       "m12 3 2.6 5.6L20 9.5l-4 4 1 6L12 17l-5 2.5 1-6-4-4 5.4-.9L12 3Z",
  Target:     "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-1a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z",
  Replace:    "M4 7h10l-3-3M4 7l3 3M20 17H10l3 3M20 17l-3-3",
  Trash:      "M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13M10 11v6M14 11v6",
  Pencil:     "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z",
  Sun:        "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 2v2M12 20v2M2 12h2M20 12h2M4.5 4.5l1.5 1.5M18 18l1.5 1.5M4.5 19.5l1.5-1.5M18 6l1.5-1.5",
  Moon:       "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  Monitor:    "M3 5h18v12H3zM8 21h8M12 17v4",
  Palette:    "M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.4-.3-.4-.5-.9-.5-1.4 0-1.1.9-2 2-2h2.5c2.5 0 4.5-2 4.5-4.5C22 5.6 17.5 2 12 2zM6.5 12a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4M9.5 7.5a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4M14.5 7.5a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4M17.5 12a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4",
  Underline:  "M7 5v6a5 5 0 0 0 10 0V5M5 20h14",
  Strike:     "M5 12h14M7 8c1-2 3-3 5-3s4 1 4 3M7 16c1 2 3 3 5 3",
  Highlight:  "M15 5l4 4-9 9H6v-4l9-9ZM4 21h7M13 7l4 4",
  Link:       "M10 14a4 4 0 0 0 6 .5l3-3a4 4 0 0 0-6-6l-1.5 1.5M14 10a4 4 0 0 0-6-.5l-3 3a4 4 0 0 0 6 6L12 13",
  AlignLeft:  "M4 6h16M4 10h10M4 14h16M4 18h10",
  AlignCenter:"M4 6h16M7 10h10M4 14h16M7 18h10",
  AlignRight: "M4 6h16M10 10h10M4 14h16M10 18h10",
  SceneBreak: "M4 12h3M10.5 12h3M17 12h3",
  PageBreak:  "M6 4h12v5M6 4v5M6 20h12v-5M6 20v-5M3 12h3M8 12h2M13 12h2M18 12h3",
  ListOrdered:"M10 6h10M10 12h10M10 18h10M5 4v4M3.5 8h2M3.5 12.5c.5-1 2-.7 2 .3 0 .8-2 1.2-2 2.2h2M3.5 17h2l-2 2.5h2",
  CheckSquare:"M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M8 12l3 3 9-9",
  Table:      "M4 5h16v14H4zM4 10h16M4 15h16M9 5v14M15 5v14",
  Focus:      "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM5 8V6a1 1 0 0 1 1-1h2M16 5h2a1 1 0 0 1 1 1v2M19 16v2a1 1 0 0 1-1 1h-2M8 19H6a1 1 0 0 1-1-1v-2",
  Close:      "M6 6l12 12M18 6L6 18",
  ArrowUp:    "M12 19V5M5 12l7-7 7 7",
  ArrowDown:  "M12 5v14M5 12l7 7 7-7",
  Grid:       "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  History:    "M12 8v4l3 2M3.5 9a9 9 0 1 1-.6 4M3.5 9V4M3.5 9H8",
  Copy:       "M8 8h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1ZM4 16a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1",
  Cut:        "M6 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM7.6 6 20 19M7.6 18 20 5",
  Paste:      "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1ZM8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2",
  Print:      "M6 9V4h12v5M6 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1M7 14h10v6H7z",
  Eraser:     "M7.6 20.4 3.6 16.4a1.5 1.5 0 0 1 0-2.1L13 5a1.5 1.5 0 0 1 2.1 0l4.3 4.3a1.5 1.5 0 0 1 0 2.1L12 19M9 12l5 5M9 21h11",
  AlignJustify:"M4 6h16M4 10h16M4 14h16M4 18h16",
  Help:       "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.5-11a2.5 2.5 0 0 1 5 .3c0 1.5-2.5 2-2.5 3.7M12 17v.01",
  ExternalLink:"M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4M14 4h6m0 0v6m0-6L10 14",
};

const d = computed(() => PATHS[props.name] || "");
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24"
       :fill="fill ? 'currentColor' : 'none'"
       stroke="currentColor" :stroke-width="sw"
       stroke-linecap="round" stroke-linejoin="round"
       aria-hidden="true">
    <path :d="d" />
  </svg>
</template>
