-- 0006 — audit chain
--
-- Contract: docs/02-DATA-MODEL.md §8.
-- row_hash = sha256(prev_hash || canonical_json(row)). Construction taken
-- from KAVAL's audit_events so both systems verify identically.

CREATE TABLE audit_event (
    audit_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    seq             bigint GENERATED ALWAYS AS IDENTITY,

    occurred_at     timestamptz NOT NULL DEFAULT now(),
    actor_type      text NOT NULL CHECK (actor_type IN ('officer','operator','system','auditor')),
    actor_id        text NOT NULL,
    device_id       uuid REFERENCES device(device_id),

    action          text NOT NULL,
    subject_type    text NOT NULL,
    subject_id      text NOT NULL,

    -- Field NAMES only, never PII values, never embeddings. An audit log that
    -- accumulates the data it audits is a second breach surface.
    payload         jsonb NOT NULL DEFAULT '{}'::jsonb,

    prev_hash       bytea NOT NULL,
    row_hash        bytea NOT NULL,

    UNIQUE (seq)
);

CREATE INDEX idx_audit_subject ON audit_event (subject_type, subject_id);
CREATE INDEX idx_audit_actor   ON audit_event (actor_id, occurred_at DESC);
CREATE INDEX idx_audit_seq     ON audit_event (seq);
