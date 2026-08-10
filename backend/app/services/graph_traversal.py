"""Bounded breadth-first traversal of the criminal network.

Depth is hard-capped at 3. Recursive CTEs degrade badly beyond that — the
planner produces nested loops over an exponentially growing working set. It is
also an ANALYTICAL limit: three hops in a dense network reaches nearly
everyone, and a graph that implicates everyone shows nothing.

Contract: docs/11-GRAPH-INTELLIGENCE.md §3.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import asyncpg

MAX_DEPTH = 3
MAX_NODES = 200
DEFAULT_DEPTH = 2
DEFAULT_LIMIT = 60

ALL_EDGE_TYPES = (
    "co_accused",
    "shared_address",
    "shared_phone",
    "same_mo",
    "family",
    "known_associate",
)

# Modus-operandi similarity is an inference, not an observation. It is never
# rendered as the sole link between two people — two burglars who both enter
# through kitchen windows are not associates. It appears only as corroboration
# alongside a documented edge.
INFERRED_EDGE_TYPES = frozenset({"same_mo"})

_TRAVERSE_SQL = """
WITH RECURSIVE frontier AS (
    SELECT $1::uuid AS person_id, 0 AS hop, ARRAY[$1::uuid] AS path

    UNION ALL

    SELECT nb.neighbour, f.hop + 1, f.path || nb.neighbour
    FROM   frontier f
    CROSS  JOIN LATERAL (
        SELECT CASE WHEN e.src_person_id = f.person_id
                    THEN e.dst_person_id ELSE e.src_person_id END AS neighbour
        FROM   edge e
        WHERE  (e.src_person_id = f.person_id OR e.dst_person_id = f.person_id)
          AND  e.weight >= $3
          AND  e.edge_type = ANY($4::text[])
    ) nb
    WHERE  f.hop < $2
      -- Cycle guard. Criminal networks are densely cyclic; without this the
      -- query runs until the connection dies.
      AND  NOT nb.neighbour = ANY(f.path)
)
-- Keep the SHORTEST path to each node. A person reachable at both 1 and 2 hops
-- is a direct associate, and drawing them on the outer ring would mislead.
SELECT DISTINCT ON (person_id) person_id, hop
FROM   frontier
ORDER  BY person_id, hop
LIMIT  $5
"""

_NODES_SQL = """
SELECT p.person_id, p.masked_name, p.age_band, p.district, p.status,
       COALESCE(nm.degree, 0)      AS degree,
       COALESCE(nm.betweenness, 0) AS betweenness,
       nm.community_id,
       (SELECT count(*) FROM person_case pc WHERE pc.person_id = p.person_id) AS case_count
FROM   person p
LEFT   JOIN node_metric nm ON nm.person_id = p.person_id
WHERE  p.person_id = ANY($1::uuid[])
"""

_EDGES_SQL = """
SELECT src_person_id, dst_person_id, edge_type, weight,
       evidence_case_ids, first_seen, last_seen
FROM   edge
WHERE  src_person_id = ANY($1::uuid[])
  AND  dst_person_id = ANY($1::uuid[])
  AND  weight >= $2
  AND  edge_type = ANY($3::text[])
ORDER  BY weight DESC
"""


def clamp_depth(requested: int | None) -> int:
    if requested is None:
        return DEFAULT_DEPTH
    return max(1, min(requested, MAX_DEPTH))


def clamp_limit(requested: int | None) -> int:
    if requested is None:
        return DEFAULT_LIMIT
    return max(1, min(requested, MAX_NODES))


def suppress_orphan_inferred_edges(edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop inferred edges between pairs that have no documented edge.

    Without this, MO clustering generates thousands of confident-looking,
    evidentially worthless links that render identically to real ones — which
    is precisely how a network graph becomes guilt by association.
    """
    documented: set[tuple[str, str]] = {
        (e["src"], e["dst"]) for e in edges if e["edge_type"] not in INFERRED_EDGE_TYPES
    }
    return [
        e
        for e in edges
        if e["edge_type"] not in INFERRED_EDGE_TYPES or (e["src"], e["dst"]) in documented
    ]


async def expand(
    conn: asyncpg.Connection,
    root: UUID,
    *,
    depth: int | None = None,
    min_weight: float = 0.0,
    edge_types: list[str] | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    depth = clamp_depth(depth)
    limit = clamp_limit(limit)
    types = list(edge_types) if edge_types else list(ALL_EDGE_TYPES)

    # Ask for one more than the cap so truncation can be reported honestly.
    reached = await conn.fetch(_TRAVERSE_SQL, root, depth, min_weight, types, limit + 1)

    truncated = len(reached) > limit
    reached = reached[:limit]

    hop_by_person = {str(r["person_id"]): int(r["hop"]) for r in reached}
    ids = [UUID(pid) for pid in hop_by_person]

    node_rows = await conn.fetch(_NODES_SQL, ids)
    nodes = [
        {
            "person_id": str(r["person_id"]),
            "masked_name": r["masked_name"],
            "age_band": r["age_band"],
            "district": r["district"],
            "hop": hop_by_person[str(r["person_id"])],
            "degree": int(r["degree"]),
            "betweenness": round(float(r["betweenness"]), 6),
            "community_id": r["community_id"],
            "case_count": int(r["case_count"]),
        }
        for r in node_rows
    ]
    nodes.sort(key=lambda n: (n["hop"], -n["degree"]))

    edge_rows = await conn.fetch(_EDGES_SQL, ids, min_weight, types)
    edges = [
        {
            "src": str(r["src_person_id"]),
            "dst": str(r["dst_person_id"]),
            "edge_type": r["edge_type"],
            "weight": round(float(r["weight"]), 4),
            "evidence_case_ids": [str(c) for c in (r["evidence_case_ids"] or [])],
            "evidence_count": len(r["evidence_case_ids"] or []),
            "inferred": r["edge_type"] in INFERRED_EDGE_TYPES,
        }
        for r in edge_rows
    ]
    edges = suppress_orphan_inferred_edges(edges)

    communities: dict[int, int] = {}
    for node in nodes:
        cid = node["community_id"]
        if cid is not None:
            communities[cid] = communities.get(cid, 0) + 1

    return {
        "root": str(root),
        "depth": depth,
        "nodes": nodes,
        "edges": edges,
        "truncated": truncated,
        "communities": [
            {"community_id": cid, "size": size, "label": f"Cluster {cid}"}
            for cid, size in sorted(communities.items())
        ],
    }
