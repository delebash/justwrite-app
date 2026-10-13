
import { tEnglish } from "../i18n/index.js";// The scene POV (narration mode) options — ONE source (RAG build 2026-07-11):
// SceneLinks' picker shows them translated; the RAG card/links lines read them in English.
// Values are the stored slugs on `scene.pov`.
export const POV_OPTIONS = [
  { value: "first",            labelKey: "sceneLinks.pov.first" },
  { value: "secondary-first",  labelKey: "sceneLinks.pov.secondaryFirst" },
  { value: "limited-third",    labelKey: "sceneLinks.pov.limitedThird" },
  { value: "omniscient-third", labelKey: "sceneLinks.pov.omniscientThird" },
  { value: "objective-third",  labelKey: "sceneLinks.pov.objectiveThird" },
  { value: "second",           labelKey: "sceneLinks.pov.second" },
];

/** A stored pov slug in English, for the text the AI model reads (the RAG cards, the story
 *  context); "" when unset/unknown. The picker translates `labelKey` itself. */
export function povLabel(value) {
  const key = POV_OPTIONS.find((o) => o.value === value)?.labelKey;
  return key ? tEnglish(key) : "";
}
