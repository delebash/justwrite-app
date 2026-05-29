// ============================================================
// editorMentions.js — builds the @-mention extension that links a
// chapter's prose to the story bible. The suggestion list is sourced
// live from the project store; selected items become styled chips
// carrying { id, label, kind } so RichEditor can route on click and
// other views can scan for back-references.
//
// Chips serialize to:
//   <span data-type="mention" data-id data-label data-kind class="mention mention--<kind>">@Label</span>
// which round-trips through the saved-HTML body.
// ============================================================

import Mention from "@tiptap/extension-mention";
import { VueRenderer } from "@tiptap/vue-3";
import MentionList from "@renderer/components/MentionList.vue";
import { useProjectStore } from "@renderer/stores/project";

// Pull every bible entity, tagged with its kind. Lazy store access so
// this works whether called at module load or later.
function getItems(query) {
  const p = useProjectStore();
  const map = (arr, kind) =>
    (arr || []).map((e) => ({ id: e.id, label: e.name || e.title || "Untitled", kind }));
  const all = [
    ...map(p.characters, "character"),
    ...map(p.locations, "location"),
    ...map(p.objects, "object"),
    ...map(p.groups, "group"),
  ];
  const q = (query || "").trim().toLowerCase();
  const matched = q ? all.filter((i) => i.label.toLowerCase().includes(q)) : all;
  return matched.slice(0, 12);
}

export function buildMentionExtension() {
  return Mention.extend({
    addAttributes() {
      return {
        id: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-id"),
          renderHTML: (attrs) => (attrs.id == null ? {} : { "data-id": attrs.id }),
        },
        label: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-label"),
          renderHTML: (attrs) => (attrs.label == null ? {} : { "data-label": attrs.label }),
        },
        kind: {
          default: "character",
          parseHTML: (el) => el.getAttribute("data-kind") || "character",
          renderHTML: (attrs) => ({ "data-kind": attrs.kind || "character" }),
        },
      };
    },
  }).configure({
    deleteTriggerWithBackspace: true,
    // Per-kind class for chip colouring; the data-kind attr drives the
    // actual colour in CSS, this just guarantees a base `.mention` hook.
    HTMLAttributes: { class: "mention" },
    renderText({ node }) {
      return `@${node.attrs.label ?? node.attrs.id}`;
    },
    suggestion: {
      char: "@",
      items: ({ query }) => getItems(query),
      command: ({ editor, range, props }) => {
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            { type: "mention", attrs: { id: props.id, label: props.label, kind: props.kind } },
            { type: "text", text: " " },
          ])
          .run();
      },
      render: () => {
        let component;
        let el;

        const place = (rect) => {
          if (!rect || !el) return;
          // clientRect is viewport-relative; the popup is position:fixed.
          const maxLeft = window.innerWidth - 240;
          el.style.left = `${Math.min(rect.left, maxLeft)}px`;
          el.style.top = `${rect.bottom + 6}px`;
        };

        return {
          onStart: (props) => {
            component = new VueRenderer(MentionList, { props, editor: props.editor });
            el = document.createElement("div");
            el.className = "mention-popup";
            el.appendChild(component.element);
            document.body.appendChild(el);
            place(props.clientRect?.());
          },
          onUpdate: (props) => {
            component.updateProps(props);
            place(props.clientRect?.());
          },
          onKeyDown: (props) => {
            if (props.event.key === "Escape") {
              // Dismiss the popup for this mention attempt. Removing the
              // element (and nulling it so onUpdate's place() bails) hides
              // it until the query ends; onExit still destroys `component`.
              el?.remove();
              el = null;
              return true;
            }
            return component.ref?.onKeyDown?.(props) ?? false;
          },
          onExit: () => {
            el?.remove();
            component?.destroy();
            el = null;
            component = null;
          },
        };
      },
    },
  });
}