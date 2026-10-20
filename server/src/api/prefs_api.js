// SPDX-License-Identifier: MIT
// /v1/prefs — the family door to the renderer's preferences document (the port of
// justwrite_server/api/prefs_api.py).
//
// JustWrite's `/v1/settings` (settings_api.js) has always BEEN the renderer's preferences
// document — one row per section — while also carrying rows the SERVER reads (auth, cors,
// the D3b folder-path config). Target-tree P9 gives the family one renderer-prefs wire: this
// router maps that same document onto the kit's `/v1/prefs` contract — same rows, same
// wholesale-per-section semantics, kit-owned router. The deeper split (operator rows to a
// typed /v1/settings, renderer sections here only) is recorded future work.
//
// DELETE here = the D3b-aware clear settings_api's DELETE performs: a user-changed folder
// path never resets, nor do the access tokens — the KEPT_KEYS survive.

import { makePrefsRouter } from "@delebash/core/platform";
import { getDb } from "../database/session.js";
import { clearKeepingKeptKeys, readAll, writeMany } from "./settings_api.js";

export const router = makePrefsRouter({
  readAll: () => readAll(getDb()),
  writeMany: (patch) => writeMany(getDb(), patch),
  clear: () => clearKeepingKeptKeys(getDb()),
});
