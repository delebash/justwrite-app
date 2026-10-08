// SPDX-License-Identifier: MIT
// ALIAS, not a copy — the port of justwrite_server/errors.py. The whole error implementation
// lives in the kit (`@delebash/llm-runner/platform/errors`; JustWrite's file was the donor).
// This module exists so the app's route files import against the ONE family implementation;
// there is no logic here to drift. Handlers are installed by app.js through the kit's
// `createServer({ typeBase })` — the type base is the only per-app datum.

export {
  ApiError,
  badRequest,
  conflict,
  forbidden,
  HttpError,
  internal,
  notFound,
  notImplemented,
  serviceUnavailable,
  unauthorized,
} from "@delebash/llm-runner/platform/errors";
