-- Shared rate-limit buckets.
--
-- Only used when RATE_LIMIT_BACKEND=postgres. A single-process deployment
-- keeps its buckets in memory and never touches this table; a deployment that
-- runs several processes has no other way to share one budget, and without a
-- shared store the configured limit is silently multiplied by the number of
-- instances.
--
-- Deliberately not an audited table. A rate-limit bucket is transient
-- mechanism, not evidence, and writing every throttled request into the
-- hash-chained audit log would drown the record of who looked at whom.

CREATE TABLE IF NOT EXISTS rate_bucket (
    bucket_key text PRIMARY KEY,
    tokens     double precision NOT NULL,
    updated_at timestamptz      NOT NULL DEFAULT now()
);

-- Buckets are abandoned as soon as a device stops calling, so the table would
-- otherwise grow forever. Cheap to sweep on this index.
CREATE INDEX IF NOT EXISTS idx_rate_bucket_stale ON rate_bucket (updated_at);
