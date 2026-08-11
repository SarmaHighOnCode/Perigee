#!/usr/bin/env python
"""Recompute degree, betweenness and community for every person.

    python scripts/compute_node_metrics.py

Batch work, never a request path: betweenness is O(V*E). Run nightly, or after
`compute_edges.py`.

Note these are ANALYTICAL DESCRIPTIONS OF A GRAPH, not statements about a
person. They are surfaced as raw numbers and are deliberately never composed
into a single "risk score" — see docs/11-GRAPH-INTELLIGENCE.md §5.

Contract: docs/02-DATA-MODEL.md §5.
"""

from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.db import create_pool
from app.services.graph_build import recompute_node_metrics


async def run() -> int:
    settings = get_settings()
    if not settings.database_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 2

    pool = await create_pool(settings)
    try:
        started = time.perf_counter()
        async with pool.acquire() as conn:
            async with conn.transaction():
                scored = await recompute_node_metrics(conn)

            summary = await conn.fetchrow(
                """
                SELECT count(*)                              AS persons,
                       count(DISTINCT community_id)          AS communities,
                       max(degree)                           AS max_degree,
                       round(avg(degree)::numeric, 2)        AS avg_degree
                FROM   node_metric
                """
            )
            top = await conn.fetch(
                """
                SELECT p.masked_name, nm.degree, round(nm.betweenness::numeric, 6) AS betweenness
                FROM   node_metric nm
                JOIN   person p ON p.person_id = nm.person_id
                ORDER  BY nm.betweenness DESC, nm.degree DESC
                LIMIT  5
                """
            )
    finally:
        await pool.close()

    print(f"recomputed {scored} persons in {time.perf_counter() - started:.1f}s")
    print(
        f"communities={summary['communities']} "
        f"max_degree={summary['max_degree']} avg_degree={summary['avg_degree']}"
    )
    print("\nhighest betweenness (masked):")
    for row in top:
        print(f"  {row['masked_name']:<20} degree={row['degree']:<4} bw={row['betweenness']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
