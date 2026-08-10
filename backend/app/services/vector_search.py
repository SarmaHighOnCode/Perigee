"""pgvector nearest-neighbour search.

Two things here are easy to get wrong and expensive to debug.

1. THE INDEX EXPRESSION MUST MATCH EXACTLY.
   The index is on `(embedding::halfvec(512)) halfvec_cosine_ops`, so the
   ORDER BY must be `embedding::halfvec(512) <=> <halfvec>`. Any mismatch and
   Postgres silently falls back to a sequential scan — no error, just slow.
   tests/test_vector_search.py asserts the plan.

2. DE-DUPLICATION BY PERSON CANNOT BE DONE IN THE INDEX SCAN.
   A person has several embeddings (multi-angle enrolment), and we want their
   best. But `DISTINCT ON (person_id)` requires `ORDER BY person_id, ...`,
   which discards the distance ordering the index provides. So: over-fetch by
   distance using the index, then de-duplicate in an outer query.

Parameters are bound as text and cast `$n::text::vector(512)` so asyncpg never
needs a registered `vector` codec — one less thing to lose on a reconnect.
"""

from __future__ import annotations

import asyncpg

from app.db import encode_vector

# How many index rows to pull before de-duplicating by person. Multi-angle
# enrolment means ~3 rows per person, so 4x top_k leaves comfortable margin.
OVERFETCH_FACTOR = 4
OVERFETCH_MIN = 20

_SEARCH_SQL = """
WITH nn AS (
    SELECT person_id,
           embedding_id,
           embedding <=> $1::text::vector(512) AS distance
    FROM   face_embedding
    WHERE  model_id = $2
    ORDER  BY embedding::halfvec(512) <=> $1::text::halfvec(512)
    LIMIT  $3
),
best AS (
    SELECT DISTINCT ON (person_id) person_id, embedding_id, distance
    FROM   nn
    ORDER  BY person_id, distance
)
SELECT person_id,
       embedding_id,
       1 - distance AS similarity
FROM   best
ORDER  BY distance
LIMIT  $4
"""


async def search(
    conn: asyncpg.Connection,
    probe: list[float],
    model_id: str,
    top_k: int,
) -> list[tuple[str, str, float]]:
    """Return (person_id, embedding_id, similarity) ordered best-first.

    Similarity is cosine, computed at full float32 precision even though the
    ordering came from the halfvec index: approximate ranking, exact score.
    """
    encoded = encode_vector(probe)
    overfetch = max(top_k * OVERFETCH_FACTOR, OVERFETCH_MIN)

    rows = await conn.fetch(_SEARCH_SQL, encoded, model_id, overfetch, top_k)
    return [(str(r["person_id"]), str(r["embedding_id"]), float(r["similarity"])) for r in rows]


async def explain(conn: asyncpg.Connection, probe: list[float], model_id: str, top_k: int) -> str:
    """Return the query plan. Used by tests to prove the HNSW index is used."""
    encoded = encode_vector(probe)
    overfetch = max(top_k * OVERFETCH_FACTOR, OVERFETCH_MIN)
    rows = await conn.fetch(
        f"EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) {_SEARCH_SQL}",
        encoded,
        model_id,
        overfetch,
        top_k,
    )
    return "\n".join(r[0] for r in rows)


async def set_ef_search(conn: asyncpg.Connection, ef_search: int) -> None:
    """Raise HNSW recall for one transaction.

    SET LOCAL, never session-level: a session-level SET persists until the
    connection returns to the pool and would silently affect unrelated queries
    on that connection.
    """
    await conn.execute(f"SET LOCAL hnsw.ef_search = {int(ef_search)}")
