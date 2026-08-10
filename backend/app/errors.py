"""Error taxonomy.

Clients switch on `error.code`, so codes are a public contract and must stay
stable. `message` is for humans and may change freely.

Contract: docs/03-API-SPEC.md §1.
"""

from __future__ import annotations

from typing import Any

from fastapi import Request, status
from fastapi.responses import JSONResponse


class PerigeeError(Exception):
    """Base for every error that reaches a client as a structured response."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "MALFORMED_REQUEST"

    def __init__(
        self,
        message: str,
        *,
        detail: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail or {}
        self.headers = headers or {}


def _error(code: str, http_status: int) -> type[PerigeeError]:
    return type(code, (PerigeeError,), {"code": code, "status_code": http_status})


# 400
MalformedRequest = _error("MALFORMED_REQUEST", status.HTTP_400_BAD_REQUEST)

# 401 — device key
DeviceKeyMissing = _error("DEVICE_KEY_MISSING", status.HTTP_401_UNAUTHORIZED)
DeviceKeyInvalid = _error("DEVICE_KEY_INVALID", status.HTTP_401_UNAUTHORIZED)

# 403 — purpose binding. Identification is the only door into a record.
PurposeNotAuthorised = _error("PURPOSE_NOT_AUTHORISED", status.HTTP_403_FORBIDDEN)

# 404
NotFound = _error("NOT_FOUND", status.HTTP_404_NOT_FOUND)

# 409 — decisions are write-once. Editable decisions are not evidence.
DecisionAlreadyRecorded = _error("DECISION_ALREADY_RECORDED", status.HTTP_409_CONFLICT)

# 410
SearchExpired = _error("SEARCH_EXPIRED", status.HTTP_410_GONE)

# 422 — validation. Each is specific so the client can coach the officer.
InvalidEmbedding = _error("INVALID_EMBEDDING", status.HTTP_422_UNPROCESSABLE_ENTITY)
UnsupportedModel = _error("UNSUPPORTED_MODEL", status.HTTP_422_UNPROCESSABLE_ENTITY)
QualityBelowFloor = _error("QUALITY_BELOW_FLOOR", status.HTTP_422_UNPROCESSABLE_ENTITY)

# 429
RateLimited = _error("RATE_LIMITED", status.HTTP_429_TOO_MANY_REQUESTS)
PendingDecisionLimit = _error("PENDING_DECISION_LIMIT", status.HTTP_429_TOO_MANY_REQUESTS)

# 503
DatabaseUnavailable = _error("DATABASE_UNAVAILABLE", status.HTTP_503_SERVICE_UNAVAILABLE)
StorageUnavailable = _error("STORAGE_UNAVAILABLE", status.HTTP_503_SERVICE_UNAVAILABLE)


def error_body(code: str, message: str, detail: dict[str, Any], request_id: str) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "detail": detail,
            "request_id": request_id,
        }
    }


async def perigee_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, PerigeeError)
    request_id = getattr(request.state, "request_id", "")
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body(exc.code, exc.message, exc.detail, request_id),
        headers=exc.headers,
    )


async def validation_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Pydantic/FastAPI validation failures, mapped into our envelope.

    FastAPI's default 422 body has a different shape; letting it through would
    give clients two error formats to handle.
    """
    request_id = getattr(request.state, "request_id", "")
    errors = getattr(exc, "errors", lambda: [])()
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=error_body(
            "MALFORMED_REQUEST",
            "Request failed schema validation",
            {"fields": [{"loc": list(e.get("loc", ())), "msg": e.get("msg")} for e in errors]},
            request_id,
        ),
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Last resort. Never leak an internal message or stack to a client."""
    request_id = getattr(request.state, "request_id", "")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_body("INTERNAL_ERROR", "An internal error occurred", {}, request_id),
    )
