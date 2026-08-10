#!/usr/bin/env python
"""Rebuild derived graph edges from case records.

    python scripts/compute_edges.py
    python scripts/compute_edges.py --with-metrics

Run after enrolling people through Perigee Enroll. Without it, newly enrolled
people have case links but no edges, so they appear isolated in the network
view — which reads as "no known associates" rather than "not yet computed".

Only `co_accused` is DERIVED. The other edge types (shared_phone,
shared_address, family, known_associate) are recorded by an operator with
evidence attached and are never generated here — inventing them would create
unfalsifiable links.

Contract: docs/11-GRAPH-INTELLIGENCE.md §2.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.db import create_pool
from app.services.graph_build import rebuild_co_accused_edges, recompute_node_metrics


async def run(with_metrics: bool) -> int:
    settings = get_settings()
    if not settings.database_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 2

    pool = await create_pool(settings)
    try:
        async with pool.acquire() as conn, conn.transaction():
            written = await rebuild_co_accused_edges(conn)
            print(f"co_accused edges written or refreshed: {written}")

            if with_metrics:
                scored = await recompute_node_metrics(conn)
                print(f"node metrics recomputed for {scored} persons")

            totals = await conn.fetchrow(
                """
                SELECT count(*) AS edges,
                       count(*) FILTER (WHERE cardinality(evidence_case_ids) = 0) AS unevidenced
                FROM   edge
                """
            )
        print(f"total edges: {totals['edges']}")
        if totals["unevidenced"]:
            # Every edge must cite the case files that produced it.
            print(
                f"WARNING: {totals['unevidenced']} edges carry no evidence case ids",
                file=sys.stderr,
            )
    finally:
        await pool.close()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Rebuild derived graph edges")
    parser.add_argument("--with-metrics", action="store_true", help="also recompute node metrics")
    args = parser.parse_args()
    return asyncio.run(run(args.with_metrics))


if __name__ == "__main__":
    raise SystemExit(main())
