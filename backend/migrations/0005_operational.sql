-- 0005 — operational: device, search_event, search_candidate, search_decision
--
-- Contract: docs/02-DATA-MODEL.md §6.

CREATE TABLE device (
    device_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Only the hash. A database dump yields no working keys.
    key_hash        bytea NOT NULL UNIQUE,
    label           text NOT NULL,
    app             text NOT NULL CHECK (app IN ('field','enroll')),
    revoked         boolean NOT NULL DEFAULT false,
    last_seen_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE search_event (
    search_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id       uuid REFERENCES device(device_id),

    -- Attribution, NOT authentication. Asserted by the client, never verified.
    officer_id      text NOT NULL,
    reason_code     text NOT NULL CHECK (reason_code IN
                        ('routine_check','suspicious_conduct','warrant_service',
                         'missing_person','post_incident','training','browse')),

    model_id        text NOT NULL,
    probe_quality   real NOT NULL,

    -- Retained only when RETAIN_PROBE_EMBEDDING=true, for audit replay.
    -- The probe PHOTOGRAPH is never stored. Not configurable.
    probe_embedding vector(512),

    geo_lat         double precision,
    geo_lon         double precision,

    -- Frozen per search so a decision can be re-audited against the policy
    -- that was actually in force when it was made.
    threshold_in_effect  real NOT NULL,
    band_config     jsonb NOT NULL,

    top_score       real,
    score_gap       real,
    candidate_count int NOT NULL DEFAULT 0,

    status          text NOT NULL DEFAULT 'PENDING_DECISION'
                    CHECK (status IN ('PENDING_DECISION','CLOSED','EXPIRED')),

    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Partial index backing the pending-decision brake: counting open searches
-- per device must be cheap, since it runs before every search.
CREATE INDEX idx_se_pending ON search_event (device_id) WHERE status = 'PENDING_DECISION';
CREATE INDEX idx_se_officer ON search_event (officer_id, created_at DESC);


CREATE TABLE search_candidate (
    search_id       uuid NOT NULL REFERENCES search_event(search_id) ON DELETE CASCADE,
    rank            int  NOT NULL CHECK (rank BETWEEN 1 AND 10),
    person_id       uuid NOT NULL REFERENCES person(person_id),
    embedding_id    uuid NOT NULL REFERENCES face_embedding(embedding_id),

    -- Frozen at query time. Never recomputed on read: what the officer saw
    -- is what the record shows, permanently.
    similarity      real NOT NULL,
    band            text NOT NULL CHECK (band IN ('NO_MATCH','WEAK','REVIEW','STRONG')),

    PRIMARY KEY (search_id, rank)
);


CREATE TABLE search_decision (
    -- PK on search_id is what makes decisions write-once.
    search_id       uuid PRIMARY KEY REFERENCES search_event(search_id) ON DELETE CASCADE,

    decision        text NOT NULL CHECK (decision IN
                        ('CONFIRMED','NO_MATCH','INCONCLUSIVE','ABORTED')),
    confirmed_person_id uuid REFERENCES person(person_id),
    confirmed_rank  int,

    officer_id      text NOT NULL,
    note            text,
    quality_override boolean NOT NULL DEFAULT false,
    decided_at      timestamptz NOT NULL DEFAULT now(),

    -- How long the human took. A cluster of sub-second confirmations is not
    -- careful review; it is someone tapping through.
    latency_ms      int,

    -- Makes "CONFIRMED with nobody confirmed" unrepresentable.
    CHECK ((decision = 'CONFIRMED') = (confirmed_person_id IS NOT NULL))
);
