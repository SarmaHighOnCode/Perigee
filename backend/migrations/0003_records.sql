-- 0003 — records: offence, case_record, person_case
--
-- Contract: docs/02-DATA-MODEL.md §4.
-- IPC and BNS are both stored. The Bharatiya Nyaya Sanhita replaced the IPC
-- on 2024-07-01 and serving officers work across both, daily.

CREATE TABLE offence (
    offence_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ipc_section     text,
    bns_section     text,
    title           text NOT NULL,
    category        text NOT NULL,
    severity        text NOT NULL CHECK (severity IN ('petty','moderate','serious','heinous')),
    CHECK (ipc_section IS NOT NULL OR bns_section IS NOT NULL)
);


CREATE TABLE case_record (
    case_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fir_number      text NOT NULL,
    station         text NOT NULL,
    district        text NOT NULL,
    offence_id      uuid REFERENCES offence(offence_id),

    registered_on   date NOT NULL,
    status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','chargesheeted','convicted','acquitted','closed')),
    mo_text         text,
    summary         text,

    dataset_mode    text NOT NULL DEFAULT 'synthetic'
                    CHECK (dataset_mode IN ('synthetic','real')),
    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (station, fir_number)
);

CREATE INDEX idx_case_district ON case_record (district);


CREATE TABLE person_case (
    person_id       uuid NOT NULL REFERENCES person(person_id)    ON DELETE CASCADE,
    case_id         uuid NOT NULL REFERENCES case_record(case_id) ON DELETE CASCADE,

    -- 'accused' and 'convicted' are never summed into one count. Conflating
    -- them is how a screening tool becomes an accusation engine.
    role            text NOT NULL CHECK (role IN
                        ('accused','convicted','suspect','victim','witness','complainant')),
    created_at      timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (person_id, case_id, role)
);

CREATE INDEX idx_pc_case   ON person_case (case_id);
CREATE INDEX idx_pc_person ON person_case (person_id);
