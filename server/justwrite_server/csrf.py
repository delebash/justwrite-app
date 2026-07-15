"""CSRF hardening — reject cross-site browser requests to the mutating API.

The server is a localhost sidecar; the real CSRF threat is a page in the user's
OTHER browser tab POSTing to 127.0.0.1:<port>. This middleware rejects a MUTATING
`/v1` request whose `Origin` marks it cross-site, UNLESS the origin is the app's
own. It needs NO token, so it can never lock a user out (the user's deciding
factor: "prefer not locking anyone out, do the vector directly"); the only
failure mode is a missing app origin blocking the app itself — which the headless
smoke catches immediately.

Allowed:
- no `Origin` header — non-browser clients AND the Tauri webview (server calls go
  through the Tauri HTTP plugin / reqwest, which sends no browser `Origin`);
- SAME-ORIGIN — the `Origin` equals the server's own origin. A page the server
  itself served is not a cross-site vector by definition, and this is the headless
  mode (`justwrite-server serve` + a browser, the dist/ mount in app.py): browsers
  DO send `Origin` on same-origin mutations, so without this every write from the
  self-hosted UI 403'd. (Found 2026-07-15 driving the server-hosted UI: the exact
  "missing app origin blocking the app itself" failure this docstring predicted —
  the smoke never caught it because it runs against the dev origin, which was
  allowlisted.) Derived per-request from the URL, so any host/port works.
- an `Origin` in the app allowlist (the dev + Tauri origins, PLUS any origins
  configured for CORS — one allowlist, reused, not a second list);
- any non-mutating method (GET/HEAD/OPTIONS) — not the CSRF vector, and CORS
  already stops a foreign page from reading the response.
Rejected: a mutating `/v1` request carrying any other browser origin → 403.
"""

from __future__ import annotations

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

# The app's own front-end origins. The packaged Tauri webview serves from
# tauri://localhost (macOS/Linux) or http(s)://tauri.localhost (Windows) and
# normally reaches the server with NO Origin (via reqwest) — these cover the dev
# server (Vite :1420) + are belt-and-suspenders for any webview that does send one.
_APP_ORIGINS = frozenset({
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
})

_MUTATING = frozenset({"POST", "PUT", "PATCH", "DELETE"})


class CsrfOriginMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, extra_origins=()):
        super().__init__(app)
        self._allow = _APP_ORIGINS | frozenset(o for o in (extra_origins or ()) if o)

    def _same_origin(self, request) -> str:
        """The server's OWN origin for this request (scheme://host[:port]) — a page
        we served ourselves. Read from the URL so it follows whatever host/port the
        server actually runs on (17495, a test port, a LAN bind)."""
        return f"{request.url.scheme}://{request.url.netloc}"

    async def dispatch(self, request, call_next):
        if request.method in _MUTATING and request.url.path.startswith("/v1"):
            origin = request.headers.get("origin")
            if origin and origin not in self._allow and origin != self._same_origin(request):
                return JSONResponse(
                    status_code=403,
                    content={
                        "type": "https://justwrite.dev/errors/cross-origin",
                        "title": "Forbidden",
                        "status": 403,
                        "detail": "cross-origin request rejected",
                        "instance": request.url.path,
                    },
                    media_type="application/problem+json",
                )
        return await call_next(request)
