-- 0001 — extensions
--
-- pgvector for 512-d embedding storage and HNSW indexing.
-- pgcrypto for gen_random_uuid() and digest().

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
