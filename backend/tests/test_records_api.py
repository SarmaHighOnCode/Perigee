"""Case linking and relationship writes.

These close the gap that left an enrolled person with no history and no graph
edges. Marked `db`; runs against real Postgres in CI.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.db


async def _person(conn, name: str) -> str:
    return str(
        await conn.fetchval(
            "INSERT INTO person (full_name, masked_name, dataset_mode) "
            "VALUES ($1,$2,'synthetic') RETURNING person_id",
            name,
            name[0] + "****",
        )
    )


async def _case(conn, fir: str) -> str:
    return str(
        await conn.fetchval(
            """
            INSERT INTO case_record (fir_number, station, district, registered_on, dataset_mode)
            VALUES ($1,'Jayanagar','Bengaluru South','2025-01-01','synthetic')
            RETURNING case_id
            """,
            fir,
        )
    )


# ---------------------------------------------------------------------------
# case listing
# ---------------------------------------------------------------------------


async def test_case_list_returns_metadata_without_names(api, clean_db):
    """Browsing the case picker must disclose nothing about who is on file."""
    async with clean_db.acquire() as conn:
        case_id = await _case(conn, "0101/2025")
        person_id = await _person(conn, "Hidden Person")
        await conn.execute(
            "INSERT INTO person_case (person_id, case_id, role) VALUES ($1,$2,'accused')",
            person_id,
            case_id,
        )

    body = (await api.get("/v1/cases")).json()

    assert body["count"] == 1
    entry = body["cases"][0]
    assert entry["fir_number"] == "0101/2025"
    assert entry["linked_persons"] == 1
    assert "Hidden Person" not in str(body)


async def test_case_list_filters_and_reports_truncation(api, clean_db):
    async with clean_db.acquire() as conn:
        for i in range(5):
            await _case(conn, f"02{i:02d}/2025")

    filtered = (await api.get("/v1/cases?q=0202")).json()
    assert filtered["count"] == 1

    limited = (await api.get("/v1/cases?limit=2")).json()
    assert limited["count"] == 2
    assert limited["truncated"] is True


# ---------------------------------------------------------------------------
# case linking
# ---------------------------------------------------------------------------


async def test_link_case_then_it_appears_on_the_person(api, clean_db):
    async with clean_db.acquire() as conn:
        person_id = await _person(conn, "Linked Person")
        case_id = await _case(conn, "0300/2025")

    response = await api.post(
        f"/v1/person/{person_id}/cases", json={"case_id": case_id, "role": "accused"}
    )
    assert response.status_code == 201
    assert response.json()["already_linked"] is False

    async with clean_db.acquire() as conn:
        count = await conn.fetchval(
            "SELECT count(*) FROM person_case WHERE person_id = $1", person_id
        )
    assert count == 1


async def test_linking_is_idempotent(api, clean_db):
    """Enroll resubmits drafts after a dropped connection; that must be safe."""
    async with clean_db.acquire() as conn:
        person_id = await _person(conn, "Retry Person")
        case_id = await _case(conn, "0301/2025")

    payload = {"case_id": case_id, "role": "accused"}
    first = await api.post(f"/v1/person/{person_id}/cases", json=payload)
    second = await api.post(f"/v1/person/{person_id}/cases", json=payload)

    assert first.json()["already_linked"] is False
    assert second.json()["already_linked"] is True

    async with clean_db.acquire() as conn:
        assert (
            await conn.fetchval("SELECT count(*) FROM person_case WHERE person_id = $1", person_id)
            == 1
        )


async def test_a_person_may_hold_two_roles_on_one_case(api, clean_db):
    async with clean_db.acquire() as conn:
        person_id = await _person(conn, "Dual Role")
        case_id = await _case(conn, "0302/2025")

    await api.post(f"/v1/person/{person_id}/cases", json={"case_id": case_id, "role": "accused"})
    await api.post(f"/v1/person/{person_id}/cases", json={"case_id": case_id, "role": "witness"})

    async with clean_db.acquire() as conn:
        roles = {
            r["role"]
            for r in await conn.fetch(
                "SELECT role FROM person_case WHERE person_id = $1", person_id
            )
        }
    assert roles == {"accused", "witness"}


async def test_link_rejects_unknown_person_and_case(api, clean_db):
    async with clean_db.acquire() as conn:
        person_id = await _person(conn, "Real Person")
        case_id = await _case(conn, "0303/2025")

    ghost = "00000000-0000-0000-0000-000000000001"

    assert (
        await api.post(f"/v1/person/{ghost}/cases", json={"case_id": case_id, "role": "accused"})
    ).status_code == 404
    assert (
        await api.post(f"/v1/person/{person_id}/cases", json={"case_id": ghost, "role": "accused"})
    ).status_code == 404


# ---------------------------------------------------------------------------
# relationships
# ---------------------------------------------------------------------------


async def test_relationship_requires_evidence(api, clean_db):
    """An edge without a citable case is an unfalsifiable accusation."""
    async with clean_db.acquire() as conn:
        a = await _person(conn, "Alpha One")
        b = await _person(conn, "Bravo Two")

    response = await api.post(
        f"/v1/person/{a}/relationships",
        json={"target_person_id": b, "edge_type": "family", "evidence_case_ids": []},
    )
    assert response.status_code == 422


async def test_relationship_rejects_evidence_that_does_not_exist(api, clean_db):
    async with clean_db.acquire() as conn:
        a = await _person(conn, "Alpha Three")
        b = await _person(conn, "Bravo Four")

    response = await api.post(
        f"/v1/person/{a}/relationships",
        json={
            "target_person_id": b,
            "edge_type": "family",
            "evidence_case_ids": ["00000000-0000-0000-0000-000000000009"],
        },
    )
    assert response.status_code == 400
    assert response.json()["error"]["detail"]["missing_case_ids"]


async def test_relationship_is_stored_once_with_canonical_ordering(api, clean_db):
    """Undirected: recording it from either side must not create two rows."""
    async with clean_db.acquire() as conn:
        a = await _person(conn, "Alpha Five")
        b = await _person(conn, "Bravo Six")
        case_id = await _case(conn, "0400/2025")

    first = await api.post(
        f"/v1/person/{a}/relationships",
        json={
            "target_person_id": b,
            "edge_type": "shared_phone",
            "evidence_case_ids": [case_id],
        },
    )
    assert first.status_code == 201
    assert first.json()["already_existed"] is False

    # Same pair, opposite direction.
    second = await api.post(
        f"/v1/person/{b}/relationships",
        json={
            "target_person_id": a,
            "edge_type": "shared_phone",
            "evidence_case_ids": [case_id],
        },
    )
    assert second.json()["already_existed"] is True

    async with clean_db.acquire() as conn:
        assert await conn.fetchval("SELECT count(*) FROM edge") == 1
        row = await conn.fetchrow("SELECT src_person_id, dst_person_id FROM edge")
    assert str(row["src_person_id"]) < str(row["dst_person_id"])


async def test_resubmitting_merges_evidence_rather_than_replacing_it(api, clean_db):
    """A second operator citing a different case strengthens the same claim."""
    async with clean_db.acquire() as conn:
        a = await _person(conn, "Alpha Seven")
        b = await _person(conn, "Bravo Eight")
        case_one = await _case(conn, "0401/2025")
        case_two = await _case(conn, "0402/2025")

    await api.post(
        f"/v1/person/{a}/relationships",
        json={"target_person_id": b, "edge_type": "family", "evidence_case_ids": [case_one]},
    )
    merged = await api.post(
        f"/v1/person/{a}/relationships",
        json={"target_person_id": b, "edge_type": "family", "evidence_case_ids": [case_two]},
    )

    assert set(merged.json()["evidence_case_ids"]) == {case_one, case_two}


async def test_co_accused_cannot_be_written_by_hand(api, clean_db):
    """It is derived from shared cases; a manual one would be overwritten."""
    async with clean_db.acquire() as conn:
        a = await _person(conn, "Alpha Nine")
        b = await _person(conn, "Bravo Ten")
        case_id = await _case(conn, "0403/2025")

    response = await api.post(
        f"/v1/person/{a}/relationships",
        json={
            "target_person_id": b,
            "edge_type": "co_accused",
            "evidence_case_ids": [case_id],
        },
    )
    assert response.status_code == 422


async def test_self_relationship_is_refused(api, clean_db):
    async with clean_db.acquire() as conn:
        a = await _person(conn, "Alpha Eleven")
        case_id = await _case(conn, "0404/2025")

    response = await api.post(
        f"/v1/person/{a}/relationships",
        json={"target_person_id": a, "edge_type": "family", "evidence_case_ids": [case_id]},
    )
    assert response.status_code == 400


async def test_relationship_updates_degree_so_the_person_is_not_shown_isolated(api, clean_db):
    async with clean_db.acquire() as conn:
        a = await _person(conn, "Alpha Twelve")
        b = await _person(conn, "Bravo Thirteen")
        case_id = await _case(conn, "0405/2025")

    await api.post(
        f"/v1/person/{a}/relationships",
        json={"target_person_id": b, "edge_type": "family", "evidence_case_ids": [case_id]},
    )

    async with clean_db.acquire() as conn:
        degrees = {
            str(r["person_id"]): r["degree"]
            for r in await conn.fetch("SELECT person_id, degree FROM node_metric")
        }
    assert degrees[a] == 1
    assert degrees[b] == 1


async def test_relationship_writes_an_audit_entry(api, clean_db):
    async with clean_db.acquire() as conn:
        a = await _person(conn, "Alpha Fourteen")
        b = await _person(conn, "Bravo Fifteen")
        case_id = await _case(conn, "0406/2025")

    await api.post(
        f"/v1/person/{a}/relationships",
        json={"target_person_id": b, "edge_type": "family", "evidence_case_ids": [case_id]},
    )

    audit = (await api.get(f"/v1/audit?subject_type=person&subject_id={a}")).json()
    actions = {e["action"] for e in audit["entries"]}
    assert "person.relationship_recorded" in actions

    verified = (await api.get("/v1/audit/verify")).json()
    assert verified["verified"] is True
