"""Case linking and relationship persistence."""

from __future__ import annotations

from uuid import UUID

import asyncpg

from app.db import require_row

# Base weights mirror scripts/compute_edges.py so a hand-recorded edge and a
# derived one are scored on the same scale.
MANUAL_EDGE_BASE_WEIGHT: dict[str, float] = {
    "shared_phone": 0.55,
    "family": 0.50,
    "shared_address": 0.45,
    "known_associate": 0.35,
    "same_mo": 0.25,
}


async def list_cases(
    conn: asyncpg.Connection,
    query: str | None,
    district: str | None,
    limit: int,
) -> list[asyncpg.Record]:
    """Cases for the Enroll picker. Ask for one extra so truncation is honest."""
    return list(
        await conn.fetch(
            """
            SELECT c.case_id, c.fir_number, c.station, c.district, c.registered_on, c.status,
                   o.title AS offence_title, o.ipc_section, o.bns_section,
                   (SELECT count(*) FROM person_case pc WHERE pc.case_id = c.case_id)
                       AS linked_persons
            FROM   case_record c
            LEFT   JOIN offence o ON o.offence_id = c.offence_id
            WHERE  ($1::text IS NULL OR c.fir_number ILIKE '%' || $1 || '%'
                                     OR c.station    ILIKE '%' || $1 || '%')
              AND  ($2::text IS NULL OR c.district = $2)
            ORDER  BY c.registered_on DESC, c.fir_number
            LIMIT  $3
            """,
            query,
            district,
            limit + 1,
        )
    )


async def link_person_case(
    conn: asyncpg.Connection, person_id: UUID, case_id: UUID, role: str
) -> bool:
    """Link a person to a case. Returns True when the link already existed.

    The primary key is (person_id, case_id, role), so re-submitting a draft
    after a dropped connection is safe — and a person can legitimately hold two
    roles on one case.
    """
    result = await conn.execute(
        """
        INSERT INTO person_case (person_id, case_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (person_id, case_id, role) DO NOTHING
        """,
        person_id,
        case_id,
        role,
    )
    return result.endswith(" 0")


async def missing_cases(conn: asyncpg.Connection, case_ids: list[UUID]) -> list[UUID]:
    """Which of these case ids do not exist. Evidence must be real."""
    rows = await conn.fetch(
        "SELECT case_id FROM case_record WHERE case_id = ANY($1::uuid[])", case_ids
    )
    found = {r["case_id"] for r in rows}
    return [c for c in case_ids if c not in found]


async def create_relationship(
    conn: asyncpg.Connection,
    person_id: UUID,
    target_person_id: UUID,
    edge_type: str,
    evidence_case_ids: list[UUID],
    weight: float | None,
) -> tuple[asyncpg.Record, bool]:
    """Create an undirected edge. Returns (row, already_existed).

    Stored with src < dst so an undirected edge has exactly one row and the
    UNIQUE constraint actually prevents duplicates — see migration 0004.
    """
    src, dst = sorted([person_id, target_person_id], key=str)
    resolved_weight = weight if weight is not None else MANUAL_EDGE_BASE_WEIGHT.get(edge_type, 0.35)

    existing = await conn.fetchrow(
        """
        SELECT edge_id, src_person_id, dst_person_id, edge_type, weight, evidence_case_ids
        FROM   edge
        WHERE  src_person_id = $1 AND dst_person_id = $2 AND edge_type = $3
        """,
        src,
        dst,
        edge_type,
    )
    if existing is not None:
        # Merge evidence rather than replacing it: a second operator citing a
        # different case strengthens the same claim.
        merged = sorted({*existing["evidence_case_ids"], *evidence_case_ids}, key=str)
        updated = require_row(
            await conn.fetchrow(
                """
                UPDATE edge
                SET    evidence_case_ids = $2, weight = $3, computed_at = now()
                WHERE  edge_id = $1
                RETURNING edge_id, src_person_id, dst_person_id, edge_type, weight,
                          evidence_case_ids
                """,
                existing["edge_id"],
                merged,
                resolved_weight,
            ),
            "edge update",
        )
        return updated, True

    created = require_row(
        await conn.fetchrow(
            """
            INSERT INTO edge (
                src_person_id, dst_person_id, edge_type, weight, evidence_case_ids
            )
            VALUES ($1,$2,$3,$4,$5)
            RETURNING edge_id, src_person_id, dst_person_id, edge_type, weight,
                      evidence_case_ids
            """,
            src,
            dst,
            edge_type,
            resolved_weight,
            evidence_case_ids,
        ),
        "edge insert",
    )
    return created, False


async def refresh_degree(conn: asyncpg.Connection, person_ids: list[UUID]) -> None:
    """Keep `degree` current for the two endpoints of a new edge.

    Betweenness and community are NOT recomputed here — they are global
    properties costing O(V*E) and belong in scripts/compute_node_metrics.py.
    Degree is local and cheap, and leaving it stale makes a freshly linked
    person render as having no associates.
    """
    await conn.executemany(
        """
        INSERT INTO node_metric (person_id, degree, computed_at)
        VALUES ($1, (SELECT count(*) FROM edge e
                      WHERE e.src_person_id = $1 OR e.dst_person_id = $1), now())
        ON CONFLICT (person_id) DO UPDATE
            SET degree = EXCLUDED.degree, computed_at = now()
        """,
        [(pid,) for pid in person_ids],
    )


async def person_exists(conn: asyncpg.Connection, person_id: UUID) -> bool:
    return await conn.fetchval("SELECT true FROM person WHERE person_id = $1", person_id) is True
