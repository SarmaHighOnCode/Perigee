"""Person, media and embedding persistence."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import asyncpg

from app.db import encode_vector, require_row


def mask_name(full_name: str) -> str:
    """'Ramesh Kumar' -> 'R***** K****'.

    Candidate lists render this instead of the full name, so four of five
    innocent candidates are never identified to the officer.
    """
    parts = [p for p in full_name.split() if p]
    if not parts:
        return "UNKNOWN"
    return " ".join(p[0].upper() + "*" * max(1, len(p) - 1) for p in parts)


async def create_person(
    conn: asyncpg.Connection, data: dict[str, Any], dataset_mode: str
) -> asyncpg.Record:
    return require_row(
        await conn.fetchrow(
            """
            INSERT INTO person (
                full_name, aliases, dob, gender, address_line, phone,
                masked_name, age_band, district, dataset_mode
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING person_id, masked_name
            """,
            data["full_name"],
            data.get("aliases") or [],
            data.get("dob"),
            data.get("gender"),
            data.get("address_line"),
            data.get("phone"),
            data.get("masked_name") or mask_name(data["full_name"]),
            data.get("age_band"),
            data.get("district"),
            dataset_mode,
        ),
        "person insert",
    )


async def get_person(conn: asyncpg.Connection, person_id: UUID) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT person_id, full_name, aliases, dob, gender, address_line, phone,
               masked_name, age_band, district, status, dataset_mode
        FROM   person WHERE person_id = $1
        """,
        person_id,
    )


async def summarise(conn: asyncpg.Connection, person_ids: list[UUID]) -> dict[str, dict[str, Any]]:
    """Masked identity plus case counts for a candidate list.

    `convictions` is counted separately from `case_count` deliberately —
    the UI is forbidden from collapsing them into one number.
    """
    if not person_ids:
        return {}

    rows = await conn.fetch(
        """
        SELECT p.person_id, p.masked_name, p.age_band, p.district,
               COALESCE(c.case_count, 0)  AS case_count,
               COALESCE(c.convictions, 0) AS convictions,
               c.latest,
               m.r2_key AS mugshot_key
        FROM   person p
        LEFT   JOIN LATERAL (
            SELECT count(*)                                            AS case_count,
                   count(*) FILTER (WHERE pc.role = 'convicted')       AS convictions,
                   max(cr.registered_on)::text                         AS latest
            FROM   person_case pc
            JOIN   case_record cr ON cr.case_id = pc.case_id
            WHERE  pc.person_id = p.person_id
        ) c ON true
        LEFT   JOIN LATERAL (
            SELECT r2_key FROM media
            WHERE  person_id = p.person_id AND committed
            ORDER  BY is_primary DESC, created_at
            LIMIT  1
        ) m ON true
        WHERE  p.person_id = ANY($1::uuid[])
        """,
        person_ids,
    )
    return {
        str(r["person_id"]): {
            "masked_name": r["masked_name"],
            "age_band": r["age_band"],
            "district": r["district"],
            "case_count": int(r["case_count"]),
            "convictions": int(r["convictions"]),
            "latest": r["latest"],
            "mugshot_key": r["mugshot_key"],
        }
        for r in rows
    }


async def get_cases(conn: asyncpg.Connection, person_id: UUID) -> list[asyncpg.Record]:
    return list(
        await conn.fetch(
            """
            SELECT cr.case_id, cr.fir_number, cr.station, cr.district,
                   cr.registered_on, cr.status, pc.role,
                   o.ipc_section, o.bns_section, o.title, o.category, o.severity
            FROM   person_case pc
            JOIN   case_record cr ON cr.case_id = pc.case_id
            LEFT   JOIN offence o ON o.offence_id = cr.offence_id
            WHERE  pc.person_id = $1
            ORDER  BY cr.registered_on DESC
            """,
            person_id,
        )
    )


async def get_media(conn: asyncpg.Connection, person_id: UUID) -> list[asyncpg.Record]:
    return list(
        await conn.fetch(
            """
            SELECT media_id, r2_key, capture_angle, is_primary
            FROM   media
            WHERE  person_id = $1 AND committed
            ORDER  BY is_primary DESC, created_at
            """,
            person_id,
        )
    )


async def get_graph_summary(conn: asyncpg.Connection, person_id: UUID) -> dict[str, Any]:
    row = await conn.fetchrow(
        """
        SELECT COALESCE(nm.degree, 0) AS degree,
               nm.community_id,
               (SELECT count(*) FROM edge e
                 WHERE e.src_person_id = $1 OR e.dst_person_id = $1) AS associates
        FROM   person p
        LEFT   JOIN node_metric nm ON nm.person_id = p.person_id
        WHERE  p.person_id = $1
        """,
        person_id,
    )
    if row is None:
        return {"degree": 0, "community_id": None, "immediate_associates": 0}
    return {
        "degree": int(row["degree"]),
        "community_id": row["community_id"],
        "immediate_associates": int(row["associates"]),
    }


async def insert_embedding(
    conn: asyncpg.Connection,
    person_id: UUID,
    vector: list[float],
    model_id: str,
    quality_score: float,
    det_score: float | None = None,
    yaw: float | None = None,
    pitch: float | None = None,
    media_id: UUID | None = None,
) -> asyncpg.Record:
    return require_row(
        await conn.fetchrow(
            """
            INSERT INTO face_embedding (
                person_id, media_id, model_id, embedding, quality_score, det_score, yaw, pitch
            )
            VALUES ($1,$2,$3,$4::text::vector(512),$5,$6,$7,$8)
            ON CONFLICT (person_id, model_id, media_id) DO UPDATE
                SET embedding = EXCLUDED.embedding,
                    quality_score = EXCLUDED.quality_score
            RETURNING embedding_id
            """,
            person_id,
            media_id,
            model_id,
            encode_vector(vector),
            quality_score,
            det_score,
            yaw,
            pitch,
        ),
        "face_embedding upsert",
    )


async def create_media(
    conn: asyncpg.Connection,
    person_id: UUID,
    r2_key: str,
    capture_angle: str,
    is_primary: bool,
) -> asyncpg.Record:
    return require_row(
        await conn.fetchrow(
            """
            INSERT INTO media (person_id, r2_key, capture_angle, is_primary)
            VALUES ($1,$2,$3,$4)
            RETURNING media_id, r2_key
            """,
            person_id,
            r2_key,
            capture_angle,
            is_primary,
        ),
        "media insert",
    )


async def get_media_row(
    conn: asyncpg.Connection, person_id: UUID, media_id: UUID
) -> asyncpg.Record | None:
    return await conn.fetchrow(
        "SELECT media_id, person_id, r2_key, committed FROM media "
        "WHERE media_id = $1 AND person_id = $2",
        media_id,
        person_id,
    )


async def commit_media(
    conn: asyncpg.Connection,
    media_id: UUID,
    sha256_hex: str,
    byte_count: int,
    width: int | None,
    height: int | None,
    exif_stripped: bool,
) -> None:
    await conn.execute(
        """
        UPDATE media
        SET    sha256 = decode($2, 'hex'), bytes = $3, width = $4, height = $5,
               exif_stripped = $6, committed = true, committed_at = now()
        WHERE  media_id = $1
        """,
        media_id,
        sha256_hex,
        byte_count,
        width,
        height,
        exif_stripped,
    )
