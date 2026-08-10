"""In-process token-bucket rate limiting.

In-process is correct HERE and only here: Render free runs exactly one uvicorn
worker (512 MB does not hold two plus a connection pool), so there is one
bucket store. Adding a second worker would silently double every limit — see
docs/ADR/0004-render-native-python.md.

A distributed limiter needs Redis, which is neither free nor warranted at this
scale.

Note this is a *rate* limit only. The brake that actually enforces human review
is the pending-decision limit, and that lives in a database trigger.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class _Bucket:
    tokens: float
    updated_at: float


@dataclass
class TokenBucketLimiter:
    rate_per_minute: int
    burst: int
    _buckets: dict[str, _Bucket] = field(default_factory=dict)

    def check(self, key: str, now: float | None = None) -> tuple[bool, int, int]:
        """Consume one token.

        Returns (allowed, remaining, retry_after_seconds).
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


class Limiters:
    """The named buckets, per docs/03-API-SPEC.md §8."""

    def __init__(self, settings: object) -> None:
        s = settings
        self.search = TokenBucketLimiter(getattr(s, "rate_limit_search_per_min", 20), burst=5)
        self.write = TokenBucketLimiter(getattr(s, "rate_limit_write_per_min", 30), burst=10)
        self.read = TokenBucketLimiter(getattr(s, "rate_limit_read_per_min", 120), burst=30)
        self.public = TokenBucketLimiter(getattr(s, "rate_limit_public_per_min", 30), burst=10)

    def reset_all(self) -> None:
        for limiter in (self.search, self.write, self.read, self.public):
            limiter.reset()
