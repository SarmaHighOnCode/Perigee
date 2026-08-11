# Perigee Core

FastAPI backend for [Perigee](../README.md). Stateless, **no ML dependencies**.

Face embedding runs on-device ([ADR-0001](../docs/ADR/0001-on-device-embedding.md)); this service
receives a 512-float vector and never sees an image. That absence is what keeps it inside Render's
free 512 MB tier with roughly 4× headroom.

> **Face recognition is deliberately on hold.** Development uses deterministic synthetic fixture
> embeddings. The `embedding: number[512]` contract is real and final, so the future on-device
> package drops in without a backend change. Fixture results are **connectivity fixtures, never
> recognition results.**

---

## Quick start

Requires Python 3.12+ and a PostgreSQL 17 with `pgvector`.

```bash
cd backend
python -m venv .venv && source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env          # then fill DATABASE_URL and DEVICE_KEY_PEPPER
python scripts/migrate.py
python scripts/seed_synthetic.py
python scripts/create_device_key.py --label DEV-LOCAL-01 --app field
uvicorn app.main:app --reload
```

Interactive docs at `http://localhost:8000/docs`, schema at `/openapi.json`.

### Postgres with pgvector, locally

```bash
docker run -d --name perigee-pg -p 5432:5432 \
  -e POSTGRES_USER=perigee -e POSTGRES_PASSWORD=perigee -e POSTGRES_DB=perigee \
  pgvector/pgvector:pg17
```

Or use a free [Neon](https://neon.tech) project — `pgvector` is available there and it needs no
local install. Use the **pooled** connection string (`-pooler` in the host); Neon's free-tier
connection limits are tight.

---

## Layout

```
app/
├── main.py            app factory, lifespan, middleware, error handlers
├── config.py          pydantic-settings; refuses to start without DATASET_MODE
├── db.py              asyncpg pool, migration runner, pgvector text encoding
├── dependencies.py    device key, officer attribution, rate limits
├── errors.py          the error taxonomy; codes are a public contract
├── models/            pydantic request/response -> OpenAPI
├── routers/           thin HTTP layer
├── services/
│   ├── embedding.py       probe validation (dim, finite, L2 norm, model, quality)
│   ├── scoring.py         bands, score gap, candidate assembly
│   ├── vector_search.py   the pgvector query (see the warning below)
│   ├── audit_chain.py     sha256(prev_hash || canonical_json(row))
│   ├── graph_traversal.py bounded recursive CTE, depth <= 3
│   ├── object_storage.py  R2 presigning; bytes never transit this service
│   └── rate_limit.py      in-process token bucket
└── repositories/      raw SQL, no ORM
```

---

## Things that will bite you

### 1. The pgvector index expression must match exactly

The index is on `(embedding::halfvec(512)) halfvec_cosine_ops`. The query's `ORDER BY` must be the
identical expression. If it drifts, Postgres **silently** falls back to a sequential scan — no
error, just a system that quietly degrades as the database grows.

```bash
pytest tests/test_db_integration.py::test_hnsw_index_is_used -v
```

CI runs `EXPLAIN (ANALYZE, BUFFERS)` against 200 seeded persons and fails if the plan is a seq scan.

### 2. De-duplication by person cannot happen in the index scan

`DISTINCT ON (person_id)` needs `ORDER BY person_id, ...`, which throws away the distance ordering
the index provides. The query therefore over-fetches by distance (4× top_k) and de-duplicates in an
outer query. Do not "simplify" this.

### 3. Never mix `model_id`s

Vectors from different models occupy different, incomparable spaces. Comparing them yields a number
that looks like a similarity and means nothing — the system does not crash, it starts returning the
wrong people. `model_id` is required, allowlisted, and filtered in every query.

### 4. Un-normalised vectors are the dangerous input

A wrong-length vector fails loudly. An un-normalised one does not error at all; it silently corrupts
cosine ranking. Hence the `0.99 <= ||v|| <= 1.01` check.

### 5. `SET LOCAL`, never session-level

`SET hnsw.ef_search` at session level persists until the connection returns to the pool and will
affect unrelated queries on that connection.

---

## Non-negotiable behaviours

Each is enforced in code or schema and covered by a test. If one of these breaks, it is not a
regression — it is a different product.

| Behaviour | Where enforced | Test |
| --- | --- | --- |
| No `is_match` field anywhere | absent by construction | `test_search_contract.py` (walks live OpenAPI) |
| A search opens `PENDING_DECISION` | `search_event.status` default | `test_api_flow.py` |
| 3 pending searches block the 4th | **database trigger** `trg_pending_limit` | `test_db_integration.py` |
| Decisions are write-once | PK on `search_decision.search_id` | `test_api_flow.py` (409) |
| PII needs a CONFIRMED decision | `assert_purpose_authorised` | `test_api_flow.py` (403) |
| Candidates are masked pre-confirmation | `masked_name` only in `Candidate` | `test_search_contract.py` |
| Audit is append-only | `BEFORE UPDATE/DELETE` triggers | `test_db_integration.py` |
| Audit chain is verifiable | `sha256(prev ‖ row)` | `test_audit_chain.py` (pinned vector) |
| Every response carries `dataset_mode` | response models | `test_search_contract.py` |
| A genuine no-match returns zero candidates | `assemble_candidates` | `test_scoring.py` |

---

## Testing

```bash
pytest tests -q                      # unit only; DB tests skip
PERIGEE_TEST_DATABASE_URL=postgresql://perigee:perigee@localhost:5432/perigee_test \
  pytest tests -q                    # full suite
pytest tests -m db -q                # database integration only
```

DB tests **skip** rather than fail when `PERIGEE_TEST_DATABASE_URL` is unset, so the unit suite runs
on a laptop with no Postgres. CI sets it against a real `pgvector/pgvector:pg17` container and
asserts at least 15 db-marked tests actually ran — a silently-skipped db suite would let a broken
vector path pass.

---

## Fixture embeddings for the mobile app

`scripts/seed_synthetic.py` writes `fixtures/probe_vectors.json` with named probes whose bands are
**measured against the seeded corpus, not assumed**:

| Fixture | Expected |
| --- | --- |
| `FIXTURE_STRONG` | STRONG band at rank 1 |
| `FIXTURE_REVIEW` | REVIEW band |
| `FIXTURE_AMBIGUOUS` | two close candidates, `ambiguous: true` |
| `FIXTURE_NO_MATCH` | **zero candidates** — the release outcome |

The file is gitignored (it is generated). CI publishes the verified copy as the **`probe-fixtures`**
artifact on every `backend-ci` run — download it from the Actions tab, or run the seed yourself.

**Why the vectors are not simply random:** two random unit vectors in 512-d have cosine ≈ 0, so a
naive seed would put every pair far below the NO_MATCH band and every search would return nothing.
The seed plants manifold and cohort structure to reproduce realistic ArcFace-like distributions
(cross-identity ~0.12–0.17, intra-identity ~0.77). Full reasoning in the script's docstring.

---

## Environment

See [`.env.example`](.env.example). Notes on the ones that matter:

| Variable | Note |
| --- | --- |
| `DATASET_MODE` | **No default.** The server refuses to start without it. |
| `DEVICE_KEY_PEPPER` | Rotating it invalidates every device key. |
| `ALLOWED_MODEL_IDS` | Anything not listed is rejected `422`, never silently searched. |
| `BAND_*` | Served via `GET /v1/config`; clients never hardcode a band. |
| `RETAIN_PROBE_EMBEDDING` | Default `false`. The probe *photograph* is never stored regardless. |
| `R2_*` | Optional. Without it, media endpoints return `503` and everything else works. |

Thresholds are environment variables, not constants, so tuning them is a restart rather than a
30-minute mobile build.

---

## Deployment

Render blueprint at [`../render.yaml`](../render.yaml). Native Python, no Docker.
Full runbook: [docs/10-DEPLOYMENT.md](../docs/10-DEPLOYMENT.md).

**Known limitation:** Render free spins down after 15 minutes idle with a ~50 s cold start. Four
layered mitigations are documented in §5 of the runbook. The mobile app pre-warms `/healthz` on
launch, which handles the common case.

---

## Not implemented

Deliberately out of scope for this milestone, in priority order:

- Face detection, alignment, ArcFace embedding, ONNX (on-device, mobile owner)
- Liveness / presentation-attack detection
- Authentication, RBAC, jurisdiction clamp — see [ADR-0003](../docs/ADR/0003-no-auth-defensible.md)
- `POST /v1/embed` — specified in the API spec, permanently disabled here (ArcFace does not fit in
  512 MB)
- CCTNS / ICJS integration
- External audit anchoring (currently tamper-*evident*, not tamper-*proof*)
