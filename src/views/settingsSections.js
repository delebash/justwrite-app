// SPDX-License-Identifier: MIT
// JustWrite's Settings sections, in render order — ONE list the view renders and
// the contract test asserts (parity batch slice 11). The family sections must keep
// the canon RELATIVE order (kit familyContract SETTINGS_SECTION_ORDER); app-own
// sections (Project) may lead or interleave. Labels stay in the view (i18n `t`).
export const SETTINGS_SECTION_IDS = [
  "project",
  "appearance",
  "backups",
  "storage",
  "server",
  "logs",
  "updates",
  "about",
];
