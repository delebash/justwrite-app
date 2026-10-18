// SPDX-License-Identifier: MIT
// Product + version constants — the port of justwrite_server/version.py. The version is the
// server package's (kept equal to the app's package.json; the family guard checks), read as a
// JSON import so the phone's bundle carries it too.

import pkg from "../package.json" with { type: "json" };

export const PRODUCT = "JustWrite Server";
export const VERSION = pkg.version;
export const API_VERSION = "v1";
