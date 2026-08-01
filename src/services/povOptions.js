// The scene POV (narration mode) options — ONE source (RAG build 2026-07-11):
// SceneLinks' picker and the RAG card/links lines both render these labels.
// Values are the stored slugs on `scene.pov`.
export const POV_OPTIONS = [
  { value: "first",            label: "First person" },
  { value: "secondary-first",  label: "Secondary first person" },
  { value: "limited-third",    label: "Limited third person" },
  { value: "omniscient-third", label: "Omniscient third person" },
  { value: "objective-third",  label: "Objective third person" },
  { value: "second",           label: "Second person" },
];

/** The human label for a stored pov slug; "" when unset/unknown. */
export function povLabel(value) {
  return POV_OPTIONS.find((o) => o.value === value)?.label || "";
}
