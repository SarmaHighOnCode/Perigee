"""Audit chain listing and verification.

`/v1/audit/verify` is a demo asset as much as an operational one: showing a
live chain verification over searches the audience just watched being
performed is more persuasive than any slide about accountability.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime

import asyncpg
from fastapi import APIRouter, Depends, Query

from app.config import Settings, get_settings
from app.dependencies import get_pool, rate_limit_read, request_context
from app.models.graph import AuditEntry, AuditListResponse, AuditVerifyResponse
from app.services import audit_chain

router = APIRouter(prefix="/v1", tags=["audit"])


@router.get(
    "/audit",
    response_model=AuditListResponse,
    summary="List audit chain entries",
    dependencies=[Depends(rate_limit_read), Depends(request_context)],
)
async def list_audit(
    subject_type: str | None = Query(default=None),
    subject_id: str | None = Query(default=None),
    actor_id: str | None = Query(default=None),
    from_seq: int | None = Query(default=None, ge=1),
    to_seq: int | None = Query(default=None, ge=1),
    limit: int = Query(default=100, ge=1, le=500),
    settings: Settings = Depends(get_settings),
    pool: asyncpg.Pool = Depends(get_pool),
) -> AuditListResponse:
    rows = await pool.fetch(
        """
        SELECT seq, occurred_at, actor_type, actor_id, action,
               subject_type, subject_id, payload, prev_hash, row_hash
        FROM   audit_event
        WHERE  ($1::text   IS NULL OR subject_type = $1)
          AND  ($2::text   IS NULL OR subject_id   = $2)
          AND  ($3::text   IS NULL OR actor_id     = $3)
          AND  ($4::bigint IS NULL OR seq >= $4)
          AND  ($5::bigint IS NULL OR seq <= $5)
        ORDER  BY seq
        LIMIT  $6
        """,
        subject_type,
        subject_id,
        actor_id,
        from_seq,
        to_seq,
        limit,
    )

    entries = [
        AuditEntry(
            seq=r["seq"],
            occurred_at=r["occurred_at"],
            actor_type=r["actor_type"],
            actor_id=r["actor_id"],
            action=r["action"],
            subject_type=r["subject_type"],
            subject_id=r["subject_id"],
            payload=r["payload"] or {},
            prev_hash=r["prev_hash"].hex(),
            row_hash=r["row_hash"].hex(),
        )
        for r in rows
    ]

    return AuditListResponse(
        entries=entries,
        count=len(entries),
        dataset_mode=settings.dataset_mode,
        server_time=datetime.now(UTC),
    )


@router.get(
    "/audit/verify",
    response_model=AuditVerifyResponse,
    summary="Recompute the hash chain and report the first inconsistency",
    dependencies=[Depends(rate_limit_read), Depends(request_context)],
)
async def verify_audit(
    from_seq: int | None = Query(default=None, ge=1),
    to_seq: int | None = Query(default=None, ge=1),
    settings: Settings = Depends(get_settings),
    pool: asyncpg.Pool = Depends(get_pool),
) -> AuditVerifyResponse:
    started = time.perf_counter()
    async with pool.acquire() as conn:
        result = await audit_chain.verify(conn, from_seq, to_seq)
    duration_ms = int((time.perf_counter() - started) * 1000)

    return AuditVerifyResponse(
        **result,
        duration_ms=duration_ms,
        dataset_mode=settings.dataset_mode,
        server_time=datetime.now(UTC),
    )
