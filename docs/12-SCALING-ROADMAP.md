# 12 — Scaling & Roadmap

What breaks, when, and what replaces it. Written so that "room for improvement and scalability" is a
set of specific, costed migrations rather than a claim.

---

## 1. The scaling ladder

| Enrolled faces | Storage | Search p95 | Architecture | Cost/mo |
| --- | --- | --- | --- | --- |
| **10³** *(prototype)* | 12 MB | 15 ms | Neon free · HNSW halfvec · Render free | **₹0** |
| **10⁴** *(one district)* | 60 MB | 25 ms | Same. No change required. | ₹0 |
| **10⁵** *(one state, partial)* | 500 MB | 60 ms | Neon paid; `ef_search` tuning; Render starter | ~₹2,000 |
| **10⁶** *(one state)* | 5 GB | 120 ms | Self-hosted PG; partition by district; partial indexes per jurisdiction | ~₹15,000 |
| **10⁷** *(multi-state)* | 50 GB | 200 ms | Binary quantization + full-precision rerank, **or** a dedicated ANN engine | ~₹80,000 |
| **10⁸** *(national)* | 500 GB | — | GPU index, regional sharding, federated by state | Enterprise |

Each row below explains what actually breaks and why the fix is the fix.

---

## 2. 10³ → 10⁵: nothing breaks

Genuinely nothing. pgvector with HNSW handles 100,000 512-d vectors on modest hardware. The changes
are tuning, not architecture:

```sql
-- Recall improves with ef_search; latency degrades linearly. Per-query, never global.
BEGIN;
  SET LOCAL hnsw.ef_search = 100;   -- default 40
  SELECT …;
COMMIT;
```

**The binding constraint is Neon free's 0.5 GB**, and it binds at roughly **60,000 faces** —
including the HNSW index and the audit log. Not the query engine, and not the CPU.

**Do not raise `ef_search` globally.** Session-level `SET` persists until the connection is returned
to the pool, which means it silently affects unrelated queries on that connection. `SET LOCAL` inside
a transaction dies with the transaction. This is a real, hard-to-diagnose bug class on pooled
connections.

---

## 3. 10⁵ → 10⁶: partitioning and index memory

Two things start to matter.

### Index memory

HNSW must live in RAM to perform. Budget:

```
halfvec(512)      = 1,024 bytes
HNSW graph (m=16) ≈ 16 × 2 × 8 bytes of links + node overhead ≈ 400 bytes
                  ────────────────────────────────────────────
per vector        ≈ 1.4 KB
1,000,000 vectors ≈ 1.4 GB of index
```

**Rule of thumb: when the index reaches 60% of available RAM, plan the next step.** Once it spills to
disk, p95 degrades by an order of magnitude — not gracefully, and usually first under load.

### Jurisdictional partitioning

The natural partition key is also the natural *policy* key. An officer in Bengaluru South rarely
needs to search all of India, and the jurisdiction clamp from
[08 §8](08-SECURITY.md#8--upgrade-path-to-production-auth) becomes a performance optimisation as well
as a privacy control:

```sql
CREATE TABLE face_embedding (…) PARTITION BY LIST (jurisdiction_code);
CREATE TABLE face_embedding_blr PARTITION OF face_embedding FOR VALUES IN ('KA-BLR');
-- one HNSW index per partition; searches touch one
```

This is the most valuable single change on the ladder, because privacy scoping and query pruning
turn out to be the same operation.

### halfvec was the right call from the start

The index is already built on `(embedding::halfvec(512))` — half the memory, negligible recall loss,
with `embedding` retained at full `float32` as the source of truth
([02 §3.3](02-DATA-MODEL.md#33-face_embedding--the-core-table)).

**Retrofitting quantization onto a large table is painful; starting with it is free.** Same reasoning
applies one rung up.

---

## 4. 10⁶ → 10⁷: binary quantization, or leave Postgres

Two viable paths.

### Path A — stay on Postgres, quantize harder

```sql
-- 1. Binary quantization: 512 bits = 64 bytes per vector, 32× smaller than float32.
CREATE INDEX ON face_embedding
    USING hnsw ((binary_quantize(embedding)::bit(512)) bit_hamming_ops);

-- 2. Retrieve wide on the cheap index, rerank narrow at full precision.
SELECT * FROM (
    SELECT person_id, embedding
    FROM   face_embedding
    WHERE  model_id = $2
    ORDER  BY binary_quantize(embedding)::bit(512) <~> binary_quantize($1::vector(512))
    LIMIT  200                                        -- coarse: Hamming distance
) coarse
ORDER BY embedding <=> $1::vector(512)                -- exact: cosine
LIMIT 5;
```

Recall lost at the coarse stage is recovered by the rerank. The 200-candidate window is the tuning
knob — wider costs latency, narrower costs recall.

**Do not adopt binary quantization without a rerank stage.** Hamming distance on 512 bits is too
coarse for 1:N face identification on its own, and the failure is silent: plausible-looking wrong
people.

### Path B — dedicated ANN engine

| Engine | Fit | Cost |
| --- | --- | --- |
| **Qdrant** | Excellent filtering, easy self-host, good docs | Two systems to run |
| **Milvus** | GPU indexes, best at 10⁸ | Heavy to operate |
| **InsightFace Server** | Purpose-built; 50 M+ images on one GPU with INT8 embeddings | Vendor-coupled |

**Recommendation: Path A until it demonstrably fails.** Two datastores means two consistency
problems, two backup stories, two failure modes, and a synchronisation job that will eventually
drift. Postgres holding relational, vector and graph data in one transaction is worth a great deal of
latency, and the point at which it stops being worth it is measurable rather than theoretical.

**The migration signal is specific:** p95 above 300 ms after Path A tuning, *or* recall below 0.95 on
the held-out set. Not "it feels slow."

---

## 5. Audit chain at scale

The chain is strictly sequential — `row_hash` depends on `prev_hash` — so writes serialise. At high
volume this becomes the bottleneck.

| Scale | Approach |
| --- | --- |
| < 10⁶ events | Single chain. Fine. |
| 10⁶ – 10⁸ | **Chain per jurisdiction**, plus a daily root hash across chains |
| > 10⁸ | Merkle tree per day; publish the root externally |

**External anchoring** is what upgrades tamper-*evident* to tamper-*proof*
([08 §3](08-SECURITY.md#layer-8--audit-chain)):

```
daily: root = merkle_root(all events for the day)
       → write to S3 with Object Lock (WORM), and/or
       → publish the root hash somewhere public and append-only
```

Once the day's root is committed externally, rewriting any event from that day is detectable by
anyone, including someone with full database access. This is the single change that would let the
system claim tamper-proofing honestly, and it is roughly a day of work.

---

## 6. Capability roadmap

Ordered by value per unit of effort. Everything in this table is *not built*.

### Tier 1 — before any real deployment

| Capability | Why | Effort |
| --- | --- | --- |
| **Liveness / presentation-attack detection** | A printed photo currently defeats the system (threat T2) | 3–5 days |
| **Auth phase 2** — OIDC, RBAC, jurisdiction clamp | `officer_id` becomes verified rather than asserted | ~2 days |
| **Per-cohort accuracy measurement** | The bias question is unanswerable without it | 2–3 days |
| **Device attestation** | Closes threat T1, adversarial embedding submission | 2 days |
| **External audit anchoring** | Tamper-proof rather than tamper-evident | 1 day |

**Liveness is first for a reason.** It is the difference between a system that verifies a person and
one that verifies a photograph of a person. Candidates: MiniFASNet (small, ONNX-exportable, runs
on-device alongside the existing pipeline), or a challenge-response blink/turn flow — which needs no
model at all and is a strong fit for a supervised roadside interaction where an officer is watching.

### Tier 2 — makes it genuinely useful

| Capability | Why | Effort |
| --- | --- | --- |
| Multi-frame probe | Embed 3 frames, average → measurably better accuracy | 1 day |
| Temporal graph | Watch a network form over time | 2 days |
| Offline-first enrolment | Rural stations with intermittent connectivity | 3 days |
| Kannada / Hindi localisation | Officers do not all work in English | 2 days |
| Supervisor co-sign | Two-person rule before detention | 2 days |
| Voice notes on decisions | Faster than typing at a roadside | 1 day |

### Tier 3 — new products

| Capability | Note |
| --- | --- |
| CCTV / video ingestion | **Different system, different legal basis.** Crowd scanning is not what this is. |
| Missing-persons matching | Same engine, sympathetic use case, far simpler legal position |
| Unidentified-body identification | High humanitarian value; low controversy |
| Cross-state federation | Requires NCRB, MoUs, and a federated privacy model |

**Missing persons is the strategically smart next build.** Identical pipeline, dramatically simpler
consent and proportionality analysis (families *want* the search), and it demonstrates the technology
in a framing where nobody argues about civil liberties. If this project needs a second act that
builds institutional trust, that is it.

---

## 7. Self-hosted deployment

Any real deployment moves off free tiers, and probably off public cloud entirely — biometric
templates for a state's criminal records are not data a department will keep on someone else's
infrastructure.

```
┌─ Department datacentre / state cloud ──────────────────┐
│                                                         │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────────┐ │
│  │ HAProxy  │──▶│ FastAPI ×3   │──▶│ Postgres 17     │ │
│  │ mTLS     │   │ (systemd)    │   │ + pgvector      │ │
│  └──────────┘   └──────────────┘   │ + streaming     │ │
│       ▲                            │   replica       │ │
│       │                            └─────────────────┘ │
│  department handsets                ┌─────────────────┐ │
│  (mTLS client certs)                │ MinIO (S3 API)  │ │
│                                     │ WORM audit sink │ │
│                                     └─────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**What changes:** the connection string, the object-store endpoint, and the auth middleware.

**What does not:** the API contract, the schema, the mobile apps, the on-device pipeline, the audit
construction. That is the payoff of having kept the backend free of ML dependencies and the API
contract embedding-first — the same code runs on a free Render instance and in a state datacentre.

`MinIO` supports object locking, which is what turns the external audit anchor from a design note
into a deployed control.

---

## 8. What we would refuse to build

A roadmap is also a set of boundaries. Stating them is part of being adoptable — a team with no
declared limits is one a government cannot predict.

| Not building | Why |
| --- | --- |
| **Real-time crowd scanning** | Identifying everyone at a protest is mass surveillance. Different system, different legal basis, no proportionality argument. |
| **Automated alerting on a match** | Removes the human from the loop, which is the entire architecture. |
| **A "threat score" per person** | Composing graph metrics into one number invites it being read as a verdict about a person. |
| **Retention of probe images** | Building a movement history of people never charged with anything. |
| **Predictive policing** | Different problem, worse evidence base, well-documented failure modes. |
| **A public-facing search** | Obvious. |
| **Covert or silent capture** | The person being photographed must be able to see it happening. |

The last row deserves emphasis: every capture in Perigee is an overt act during a face-to-face
interaction. There is no background mode, no silent capture, no shutter suppression. That constraint
is what keeps this a *field verification tool* rather than a surveillance system, and it is the one
that would be easiest to quietly remove — which is why it is written down.

---

**Next:** [13 — Build Plan](13-BUILD-PLAN.md)
