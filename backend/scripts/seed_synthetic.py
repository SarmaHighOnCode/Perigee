#!/usr/bin/env python
"""Deterministic synthetic seed.

    python scripts/seed_synthetic.py
    python scripts/seed_synthetic.py --persons 500 --reset

NO REAL FACE, NAME, OR RECORD IS USED AT ANY POINT. Every row is written with
dataset_mode='synthetic'.

────────────────────────────────────────────────────────────────────────────
WHY THE VECTORS ARE NOT SIMPLY RANDOM
────────────────────────────────────────────────────────────────────────────
Two independent random unit vectors in 512 dimensions have cosine similarity
≈ 0 ± 0.044. If identities were drawn that way, every similarity in the corpus
would sit far below the NO_MATCH band (0.28), every search would return zero
candidates, and the API would look broken while behaving correctly.

Real ArcFace embeddings are not uniform on the sphere: faces occupy a manifold,
so different identities score ~0.0-0.3 and images of one identity score ~0.5-0.9.
This seed reproduces that structure:

    identity_core = normalise( 0.38·global + 0.22·cohort + 1.00·person )
    embedding     = normalise( identity_core + 0.55·noise )

giving cross-identity ~0.12-0.17 and intra-identity ~0.77 - close enough to
real distributions that thresholds tuned here mean something later.

These are CONNECTIVITY FIXTURES, not face-recognition results. They exercise the
pgvector path and the decision loop. They say nothing about whether any face
recognition model works.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections import deque
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.db import create_pool, encode_vector
from app.repositories.person import mask_name

SEED = 20260810
DIM = 512

# Manifold weights. Derived in the module docstring; changing them changes the
# similarity distribution and therefore which band every fixture lands in.
GLOBAL_W = 0.38
COHORT_W = 0.22
PERSON_W = 1.00
INTRA_NOISE = 0.55

N_COHORTS = 12

FIRST_NAMES = [
    "Ramesh",
    "Suresh",
    "Anil",
    "Vijay",
    "Prakash",
    "Manoj",
    "Deepak",
    "Rajesh",
    "Sunil",
    "Ashok",
    "Kiran",
    "Ganesh",
    "Mahesh",
    "Naveen",
    "Sanjay",
    "Arun",
    "Lakshmi",
    "Priya",
    "Kavita",
    "Sunita",
    "Meena",
    "Anita",
    "Rekha",
    "Shobha",
    "Divya",
    "Pooja",
    "Sneha",
    "Asha",
    "Geeta",
    "Radha",
]
LAST_NAMES = [
    "Kumar",
    "Sharma",
    "Reddy",
    "Nair",
    "Patil",
    "Gowda",
    "Shetty",
    "Rao",
    "Naidu",
    "Hegde",
    "Bhat",
    "Desai",
    "Joshi",
    "Menon",
    "Pillai",
    "Iyer",
]
DISTRICTS = [
    "Bengaluru South",
    "Bengaluru North",
    "Bengaluru East",
    "Mysuru",
    "Mangaluru",
    "Hubballi",
    "Belagavi",
    "Kalaburagi",
]
STATIONS = [
    "Jayanagar",
    "Koramangala",
    "Whitefield",
    "Indiranagar",
    "Rajajinagar",
    "Malleshwaram",
    "Banashankari",
    "Yelahanka",
]
AGE_BANDS = ["18-25", "26-35", "36-45", "46-60", "60+"]

# IPC / BNS dual citation. The Bharatiya Nyaya Sanhita replaced the IPC on
# 2024-07-01 and officers work across both, daily.
OFFENCES = [
    ("IPC 379", "BNS 303(2)", "Theft", "property", "moderate"),
    ("IPC 380", "BNS 305", "Theft in dwelling house", "property", "moderate"),
    ("IPC 392", "BNS 309(4)", "Robbery", "property", "serious"),
    ("IPC 420", "BNS 318(4)", "Cheating", "economic", "moderate"),
    ("IPC 457", "BNS 331(4)", "House-breaking by night", "property", "serious"),
    ("IPC 323", "BNS 115(2)", "Voluntarily causing hurt", "violent", "moderate"),
    ("IPC 341", "BNS 126(2)", "Wrongful restraint", "violent", "petty"),
    ("IPC 302", "BNS 103(1)", "Murder", "violent", "heinous"),
    ("IPC 411", "BNS 317(2)", "Receiving stolen property", "property", "moderate"),
    ("IPC 465", "BNS 336(2)", "Forgery", "economic", "moderate"),
]

EDGE_BASE_WEIGHT = {
    "co_accused": 0.60,
    "shared_phone": 0.55,
    "family": 0.50,
    "shared_address": 0.45,
    "known_associate": 0.35,
    "same_mo": 0.25,
}


def normalise(v: np.ndarray) -> np.ndarray:
    return v / np.linalg.norm(v)


def build_identity_cores(rng: np.random.Generator, n: int) -> tuple[np.ndarray, list[int]]:
    """Identity centroids with planted manifold + cohort structure."""
    global_dir = normalise(rng.normal(size=DIM))
    cohort_dirs = [normalise(rng.normal(size=DIM)) for _ in range(N_COHORTS)]

    cores = np.empty((n, DIM), dtype=np.float64)
    cohorts: list[int] = []
    for i in range(n):
        cohort = int(rng.integers(0, N_COHORTS))
        cohorts.append(cohort)
        cores[i] = normalise(
            GLOBAL_W * global_dir
            + COHORT_W * cohort_dirs[cohort]
            + PERSON_W * normalise(rng.normal(size=DIM))
        )

    # One planted lookalike pair, so the ambiguity path (score_gap < 0.05) has
    # something real to trigger on during a demo.
    if n >= 2:
        cores[1] = normalise(0.80 * cores[0] + 0.60 * normalise(rng.normal(size=DIM)))

    return cores, cohorts


def jitter(rng: np.random.Generator, core: np.ndarray, noise: float) -> np.ndarray:
    return normalise(core + noise * normalise(rng.normal(size=DIM)))


def brandes_betweenness(nodes: list[int], adjacency: dict[int, set[int]]) -> dict[int, float]:
    """Unweighted betweenness centrality (Brandes 2001).

    ~35 lines, so networkx is not a dependency for a nightly batch job. O(V·E),
    which is instant at this scale and is why it never runs in a request path.
    """
    cb = dict.fromkeys(nodes, 0.0)
    for s in nodes:
        stack: list[int] = []
        preds: dict[int, list[int]] = {v: [] for v in nodes}
        sigma = dict.fromkeys(nodes, 0.0)
        dist = dict.fromkeys(nodes, -1)
        sigma[s] = 1.0
        dist[s] = 0
        queue = deque([s])

        while queue:
            v = queue.popleft()
            stack.append(v)
            for w in adjacency.get(v, ()):
                if dist[w] < 0:
                    dist[w] = dist[v] + 1
                    queue.append(w)
                if dist[w] == dist[v] + 1:
                    sigma[w] += sigma[v]
                    preds[w].append(v)

        delta = dict.fromkeys(nodes, 0.0)
        while stack:
            w = stack.pop()
            for v in preds[w]:
                delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]) if sigma[w] else 0.0
            if w != s:
                cb[w] += delta[w]

    scale = 1.0 / ((len(nodes) - 1) * (len(nodes) - 2)) if len(nodes) > 2 else 1.0
    return {v: c * scale for v, c in cb.items()}


async def seed(persons_n: int, cases_n: int, reset: bool) -> int:
    settings = get_settings()
    if not settings.database_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 2
    if settings.dataset_mode != "synthetic":
        print("refusing to seed: DATASET_MODE is not 'synthetic'", file=sys.stderr)
        return 2

    rng = np.random.default_rng(SEED)
    model_id = settings.model_ids[0]
    pool = await create_pool(settings)

    try:
        async with pool.acquire() as conn:
            if reset:
                # Order matters: audit_event is append-only by trigger, so it is
                # dropped by TRUNCATE ... CASCADE only with triggers disabled.
                await conn.execute("ALTER TABLE audit_event DISABLE TRIGGER USER")
                await conn.execute(
                    "TRUNCATE search_decision, search_candidate, search_event, "
                    "audit_event, face_embedding, media, person_case, edge, "
                    "node_metric, case_record, person, offence RESTART IDENTITY CASCADE"
                )
                await conn.execute("ALTER TABLE audit_event ENABLE TRIGGER USER")

            existing = await conn.fetchval("SELECT count(*) FROM person")
            if existing:
                print(f"database already has {existing} persons; use --reset to rebuild")
                return 0

            # ---------------------------------------------------------------
            # offences
            # ---------------------------------------------------------------
            offence_ids = []
            for ipc, bns, title, category, severity in OFFENCES:
                oid = await conn.fetchval(
                    """
                    INSERT INTO offence (ipc_section, bns_section, title, category, severity)
                    VALUES ($1,$2,$3,$4,$5) RETURNING offence_id
                    """,
                    ipc,
                    bns,
                    title,
                    category,
                    severity,
                )
                offence_ids.append(oid)

            # ---------------------------------------------------------------
            # persons + embeddings
            # ---------------------------------------------------------------
            cores, cohorts = build_identity_cores(rng, persons_n)
            person_ids: list[Any] = []

            for i in range(persons_n):
                full_name = (
                    f"{FIRST_NAMES[int(rng.integers(0, len(FIRST_NAMES)))]} "
                    f"{LAST_NAMES[int(rng.integers(0, len(LAST_NAMES)))]}"
                )
                pid = await conn.fetchval(
                    """
                    INSERT INTO person (
                        full_name, aliases, gender, masked_name, age_band,
                        district, phone, dataset_mode
                    )
                    VALUES ($1,$2,$3,$4,$5,$6,$7,'synthetic')
                    RETURNING person_id
                    """,
                    full_name,
                    [],
                    "M" if rng.random() < 0.78 else "F",
                    mask_name(full_name),
                    AGE_BANDS[int(rng.integers(0, len(AGE_BANDS)))],
                    DISTRICTS[int(rng.integers(0, len(DISTRICTS)))],
                    f"9{int(rng.integers(100000000, 999999999))}",
                )
                person_ids.append(pid)

                # Multi-angle enrolment: 1-3 embeddings per person, all under
                # the same model_id. Pose variance covered here is variance the
                # field probe does not have to match.
                for angle_idx in range(1 + int(rng.integers(0, 3))):
                    vec = cores[i] if angle_idx == 0 else jitter(rng, cores[i], INTRA_NOISE)
                    await conn.execute(
                        """
                        INSERT INTO face_embedding (
                            person_id, model_id, embedding, quality_score, det_score
                        )
                        VALUES ($1,$2,$3::text::vector(512),$4,$5)
                        """,
                        pid,
                        model_id,
                        encode_vector([float(x) for x in vec]),
                        float(0.62 + rng.random() * 0.35),
                        float(0.85 + rng.random() * 0.14),
                    )

            # ---------------------------------------------------------------
            # cases + person_case
            # ---------------------------------------------------------------
            case_ids: list[Any] = []
            case_members: dict[Any, list[Any]] = {}

            for c in range(cases_n):
                station = STATIONS[int(rng.integers(0, len(STATIONS)))]
                # A real date object: asyncpg binds `date` columns strictly and
                # rejects an ISO string.
                registered_on = date(
                    2022 + int(rng.integers(0, 4)),
                    int(rng.integers(1, 13)),
                    int(rng.integers(1, 28)),
                )
                cid = await conn.fetchval(
                    """
                    INSERT INTO case_record (
                        fir_number, station, district, offence_id, registered_on,
                        status, mo_text, dataset_mode
                    )
                    VALUES ($1,$2,$3,$4,$5,$6,$7,'synthetic')
                    RETURNING case_id
                    """,
                    f"{c + 1:04d}/{2022 + int(rng.integers(0, 4))}",
                    station,
                    DISTRICTS[int(rng.integers(0, len(DISTRICTS)))],
                    offence_ids[int(rng.integers(0, len(offence_ids)))],
                    registered_on,
                    ["open", "chargesheeted", "convicted", "acquitted", "closed"][
                        int(rng.integers(0, 5))
                    ],
                    "Entry through rear window; tools recovered nearby.",
                )
                case_ids.append(cid)

                # Co-accused draw from the same cohort, so planted communities
                # actually show up in the graph.
                cohort = int(rng.integers(0, N_COHORTS))
                pool_idx = [i for i, c_ in enumerate(cohorts) if c_ == cohort] or list(
                    range(persons_n)
                )
                members = list(
                    rng.choice(
                        pool_idx,
                        size=min(len(pool_idx), 1 + int(rng.integers(0, 4))),
                        replace=False,
                    )
                )
                case_members[cid] = [person_ids[int(m)] for m in members]

                for m in members:
                    role = "convicted" if rng.random() < 0.28 else "accused"
                    await conn.execute(
                        "INSERT INTO person_case (person_id, case_id, role) "
                        "VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
                        person_ids[int(m)],
                        cid,
                        role,
                    )

            # ---------------------------------------------------------------
            # edges — co_accused derived from shared cases, others planted
            # ---------------------------------------------------------------
            pair_cases: dict[tuple[Any, Any], list[Any]] = {}
            for cid, members in case_members.items():
                for i in range(len(members)):
                    for j in range(i + 1, len(members)):
                        a, b = sorted((members[i], members[j]), key=str)
                        pair_cases.setdefault((a, b), []).append(cid)

            edge_count = 0
            for (a, b), evidence in pair_cases.items():
                weight = min(
                    1.0,
                    EDGE_BASE_WEIGHT["co_accused"] + 0.15 * np.log2(1 + len(evidence)),
                )
                await conn.execute(
                    """
                    INSERT INTO edge (
                        src_person_id, dst_person_id, edge_type, weight, evidence_case_ids
                    )
                    VALUES ($1,$2,'co_accused',$3,$4)
                    ON CONFLICT (src_person_id, dst_person_id, edge_type) DO NOTHING
                    """,
                    a,
                    b,
                    float(weight),
                    evidence,
                )
                edge_count += 1

            # Supplementary edge types. Every one still carries evidence — an
            # edge without a citable case is an unfalsifiable accusation.
            for edge_type in ("shared_phone", "shared_address", "family", "known_associate"):
                for _ in range(persons_n // 6):
                    i, j = rng.choice(persons_n, size=2, replace=False)
                    a, b = sorted((person_ids[int(i)], person_ids[int(j)]), key=str)
                    if a == b:
                        continue
                    await conn.execute(
                        """
                        INSERT INTO edge (
                            src_person_id, dst_person_id, edge_type, weight, evidence_case_ids
                        )
                        VALUES ($1,$2,$3,$4,$5)
                        ON CONFLICT (src_person_id, dst_person_id, edge_type) DO NOTHING
                        """,
                        a,
                        b,
                        edge_type,
                        float(EDGE_BASE_WEIGHT[edge_type] + rng.random() * 0.15),
                        [case_ids[int(rng.integers(0, len(case_ids)))]],
                    )
                    edge_count += 1

            # ---------------------------------------------------------------
            # node_metric — degree, betweenness, community
            # ---------------------------------------------------------------
            edge_rows = await conn.fetch("SELECT src_person_id, dst_person_id FROM edge")
            index_of = {pid: i for i, pid in enumerate(person_ids)}
            adjacency: dict[int, set[int]] = {i: set() for i in range(persons_n)}
            for r in edge_rows:
                s, d = index_of.get(r["src_person_id"]), index_of.get(r["dst_person_id"])
                if s is not None and d is not None:
                    adjacency[s].add(d)
                    adjacency[d].add(s)

            betweenness = brandes_betweenness(list(range(persons_n)), adjacency)
            await conn.executemany(
                """
                INSERT INTO node_metric (person_id, degree, betweenness, community_id)
                VALUES ($1,$2,$3,$4)
                ON CONFLICT (person_id) DO UPDATE
                    SET degree = EXCLUDED.degree,
                        betweenness = EXCLUDED.betweenness,
                        community_id = EXCLUDED.community_id
                """,
                [
                    (person_ids[i], len(adjacency[i]), float(betweenness[i]), cohorts[i])
                    for i in range(persons_n)
                ],
            )

            # ---------------------------------------------------------------
            # fixture probes — VERIFIED against the corpus, not assumed
            # ---------------------------------------------------------------
            fixtures = await build_fixtures(conn, rng, cores, model_id, settings)

    finally:
        await pool.close()

    out = Path(__file__).resolve().parent.parent / "fixtures" / "probe_vectors.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(fixtures, indent=2), encoding="utf-8")

    print(f"seeded {persons_n} persons, {cases_n} cases, ~{edge_count} edges")
    print(f"fixtures written to {out}")
    print()
    print(f"{'FIXTURE':<22} {'TOP SIM':>8}  EXPECTED BAND")
    for name, f in fixtures["fixtures"].items():
        print(f"{name:<22} {f['observed_top_similarity']:>8.4f}  {f['expected_band']}")
    return 0


async def build_fixtures(
    conn, rng: np.random.Generator, cores: np.ndarray, model_id: str, settings
) -> dict[str, Any]:
    """Named probes the mobile app can send for predictable results.

    Each is VERIFIED against the seeded corpus rather than assumed: the band a
    fixture lands in is measured, and the no-match fixture is resampled until it
    genuinely falls below the NO_MATCH floor. Determinism is preserved because
    the RNG is seeded.
    """

    async def top_similarity(vec: np.ndarray) -> float:
        value = await conn.fetchval(
            """
            SELECT 1 - MIN(embedding <=> $1::text::vector(512))
            FROM   face_embedding WHERE model_id = $2
            """,
            encode_vector([float(x) for x in vec]),
            model_id,
        )
        return float(value) if value is not None else 0.0

    specs = [
        ("FIXTURE_STRONG", 0.60, "STRONG"),
        ("FIXTURE_REVIEW", 1.05, "REVIEW"),
        ("FIXTURE_AMBIGUOUS", 0.62, "STRONG"),
    ]

    fixtures: dict[str, Any] = {}
    for idx, (name, noise, expected) in enumerate(specs):
        # FIXTURE_AMBIGUOUS targets the planted lookalike pair (cores 0 and 1).
        core = cores[0] if name == "FIXTURE_AMBIGUOUS" else cores[idx * 7 % len(cores)]
        vec = jitter(rng, core, noise)
        fixtures[name] = {
            "embedding": [round(float(x), 8) for x in vec],
            "expected_band": expected,
            "observed_top_similarity": round(await top_similarity(vec), 4),
        }

    # A genuine no-match: a fresh identity core that was never enrolled.
    # Verified, because the maximum of ~800 cross-identity similarities has a
    # tail that can drift above the floor by chance.
    for attempt in range(50):
        candidate = normalise(rng.normal(size=DIM))
        observed = await top_similarity(candidate)
        if observed < settings.band_no_match:
            fixtures["FIXTURE_NO_MATCH"] = {
                "embedding": [round(float(x), 8) for x in candidate],
                "expected_band": "NONE (zero candidates returned)",
                "observed_top_similarity": round(observed, 4),
                "attempts": attempt + 1,
            }
            break
    else:
        raise RuntimeError(
            "could not construct a below-threshold no-match fixture in 50 attempts; "
            "the manifold weights in this module need lowering"
        )

    return {
        "model_id": model_id,
        "dim": DIM,
        "seed": SEED,
        "bands": settings.band_config,
        "note": (
            "CONNECTIVITY FIXTURES ONLY. These are synthetic vectors that exercise "
            "the pgvector search path and the decision loop. They are not face "
            "recognition results and must never be presented as such."
        ),
        "fixtures": fixtures,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed deterministic synthetic data")
    parser.add_argument("--persons", type=int, default=500)
    parser.add_argument("--cases", type=int, default=300)
    parser.add_argument("--reset", action="store_true", help="truncate before seeding")
    args = parser.parse_args()
    return asyncio.run(seed(args.persons, args.cases, args.reset))


if __name__ == "__main__":
    raise SystemExit(main())
