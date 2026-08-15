"""Shared rate limiting, for deployments that run more than one process.

The in-process limiter is correct only when there is exactly one bucket store.
A serverless or multi-worker host runs several, so each would keep its own
counter and the effective limit would be N times the configured one — the
limit would silently stop being a limit.

Marked `db`; runs against real Postgres in CI.
"""

from __future__ import annotations

import pytest

from app.services.rate_limit import PgTokenBucketLimiter

pytestmark = pytest.mark.db


async def test_burst_is_allowed_then_the_next_call_is_refused(clean_db):
    limiter = PgTokenBucketLimiter("search", rate_per_minute=60, burst=3, pool=clean_db)

    results = [await limiter.check("device-a") for _ in range(3)]
    assert [allowed for allowed, _, _ in results] == [True, True, True]

    allowed, remaining, retry_after = await limiter.check("device-a")
    assert allowed is False
    assert remaining == 0
    assert retry_after >= 1


async def test_two_limiter_instances_share_one_budget(clean_db):
    """The whole point: this is what an in-process limiter cannot do.

    Two instances stand in for two processes on the same deployment.
    """
    one = PgTokenBucketLimiter("search", rate_per_minute=60, burst=2, pool=clean_db)
    two = PgTokenBucketLimiter("search", rate_per_minute=60, burst=2, pool=clean_db)

    assert (await one.check("device-b"))[0] is True
    assert (await two.check("device-b"))[0] is True
    # Budget of 2 is now spent, even though each instance only saw one call.
    assert (await two.check("device-b"))[0] is False


async def test_buckets_are_independent_per_key_and_per_name(clean_db):
    search = PgTokenBucketLimiter("search", rate_per_minute=60, burst=1, pool=clean_db)
    write = PgTokenBucketLimiter("write", rate_per_minute=60, burst=1, pool=clean_db)

    assert (await search.check("device-c"))[0] is True
    assert (await search.check("device-c"))[0] is False

    # A different device is unaffected...
    assert (await search.check("device-d"))[0] is True
    # ...and so is a different bucket for the same device.
    assert (await write.check("device-c"))[0] is True


async def test_tokens_refill_with_elapsed_time(clean_db):
    """Rewind updated_at rather than sleeping: a test that waits is a test
    nobody runs."""
    limiter = PgTokenBucketLimiter("read", rate_per_minute=60, burst=2, pool=clean_db)

    assert (await limiter.check("device-e"))[0] is True
    assert (await limiter.check("device-e"))[0] is True
    assert (await limiter.check("device-e"))[0] is False

    async with clean_db.acquire() as conn:
        await conn.execute(
            "UPDATE rate_bucket SET updated_at = updated_at - interval '30 seconds' "
            "WHERE bucket_key = $1",
            "read:device-e",
        )

    # 60/min for 30s = 30 tokens of refill, capped at the burst of 2.
    allowed, remaining, _ = await limiter.check("device-e")
    assert allowed is True
    assert remaining == 1


async def test_refill_never_exceeds_burst(clean_db):
    limiter = PgTokenBucketLimiter("read", rate_per_minute=600, burst=2, pool=clean_db)

    await limiter.check("device-f")
    async with clean_db.acquire() as conn:
        await conn.execute(
            "UPDATE rate_bucket SET updated_at = updated_at - interval '1 hour' "
            "WHERE bucket_key = $1",
            "read:device-f",
        )

    # An hour of refill must not hand out an hour's worth of tokens.
    allowed, remaining, _ = await limiter.check("device-f")
    assert allowed is True
    assert remaining == 1
