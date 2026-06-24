"""RFC 7807 problem-details error envelope.

Uniform with JustVoice's server (the reference shape): handlers convert
ApiError / HTTPException into application/problem+json so both apps' servers —
and the shared renderer's serverApi error handling — see one consistent error
body. The bearer-auth middleware already emits this shape for 401/403.
"""

from __future__ import annotations

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

_TYPE_BASE = "https://justwrite.dev/errors/"


class ApiError(HTTPException):
    """HTTPException variant that carries the slug + title for the RFC 7807 type uri."""

    def __init__(self, status_code: int, slug: str, title: str, detail: str):
        super().__init__(status_code=status_code, detail=detail)
        self.slug = slug
        self.title = title


def bad_request(detail: str) -> ApiError:
    return ApiError(400, "bad-request", "Bad Request", detail)


def unauthorized(detail: str = "Authentication required") -> ApiError:
    return ApiError(401, "unauthorized", "Unauthorized", detail)


def forbidden(detail: str = "Token not accepted") -> ApiError:
    return ApiError(403, "forbidden", "Forbidden", detail)


def not_found(detail: str) -> ApiError:
    return ApiError(404, "not-found", "Not Found", detail)


def conflict(detail: str) -> ApiError:
    return ApiError(409, "conflict", "Conflict", detail)


def not_implemented(detail: str) -> ApiError:
    return ApiError(501, "not-implemented", "Not Implemented", detail)


def service_unavailable(detail: str) -> ApiError:
    return ApiError(503, "service-unavailable", "Service Unavailable", detail)


def internal(detail: str = "An internal error occurred. See server logs for details.") -> ApiError:
    return ApiError(500, "internal", "Internal Server Error", detail)


async def api_exception_handler(request: Request, exc: ApiError):
    body = {
        "type": f"{_TYPE_BASE}{exc.slug}",
        "title": exc.title,
        "status": exc.status_code,
        "detail": exc.detail,
        "instance": request.url.path,
    }
    return JSONResponse(
        status_code=exc.status_code,
        content=body,
        media_type="application/problem+json",
    )


async def http_exception_handler(request: Request, exc: HTTPException):
    # Plain HTTPException (without our slug) — synthesize a reasonable one.
    slug = "error"
    title = "Error"
    if exc.status_code == 404:
        slug, title = "not-found", "Not Found"
    elif exc.status_code == 400:
        slug, title = "bad-request", "Bad Request"
    elif exc.status_code == 401:
        slug, title = "unauthorized", "Unauthorized"
    elif exc.status_code == 403:
        slug, title = "forbidden", "Forbidden"
    elif exc.status_code == 422:
        slug, title = "validation-error", "Validation Error"
    body = {
        "type": f"{_TYPE_BASE}{slug}",
        "title": title,
        "status": exc.status_code,
        "detail": str(exc.detail),
        "instance": request.url.path,
    }
    return JSONResponse(
        status_code=exc.status_code,
        content=body,
        media_type="application/problem+json",
    )
