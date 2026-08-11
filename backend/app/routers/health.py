"""Liveness and readiness.

/healthz deliberately does NOT touch the database: it is what the mobile app
pre-warms on launch and what the demo-window keepalive pings. Making it hit
Postgres would wake Neon on every ping and turn a cheap liveness check into a
cost.
"""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, Request

from app.config import Settings, get_settings
from app.db import current_version
from app.models.common import HealthResponse, ReadyResponse

router = APIRouter(tags=["health"])


@router.get("/healthz", response_model=HealthResponse, summary="Liveness (no DB access)")
async def healthz(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(status="ok", dataset_mode=settings.dataset_mode)


@router.get("/readyz", response_model=ReadyResponse, summary="Readiness (checks DB + migrations)")
async def readyz(request: Request, settings: Settings = Depends(get_settings)) -> ReadyResponse:
    pool: asyncpg.Pool | None = getattr(request.app.state, "pool", None)

    database = "unavailable"
    version: str | None = None
    if pool is not None:
        try:
            async with pool.acquire() as conn:
                await conn.execute("SELECT 1")
                version = await current_version(conn)
            database = "ok"
        except Exception:
            database = "unavailable"

    return ReadyResponse(
        status="ok" if database == "ok" else "degraded",
        database=database,
        migration_version=version,
        storage="ok" if settings.storage_enabled else "disabled",
        dataset_mode=settings.dataset_mode,
    )
