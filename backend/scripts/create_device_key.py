#!/usr/bin/env python
"""Provision a device key.

    python scripts/create_device_key.py --label FIELD-DEMO-01 --app field

Prints the raw key ONCE. Only sha256(pepper || key) is stored, so a database
dump yields no working keys — and a lost key cannot be recovered, only replaced.

Hand the key to the mobile developer through a secure channel. Never commit it,
never put it in a chat log, never bake it into a public build.
"""

from __future__ import annotations

import argparse
import asyncio
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.db import create_pool
from app.dependencies import hash_device_key


async def create(label: str, app: str, revoke: str | None) -> int:
    settings = get_settings()
    if not settings.database_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 2
    if not settings.device_key_pepper:
        print(
            "DEVICE_KEY_PEPPER is not set. Keys created without a pepper cannot "
            "be validated once one is configured.",
            file=sys.stderr,
        )
        return 2

    pool = await create_pool(settings)
    try:
        if revoke:
            result = await pool.execute("UPDATE device SET revoked = true WHERE label = $1", revoke)
            print(f"revoked: {result}")
            return 0

        raw_key = secrets.token_urlsafe(32)
        key_hash = hash_device_key(raw_key, settings.device_key_pepper)

        row = await pool.fetchrow(
            """
            INSERT INTO device (key_hash, label, app) VALUES ($1, $2, $3)
            RETURNING device_id
            """,
            key_hash,
            label,
            app,
        )
    finally:
        await pool.close()

    print("=" * 66)
    print(f"  device_id : {row['device_id']}")
    print(f"  label     : {label}")
    print(f"  app       : {app}")
    print()
    print(f"  X-Perigee-Device-Key: {raw_key}")
    print()
    print("  Shown once. Only the hash is stored. Deliver out of band.")
    print("=" * 66)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Provision a Perigee device key")
    parser.add_argument("--label", default="DEV-LOCAL-01")
    parser.add_argument("--app", choices=["field", "enroll"], default="field")
    parser.add_argument("--revoke", metavar="LABEL", help="revoke by label instead of creating")
    args = parser.parse_args()
    return asyncio.run(create(args.label, args.app, args.revoke))


if __name__ == "__main__":
    raise SystemExit(main())
