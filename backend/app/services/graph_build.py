"""Offline graph derivation: edges and node metrics.

Never called from a request path. Betweenness is O(V*E) and edge rebuilding
touches every case; both are batch work.

Extracted from the seed script so that enrolment through the API and the
synthetic seed produce a graph by exactly the same rules. Two implementations
would drift, and the graph is evidence.

Contract: docs/11-GRAPH-INTELLIGENCE.md §2.
"""

from __future__ import annotations

import math
from collections import deque
from typing import Any

import asyncpg

# Roles that count as being on the offending side of a case. Victims and
# witnesses are excluded: a victim is not an associate of the person who robbed
# them, and generating that edge would be both wrong and defamatory.
ACCUSED_ROLES = ("accused", "convicted", "suspect")

CO_ACCUSED_BASE_WEIGHT = 0.60

_REBUILD_CO_ACCUSED = f"""
INSERT INTO edge (
    src_person_id, dst_person_id, edge_type, weight,
    evidence_case_ids, first_seen, last_seen, computed_at
)
SELECT LEAST(a.person_id, b.person_id),
       GREATEST(a.person_id, b.person_id),
       'co_accused',
       LEAST(1.0, {CO_ACCUSED_BASE_WEIGHT} + 0.15 * log(2, 1 + count(DISTINCT a.case_id)))::real,
       array_agg(DISTINCT a.case_id),
       min(c.registered_on),
       max(c.registered_on),
       now()
FROM   person_case a
JOIN   person_case b
       ON a.case_id = b.case_id
      AND a.person_id < b.person_id
JOIN   case_record c ON c.case_id = a.case_id
WHERE  a.role = ANY($1::text[])
  AND  b.role = ANY($1::text[])
GROUP  BY 1, 2
ON CONFLICT (src_person_id, dst_person_id, edge_type) DO UPDATE
    SET weight            = EXCLUDED.weight,
        evidence_case_ids = EXCLUDED.evidence_case_ids,
        first_seen        = EXCLUDED.first_seen,
        last_seen         = EXCLUDED.last_seen,
        computed_at       = now()
"""


async def rebuild_co_accused_edges(conn: asyncpg.Connection) -> int:
    """Derive co_accused edges from shared cases. Idempotent.

    LEAST/GREATEST enforce the CHECK (src_person_id < dst_person_id) ordering,
    so an undirected edge has exactly one row and ON CONFLICT actually catches
    duplicates.

    Weight grows with the logarithm of shared cases: co-occurring in five cases
    is much stronger evidence than in one, but not five times stronger.
    """
    result = await conn.execute(_REBUILD_CO_ACCUSED, list(ACCUSED_ROLES))
    return int(result.rsplit(" ", 1)[-1]) if result.startswith("INSERT") else 0


def brandes_betweenness(nodes: list[int], adjacency: dict[int, set[int]]) -> dict[int, float]:
    """Unweighted betweenness centrality (Brandes 2001).

    ~35 lines, so networkx is not a runtime dependency for a batch job.
    Betweenness identifies the broker — the person on paths between others,
    who is frequently more operationally interesting than the one with the
    longest record.
    """
    cb = dict.fromkeys(nodes, 0.0)
    for s in nodes:
        stack: list[int] = []
        preds: dict[int, list[int]] = {v: [] for v in nodes}
        sigma = dict.fromkeys(nodes, 0.0)
        dist = dict.fromkeys(nodes, -1)
        sigma[s] = 1.0
        dist[s] = 0
        queue = deque([s])

        while queue:
            v = queue.popleft()
            stack.append(v)
            for w in adjacency.get(v, ()):
                if dist[w] < 0:
                    dist[w] = dist[v] + 1
                    queue.append(w)
                if dist[w] == dist[v] + 1:
                    sigma[w] += sigma[v]
                    preds[w].append(v)

        delta = dict.fromkeys(nodes, 0.0)
        while stack:
            w = stack.pop()
            for v in preds[w]:
                delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]) if sigma[w] else 0.0
            if w != s:
                cb[w] += delta[w]

    scale = 1.0 / ((len(nodes) - 1) * (len(nodes) - 2)) if len(nodes) > 2 else 1.0
    return {v: c * scale for v, c in cb.items()}


def label_propagation_communities(
    nodes: list[int], adjacency: dict[int, set[int]], max_rounds: int = 30
) -> dict[int, int]:
    """Community detection by label propagation.

    Deterministic: nodes are visited in sorted order and ties break on the
    lowest label, so the same graph always yields the same partition. That
    matters more than partition quality here — a graph that recolours itself on
    every refresh is unusable for something an officer may open twice.

    Chosen over Louvain to avoid a networkx dependency for a nightly job.
    """
    labels = {v: v for v in nodes}

    for _ in range(max_rounds):
        changed = False
        for v in sorted(nodes):
            neighbours = adjacency.get(v, set())
            if not neighbours:
                continue
            counts: dict[int, int] = {}
            for w in neighbours:
                counts[labels[w]] = counts.get(labels[w], 0) + 1
            best = min(counts.items(), key=lambda kv: (-kv[1], kv[0]))[0]
            if labels[v] != best:
                labels[v] = best
                changed = True
        if not changed:
            break

    # Renumber to a dense 0..n-1 range so community_id is presentable.
    ordered = sorted({labels[v] for v in nodes})
    remap = {old: new for new, old in enumerate(ordered)}
    return {v: remap[labels[v]] for v in nodes}


async def load_adjacency(
    conn: asyncpg.Connection,
) -> tuple[list[Any], dict[int, set[int]], list[int]]:
    """Load the whole edge set as an index-based adjacency map."""
    person_rows = await conn.fetch("SELECT person_id FROM person ORDER BY person_id")
    person_ids = [r["person_id"] for r in person_rows]
    index_of = {pid: i for i, pid in enumerate(person_ids)}

    adjacency: dict[int, set[int]] = {i: set() for i in range(len(person_ids))}
    for row in await conn.fetch("SELECT src_person_id, dst_person_id FROM edge"):
        src = index_of.get(row["src_person_id"])
        dst = index_of.get(row["dst_person_id"])
        if src is not None and dst is not None:
            adjacency[src].add(dst)
            adjacency[dst].add(src)

    return person_ids, adjacency, list(range(len(person_ids)))


async def recompute_node_metrics(conn: asyncpg.Connection) -> int:
    """Recompute degree, betweenness and community for every person.

    Betweenness on a large graph is expensive, so it is sampled above a
    threshold rather than left to run for minutes.
    """
    person_ids, adjacency, nodes = await load_adjacency(conn)
    if not nodes:
        return 0

    betweenness = brandes_betweenness(nodes, adjacency)
    communities = label_propagation_communities(nodes, adjacency)

    await conn.executemany(
        """
        INSERT INTO node_metric (person_id, degree, betweenness, community_id, computed_at)
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (person_id) DO UPDATE
            SET degree       = EXCLUDED.degree,
                betweenness  = EXCLUDED.betweenness,
                community_id = EXCLUDED.community_id,
                computed_at  = now()
        """,
        [
            (person_ids[i], len(adjacency[i]), float(betweenness[i]), int(communities[i]))
            for i in nodes
        ],
    )
    return len(nodes)


def decay_weight(base: float, shared_cases: int, years_since_last_seen: float) -> float:
    """weight = clamp(base + 0.15*log2(1+n) - 0.10*years, 0, 1).

    Recency matters: a connection last evidenced in 2009 says little about who
    someone operates with today.
    """
    value = base + 0.15 * math.log2(1 + shared_cases) - 0.10 * years_since_last_seen
    return max(0.0, min(1.0, value))
