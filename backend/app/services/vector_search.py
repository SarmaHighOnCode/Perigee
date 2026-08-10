"""pgvector nearest-neighbour search.

Three things here are easy to get wrong and expensive to debug. All three fail
SILENTLY -- no error, just a system that is slower or less correct than it looks.

1. THE INDEX EXPRESSION MUST MATCH EXACTLY.
   The index is on `(embedding::halfvec(512)) halfvec_cosine_ops`, so the
   ORDER BY must be `embedding::halfvec(512) <=> <halfvec>`.

2. THE PARTIAL-INDEX PREDICATE IS INLINED, NOT PARAMETERISED.
   The index carries `WHERE model_id = 'insightface/w600k_r50@1'`. Postgres
   only uses a partial index when it can PROVE the query's predicate implies
   the index's, and it cannot prove anything about a parameter whose value is
   unknown at plan time.

   With a CUSTOM plan the value is substituted and the proof succeeds, so a
   parameter usually works. But `plan_cache_mode` defaults to `auto`: after
   five executions of a prepared statement Postgres may switch to a GENERIC
   plan, where the value is unknown again and the partial index drops out of
   consideration. asyncpg reuses prepared statements, so a long-running server
   is exactly where that switch happens — the index would work in testing and
   quietly stop being used in production.

   Inlining removes the failure mode rather than relying on the planner
   continuing to prefer custom plans. See `_search_sql`.

3. DE-DUPLICATION BY PERSON CANNOT HAPPEN IN THE INDEX SCAN.
   A person has several embeddings (multi-angle enrolment) and we want their
   best. But `DISTINCT ON (person_id)` requires `ORDER BY person_id, ...`,
   which discards the distance ordering the index provides. So: over-fetch by
   distance using the index, then de-duplicate in an outer query.

The probe vector is bound as text and double-cast (`$1::text::vector(512)`) so
asyncpg never needs a registered `vector` codec -- one less thing to lose
silently on a reconnect.
"""

from __future__ import annotations

import re
from functools import lru_cache

import asyncpg

from app.db import encode_vector

# How many index rows to pull before de-duplicating by person. Multi-angle
# enrolment means ~3 rows per person, so 4x top_k leaves comfortable margin.
OVERFETCH_FACTOR = 4
OVERFETCH_MIN = 20

# model_id is inlined into SQL, so its shape is constrained defensively even
# though every caller has already checked it against the config allowlist.
# Quotes, backslashes and whitespace cannot appear.
_MODEL_ID_PATTERN = re.compile(r"^[A-Za-z0-9._/@:-]{1,128}$")

_SEARCH_SQL_TEMPLATE = """
WITH nn AS (
    SELECT person_id,
           embedding_id,
           embedding <=> $1::text::vector(512) AS distance
    FROM   face_embedding
    WHERE  model_id = {model_literal}
    ORDER  BY embedding::halfvec(512) <=> $1::text::halfvec(512)
    LIMIT  $2
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
LIMIT  $3
"""


class UnsafeModelIdError(ValueError):
    """A model_id that cannot be safely inlined into SQL."""


@lru_cache(maxsize=16)
def _search_sql(model_id: str) -> str:
    """Build (and cache) the search SQL for one model_id.

    The value is inlined rather than parameterised so the partial index stays
    matchable under a generic plan (see note 2 above). Injection is not
    reachable:
    callers validate model_id against the config allowlist before this point,
    and the pattern below independently rejects anything containing a quote,
    backslash, or whitespace. The result is cached per model, so the formatting
    happens a handful of times per process, never per request.
    """
    if not _MODEL_ID_PATTERN.match(model_id):
        raise UnsafeModelIdError(f"model_id {model_id!r} is not a permitted identifier")
    return _SEARCH_SQL_TEMPLATE.format(model_literal=f"'{model_id}'")


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

    rows = await conn.fetch(_search_sql(model_id), encoded, overfetch, top_k)
    return [(str(r["person_id"]), str(r["embedding_id"]), float(r["similarity"])) for r in rows]


async def explain(conn: asyncpg.Connection, probe: list[float], model_id: str, top_k: int) -> str:
    """Return the query plan. Used by tests and CI to prove the index is used."""
    encoded = encode_vector(probe)
    overfetch = max(top_k * OVERFETCH_FACTOR, OVERFETCH_MIN)
    rows = await conn.fetch(
        f"EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) {_search_sql(model_id)}",
        encoded,
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
