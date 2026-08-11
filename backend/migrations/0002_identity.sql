-- 0002 — identity: person, media, face_embedding
--
-- Contract: docs/02-DATA-MODEL.md §3.
-- face_embedding deliberately carries NO PII. Exfiltrating it alone yields
-- floats and opaque UUIDs; re-identification needs a separately-scoped table.

CREATE TABLE person (
    person_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- PII. Never returned unless a CONFIRMED decision authorises it.
    full_name       text NOT NULL,
    aliases         text[] NOT NULL DEFAULT '{}',
    dob             date,
    gender          text CHECK (gender IN ('M','F','O','U')),
    address_line    text,
    phone           text,

    -- Always safe to return. Candidate lists render these, so four of five
    -- innocent people are never identified to the officer.
    masked_name     text NOT NULL,
    age_band        text CHECK (age_band IN ('18-25','26-35','36-45','46-60','60+','UNKNOWN')),
    district        text,

    status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','cleared','deceased','expunged')),

    dataset_mode    text NOT NULL DEFAULT 'synthetic'
                    CHECK (dataset_mode IN ('synthetic','real')),

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_person_district ON person (district) WHERE status = 'active';
CREATE INDEX idx_person_status   ON person (status);


CREATE TABLE media (
    media_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id       uuid NOT NULL REFERENCES person(person_id) ON DELETE CASCADE,

    r2_key          text NOT NULL UNIQUE,
    sha256          bytea,
    width           int,
    height          int,
    bytes           int,

    capture_angle   text NOT NULL DEFAULT 'frontal'
                    CHECK (capture_angle IN ('frontal','left','right','up','down')),
    is_primary      boolean NOT NULL DEFAULT false,
    exif_stripped   boolean NOT NULL DEFAULT true,

    -- Media rows are created at presign time and committed after the client
    -- has uploaded directly to R2. Uncommitted rows are not servable.
    committed       boolean NOT NULL DEFAULT false,

    created_at      timestamptz NOT NULL DEFAULT now(),
    committed_at    timestamptz
);

CREATE UNIQUE INDEX idx_media_one_primary ON media (person_id) WHERE is_primary;
CREATE INDEX idx_media_person ON media (person_id);


CREATE TABLE face_embedding (
    embedding_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id       uuid NOT NULL REFERENCES person(person_id) ON DELETE CASCADE,
    media_id        uuid REFERENCES media(media_id) ON DELETE SET NULL,

    -- Vectors from different models occupy different, incomparable spaces.
    -- Every query filters on this. See docs/01-ARCHITECTURE.md §7.
    model_id        text NOT NULL,
    embedding       vector(512) NOT NULL,

    quality_score   real NOT NULL CHECK (quality_score BETWEEN 0 AND 1),
    det_score       real,
    yaw             real,
    pitch           real,

    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (person_id, model_id, media_id)
);

CREATE INDEX idx_fe_person ON face_embedding (person_id);
CREATE INDEX idx_fe_model  ON face_embedding (model_id);
