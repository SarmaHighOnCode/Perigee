"""Shared test fixtures.

DB-backed tests are marked `db` and SKIP when PERIGEE_TEST_DATABASE_URL is
unset, so the unit suite runs on a laptop with no Postgres. CI sets the
variable against a real pgvector service container — the vector path and the
triggers are exactly the parts that must not be mocked.
"""

from __future__ import annotations

import math
import os
import secrets
from collections.abc import AsyncIterator, Iterator

import pytest

# Must be set before app.config is imported anywhere.
os.environ.setdefault("DATASET_MODE", "synthetic")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DEVICE_KEY_PEPPER", "test-pepper")
os.environ.setdefault("ALLOWED_MODEL_IDS", "insightface/w600k_r50@1")

TEST_DB_URL = os.getenv("PERIGEE_TEST_DATABASE_URL", "")
MODEL_ID = "insightface/w600k_r50@1"
DIM = 512


def pytest_collection_modifyitems(config, items):
    if TEST_DB_URL:
        return
    skip = pytest.mark.skip(reason="PERIGEE_TEST_DATABASE_URL is not set")
    for item in items:
        if "db" in item.keywords:
            item.add_marker(skip)


def unit_vector(seed: int, dim: int = DIM) -> list[float]:
    """Deterministic L2-normalised vector without requiring numpy."""
    rng = __import__("random").Random(seed)
    values = [rng.gauss(0.0, 1.0) for _ in range(dim)]
    norm = math.sqrt(sum(v * v for v in values))
    return [v / norm for v in values]


def blend(a: list[float], b: list[float], weight_b: float) -> list[float]:
    """Normalised blend — builds a probe at a controlled similarity to `a`."""
    mixed = [x + weight_b * y for x, y in zip(a, b, strict=True)]
    norm = math.sqrt(sum(v * v for v in mixed))
    return [v / norm for v in mixed]


@pytest.fixture
def settings():
    from app.config import Settings

    return Settings(
        dataset_mode="synthetic",
        app_env="test",
        device_key_pepper="test-pepper",
        allowed_model_ids=MODEL_ID,
    )


@pytest.fixture
def app_client() -> Iterator[object]:
    """TestClient with no database. For contract/schema assertions only."""
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app()) as client:
        yield client


@pytest.fixture
async def pool() -> AsyncIterator[object]:
    import asyncpg

    from app.db import apply_migrations

    created = await asyncpg.create_pool(TEST_DB_URL, min_size=1, max_size=3)
    await apply_migrations(created)
    try:
        yield created
    finally:
        await created.close()


@pytest.fixture
async def clean_db(pool):
    """Truncate everything between tests. audit_event needs its append-only
    triggers disabled to be truncated at all — which is the point of them."""
    async with pool.acquire() as conn:
        await conn.execute("ALTER TABLE audit_event DISABLE TRIGGER USER")
        await conn.execute(
            "TRUNCATE search_decision, search_candidate, search_event, audit_event, "
            "face_embedding, media, person_case, edge, node_metric, case_record, "
            "person, offence, device RESTART IDENTITY CASCADE"
        )
        await conn.execute("ALTER TABLE audit_event ENABLE TRIGGER USER")
    return pool


@pytest.fixture
async def device_key(clean_db) -> tuple[str, object]:
    """Provision a device and return (raw_key, device_id)."""
    from app.dependencies import hash_device_key

    raw = secrets.token_urlsafe(24)
    async with clean_db.acquire() as conn:
        device_id = await conn.fetchval(
            "INSERT INTO device (key_hash, label, app) VALUES ($1,$2,$3) RETURNING device_id",
            hash_device_key(raw, "test-pepper"),
            "TEST-DEVICE",
            "field",
        )
    return raw, device_id


@pytest.fixture
async def api(clean_db, device_key):
    """httpx client wired to the app, reusing the test pool.

    Lifespan is bypassed deliberately: it would open a SECOND pool and re-run
    migrations, and the fixture already owns a migrated one. State that lifespan
    would normally set is injected here instead.
    """
    import httpx

    from app.config import get_settings
    from app.main import create_app
    from app.services.rate_limit import Limiters

    raw_key, _ = device_key
    application = create_app()
    application.state.pool = clean_db
    application.state.limiters = Limiters(get_settings())

    transport = httpx.ASGITransport(app=application)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={
            "X-Perigee-Device-Key": raw_key,
            "X-Perigee-Officer-Id": "OFFICER-TEST-01",
        },
    ) as client:
        yield client
