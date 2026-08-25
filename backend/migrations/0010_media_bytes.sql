-- Postgres as a fallback media backend, for a deployment that will never see
-- R2 credentials: 10-20 enrolled people, not a production rollout.
--
-- R2 remains the default and preferred path where it is configured -
-- proxying bytes through a 512 MB serverless instance is exactly what
-- object_storage.py's docstring warns against at scale. At this scale
-- (a handful of ~200 KB JPEGs) that risk does not apply, and Cloudflare
-- requires a payment method on file for R2 even within its free tier, which
-- this deployment is deliberately avoiding.
--
-- r2_key drops its NOT NULL: a row now has EITHER an R2 key or inline bytes,
-- never neither once committed. The CHECK enforces that directly rather than
-- trusting every call site to remember it.

ALTER TABLE media ALTER COLUMN r2_key DROP NOT NULL;

ALTER TABLE media ADD COLUMN image_bytes  bytea;
ALTER TABLE media ADD COLUMN content_type text;

ALTER TABLE media ADD CONSTRAINT media_has_a_backend_once_committed
    CHECK (NOT committed OR r2_key IS NOT NULL OR image_bytes IS NOT NULL);
