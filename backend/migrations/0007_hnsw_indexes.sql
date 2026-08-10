-- 0007 — HNSW vector indexes
--
-- Contract: docs/02-DATA-MODEL.md §3.3.
--
-- Indexed on halfvec: half the index memory, negligible recall loss, while
-- `embedding` itself stays full float32 as the source of truth.
--
-- PARTIAL PER model_id. The WHERE clause is what makes model isolation free
-- rather than a filter applied after the index scan. A new model gets its own
-- index in a new migration; it never replaces this one.
--
-- The query in app/services/vector_search.py MUST order by the identical
-- expression `embedding::halfvec(512) <=> $1::halfvec(512)` or Postgres
-- silently falls back to a sequential scan. tests/test_vector_search.py
-- asserts the plan contains an Index Scan.

CREATE INDEX idx_fe_hnsw_w600k_r50
    ON face_embedding
    USING hnsw ((embedding::halfvec(512)) halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE model_id = 'insightface/w600k_r50@1';
