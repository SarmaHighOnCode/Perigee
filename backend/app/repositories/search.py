"""Search event, candidate and decision persistence."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import asyncpg

from app.db import encode_vector, require_row
from app.services.scoring import ScoredCandidate


async def create_search_event(
    conn: asyncpg.Connection,
    *,
    device_id: UUID,
    officer_id: str,
    reason_code: str,
    model_id: str,
    probe_quality: float,
    threshold_in_effect: float,
    band_config: dict[str, float],
    probe_embedding: list[float] | None,
    geo_lat: float | None,
    geo_lon: float | None,
    top_score: float | None,
    score_gap: float | None,
    candidate_count: int,
) -> UUID:
    """Insert the search. May raise CheckViolationError from the
    pending-decision trigger — the caller maps that to 429."""
    row = await conn.fetchrow(
        """
        INSERT INTO search_event (
            device_id, officer_id, reason_code, model_id, probe_quality,
            probe_embedding, geo_lat, geo_lon, threshold_in_effect, band_config,
            top_score, score_gap, candidate_count
        )
        VALUES ($1,$2,$3,$4,$5,
                CASE WHEN $6::text IS NULL THEN NULL ELSE $6::text::vector(512) END,
                $7,$8,$9,$10::jsonb,$11,$12,$13)
        RETURNING search_id
        """,
        device_id,
        officer_id,
        reason_code,
        model_id,
        probe_quality,
        encode_vector(probe_embedding) if probe_embedding is not None else None,
        geo_lat,
        geo_lon,
        threshold_in_effect,
        json.dumps(band_config),
        top_score,
        score_gap,
        candidate_count,
    )
    return require_row(row, "search_event insert")["search_id"]


async def insert_candidates(
    conn: asyncpg.Connection, search_id: UUID, candidates: list[ScoredCandidate]
) -> None:
    if not candidates:
        return
    await conn.executemany(
        """
        INSERT INTO search_candidate (search_id, rank, person_id, embedding_id, similarity, band)
        VALUES ($1,$2,$3,$4,$5,$6)
        """,
        [
            (search_id, rank, UUID(c.person_id), UUID(c.embedding_id), c.similarity, c.band)
            for rank, c in enumerate(candidates, start=1)
        ],
    )


async def get_search(conn: asyncpg.Connection, search_id: UUID) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT search_id, device_id, officer_id, reason_code, model_id, probe_quality,
               threshold_in_effect, band_config, top_score, score_gap, candidate_count,
               status, created_at
        FROM   search_event WHERE search_id = $1
        """,
        search_id,
    )


async def get_candidates(conn: asyncpg.Connection, search_id: UUID) -> list[asyncpg.Record]:
    return list(
        await conn.fetch(
            """
            SELECT rank, person_id, embedding_id, similarity, band
            FROM   search_candidate WHERE search_id = $1 ORDER BY rank
            """,
            search_id,
        )
    )


async def get_decision(conn: asyncpg.Connection, search_id: UUID) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT decision, confirmed_person_id, confirmed_rank, officer_id, note,
               quality_override, decided_at, latency_ms
        FROM   search_decision WHERE search_id = $1
        """,
        search_id,
    )


async def record_decision(
    conn: asyncpg.Connection,
    *,
    search_id: UUID,
    decision: str,
    confirmed_person_id: UUID | None,
    confirmed_rank: int | None,
    officer_id: str,
    note: str | None,
    quality_override: bool,
    latency_ms: int | None,
) -> None:
    """Write the decision and close the search.

    The PK on search_id makes this write-once: a second attempt raises
    UniqueViolationError, which the caller maps to 409. A decision cannot be
    revised — a new search must be run, because editable decisions are not
    evidence.
    """
    await conn.execute(
        """
        INSERT INTO search_decision (
            search_id, decision, confirmed_person_id, confirmed_rank,
            officer_id, note, quality_override, latency_ms
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        """,
        search_id,
        decision,
        confirmed_person_id,
        confirmed_rank,
        officer_id,
        note,
        quality_override,
        latency_ms,
    )
    await conn.execute("UPDATE search_event SET status = 'CLOSED' WHERE search_id = $1", search_id)


async def list_pending(conn: asyncpg.Connection, device_id: UUID) -> list[asyncpg.Record]:
    return list(
        await conn.fetch(
            """
            SELECT search_id, officer_id, reason_code, candidate_count, top_score, created_at
            FROM   search_event
            WHERE  device_id = $1 AND status = 'PENDING_DECISION'
            ORDER  BY created_at
            """,
            device_id,
        )
    )


async def expire_stale(conn: asyncpg.Connection, minutes: int) -> int:
    """Mark abandoned searches EXPIRED.

    Abandonment is recorded, not erased: a high expiry rate is itself a
    reviewable signal about how the tool is being used.
    """
    rows = await conn.fetch(
        """
        UPDATE search_event
        SET    status = 'EXPIRED'
        WHERE  status = 'PENDING_DECISION'
          AND  created_at < now() - make_interval(mins => $1)
        RETURNING search_id
        """,
        minutes,
    )
    return len(rows)


async def confirmed_person_for(conn: asyncpg.Connection, search_id: UUID) -> dict[str, Any] | None:
    """Backing query for purpose binding on GET /v1/person/{id}."""
    row = await conn.fetchrow(
        """
        SELECT se.reason_code, se.created_at, sd.decision, sd.confirmed_person_id
        FROM   search_event se
        LEFT   JOIN search_decision sd ON sd.search_id = se.search_id
        WHERE  se.search_id = $1
        """,
        search_id,
    )
    if row is None:
        return None
    return {
        "reason_code": row["reason_code"],
        "decision": row["decision"],
        "confirmed_person_id": row["confirmed_person_id"],
        "created_at": row["created_at"],
    }
