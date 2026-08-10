"""Append-only, hash-chained audit log.

    row_hash = sha256(prev_hash || canonical_json(row))

Construction is taken from KAVAL's `audit_events` so both systems verify
identically. The canonical form is pinned by a committed test vector in
tests/test_audit_chain.py — any drift in key ordering, whitespace, or timestamp
precision changes every hash and silently breaks cross-verification.

Tamper-EVIDENT, not tamper-proof. See docs/08-SECURITY.md §3.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import asyncpg

GENESIS_PREV_HASH = b"\x00" * 32

# Serialises appends so the chain cannot fork under concurrency.
AUDIT_LOCK_KEY = 4815162343


def canonical_timestamp(value: datetime) -> str:
    """UTC, ISO-8601, exactly milliseconds: '2026-08-10T14:22:31.482Z'.

    Fixed precision matters — Postgres returns microseconds and Python's
    isoformat() drops trailing zeros, so both would produce unstable strings.
    """
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    utc = value.astimezone(UTC)
    return f"{utc.strftime('%Y-%m-%dT%H:%M:%S')}.{utc.microsecond // 1000:03d}Z"


def _default(obj: Any) -> Any:
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, datetime):
        return canonical_timestamp(obj)
    raise TypeError(f"{type(obj).__name__} is not serialisable in an audit payload")


def canonical_json(data: dict[str, Any]) -> bytes:
    """Sorted keys, no whitespace, UTF-8. Deterministic across implementations."""
    return json.dumps(
        data,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=_default,
    ).encode("utf-8")


def build_row(
    *,
    seq: int,
    occurred_at: datetime,
    actor_type: str,
    actor_id: str,
    action: str,
    subject_type: str,
    subject_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """The exact field set that is hashed. Order here is irrelevant (keys are
    sorted); membership is not — adding a field changes every subsequent hash."""
    return {
        "seq": seq,
        "occurred_at": canonical_timestamp(occurred_at),
        "actor_type": actor_type,
        "actor_id": actor_id,
        "action": action,
        "subject_type": subject_type,
        "subject_id": subject_id,
        "payload": payload,
    }


def compute_row_hash(prev_hash: bytes, row: dict[str, Any]) -> bytes:
    return hashlib.sha256(prev_hash + canonical_json(row)).digest()


async def append(
    conn: asyncpg.Connection,
    *,
    actor_type: str,
    actor_id: str,
    action: str,
    subject_type: str,
    subject_id: str,
    payload: dict[str, Any] | None = None,
    device_id: UUID | None = None,
) -> dict[str, Any]:
    """Append one event.

    MUST be called inside an open transaction so the audit write commits or
    rolls back with the thing it describes. An audit log that records events
    which did not happen is worse than none.
    """
    payload = payload or {}

    # Transaction-scoped: released at COMMIT/ROLLBACK, so a crash cannot wedge
    # the chain.
    await conn.execute("SELECT pg_advisory_xact_lock($1)", AUDIT_LOCK_KEY)

    prev = await conn.fetchrow("SELECT seq, row_hash FROM audit_event ORDER BY seq DESC LIMIT 1")
    prev_hash: bytes = prev["row_hash"] if prev else GENESIS_PREV_HASH

    seq_value = await conn.fetchval("SELECT nextval(pg_get_serial_sequence('audit_event', 'seq'))")
    if seq_value is None:
        raise RuntimeError("audit_event sequence returned no value")
    seq = int(seq_value)
    occurred_at = datetime.now(UTC)

    row = build_row(
        seq=seq,
        occurred_at=occurred_at,
        actor_type=actor_type,
        actor_id=actor_id,
        action=action,
        subject_type=subject_type,
        subject_id=subject_id,
        payload=payload,
    )
    row_hash = compute_row_hash(prev_hash, row)

    await conn.execute(
        """
        INSERT INTO audit_event (
            seq, occurred_at, actor_type, actor_id, device_id,
            action, subject_type, subject_id, payload, prev_hash, row_hash
        )
        OVERRIDING SYSTEM VALUE
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
        """,
        seq,
        occurred_at,
        actor_type,
        actor_id,
        device_id,
        action,
        subject_type,
        subject_id,
        payload,
        prev_hash,
        row_hash,
    )

    return {"seq": seq, "row_hash": row_hash.hex(), "occurred_at": occurred_at}


async def verify(
    conn: asyncpg.Connection, from_seq: int | None = None, to_seq: int | None = None
) -> dict[str, Any]:
    """Recompute the chain and report the first inconsistency.

    Verifying a partial range trusts the starting row's stored prev_hash; a
    full verification (from_seq=None) anchors on the genesis value instead.
    """
    rows = await conn.fetch(
        """
        SELECT seq, occurred_at, actor_type, actor_id, action,
               subject_type, subject_id, payload, prev_hash, row_hash
        FROM   audit_event
        WHERE  ($1::bigint IS NULL OR seq >= $1)
          AND  ($2::bigint IS NULL OR seq <= $2)
        ORDER  BY seq
        """,
        from_seq,
        to_seq,
    )

    if not rows:
        return {
            "verified": True,
            "from_seq": from_seq,
            "to_seq": to_seq,
            "checked": 0,
            "first_bad_seq": None,
            "head_hash": None,
        }

    expected_prev = GENESIS_PREV_HASH if from_seq in (None, 1) else rows[0]["prev_hash"]
    first_bad: int | None = None

    for record in rows:
        if record["prev_hash"] != expected_prev:
            first_bad = record["seq"]
            break

        row = build_row(
            seq=record["seq"],
            occurred_at=record["occurred_at"],
            actor_type=record["actor_type"],
            actor_id=record["actor_id"],
            action=record["action"],
            subject_type=record["subject_type"],
            subject_id=record["subject_id"],
            payload=record["payload"] or {},
        )
        if compute_row_hash(expected_prev, row) != record["row_hash"]:
            first_bad = record["seq"]
            break

        expected_prev = record["row_hash"]

    return {
        "verified": first_bad is None,
        "from_seq": rows[0]["seq"],
        "to_seq": rows[-1]["seq"],
        "checked": len(rows),
        "first_bad_seq": first_bad,
        "head_hash": rows[-1]["row_hash"].hex() if first_bad is None else None,
    }
