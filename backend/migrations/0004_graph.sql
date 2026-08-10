-- 0004 — graph: edge, node_metric
--
-- Contract: docs/02-DATA-MODEL.md §5. Shape is deliberately identical to
-- KAVAL's grf_edges / grf_node_metrics so records are cross-queryable.

CREATE TABLE edge (
    edge_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    src_person_id   uuid NOT NULL REFERENCES person(person_id) ON DELETE CASCADE,
    dst_person_id   uuid NOT NULL REFERENCES person(person_id) ON DELETE CASCADE,

    edge_type       text NOT NULL CHECK (edge_type IN
                        ('co_accused','shared_address','shared_phone',
                         'same_mo','family','known_associate')),
    weight          real NOT NULL CHECK (weight BETWEEN 0 AND 1),

    -- WHY this edge exists. An edge asserting two people are connected
    -- without a citable case file is an unfalsifiable accusation.
    evidence_case_ids uuid[] NOT NULL DEFAULT '{}',
    first_seen      date,
    last_seen       date,
    computed_at     timestamptz NOT NULL DEFAULT now(),

    -- Undirected, stored once. Canonical ordering makes UNIQUE meaningful.
    CHECK (src_person_id < dst_person_id),
    UNIQUE (src_person_id, dst_person_id, edge_type)
);

-- Both directions indexed: traversal's lateral join hits either column.
CREATE INDEX idx_edge_src ON edge (src_person_id, weight DESC);
CREATE INDEX idx_edge_dst ON edge (dst_person_id, weight DESC);


CREATE TABLE node_metric (
    person_id       uuid PRIMARY KEY REFERENCES person(person_id) ON DELETE CASCADE,
    degree          int  NOT NULL DEFAULT 0,
    betweenness     real NOT NULL DEFAULT 0,
    community_id    int,
    computed_at     timestamptz NOT NULL DEFAULT now()
);
