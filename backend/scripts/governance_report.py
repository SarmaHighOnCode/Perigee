#!/usr/bin/env python
"""Oversight report over search and decision activity.

    python scripts/governance_report.py
    python scripts/governance_report.py --days 30

Controls only matter if someone looks. These are the signals from
docs/08-SECURITY.md §7, as runnable queries.

In a real deployment this belongs in a dashboard owned by someone who is NOT
the operator: oversight one reports to is not oversight.

Every figure here is aggregate. No name, no embedding, no probe image — the
report reads the audit trail without becoming a second copy of the data.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.db import create_pool

# (heading, why it matters, sql). Each query takes $1 = window in days.
CHECKS: list[tuple[str, str, str]] = [
    (
        "Decision latency",
        "A cluster of sub-second confirmations is not careful review; it is "
        "someone tapping through.",
        """
        SELECT count(*)                                                  AS decisions,
               count(*) FILTER (WHERE latency_ms < 1000)                 AS under_1s,
               count(*) FILTER (WHERE latency_ms < 3000)                 AS under_3s,
               round(avg(latency_ms)::numeric, 0)                        AS avg_ms
        FROM   search_decision
        WHERE  decided_at > now() - make_interval(days => $1)
        """,
    ),
    (
        "Reason codes",
        "A 'browse' spike suggests the purpose-binding control is being routed "
        "around rather than obeyed.",
        """
        SELECT reason_code, count(*) AS searches
        FROM   search_event
        WHERE  created_at > now() - make_interval(days => $1)
        GROUP  BY reason_code
        ORDER  BY searches DESC
        """,
    ),
    (
        "Officer ids per device",
        "One handset claiming many officer identities is either a shared device "
        "or spoofing. officer_id is asserted, never verified.",
        """
        SELECT d.label, count(DISTINCT se.officer_id) AS distinct_officers,
               count(*) AS searches
        FROM   search_event se
        JOIN   device d ON d.device_id = se.device_id
        WHERE  se.created_at > now() - make_interval(days => $1)
        GROUP  BY d.label
        HAVING count(DISTINCT se.officer_id) > 1
        ORDER  BY distinct_officers DESC
        """,
    ),
    (
        "Abandoned searches",
        "A high expiry rate means searches are being run and not adjudicated.",
        """
        SELECT status, count(*) AS searches
        FROM   search_event
        WHERE  created_at > now() - make_interval(days => $1)
        GROUP  BY status
        ORDER  BY searches DESC
        """,
    ),
    (
        "Quality overrides",
        "Frequent overrides mean the gate is either too strict or being ignored.",
        """
        SELECT count(*) FILTER (WHERE quality_override) AS overrides,
               count(*)                                 AS decisions
        FROM   search_decision
        WHERE  decided_at > now() - make_interval(days => $1)
        """,
    ),
    (
        "Confirmations below the REVIEW band",
        "THE MOST SERIOUS SIGNAL: an officer confirming an identification on " "weak evidence.",
        """
        SELECT sc.band, count(*) AS confirmations
        FROM   search_decision sd
        JOIN   search_candidate sc
               ON sc.search_id = sd.search_id AND sc.rank = sd.confirmed_rank
        WHERE  sd.decision = 'CONFIRMED'
          AND  sd.decided_at > now() - make_interval(days => $1)
        GROUP  BY sc.band
        ORDER  BY confirmations DESC
        """,
    ),
    (
        "Outcome mix",
        "Most searches SHOULD end in no match. A system that rarely clears "
        "anyone is not being used as intended.",
        """
        SELECT decision, count(*) AS n
        FROM   search_decision
        WHERE  decided_at > now() - make_interval(days => $1)
        GROUP  BY decision
        ORDER  BY n DESC
        """,
    ),
]


async def run(days: int) -> int:
    settings = get_settings()
    if not settings.database_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 2

    pool = await create_pool(settings)
    try:
        async with pool.acquire() as conn:
            print(f"PERIGEE GOVERNANCE REPORT - last {days} days")
            print(f"dataset_mode={settings.dataset_mode}")
            print("=" * 72)

            for heading, why, sql in CHECKS:
                print(f"\n{heading}")
                print(f"  {why}")
                rows = await conn.fetch(sql, days)
                if not rows:
                    print("  (no activity)")
                    continue
                for row in rows:
                    print("  " + "  ".join(f"{k}={v}" for k, v in dict(row).items()))

            print("\n" + "=" * 72)
            chain = await conn.fetchrow(
                "SELECT count(*) AS events, max(seq) AS head FROM audit_event"
            )
            print(f"audit chain: {chain['events']} events, head seq {chain['head']}")
            print("verify with: GET /v1/audit/verify")
    finally:
        await pool.close()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Perigee oversight report")
    parser.add_argument("--days", type=int, default=7, help="window in days (default 7)")
    args = parser.parse_args()
    return asyncio.run(run(args.days))


if __name__ == "__main__":
    raise SystemExit(main())
