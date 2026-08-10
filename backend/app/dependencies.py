"""Request-scoped dependencies: device key, officer attribution, rate limits.

IMPORTANT FRAMING: none of this is authentication.

`X-Perigee-Device-Key` identifies a handset, not a person. `X-Perigee-Officer-Id`
is an ASSERTED string that nothing verifies. Together they give attribution and
revocability, not proof of identity. See docs/ADR/0003-no-auth-defensible.md for
what that does and does not buy.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from uuid import UUID

import asyncpg
from fastapi import Depends, Request

from app.config import Settings, get_settings
from app.errors import DeviceKeyInvalid, DeviceKeyMissing, MalformedRequest, RateLimited
from app.services.rate_limit import Limiters

MAX_OFFICER_ID_LEN = 64


def hash_device_key(raw_key: str, pepper: str) -> bytes:
    """sha256(pepper || key). Only the digest is ever stored."""
    return hashlib.sha256(f"{pepper}{raw_key}".encode()).digest()


@dataclass(frozen=True)
class DeviceContext:
    device_id: UUID
    label: str
    app: str


@dataclass(frozen=True)
class RequestContext:
    """Everything a handler needs about who is asking, and under what claim."""

    request_id: str
    device: DeviceContext
    officer_id: str


def get_pool(request: Request) -> asyncpg.Pool:
    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        from app.errors import DatabaseUnavailable

        raise DatabaseUnavailable("Database pool is not initialised")
    return pool


def get_limiters(request: Request) -> Limiters:
    return request.app.state.limiters


async def require_device(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> DeviceContext:
    # Header presence is checked BEFORE the pool is resolved. A missing key is
    # a client error that needs no database, and resolving the pool first would
    # mask a 401 behind a 503 whenever the database is unreachable.
    raw_key = request.headers.get(settings.device_key_header)
    if not raw_key:
        raise DeviceKeyMissing(
            f"{settings.device_key_header} header is required",
            detail={"header": settings.device_key_header},
        )

    pool = get_pool(request)
    key_hash = hash_device_key(raw_key, settings.device_key_pepper)
    row = await pool.fetchrow(
        "SELECT device_id, label, app, revoked FROM device WHERE key_hash = $1", key_hash
    )
    if row is None:
        raise DeviceKeyInvalid("Device key is not recognised")
    if row["revoked"]:
        raise DeviceKeyInvalid("Device key has been revoked")

    # Best-effort liveness marker; never worth failing a request over.
    await pool.execute(
        "UPDATE device SET last_seen_at = now() WHERE device_id = $1", row["device_id"]
    )

    return DeviceContext(device_id=row["device_id"], label=row["label"], app=row["app"])


def require_officer(request: Request, settings: Settings = Depends(get_settings)) -> str:
    """The officer's asserted identifier.

    Recorded immutably and displayed back in the app as
    'SEARCHING AS OFFICER-1147'. Social accountability is weaker than
    cryptographic accountability and considerably stronger than nothing.
    """
    officer_id = (request.headers.get(settings.officer_id_header) or "").strip()
    if not officer_id:
        raise MalformedRequest(
            f"{settings.officer_id_header} header is required",
            detail={"header": settings.officer_id_header},
        )
    if len(officer_id) > MAX_OFFICER_ID_LEN:
        raise MalformedRequest(
            f"officer id exceeds {MAX_OFFICER_ID_LEN} characters",
            detail={"max_length": MAX_OFFICER_ID_LEN},
        )
    return officer_id


async def request_context(
    request: Request,
    device: DeviceContext = Depends(require_device),
    officer_id: str = Depends(require_officer),
) -> RequestContext:
    return RequestContext(
        request_id=getattr(request.state, "request_id", ""),
        device=device,
        officer_id=officer_id,
    )


def _enforce(limiter_name: str):
    async def dependency(
        request: Request,
        device: DeviceContext = Depends(require_device),
        limiters: Limiters = Depends(get_limiters),
    ) -> None:
        limiter = getattr(limiters, limiter_name)
        allowed, remaining, retry_after = limiter.check(str(device.device_id))
        if not allowed:
            raise RateLimited(
                "Rate limit exceeded",
                detail={"bucket": limiter_name, "retry_after_seconds": retry_after},
                headers={"Retry-After": str(retry_after), "X-RateLimit-Remaining": "0"},
            )
        request.state.rate_limit_remaining = remaining

    return dependency


rate_limit_search = _enforce("search")
rate_limit_write = _enforce("write")
rate_limit_read = _enforce("read")


async def rate_limit_public(request: Request, limiters: Limiters = Depends(get_limiters)) -> None:
    """Public endpoints have no device key, so they are limited per client IP."""
    client_ip = request.client.host if request.client else "unknown"
    allowed, _remaining, retry_after = limiters.public.check(client_ip)
    if not allowed:
        raise RateLimited(
            "Rate limit exceeded",
            detail={"bucket": "public", "retry_after_seconds": retry_after},
            headers={"Retry-After": str(retry_after)},
        )
