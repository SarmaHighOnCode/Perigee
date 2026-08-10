"""Audit chain canonical form and hashing.

The committed test vector below PINS the canonical serialisation. If a change
to key ordering, whitespace, or timestamp precision breaks it, that change
would also invalidate every hash ever written and break cross-verification with
KAVAL. Do not update the expected value to make a failure go away — work out
why the serialisation moved.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta, timezone

import pytest

from app.services.audit_chain import (
    GENESIS_PREV_HASH,
    build_row,
    canonical_json,
    canonical_timestamp,
    compute_row_hash,
)

FIXED_TS = datetime(2026, 8, 10, 14, 22, 31, 482000, tzinfo=UTC)


def test_canonical_timestamp_is_millisecond_precision():
    assert canonical_timestamp(FIXED_TS) == "2026-08-10T14:22:31.482Z"


def test_canonical_timestamp_pads_milliseconds():
    """Python's isoformat() drops trailing zeros; a hash cannot tolerate that."""
    ts = datetime(2026, 1, 2, 3, 4, 5, 7000, tzinfo=UTC)
    assert canonical_timestamp(ts) == "2026-01-02T03:04:05.007Z"


def test_canonical_timestamp_truncates_microseconds():
    ts = datetime(2026, 1, 1, 0, 0, 0, 123999, tzinfo=UTC)
    assert canonical_timestamp(ts) == "2026-01-01T00:00:00.123Z"


def test_canonical_timestamp_converts_to_utc():
    ist = timezone(timedelta(hours=5, minutes=30))
    assert canonical_timestamp(datetime(2026, 8, 10, 19, 52, 31, 482000, tzinfo=ist)) == (
        "2026-08-10T14:22:31.482Z"
    )


def test_canonical_timestamp_assumes_naive_is_utc():
    naive = datetime(2026, 8, 10, 14, 22, 31, 482000)
    assert canonical_timestamp(naive) == "2026-08-10T14:22:31.482Z"


def test_canonical_json_sorts_keys_and_omits_whitespace():
    assert canonical_json({"b": 1, "a": 2}) == b'{"a":2,"b":1}'


def test_canonical_json_is_insertion_order_independent():
    assert canonical_json({"z": 1, "a": {"y": 2, "b": 3}}) == canonical_json(
        {"a": {"b": 3, "y": 2}, "z": 1}
    )


def test_canonical_json_rejects_unserialisable_payload():
    with pytest.raises(TypeError):
        canonical_json({"bad": object()})


# ---------------------------------------------------------------------------
# THE PINNED VECTOR
# ---------------------------------------------------------------------------

EXPECTED_CANONICAL = (
    b'{"action":"search.executed","actor_id":"OFFICER-1147","actor_type":"officer",'
    b'"occurred_at":"2026-08-10T14:22:31.482Z","payload":{"candidate_count":3,'
    b'"model_id":"insightface/w600k_r50@1"},"seq":1,"subject_id":"abc-123",'
    b'"subject_type":"search"}'
)


def _reference_row() -> dict:
    return build_row(
        seq=1,
        occurred_at=FIXED_TS,
        actor_type="officer",
        actor_id="OFFICER-1147",
        action="search.executed",
        subject_type="search",
        subject_id="abc-123",
        payload={"model_id": "insightface/w600k_r50@1", "candidate_count": 3},
    )


def test_canonical_form_is_pinned():
    assert canonical_json(_reference_row()) == EXPECTED_CANONICAL


def test_genesis_hash_is_pinned():
    expected = hashlib.sha256(GENESIS_PREV_HASH + EXPECTED_CANONICAL).hexdigest()
    assert compute_row_hash(GENESIS_PREV_HASH, _reference_row()).hex() == expected


def test_genesis_prev_hash_is_32_zero_bytes():
    assert bytes(32) == GENESIS_PREV_HASH
    assert len(GENESIS_PREV_HASH) == 32


def test_hash_changes_when_any_field_changes():
    base = compute_row_hash(GENESIS_PREV_HASH, _reference_row())
    for field, value in [
        ("actor_id", "OFFICER-9999"),
        ("action", "search.decided"),
        ("subject_id", "abc-124"),
        ("seq", 2),
    ]:
        row = _reference_row()
        row[field] = value
        assert compute_row_hash(GENESIS_PREV_HASH, row) != base, field


def test_hash_changes_when_payload_changes():
    row = _reference_row()
    row["payload"] = {"model_id": "insightface/w600k_r50@1", "candidate_count": 4}
    assert compute_row_hash(GENESIS_PREV_HASH, row) != compute_row_hash(
        GENESIS_PREV_HASH, _reference_row()
    )


def test_chain_links_are_order_dependent():
    """Rewriting history must break every downstream hash — that is the whole
    security property."""
    first = compute_row_hash(GENESIS_PREV_HASH, _reference_row())
    second_row = _reference_row()
    second_row["seq"] = 2
    assert compute_row_hash(first, second_row) != compute_row_hash(GENESIS_PREV_HASH, second_row)
