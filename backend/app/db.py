"""Database pool, migration runner, and pgvector wire encoding.

No ORM. Raw SQL is transparent, reviewable, and predictable around extension
DDL and CREATE INDEX — which matters more here than the ergonomics an ORM buys.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import asyncpg

from app.config import Settings

log = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"

# Arbitrary but fixed. Serialises concurrent migration runs so two instances
# booting simultaneously cannot both apply 0002.
MIGRATION_LOCK_KEY = 4815162342

_BOOTSTRAP = """
CREATE TABLE IF NOT EXISTS schema_migration (
    version    text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now(),
    checksum   text NOT NULL
);
"""


def encode_vector(values: Sequence[float]) -> str:
    """pgvector's text input format: '[1,2,3]'.

    Sent as text and cast in SQL (`$1::vector(512)`). This avoids depending on
    asyncpg codec registration, which has to be re-applied on every pooled
    connection and is easy to lose after a reconnect.
    """
    return "[" + ",".join(repr(float(v)) for v in values) + "]"


def parse_vector(raw: str | None) -> list[float] | None:
    if raw is None:
        return None
    return [float(x) for x in raw.strip("[]").split(",") if x]


async def _init_connection(conn: asyncpg.Connection) -> None:
    """Per-connection setup. jsonb in/out as Python objects."""
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


async def create_pool(settings: Settings) -> asyncpg.Pool:
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not set")
    return await asyncpg.create_pool(
        settings.database_url,
        min_size=settings.db_pool_min,
        max_size=settings.db_pool_max,
        init=_init_connection,
        command_timeout=30,
    )


def discover_migrations() -> list[tuple[str, Path]]:
    """(version, path) pairs sorted by filename. Version is the stem."""
    if not MIGRATIONS_DIR.is_dir():
        return []
    return [(p.stem, p) for p in sorted(MIGRATIONS_DIR.glob("*.sql"))]


def checksum(path: Path) -> str:
    # Normalise line endings so a Windows checkout and a Linux CI runner agree.
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


class MigrationDriftError(RuntimeError):
    """An already-applied migration file has been edited.

    A nasty class of bug: two developers' databases silently diverge because a
    migration was changed after it ran somewhere. Better to refuse to start.
    """


async def apply_migrations(pool: asyncpg.Pool) -> list[str]:
    """Apply pending migrations. Idempotent. Returns versions applied now."""
    applied_now: list[str] = []

    async with pool.acquire() as conn:
        await conn.execute(f"SELECT pg_advisory_lock({MIGRATION_LOCK_KEY})")
        try:
            await conn.execute(_BOOTSTRAP)
            recorded: dict[str, str] = {
                r["version"]: r["checksum"]
                for r in await conn.fetch("SELECT version, checksum FROM schema_migration")
            }

            for version, path in discover_migrations():
                digest = checksum(path)

                if version in recorded:
                    if recorded[version] != digest:
                        raise MigrationDriftError(
                            f"migration {version} was modified after it was applied "
                            f"(recorded {recorded[version][:12]}, file {digest[:12]})"
                        )
                    continue

                log.info("applying migration %s", version)
                async with conn.transaction():
                    await conn.execute(path.read_text(encoding="utf-8"))
                    await conn.execute(
                        "INSERT INTO schema_migration (version, checksum) VALUES ($1, $2)",
                        version,
                        digest,
                    )
                applied_now.append(version)
        finally:
            await conn.execute(f"SELECT pg_advisory_unlock({MIGRATION_LOCK_KEY})")

    return applied_now


async def current_version(conn: asyncpg.Connection) -> str | None:
    row = await conn.fetchrow("SELECT version FROM schema_migration ORDER BY version DESC LIMIT 1")
    return row["version"] if row else None


async def sync_system_config(pool: asyncpg.Pool, settings: Settings) -> None:
    """Push env-derived limits into the table the DB trigger reads.

    Keeps the application and the pending-decision trigger in agreement about
    the limit, with env as the single source of truth. The trigger stays
    authoritative — this only tells it what the configured value is.
    """
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE system_config SET pending_decision_limit = $1, updated_at = now() WHERE id",
            settings.search_pending_limit,
        )


def is_pending_limit_violation(exc: BaseException) -> bool:
    """The pending-decision trigger surfaces as a check violation."""
    return isinstance(exc, asyncpg.exceptions.CheckViolationError) and "PENDING_DECISION_LIMIT" in (
        str(exc) or ""
    )


def require_row(row: asyncpg.Record | None, what: str) -> asyncpg.Record:
    """Narrow an always-present row (INSERT ... RETURNING, aggregate SELECT).

    Raises rather than asserts: `assert` is stripped under `python -O`, and a
    missing row here means the database did something impossible, which should
    surface as a 500 rather than an AttributeError three frames later.
    """
    if row is None:
        raise RuntimeError(f"expected exactly one row from {what}")
    return row


async def fetch_one(pool: asyncpg.Pool, query: str, *args: Any) -> asyncpg.Record | None:
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)


async def fetch_all(pool: asyncpg.Pool, query: str, *args: Any) -> list[asyncpg.Record]:
    async with pool.acquire() as conn:
        return list(await conn.fetch(query, *args))
