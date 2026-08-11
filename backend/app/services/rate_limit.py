"""Token-bucket rate limiting, in two flavours.

In-process (`TokenBucketLimiter`) is correct only where there is exactly one
bucket store: Render free runs exactly one uvicorn worker (512 MB does not hold
two plus a connection pool) — see docs/ADR/0004-render-native-python.md.

`PgTokenBucketLimiter` exists because that precondition does not survive a
serverless host, which runs as many instances as it likes. Each would keep its
own counter, so the effective limit becomes N times the configured one and the
limit silently stops being a limit. Postgres is already a hard dependency and
already holds the pending-decision limit, so it is the natural shared store; a
Redis just for this would be neither free nor warranted at this scale.

Selected by RATE_LIMIT_BACKEND. Both expose the same async `check`.

Note this is a *rate* limit only. The brake that actually enforces human review
is the pending-decision limit, and that lives in a database trigger.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field

import asyncpg


@dataclass
class _Bucket:
    tokens: float
    updated_at: float


@dataclass
class TokenBucketLimiter:
    rate_per_minute: int
    burst: int
    _buckets: dict[str, _Bucket] = field(default_factory=dict)

    async def check(self, key: str, now: float | None = None) -> tuple[bool, int, int]:
        """Consume one token.

        Returns (allowed, remaining, retry_after_seconds).

        Async only so it matches PgTokenBucketLimiter and the call sites do not
        have to know which backend they were handed.
        """
        now = time.monotonic() if now is None else now
        refill_per_second = self.rate_per_minute / 60.0

        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = _Bucket(tokens=float(self.burst), updated_at=now)
            self._buckets[key] = bucket

        elapsed = max(0.0, now - bucket.updated_at)
        bucket.tokens = min(float(self.burst), bucket.tokens + elapsed * refill_per_second)
        bucket.updated_at = now

        if bucket.tokens >= 1.0:
            bucket.tokens -= 1.0
            return True, int(bucket.tokens), 0

        deficit = 1.0 - bucket.tokens
        retry_after = max(1, int(deficit / refill_per_second) + 1)
        return False, 0, retry_after

    def reset(self) -> None:
        self._buckets.clear()

    def prune(self, max_idle_seconds: float = 3600.0, now: float | None = None) -> int:
        """Drop buckets nobody has touched. Without this the dict grows without
        bound over a long-running process."""
        now = time.monotonic() if now is None else now
        stale = [k for k, b in self._buckets.items() if now - b.updated_at > max_idle_seconds]
        for key in stale:
            del self._buckets[key]
        return len(stale)


class PgTokenBucketLimiter:
    """The same token bucket, kept in Postgres so every instance shares it.

    Refill and consumption happen in ONE statement. Read-then-write across two
    round trips would let two instances both observe the last token and both
    spend it, which is precisely the failure this class exists to prevent.
    """

    # The WHERE clause on DO UPDATE is what makes this safe: when the refilled
    # balance is under one token the update does not fire, no row comes back,
    # and nothing was consumed.
    _CONSUME = """
        INSERT INTO rate_bucket AS b (bucket_key, tokens, updated_at)
        VALUES ($1, $2::float8 - 1, now())
        ON CONFLICT (bucket_key) DO UPDATE
           SET tokens = LEAST($2::float8,
                              b.tokens
                              + EXTRACT(EPOCH FROM (now() - b.updated_at)) * $3::float8) - 1,
               updated_at = now()
         WHERE LEAST($2::float8,
                     b.tokens
                     + EXTRACT(EPOCH FROM (now() - b.updated_at)) * $3::float8) >= 1
        RETURNING tokens
    """

    _BALANCE = """
        SELECT LEAST($2::float8,
                     tokens + EXTRACT(EPOCH FROM (now() - updated_at)) * $3::float8)
        FROM   rate_bucket WHERE bucket_key = $1
    """

    def __init__(self, name: str, rate_per_minute: int, burst: int, pool: asyncpg.Pool) -> None:
        self.name = name
        self.rate_per_minute = rate_per_minute
        self.burst = burst
        self._pool = pool

    async def check(self, key: str) -> tuple[bool, int, int]:
        refill_per_second = self.rate_per_minute / 60.0
        bucket_key = f"{self.name}:{key}"

        async with self._pool.acquire() as conn:
            tokens = await conn.fetchval(
                self._CONSUME, bucket_key, float(self.burst), refill_per_second
            )
            if tokens is not None:
                return True, int(tokens), 0

            balance = await conn.fetchval(
                self._BALANCE, bucket_key, float(self.burst), refill_per_second
            )

        # The row can vanish between the two statements if a sweep runs; treat
        # a missing bucket as "wait one second" rather than dividing by nothing.
        deficit = 1.0 - float(balance if balance is not None else 0.0)
        return False, 0, max(1, math.ceil(deficit / refill_per_second))


class Limiters:
    """The named buckets, per docs/03-API-SPEC.md §8."""

    def __init__(self, settings: object, pool: asyncpg.Pool | None = None) -> None:
        s = settings
        shared = getattr(s, "rate_limit_backend", "memory") == "postgres" and pool is not None

        def build(name: str, per_min: int, burst: int):
            if shared:
                assert pool is not None
                return PgTokenBucketLimiter(name, per_min, burst, pool)
            return TokenBucketLimiter(per_min, burst=burst)

        self.shared = shared
        self.search = build("search", getattr(s, "rate_limit_search_per_min", 20), 5)
        self.write = build("write", getattr(s, "rate_limit_write_per_min", 30), 10)
        self.read = build("read", getattr(s, "rate_limit_read_per_min", 120), 30)
        self.public = build("public", getattr(s, "rate_limit_public_per_min", 30), 10)

    def reset_all(self) -> None:
        for limiter in (self.search, self.write, self.read, self.public):
            if isinstance(limiter, TokenBucketLimiter):
                limiter.reset()
