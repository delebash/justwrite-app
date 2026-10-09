// SPDX-License-Identifier: MIT
// Where JustWrite's sync runs (sync.js). On a computer: the engine on better-sqlite3, and the
// product's app layer with its own defaults — this device's id from the data folder and the
// machine, the computer's name, a cloud folder on the disk. The phone's in-app server puts its
// twin in this module's place (sync_platform.phone.js).
import { betterSqlite3Adapter } from "@delebash/sqlite-sync";

/** The engine's adapter on the app's open database (the kit's handle's `raw`). */
export const syncDatabase = (raw) => betterSqlite3Adapter(raw);

/** The app layer's `platform` (undefined: its defaults). */
export const SYNC_PLATFORM = undefined;
