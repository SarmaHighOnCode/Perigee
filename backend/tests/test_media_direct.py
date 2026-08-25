"""POST /v1/person/{id}/media/direct — the Postgres-backed mugshot fallback.

Exists because Cloudflare requires a payment method on file for R2 even
within its free tier, and this deployment has none. Only sensible at small
scale: image bytes transit this service here, which the R2 path exists
specifically to avoid.

Marked `db`; runs against real Postgres in CI.
"""

from __future__ import annotations

import base64
import hashlib

import pytest

pytestmark = pytest.mark.db

# JPEG magic bytes (0xFFD8...0xFFD9) around synthetic payload bytes. Deliberately
# not a decodable image: nothing under test decodes it as one - these tests
# verify storage, retrieval, and hash integrity, not JPEG validity.
_TINY_JPEG = b"\xff\xd8\xff\xe0" + bytes(range(256)) * 3 + b"\xff\xd9"


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


async def _person(conn, name: str = "Direct Media Person") -> str:
    return str(
        await conn.fetchval(
            "INSERT INTO person (full_name, masked_name, dataset_mode) "
            "VALUES ($1,$2,'synthetic') RETURNING person_id",
            name,
            "D**** M**** P*****",
        )
    )


def _payload(**overrides) -> dict:
    body = {
        "capture_angle": "frontal",
        "content_type": "image/jpeg",
        "is_primary": True,
        "image_base64": _b64(_TINY_JPEG),
        "sha256": _sha256(_TINY_JPEG),
        "exif_stripped": True,
    }
    body.update(overrides)
    return body


async def test_stores_bytes_and_marks_committed_in_one_call(api, clean_db):
    async with clean_db.acquire() as conn:
        person_id = await _person(conn)

    response = await api.post(f"/v1/person/{person_id}/media/direct", json=_payload())
    assert response.status_code == 201
    body = response.json()
    assert body["committed"] is True
    assert body["bytes"] == len(_TINY_JPEG)

    async with clean_db.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT r2_key, image_bytes, content_type, committed FROM media WHERE person_id = $1",
            person_id,
        )
    assert row["r2_key"] is None
    assert bytes(row["image_bytes"]) == _TINY_JPEG
    assert row["content_type"] == "image/jpeg"
    assert row["committed"] is True


async def test_the_mugshot_comes_back_as_a_data_uri_on_person_detail(api, clean_db):
    async with clean_db.acquire() as conn:
        person_id = await _person(conn)

    await api.post(f"/v1/person/{person_id}/media/direct", json=_payload())

    from tests.conftest import MODEL_ID, unit_vector

    search_id = (
        await api.post(
            "/v1/search",
            json={
                "embedding": unit_vector(4242),
                "model_id": MODEL_ID,
                "quality": {"score": 0.87, "det_score": 0.96, "face_px": 224},
                "reason_code": "browse",
                "top_k": 1,
            },
        )
    ).json()["search_id"]

    detail = await api.get(f"/v1/person/{person_id}?search_id={search_id}")
    assert detail.status_code == 200
    media = detail.json()["media"]
    assert len(media) == 1
    assert media[0]["url"].startswith("data:image/jpeg;base64,")
    # The data URI must decode back to the exact bytes that were stored.
    decoded = base64.b64decode(media[0]["url"].split(",", 1)[1])
    assert decoded == _TINY_JPEG


async def test_search_candidates_carry_the_mugshot_too(api, clean_db):
    """The regression this exists for: a mugshot saved via Enroll must show
    up on Field's results screen, not just on the person-detail page."""
    from tests.conftest import MODEL_ID, encode_vector, unit_vector

    async with clean_db.acquire() as conn:
        person_id = await _person(conn, "Findable Person")
        await conn.execute(
            "INSERT INTO face_embedding (person_id, model_id, embedding, quality_score) "
            "VALUES ($1,$2,$3::text::vector(512),0.9)",
            person_id,
            MODEL_ID,
            encode_vector(unit_vector(7000)),
        )

    await api.post(f"/v1/person/{person_id}/media/direct", json=_payload())

    response = await api.post(
        "/v1/search",
        json={
            "embedding": unit_vector(7000),
            "model_id": MODEL_ID,
            "quality": {"score": 0.87, "det_score": 0.96, "face_px": 224},
            "reason_code": "training",
            "top_k": 1,
        },
    )
    candidate = response.json()["candidates"][0]
    assert candidate["person_id"] == person_id
    assert candidate["mugshot_url"].startswith("data:image/jpeg;base64,")


async def test_rejects_a_sha256_that_does_not_match_the_bytes(api, clean_db):
    async with clean_db.acquire() as conn:
        person_id = await _person(conn)

    response = await api.post(
        f"/v1/person/{person_id}/media/direct",
        json=_payload(sha256=_sha256(b"different bytes entirely, not the jpeg")),
    )
    assert response.status_code == 400
    assert "sha256" in response.json()["error"]["message"]

    async with clean_db.acquire() as conn:
        count = await conn.fetchval("SELECT count(*) FROM media WHERE person_id = $1", person_id)
    assert count == 0


async def test_rejects_an_oversized_image(api, clean_db):
    async with clean_db.acquire() as conn:
        person_id = await _person(conn)

    from app.config import get_settings

    oversized = b"\xff" * (get_settings().media_max_bytes + 1)
    response = await api.post(
        f"/v1/person/{person_id}/media/direct",
        json=_payload(image_base64=_b64(oversized), sha256=_sha256(oversized)),
    )
    assert response.status_code == 400
    assert response.json()["error"]["detail"]["max_bytes"] == get_settings().media_max_bytes


async def test_rejects_invalid_base64(api, clean_db):
    async with clean_db.acquire() as conn:
        person_id = await _person(conn)

    response = await api.post(
        f"/v1/person/{person_id}/media/direct",
        json=_payload(image_base64="not valid base64!!! ==="),
    )
    assert response.status_code == 400


async def test_404s_for_a_person_that_does_not_exist(api):
    import uuid

    response = await api.post(f"/v1/person/{uuid.uuid4()}/media/direct", json=_payload())
    assert response.status_code == 404


async def test_writes_an_audit_entry(api, clean_db):
    async with clean_db.acquire() as conn:
        person_id = await _person(conn)

    await api.post(f"/v1/person/{person_id}/media/direct", json=_payload())

    audit = (await api.get("/v1/audit?subject_type=person")).json()
    assert any(
        e["action"] == "person.media_committed" and e["subject_id"] == person_id
        for e in audit["entries"]
    )
