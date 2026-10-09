// SPDX-License-Identifier: MIT
// JustWrite's Settings sections, in render order — ONE list the view renders and
// the contract test asserts (parity batch slice 11). The family sections must keep
// the canon RELATIVE order (kit familyContract SETTINGS_SECTION_ORDER); app-own
// sections (Project) may lead or interleave. Labels stay in the view (i18n `t`).
export const SETTINGS_SECTION_IDS = [
  "project",
  "appearance",
  "backups",
  "sync", // app section (not yet the family canon — docgen has no sync)
  "storage",
  "server",
  "logs",
  "updates",
  "about",
];

// The sections the phone leaves out (the kit's phone plan §1): its database is the save, so no
// backups or book zip (Backups); no data folder to move or measure (Storage); nothing connects to
// the phone, so no listening or access tokens (Server); no log files (Logs).
export const PHONE_HIDDEN_SECTIONS = ["backups", "storage", "server", "logs"];
