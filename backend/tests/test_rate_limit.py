"""Token-bucket rate limiting."""

from __future__ import annotations

from app.services.rate_limit import TokenBucketLimiter


async def test_burst_is_allowed_then_exhausted():
    limiter = TokenBucketLimiter(rate_per_minute=60, burst=5)
    for _ in range(5):
        allowed, _, _ = await limiter.check("device-1", now=0.0)
        assert allowed
    allowed, remaining, retry_after = await limiter.check("device-1", now=0.0)
    assert not allowed
    assert remaining == 0
    assert retry_after >= 1


async def test_refills_over_time():
    limiter = TokenBucketLimiter(rate_per_minute=60, burst=2)  # 1 token/second
    await limiter.check("d", now=0.0)
    await limiter.check("d", now=0.0)
    assert not (await limiter.check("d", now=0.0))[0]
    assert (await limiter.check("d", now=1.1))[0]


async def test_refill_is_capped_at_burst():
    limiter = TokenBucketLimiter(rate_per_minute=60, burst=3)
    await limiter.check("d", now=0.0)
    for _ in range(3):
        assert (await limiter.check("d", now=1000.0))[0]
    assert not (await limiter.check("d", now=1000.0))[0]


async def test_buckets_are_independent_per_key():
    limiter = TokenBucketLimiter(rate_per_minute=60, burst=1)
    assert (await limiter.check("device-a", now=0.0))[0]
    assert not (await limiter.check("device-a", now=0.0))[0]
    assert (await limiter.check("device-b", now=0.0))[0]


async def test_prune_drops_idle_buckets():
    limiter = TokenBucketLimiter(rate_per_minute=60, burst=1)
    await limiter.check("old", now=0.0)
    await limiter.check("new", now=5000.0)
    assert limiter.prune(max_idle_seconds=3600, now=5000.0) == 1
    assert "old" not in limiter._buckets
    assert "new" in limiter._buckets


async def test_reset_clears_everything():
    limiter = TokenBucketLimiter(rate_per_minute=60, burst=1)
    await limiter.check("d", now=0.0)
    limiter.reset()
    assert (await limiter.check("d", now=0.0))[0]
