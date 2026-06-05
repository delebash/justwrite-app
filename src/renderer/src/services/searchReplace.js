// ============================================================
// searchReplace.js — a self-contained TipTap/ProseMirror extension
// that highlights all matches of a search term and exposes commands
// to step through them and replace one / all. No external deps.
//
// Plugin state holds { term, caseSensitive, results, current, deco }.
// The RichEditor reads it back via `searchReplacePluginKey.getState`
// (on every transaction) to drive the find-bar match counter.
// ============================================================

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const searchReplacePluginKey = new PluginKey("searchReplace");

// Find every occurrence of `term` within a single text node. Matches
// don't span marks/nodes — fine for a writer's find-in-chapter.
function findMatches(doc, term, caseSensitive) {
  const results = [];
  if (!term) return results;
  const needle = caseSensitive ? term : term.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const hay = caseSensitive ? node.text : node.text.toLowerCase();
    let i = 0;
    // biome-ignore lint/suspicious/noAssignInExpressions: indexOf-walk — advances `i` past each occurrence.
    while ((i = hay.indexOf(needle, i)) !== -1) {
      results.push({ from: pos + i, to: pos + i + term.length });
      i += Math.max(needle.length, 1);
    }
  });
  return results;
}

function buildDeco(doc, results, current) {
  if (!results.length) return DecorationSet.empty;
  const decos = results.map((r, idx) =>
    Decoration.inline(r.from, r.to, {
      class: idx === current ? "search-match search-match--current" : "search-match",
    })
  );
  return DecorationSet.create(doc, decos);
}

export const SearchReplace = Extension.create({
  name: "searchReplace",

  addOptions() {
    return { caseSensitive: false };
  },

  addCommands() {
    return {
      setSearchTerm:
        (term) =>
        ({ dispatch, tr }) => {
          if (dispatch) dispatch(tr.setMeta(searchReplacePluginKey, { term, current: 0 }));
          return true;
        },
      setSearchCaseSensitive:
        (caseSensitive) =>
        ({ dispatch, tr }) => {
          if (dispatch) dispatch(tr.setMeta(searchReplacePluginKey, { caseSensitive }));
          return true;
        },
      // dir: +1 next, -1 previous. Moves the selection to the match so
      // it scrolls into view.
      searchGoTo:
        (dir) =>
        ({ state, dispatch, tr }) => {
          const ps = searchReplacePluginKey.getState(state);
          if (!ps || !ps.results.length) return false;
          let next = ps.current + dir;
          if (next < 0) next = ps.results.length - 1;
          if (next >= ps.results.length) next = 0;
          const m = ps.results[next];
          tr.setMeta(searchReplacePluginKey, { current: next });
          tr.setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView();
          if (dispatch) dispatch(tr);
          return true;
        },
      replaceCurrent:
        (replaceWith) =>
        ({ state, dispatch, tr }) => {
          const ps = searchReplacePluginKey.getState(state);
          if (!ps || !ps.results.length) return false;
          const m = ps.results[ps.current];
          tr.insertText(replaceWith ?? "", m.from, m.to);
          if (dispatch) dispatch(tr);
          return true;
        },
      replaceAll:
        (replaceWith) =>
        ({ state, dispatch, tr }) => {
          const ps = searchReplacePluginKey.getState(state);
          if (!ps || !ps.results.length) return false;
          // Replace back-to-front so earlier positions stay valid.
          [...ps.results]
            .sort((a, b) => b.from - a.from)
            .forEach((m) => { tr.insertText(replaceWith ?? "", m.from, m.to); });
          if (dispatch) dispatch(tr);
          return true;
        },
      clearSearch:
        () =>
        ({ dispatch, tr }) => {
          if (dispatch) dispatch(tr.setMeta(searchReplacePluginKey, { term: "", current: 0 }));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const ext = this;
    return [
      new Plugin({
        key: searchReplacePluginKey,
        state: {
          init() {
            return {
              term: "",
              caseSensitive: ext.options.caseSensitive,
              results: [],
              current: 0,
              deco: DecorationSet.empty,
            };
          },
          apply(tr, value, _old, newState) {
            const meta = tr.getMeta(searchReplacePluginKey);
            let { term, caseSensitive, current } = value;
            if (meta) {
              if ("term" in meta) term = meta.term;
              if ("caseSensitive" in meta) caseSensitive = meta.caseSensitive;
              if ("current" in meta) current = meta.current;
            }
            if (!meta && !tr.docChanged) return value;

            const results = findMatches(newState.doc, term, caseSensitive);
            if (results.length === 0) current = 0;
            else if (current >= results.length) current = results.length - 1;
            else if (current < 0) current = 0;
            return { term, caseSensitive, results, current, deco: buildDeco(newState.doc, results, current) };
          },
        },
        props: {
          decorations(state) {
            return searchReplacePluginKey.getState(state)?.deco ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});