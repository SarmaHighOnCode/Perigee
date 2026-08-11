"""End-to-end API flow — the immediate milestone from the handoff.

    config -> search -> candidates -> decision -> closed -> audit verifies

Marked `db`; runs against real Postgres in CI.
"""

from __future__ import annotations

import pytest

from app.db import encode_vector
from tests.conftest import MODEL_ID, blend, unit_vector

pytestmark = pytest.mark.db


async def _enrol(conn, count: int, anchor_seed: int = 9001) -> list[str]:
    """Enrol `count` people; person 0 is anchored near `anchor_seed`."""
    ids = []
    for i in range(count):
        pid = await conn.fetchval(
            """
            INSERT INTO person (full_name, masked_name, age_band, district, dataset_mode)
            VALUES ($1,$2,'26-35','Bengaluru South','synthetic') RETURNING person_id
            """,
            f"Synthetic Person {i}",
            f"S***** P***** {i}",
        )
        vector = unit_vector(anchor_seed) if i == 0 else unit_vector(anchor_seed + 100 + i)
        await conn.execute(
            """
            INSERT INTO face_embedding (person_id, model_id, embedding, quality_score)
            VALUES ($1,$2,$3::text::vector(512),0.85)
            """,
            pid,
            MODEL_ID,
            encode_vector(vector),
        )
        ids.append(str(pid))
    return ids


def _probe(vector: list[float], reason: str = "training") -> dict:
    return {
        "embedding": vector,
        "model_id": MODEL_ID,
        "quality": {"score": 0.87, "det_score": 0.96, "face_px": 224},
        "reason_code": reason,
        "top_k": 5,
    }


async def test_health_and_config(api):
    assert (await api.get("/healthz")).json()["dataset_mode"] == "synthetic"

    config = (await api.get("/v1/config")).json()
    assert MODEL_ID in config["allowed_model_ids"]
    assert config["bands"]["no_match"] < config["bands"]["weak"] < config["bands"]["review"]


async def test_full_loop_confirm(api, clean_db):
    async with clean_db.acquire() as conn:
        person_ids = await _enrol(conn, 12)

    near = blend(unit_vector(9001), unit_vector(4), 0.30)
    response = await api.post("/v1/search", json=_probe(near))
    assert response.status_code == 200, response.text

    body = response.json()
    assert body["status"] == "PENDING_DECISION"
    assert body["dataset_mode"] == "synthetic"
    assert body["advisory"].startswith("HUMAN VERIFICATION REQUIRED")
    assert "is_match" not in body and "matched" not in body
    assert len(body["candidates"]) >= 3, "forced comparison requires at least three"
    assert body["candidates"][0]["person_id"] == person_ids[0]
    assert body["candidates"][0]["masked_name"].count("*") > 0
    assert "full_name" not in body["candidates"][0]

    search_id = body["search_id"]

    # Purpose binding: the record is closed until a human confirms.
    blocked = await api.get(f"/v1/person/{person_ids[0]}?search_id={search_id}")
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "PURPOSE_NOT_AUTHORISED"

    decision = await api.post(
        f"/v1/search/{search_id}/decision",
        json={"decision": "CONFIRMED", "confirmed_rank": 1, "latency_ms": 8420},
    )
    assert decision.status_code == 204

    allowed = await api.get(f"/v1/person/{person_ids[0]}?search_id={search_id}")
    assert allowed.status_code == 200
    assert allowed.json()["full_name"] == "Synthetic Person 0"

    detail = (await api.get(f"/v1/search/{search_id}")).json()
    assert detail["status"] == "CLOSED"
    assert detail["decision"]["decision"] == "CONFIRMED"

    verified = (await api.get("/v1/audit/verify")).json()
    assert verified["verified"] is True
    assert verified["checked"] >= 3


async def test_no_match_returns_zero_candidates(api, clean_db):
    """The release outcome — the one this product is actually built around."""
    async with clean_db.acquire() as conn:
        await _enrol(conn, 12)

    far = unit_vector(777777)
    body = (await api.post("/v1/search", json=_probe(far))).json()

    assert body["candidates"] == []
    assert body["score_gap"] is None
    assert body["ambiguous"] is False

    decision = await api.post(
        f"/v1/search/{body['search_id']}/decision", json={"decision": "NO_MATCH"}
    )
    assert decision.status_code == 204


async def test_decision_is_write_once(api, clean_db):
    async with clean_db.acquire() as conn:
        await _enrol(conn, 6)

    search_id = (await api.post("/v1/search", json=_probe(unit_vector(9001)))).json()["search_id"]
    assert (
        await api.post(f"/v1/search/{search_id}/decision", json={"decision": "NO_MATCH"})
    ).status_code == 204

    second = await api.post(f"/v1/search/{search_id}/decision", json={"decision": "INCONCLUSIVE"})
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "DECISION_ALREADY_RECORDED"


async def test_pending_decision_limit_blocks_the_fourth(api, clean_db):
    async with clean_db.acquire() as conn:
        await _enrol(conn, 6)

    for _ in range(3):
        assert (await api.post("/v1/search", json=_probe(unit_vector(9001)))).status_code == 200

    fourth = await api.post("/v1/search", json=_probe(unit_vector(9001)))
    assert fourth.status_code == 429
    body = fourth.json()
    assert body["error"]["code"] == "PENDING_DECISION_LIMIT"
    assert len(body["error"]["detail"]["open_search_ids"]) == 3

    pending = (await api.get("/v1/search/pending")).json()
    assert len(pending["pending"]) == 3


async def test_person_requires_a_search_id(api, clean_db):
    async with clean_db.acquire() as conn:
        person_ids = await _enrol(conn, 3)

    response = await api.get(f"/v1/person/{person_ids[0]}")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PURPOSE_NOT_AUTHORISED"


async def test_browse_reason_is_permitted_and_logged_distinctly(api, clean_db):
    """The deliberate valve: a control with no valve gets circumvented."""
    async with clean_db.acquire() as conn:
        person_ids = await _enrol(conn, 6)

    search_id = (
        await api.post("/v1/search", json=_probe(unit_vector(9001), reason="browse"))
    ).json()["search_id"]

    assert (await api.get(f"/v1/person/{person_ids[0]}?search_id={search_id}")).status_code == 200

    audit = (await api.get("/v1/audit?subject_type=person")).json()
    assert any(e["action"] == "person.browsed" for e in audit["entries"])


@pytest.mark.parametrize(
    ("mutate", "expected_code"),
    [
        (lambda p: p.update(embedding=[0.0] * 511), "INVALID_EMBEDDING"),
        (lambda p: p.update(embedding=[0.0] * 513), "INVALID_EMBEDDING"),
        (lambda p: p.update(embedding=[v * 3 for v in unit_vector(1)]), "INVALID_EMBEDDING"),
        (lambda p: p.update(model_id="insightface/w600k_mbf@1"), "UNSUPPORTED_MODEL"),
        (lambda p: p["quality"].update(score=0.05), "QUALITY_BELOW_FLOOR"),
    ],
)
async def test_invalid_probes_are_rejected(api, clean_db, mutate, expected_code):
    async with clean_db.acquire() as conn:
        await _enrol(conn, 3)

    payload = _probe(unit_vector(9001))
    mutate(payload)

    response = await api.post("/v1/search", json=payload)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == expected_code


async def test_search_and_candidates_commit_together(api, clean_db):
    """One transaction: a search row without its candidates would be a record
    of what the officer saw that does not say what they saw."""
    async with clean_db.acquire() as conn:
        await _enrol(conn, 8)

    search_id = (await api.post("/v1/search", json=_probe(unit_vector(9001)))).json()["search_id"]

    async with clean_db.acquire() as conn:
        stored = await conn.fetchval(
            "SELECT candidate_count FROM search_event WHERE search_id = $1", search_id
        )
        actual = await conn.fetchval(
            "SELECT count(*) FROM search_candidate WHERE search_id = $1", search_id
        )
    assert stored == actual


async def test_graph_depth_is_capped(api, clean_db):
    async with clean_db.acquire() as conn:
        person_ids = await _enrol(conn, 3)

    response = await api.get(f"/v1/graph/{person_ids[0]}?depth=5")
    assert response.status_code == 400
    assert response.json()["error"]["detail"]["max_depth"] == 3


async def test_unknown_device_key_is_rejected(api, clean_db):
    response = await api.post(
        "/v1/search",
        json=_probe(unit_vector(1)),
        headers={"X-Perigee-Device-Key": "not-a-real-key"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "DEVICE_KEY_INVALID"
