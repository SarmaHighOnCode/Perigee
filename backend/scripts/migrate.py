#!/usr/bin/env python
"""Apply pending migrations. Idempotent.

python scripts/migrate.py            # apply
python scripts/migrate.py --status   # show what is applied
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.db import (
    MigrationDriftError,
    apply_migrations,
    checksum,
    create_pool,
    discover_migrations,
)


async def show_status() -> int:
    settings = get_settings()
    pool = await create_pool(settings)
    try:
        rows = await pool.fetch("SELECT version, applied_at, checksum FROM schema_migration")
        applied = {r["version"]: r["checksum"] for r in rows}
    except Exception:
        applied = {}
    finally:
        await pool.close()

    print(f"{'VERSION':<28} {'STATE':<10} CHECKSUM")
    for version, path in discover_migrations():
        digest = checksum(path)
        if version not in applied:
            state = "pending"
        elif applied[version] != digest:
            state = "DRIFT"
        else:
            state = "applied"
        print(f"{version:<28} {state:<10} {digest[:16]}")
    return 0


async def run() -> int:
    settings = get_settings()
    if not settings.database_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 2

    pool = await create_pool(settings)
    try:
        applied = await apply_migrations(pool)
    except MigrationDriftError as exc:
        print(f"MIGRATION DRIFT: {exc}", file=sys.stderr)
        print(
            "\nAn already-applied migration file was edited. Databases have "
            "silently diverged. Write a NEW migration instead of editing an old one.",
            file=sys.stderr,
        )
        return 3
    finally:
        await pool.close()

    if applied:
        for version in applied:
            print(f"applied {version}")
    else:
        print("no pending migrations")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Perigee migration runner")
    parser.add_argument("--status", action="store_true", help="show migration status")
    args = parser.parse_args()
    return asyncio.run(show_status() if args.status else run())


if __name__ == "__main__":
    raise SystemExit(main())
