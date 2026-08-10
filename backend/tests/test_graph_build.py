"""Offline graph derivation: betweenness, communities, edge rebuilding.

The pure-graph functions are tested without a database; edge rebuilding needs
one and is marked `db`.
"""

from __future__ import annotations

import pytest

from app.services.graph_build import (
    brandes_betweenness,
    decay_weight,
    label_propagation_communities,
    rebuild_co_accused_edges,
    recompute_node_metrics,
)


def _undirected(pairs: list[tuple[int, int]], n: int) -> dict[int, set[int]]:
    adjacency: dict[int, set[int]] = {i: set() for i in range(n)}
    for a, b in pairs:
        adjacency[a].add(b)
        adjacency[b].add(a)
    return adjacency


# ---------------------------------------------------------------------------
# betweenness
# ---------------------------------------------------------------------------


def test_broker_has_the_highest_betweenness():
    """A path graph 0-1-2: node 1 sits on the only route between the others.

    This is the whole point of the metric — the broker is often the
    operationally interesting person and rarely the one with the longest
    record.
    """
    scores = brandes_betweenness([0, 1, 2], _undirected([(0, 1), (1, 2)], 3))
    assert scores[1] > scores[0]
    assert scores[0] == pytest.approx(0.0)
    assert scores[2] == pytest.approx(0.0)


def test_star_centre_is_the_broker():
    adjacency = _undirected([(0, 1), (0, 2), (0, 3), (0, 4)], 5)
    scores = brandes_betweenness(list(range(5)), adjacency)
    assert scores[0] == max(scores.values())
    assert all(scores[i] == pytest.approx(0.0) for i in (1, 2, 3, 4))


def test_clique_has_no_broker():
    """Everyone reaches everyone directly, so nobody is on anyone's path."""
    adjacency = _undirected([(0, 1), (0, 2), (1, 2)], 3)
    scores = brandes_betweenness([0, 1, 2], adjacency)
    assert all(v == pytest.approx(0.0) for v in scores.values())


def test_isolated_nodes_score_zero():
    scores = brandes_betweenness([0, 1, 2], {0: set(), 1: set(), 2: set()})
    assert all(v == pytest.approx(0.0) for v in scores.values())


def test_betweenness_handles_a_single_node():
    assert brandes_betweenness([0], {0: set()}) == {0: 0.0}


# ---------------------------------------------------------------------------
# communities
# ---------------------------------------------------------------------------


def test_two_disconnected_groups_get_different_communities():
    adjacency = _undirected([(0, 1), (1, 2), (0, 2), (3, 4), (4, 5), (3, 5)], 6)
    communities = label_propagation_communities(list(range(6)), adjacency)
    assert communities[0] == communities[1] == communities[2]
    assert communities[3] == communities[4] == communities[5]
    assert communities[0] != communities[3]


def test_community_detection_is_deterministic():
    """A graph that recolours itself on every refresh is unusable for something
    an officer may open twice."""
    adjacency = _undirected([(0, 1), (1, 2), (3, 4), (4, 5), (2, 3)], 6)
    first = label_propagation_communities(list(range(6)), adjacency)
    for _ in range(5):
        assert label_propagation_communities(list(range(6)), adjacency) == first


def test_community_ids_are_dense_from_zero():
    adjacency = _undirected([(0, 1), (2, 3)], 4)
    communities = label_propagation_communities(list(range(4)), adjacency)
    assert sorted(set(communities.values())) == list(range(len(set(communities.values()))))


def test_isolated_node_keeps_its_own_community():
    adjacency = _undirected([(0, 1)], 3)
    communities = label_propagation_communities([0, 1, 2], adjacency)
    assert communities[2] not in (communities[0],)


# ---------------------------------------------------------------------------
# weight decay
# ---------------------------------------------------------------------------


def test_weight_grows_sublinearly_with_shared_cases():
    """Five shared cases is stronger than one, but not five times stronger."""
    one = decay_weight(0.6, 1, 0)
    five = decay_weight(0.6, 5, 0)
    assert five > one
    assert five - 0.6 < 5 * (one - 0.6)


def test_weight_decays_with_age():
    assert decay_weight(0.6, 1, 5) < decay_weight(0.6, 1, 0)


def test_weight_is_clamped_to_unit_range():
    assert decay_weight(0.6, 10_000, 0) <= 1.0
    assert decay_weight(0.6, 1, 100) >= 0.0


# ---------------------------------------------------------------------------
# database-backed
# ---------------------------------------------------------------------------


@pytest.mark.db
async def test_rebuild_derives_edges_from_shared_cases(clean_db):
    """Enrolment through the API creates case links but no edges; this is what
    turns them into a graph."""
    async with clean_db.acquire() as conn:
        people = [
            await conn.fetchval(
                "INSERT INTO person (full_name, masked_name, dataset_mode) "
                "VALUES ($1,$2,'synthetic') RETURNING person_id",
                f"P{i}",
                f"P{i}",
            )
            for i in range(3)
        ]
        case_id = await conn.fetchval(
            """
            INSERT INTO case_record (fir_number, station, district, registered_on, dataset_mode)
            VALUES ('0001/2025','Test','Test','2025-01-01','synthetic') RETURNING case_id
            """
        )
        # Two accused and one VICTIM. The victim must not be linked to anyone.
        for person_id, role in zip(people, ("accused", "convicted", "victim"), strict=True):
            await conn.execute(
                "INSERT INTO person_case (person_id, case_id, role) VALUES ($1,$2,$3)",
                person_id,
                case_id,
                role,
            )

        await rebuild_co_accused_edges(conn)
        edges = await conn.fetch("SELECT src_person_id, dst_person_id, evidence_case_ids FROM edge")

    assert len(edges) == 1, "exactly one edge, between the two accused"
    linked = {edges[0]["src_person_id"], edges[0]["dst_person_id"]}
    assert linked == {people[0], people[1]}
    assert people[2] not in linked, "a victim is not an associate of their offender"
    assert edges[0]["evidence_case_ids"] == [case_id], "every edge must cite its case"


@pytest.mark.db
async def test_rebuild_is_idempotent(clean_db):
    async with clean_db.acquire() as conn:
        a = await conn.fetchval(
            "INSERT INTO person (full_name, masked_name, dataset_mode) "
            "VALUES ('A','A','synthetic') RETURNING person_id"
        )
        b = await conn.fetchval(
            "INSERT INTO person (full_name, masked_name, dataset_mode) "
            "VALUES ('B','B','synthetic') RETURNING person_id"
        )
        case_id = await conn.fetchval(
            """
            INSERT INTO case_record (fir_number, station, district, registered_on, dataset_mode)
            VALUES ('0002/2025','Test','Test','2025-01-01','synthetic') RETURNING case_id
            """
        )
        for person_id in (a, b):
            await conn.execute(
                "INSERT INTO person_case (person_id, case_id, role) VALUES ($1,$2,'accused')",
                person_id,
                case_id,
            )

        for _ in range(3):
            await rebuild_co_accused_edges(conn)
        count = await conn.fetchval("SELECT count(*) FROM edge")

    assert count == 1, "re-running must refresh the edge, not duplicate it"


@pytest.mark.db
async def test_node_metrics_are_written(clean_db):
    async with clean_db.acquire() as conn:
        ids = [
            await conn.fetchval(
                "INSERT INTO person (full_name, masked_name, dataset_mode) "
                "VALUES ($1,$1,'synthetic') RETURNING person_id",
                f"N{i}",
            )
            for i in range(3)
        ]
        # A path graph: the middle node is the broker.
        for src, dst in ((0, 1), (1, 2)):
            lo, hi = sorted([ids[src], ids[dst]], key=str)
            await conn.execute(
                "INSERT INTO edge (src_person_id, dst_person_id, edge_type, weight) "
                "VALUES ($1,$2,'co_accused',0.6)",
                lo,
                hi,
            )

        scored = await recompute_node_metrics(conn)
        rows = {
            r["person_id"]: r
            for r in await conn.fetch("SELECT person_id, degree, betweenness FROM node_metric")
        }

    assert scored == 3
    assert rows[ids[1]]["degree"] == 2
    assert rows[ids[1]]["betweenness"] > rows[ids[0]]["betweenness"]
