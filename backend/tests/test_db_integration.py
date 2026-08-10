"""Database integration: migrations, pgvector, triggers, audit chain.

Marked `db`. Skips without PERIGEE_TEST_DATABASE_URL; CI runs it against a real
pgvector/pgvector:pg17 service container.

Mocking this layer would leave the most failure-prone parts of the system —
the index expression match, the pending-decision trigger, the audit chain —
completely untested.
"""

from __future__ import annotations

import pytest

from app.db import (
    MigrationDriftError,
    apply_migrations,
    checksum,
    discover_migrations,
    encode_vector,
)
from app.services import audit_chain, vector_search
from tests.conftest import MODEL_ID, blend, unit_vector

pytestmark = pytest.mark.db


# ---------------------------------------------------------------------------
# migrations
# ---------------------------------------------------------------------------


async def test_migrations_are_idempotent(pool):
    assert await apply_migrations(pool) == []


async def test_every_migration_is_recorded(pool):
    async with pool.acquire() as conn:
        recorded = {r["version"] for r in await conn.fetch("SELECT version FROM schema_migration")}
    assert {v for v, _ in discover_migrations()} <= recorded


async def test_checksum_drift_is_detected(pool):
    """Editing an applied migration must refuse to start, not diverge quietly."""
    version, path = discover_migrations()[1]
    async with pool.acquire() as conn:
        original = await conn.fetchval(
            "SELECT checksum FROM schema_migration WHERE version = $1", version
        )
        await conn.execute(
            "UPDATE schema_migration SET checksum = $1 WHERE version = $2", "deadbeef", version
        )
    try:
        with pytest.raises(MigrationDriftError):
            await apply_migrations(pool)
    finally:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE schema_migration SET checksum = $1 WHERE version = $2", original, version
            )
    assert checksum(path) == original


async def test_extensions_present(clean_db):
    async with clean_db.acquire() as conn:
        names = {r["extname"] for r in await conn.fetch("SELECT extname FROM pg_extension")}
    assert {"vector", "pgcrypto"} <= names


# ---------------------------------------------------------------------------
# pgvector
# ---------------------------------------------------------------------------


async def _seed_embeddings(conn, count: int = 400) -> list[str]:
    person_ids = []
    for i in range(count):
        pid = await conn.fetchval(
            """
            INSERT INTO person (full_name, masked_name, age_band, district, dataset_mode)
            VALUES ($1,$2,'26-35','Test District','synthetic') RETURNING person_id
            """,
            f"Person {i}",
            f"P***** {i}",
        )
        await conn.execute(
            """
            INSERT INTO face_embedding (person_id, model_id, embedding, quality_score)
            VALUES ($1,$2,$3::text::vector(512),0.9)
            """,
            pid,
            MODEL_ID,
            encode_vector(unit_vector(1000 + i)),
        )
        person_ids.append(str(pid))
    await conn.execute("ANALYZE face_embedding")
    return person_ids


async def test_hnsw_index_is_used(clean_db):
    """Prove the HNSW index is USABLE by this query.

    Usable, not chosen. Those are different properties and only one of them is
    a property of this code.

    At test scale the planner will not choose it, and is right not to: 400 rows
    is a `cost=0.00..15.00` sequential scan, cheaper than any index traversal.
    Asserting the index is chosen here would be asserting something about
    Postgres's cost model on a tiny table, and it would fail for a reason that
    is not a defect. That check belongs at realistic volume, and lives in the
    `migrate-and-seed` CI job.

    What a code change CAN break is usability: if the ORDER BY expression drifts
    from the index expression, or the partial-index predicate stops matching,
    the index becomes unusable and the system silently scans more of the table
    forever. Disabling the sequential and bitmap paths isolates exactly that —
    they become expensive, not impossible, so the planner still refuses the
    HNSW index if it genuinely cannot serve the query. Seeing it in the plan
    therefore proves usability.
    """
    async with clean_db.acquire() as conn:
        await _seed_embeddings(conn, 400)
        async with conn.transaction():
            # SET LOCAL: dies with the transaction, so it cannot leak onto a
            # pooled connection and affect an unrelated query.
            await conn.execute("SET LOCAL enable_seqscan = off")
            await conn.execute("SET LOCAL enable_bitmapscan = off")
            plan = await vector_search.explain(conn, unit_vector(7), MODEL_ID, 5)

    assert "idx_fe_hnsw_w600k_r50" in plan, (
        "HNSW index is NOT USABLE by the search query. Two causes, both silent "
        "in production -- the API keeps returning correct answers while scanning\n"
        "progressively more of the table:\n"
        "  1. The ORDER BY expression drifted from the index expression\n"
        "     `(embedding::halfvec(512)) halfvec_cosine_ops`. Both casts must match.\n"
        "  2. The partial-index predicate stopped matching. The index carries\n"
        "     `WHERE model_id = '<literal>'`, so the query's predicate must be a\n"
        "     literal the planner can prove implies it. A `Bitmap Index Scan on\n"
        "     idx_fe_model` or a btree scan plus a Sort below is that failure.\n\n"
        f"Plan:\n{plan}"
    )


async def test_hnsw_index_exists_and_is_partial_per_model(clean_db):
    """Model isolation is what makes cross-model contamination impossible.

    A non-partial index would let a future model's vectors share the graph with
    this one, and vectors from different models are not comparable.
    """
    async with clean_db.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_fe_hnsw_w600k_r50'"
        )
    assert row is not None, "the HNSW index is missing"
    indexdef = row["indexdef"]
    assert "USING hnsw" in indexdef
    assert "halfvec_cosine_ops" in indexdef
    assert "WHERE (model_id =" in indexdef, f"index must be partial per model: {indexdef}"


async def test_search_returns_nearest_first(clean_db):
    async with clean_db.acquire() as conn:
        await _seed_embeddings(conn, 100)
        target = unit_vector(1005)
        probe = blend(target, unit_vector(999), 0.35)

        results = await vector_search.search(conn, probe, MODEL_ID, 5)

    assert len(results) == 5
    similarities = [s for _, _, s in results]
    assert similarities == sorted(similarities, reverse=True)
    assert similarities[0] > 0.85, "a near-identical probe should score highly"


async def test_search_isolates_by_model_id(clean_db):
    """Vectors from a different model must never enter the result set."""
    async with clean_db.acquire() as conn:
        await _seed_embeddings(conn, 20)
        pid = await conn.fetchval(
            "INSERT INTO person (full_name, masked_name, dataset_mode) "
            "VALUES ('Other Model','O***** M****','synthetic') RETURNING person_id"
        )
        probe = unit_vector(4242)
        await conn.execute(
            """
            INSERT INTO face_embedding (person_id, model_id, embedding, quality_score)
            VALUES ($1,'other/model@9',$2::text::vector(512),0.9)
            """,
            pid,
            encode_vector(probe),
        )

        results = await vector_search.search(conn, probe, MODEL_ID, 5)

    assert str(pid) not in {p for p, _, _ in results}


async def test_search_returns_best_embedding_per_person(clean_db):
    """Multi-angle enrolment must not fill the candidate list with one person."""
    async with clean_db.acquire() as conn:
        pid = await conn.fetchval(
            "INSERT INTO person (full_name, masked_name, dataset_mode) "
            "VALUES ('Multi Angle','M***** A****','synthetic') RETURNING person_id"
        )
        base = unit_vector(31337)
        for i in range(4):
            await conn.execute(
                """
                INSERT INTO face_embedding (person_id, model_id, embedding, quality_score)
                VALUES ($1,$2,$3::text::vector(512),0.9)
                """,
                pid,
                MODEL_ID,
                encode_vector(blend(base, unit_vector(500 + i), 0.3)),
            )
        await _seed_embeddings(conn, 30)

        results = await vector_search.search(conn, base, MODEL_ID, 5)

    person_ids = [p for p, _, _ in results]
    assert len(person_ids) == len(set(person_ids)), "one person appeared more than once"


# ---------------------------------------------------------------------------
# triggers
# ---------------------------------------------------------------------------


async def test_pending_decision_trigger_blocks_the_fourth_search(clean_db, device_key):
    """The human-in-the-loop brake, enforced in the DATABASE.

    Application logic can be refactored away. A trigger cannot be, without
    someone noticing.
    """
    import asyncpg

    _, device_id = device_key
    async with clean_db.acquire() as conn:
        for _ in range(3):
            await conn.execute(
                """
                INSERT INTO search_event (
                    device_id, officer_id, reason_code, model_id, probe_quality,
                    threshold_in_effect, band_config
                ) VALUES ($1,'OFF-1','training',$2,0.9,0.42,'{}'::jsonb)
                """,
                device_id,
                MODEL_ID,
            )

        with pytest.raises(asyncpg.exceptions.CheckViolationError, match="PENDING_DECISION_LIMIT"):
            await conn.execute(
                """
                INSERT INTO search_event (
                    device_id, officer_id, reason_code, model_id, probe_quality,
                    threshold_in_effect, band_config
                ) VALUES ($1,'OFF-1','training',$2,0.9,0.42,'{}'::jsonb)
                """,
                device_id,
                MODEL_ID,
            )


async def test_adjudicating_frees_the_brake(clean_db, device_key):
    _, device_id = device_key
    async with clean_db.acquire() as conn:
        ids = []
        for _ in range(3):
            ids.append(
                await conn.fetchval(
                    """
                    INSERT INTO search_event (
                        device_id, officer_id, reason_code, model_id, probe_quality,
                        threshold_in_effect, band_config
                    ) VALUES ($1,'OFF-1','training',$2,0.9,0.42,'{}'::jsonb)
                    RETURNING search_id
                    """,
                    device_id,
                    MODEL_ID,
                )
            )
        await conn.execute("UPDATE search_event SET status='CLOSED' WHERE search_id=$1", ids[0])

        # Now permitted again.
        await conn.execute(
            """
            INSERT INTO search_event (
                device_id, officer_id, reason_code, model_id, probe_quality,
                threshold_in_effect, band_config
            ) VALUES ($1,'OFF-1','training',$2,0.9,0.42,'{}'::jsonb)
            """,
            device_id,
            MODEL_ID,
        )


async def test_decision_is_write_once(clean_db, device_key):
    import asyncpg

    _, device_id = device_key
    async with clean_db.acquire() as conn:
        search_id = await conn.fetchval(
            """
            INSERT INTO search_event (
                device_id, officer_id, reason_code, model_id, probe_quality,
                threshold_in_effect, band_config
            ) VALUES ($1,'OFF-1','training',$2,0.9,0.42,'{}'::jsonb)
            RETURNING search_id
            """,
            device_id,
            MODEL_ID,
        )
        await conn.execute(
            "INSERT INTO search_decision (search_id, decision, officer_id) "
            "VALUES ($1,'NO_MATCH','OFF-1')",
            search_id,
        )
        # A second decision of any valid shape must fail on the primary key.
        # (Using CONFIRMED here would trip the confirmed_person_id CHECK first
        # and pass for the wrong reason.)
        with pytest.raises(asyncpg.exceptions.UniqueViolationError):
            await conn.execute(
                "INSERT INTO search_decision (search_id, decision, officer_id) "
                "VALUES ($1,'INCONCLUSIVE','OFF-1')",
                search_id,
            )


async def test_confirmed_requires_a_person(clean_db, device_key):
    """'CONFIRMED with nobody confirmed' is unrepresentable."""
    import asyncpg

    _, device_id = device_key
    async with clean_db.acquire() as conn:
        search_id = await conn.fetchval(
            """
            INSERT INTO search_event (
                device_id, officer_id, reason_code, model_id, probe_quality,
                threshold_in_effect, band_config
            ) VALUES ($1,'OFF-1','training',$2,0.9,0.42,'{}'::jsonb)
            RETURNING search_id
            """,
            device_id,
            MODEL_ID,
        )
        with pytest.raises(asyncpg.exceptions.CheckViolationError):
            await conn.execute(
                "INSERT INTO search_decision (search_id, decision, officer_id) "
                "VALUES ($1,'CONFIRMED','OFF-1')",
                search_id,
            )


async def test_edge_requires_canonical_ordering(clean_db):
    """Undirected edges are stored once, so UNIQUE actually prevents dupes."""
    import asyncpg

    async with clean_db.acquire() as conn:
        a = await conn.fetchval(
            "INSERT INTO person (full_name, masked_name, dataset_mode) "
            "VALUES ('A','A','synthetic') RETURNING person_id"
        )
        b = await conn.fetchval(
            "INSERT INTO person (full_name, masked_name, dataset_mode) "
            "VALUES ('B','B','synthetic') RETURNING person_id"
        )
        lo, hi = sorted([a, b], key=str)
        await conn.execute(
            "INSERT INTO edge (src_person_id, dst_person_id, edge_type, weight) "
            "VALUES ($1,$2,'co_accused',0.6)",
            lo,
            hi,
        )
        with pytest.raises(asyncpg.exceptions.CheckViolationError):
            await conn.execute(
                "INSERT INTO edge (src_person_id, dst_person_id, edge_type, weight) "
                "VALUES ($1,$2,'family',0.5)",
                hi,
                lo,
            )


# ---------------------------------------------------------------------------
# audit chain
# ---------------------------------------------------------------------------


async def test_audit_is_append_only(clean_db):
    import asyncpg

    async with clean_db.acquire() as conn:
        async with conn.transaction():
            await audit_chain.append(
                conn,
                actor_type="system",
                actor_id="test",
                action="test.event",
                subject_type="test",
                subject_id="1",
            )
        for statement in (
            "UPDATE audit_event SET action = 'tampered'",
            "DELETE FROM audit_event",
        ):
            with pytest.raises(asyncpg.exceptions.RaiseError, match="append-only"):
                await conn.execute(statement)


async def test_audit_chain_verifies_over_twenty_events(clean_db):
    """The acceptance criterion, and the closing move of the live demo."""
    async with clean_db.acquire() as conn:
        for i in range(25):
            async with conn.transaction():
                await audit_chain.append(
                    conn,
                    actor_type="officer",
                    actor_id=f"OFFICER-{i % 3}",
                    action="search.executed",
                    subject_type="search",
                    subject_id=f"search-{i}",
                    payload={"candidate_count": i % 5},
                )

        result = await audit_chain.verify(conn)

    assert result["verified"] is True
    assert result["checked"] == 25
    assert result["first_bad_seq"] is None
    assert result["head_hash"]


async def test_audit_chain_detects_tampering(clean_db):
    """Tamper-evidence, demonstrated. Triggers are disabled to simulate an
    attacker with database-level access — which is exactly the threat the hash
    chain exists to detect, since triggers alone cannot stop a superuser."""
    async with clean_db.acquire() as conn:
        for i in range(6):
            async with conn.transaction():
                await audit_chain.append(
                    conn,
                    actor_type="officer",
                    actor_id="OFFICER-1",
                    action="search.executed",
                    subject_type="search",
                    subject_id=f"s-{i}",
                )

        await conn.execute("ALTER TABLE audit_event DISABLE TRIGGER USER")
        await conn.execute("UPDATE audit_event SET actor_id = 'SOMEONE-ELSE' WHERE seq = 3")
        await conn.execute("ALTER TABLE audit_event ENABLE TRIGGER USER")

        result = await audit_chain.verify(conn)

    assert result["verified"] is False
    assert result["first_bad_seq"] == 3
    assert result["head_hash"] is None


async def test_audit_verify_on_empty_chain(clean_db):
    async with clean_db.acquire() as conn:
        result = await audit_chain.verify(conn)
    assert result["verified"] is True
    assert result["checked"] == 0
