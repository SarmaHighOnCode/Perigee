# 03 — API Specification

`perigee-core` — FastAPI, Python 3.13, Pydantic v2. OpenAPI 3.1 served at `/openapi.json`;
the mobile `packages/api-client` is generated from it, so this document and the client cannot drift.

**Base URL:** `https://perigee-core.onrender.com/v1`

---

## 1. Conventions

### Required headers

| Header | Applies to | Notes |
| --- | --- | --- |
| `X-Perigee-Device-Key` | all except `/healthz`, `/v1/public/*` | Provisioned at build time via EAS secrets |
| `X-Perigee-Officer-Id` | search, decision, enrolment | **Attribution, not authentication** |
| `X-Request-Id` | optional | UUID; echoed back and written to the audit log |
| `Content-Type` | writes | `application/json` |

### Response envelope

Success responses return the resource directly — no wrapper. Errors are uniform:

```jsonc
{
  "error": {
    "code": "PENDING_DECISION_LIMIT",     // stable, machine-readable, never localised
    "message": "3 searches await adjudication",
    "detail": { "open_search_ids": ["…"] },
    "request_id": "018f…"
  }
}
```

Clients switch on `code`. `message` is for humans and may change.

### Error taxonomy

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `MALFORMED_REQUEST` | Body is not valid JSON |
| 401 | `DEVICE_KEY_MISSING` / `DEVICE_KEY_INVALID` | Absent, unknown, or revoked |
| 403 | `PURPOSE_NOT_AUTHORISED` | Record access without a `CONFIRMED` decision |
| 404 | `NOT_FOUND` | |
| 409 | `DECISION_ALREADY_RECORDED` | Decisions are write-once |
| 410 | `SEARCH_EXPIRED` | Older than 30 minutes; re-run it |
| 422 | `INVALID_EMBEDDING` | Wrong dimension, not normalised, contains NaN |
| 422 | `UNSUPPORTED_MODEL` | `model_id` not on the allowlist |
| 422 | `QUALITY_BELOW_FLOOR` | Probe quality under the hard floor |
| 429 | `RATE_LIMITED` | Token bucket exhausted; `Retry-After` set |
| 429 | `PENDING_DECISION_LIMIT` | **The human-in-the-loop brake** |
| 503 | `DATABASE_UNAVAILABLE` | Neon waking or unreachable |

### Global response fields

Every 2xx carries:

```jsonc
{
  "dataset_mode": "synthetic",     // apps render a watermark whenever this is present
  "model_id": "insightface/w600k_r50@1",
  "server_time": "2026-08-10T14:22:31.482Z"
}
```

`dataset_mode` is on **every** response by design. A client cannot accidentally render prototype
data as though it were operational.

---

## 2. Search — the core endpoint

### `POST /v1/search`

Accepts a face embedding. Returns ranked candidates. **Never returns a match.**

```jsonc
// Request
{
  "embedding": [0.0134, -0.0721, /* … exactly 512 float32 … */],
  "model_id": "insightface/w600k_r50@1",
  "quality": {
    "score": 0.87,          // 0–1 composite
    "det_score": 0.96,      // detector confidence
    "blur": 142.3,          // variance of Laplacian
    "yaw": -4.2,            // degrees
    "pitch": 2.1,
    "face_px": 224          // aligned crop source size
  },
  "reason_code": "suspicious_conduct",
  "top_k": 5,               // 3–10, default 5, clamped to >= 3
  "geo": { "lat": 12.9716, "lon": 77.5946 }   // optional
}
```

**Validation, in order.** Each failure is specific — a generic 422 makes the client unable to coach
the officer:

1. `len(embedding) == 512` → else `INVALID_EMBEDDING`
2. no `NaN`/`Inf` → else `INVALID_EMBEDDING`
3. `0.99 ≤ ‖v‖₂ ≤ 1.01` → else `INVALID_EMBEDDING` *(catches un-normalised vectors, which
   silently corrupt cosine ranking rather than erroring)*
4. `model_id` on the allowlist and `accepting = true` → else `UNSUPPORTED_MODEL`
5. `quality.score ≥ QUALITY_FLOOR` (default 0.35) → else `QUALITY_BELOW_FLOOR`
6. open `PENDING_DECISION` count < 3 → else `PENDING_DECISION_LIMIT`

```jsonc
// 200
{
  "search_id": "018f2c…",
  "status": "PENDING_DECISION",
  "expires_at": "2026-08-10T14:52:31Z",
  "candidates": [
    {
      "rank": 1,
      "person_id": "9a1f…",
      "masked_name": "R***** K****",     // NOT the full name
      "age_band": "26-35",
      "district": "Bengaluru South",
      "similarity": 0.6412,
      "band": "STRONG",
      "mugshot_url": "https://…r2…?X-Amz-Expires=120",
      "record_summary": { "case_count": 3, "convictions": 1, "latest": "2024-11-02" }
    },
    { "rank": 2, "similarity": 0.5887, "band": "REVIEW",  /* … */ },
    { "rank": 3, "similarity": 0.3102, "band": "WEAK",    /* … */ }
  ],
  "score_gap": 0.0525,
  "ambiguous": false,                    // score_gap < 0.05
  "threshold_in_effect": 0.42,
  "bands": { "no_match": 0.28, "weak": 0.42, "review": 0.58 },
  "advisory": "HUMAN VERIFICATION REQUIRED. This system does not identify persons."
}
```

**Deliberate properties of this response:**

| Property | Reason |
| --- | --- |
| No `is_match`, no `matched: true` | The machine does not get to answer that |
| `masked_name`, never `full_name` | Four of five candidates are innocent; do not disclose them |
| Minimum 3 candidates | Forced comparison counters automation bias |
| `NO_MATCH`-band candidates omitted entirely | Below 0.28 is noise; showing it invites pattern-matching |
| `score_gap` + `ambiguous` | Two close candidates is the classic misidentification setup |
| `bands` echoed | The client renders thresholds it was given, never hardcodes them |
| `advisory` | Rendered verbatim, non-dismissible, in the results header |

### `POST /v1/search/{search_id}/decision`

**Mandatory.** The search is not complete without it. Write-once.

```jsonc
// Request
{
  "decision": "CONFIRMED",          // CONFIRMED | NO_MATCH | INCONCLUSIVE | ABORTED
  "confirmed_rank": 1,              // required iff CONFIRMED
  "note": "Verified against tattoo on left forearm",
  "latency_ms": 8420                // time from render to tap
}
// 204 No Content
```

`409 DECISION_ALREADY_RECORDED` on a second attempt. A decision cannot be revised — a *new* search
must be run. Editable decisions are not evidence.

### `GET /v1/search/{search_id}`

Returns the frozen search with its candidates and decision. Used to resume an interrupted flow and
by the audit view.

### `GET /v1/search/pending`

Open searches for the calling device. The client routes here on `PENDING_DECISION_LIMIT`.

---

## 3. Person

### `GET /v1/person/{person_id}`

**Purpose-bound.** Full PII requires proof of a confirmed identification.

```
GET /v1/person/9a1f…?search_id=018f2c…
```

Server checks: `search_id` exists → decision is `CONFIRMED` → `confirmed_person_id` equals the path
`person_id`. Any failure → `403 PURPOSE_NOT_AUTHORISED`.

The one exception: `reason_code = 'browse'` on the originating search. It works, and it is logged
under a distinct audit action that stands out in review. Not blocked — legitimate investigative
browsing exists — but never invisible.

```jsonc
// 200
{
  "person_id": "9a1f…",
  "full_name": "Ramesh Kumar",
  "aliases": ["Ramu"],
  "dob": "1994-03-12",
  "gender": "M",
  "district": "Bengaluru South",
  "status": "active",
  "media": [{ "media_id": "…", "url": "https://…?X-Amz-Expires=120", "angle": "frontal" }],
  "cases": [
    {
      "case_id": "…", "fir_number": "0142/2024", "station": "Jayanagar",
      "role": "convicted",                       // rendered distinctly from 'accused'
      "offence": { "ipc_section": "IPC 379", "bns_section": "BNS 303(2)",
                   "title": "Theft", "severity": "moderate" },
      "registered_on": "2024-11-02", "status": "convicted"
    }
  ],
  "graph_summary": { "degree": 7, "community_id": 12, "immediate_associates": 4 }
}
```

`role` is surfaced per case and never aggregated. "3 cases" spanning one conviction and two
withdrawn accusations is a materially different fact from "3 convictions", and the UI is forbidden
from collapsing them.

### `POST /v1/person` · `POST /v1/person/{id}/embedding` · `POST /v1/person/{id}/media`

Enrolment endpoints, used only by Perigee Enroll. Embeddings are computed on-device and posted the
same way search embeddings are, with identical validation. `media` upload is a two-step presigned
PUT so image bytes never transit the Render instance — which matters when the instance has 512 MB.

```jsonc
// POST /v1/person/{id}/media  → 201
{ "media_id": "…", "upload_url": "https://…r2…?X-Amz-Expires=300", "method": "PUT" }
// client PUTs the JPEG directly to R2, then:
// POST /v1/person/{id}/media/{media_id}/commit  { "sha256": "…", "bytes": 84213 }
```

---

## 4. Graph

### `GET /v1/graph/{person_id}`

```
?depth=2          # 1–3, default 2, hard cap 3
&min_weight=0.3
&edge_types=co_accused,shared_phone
&limit=60         # max nodes, default 60, hard cap 200
```

```jsonc
{
  "root": "9a1f…",
  "depth": 2,
  "nodes": [
    { "person_id": "9a1f…", "masked_name": "R***** K****", "hop": 0,
      "degree": 7, "community_id": 12, "case_count": 3 },
    { "person_id": "3b2c…", "masked_name": "S***** M****", "hop": 1,
      "degree": 4, "community_id": 12, "case_count": 1 }
  ],
  "edges": [
    { "src": "9a1f…", "dst": "3b2c…", "edge_type": "co_accused", "weight": 0.82,
      "evidence_case_ids": ["…"], "evidence_count": 2 }
  ],
  "truncated": false,
  "communities": [{ "community_id": 12, "size": 9, "label": "Cluster 12" }]
}
```

Traversal is a bounded recursive CTE, hard-capped at depth 3 and 200 nodes. Recursive CTEs degrade
badly past that — the query in [11 — Graph Intelligence](11-GRAPH-INTELLIGENCE.md) §3 and the
degradation analysis in [12 — Scaling](12-SCALING-ROADMAP.md) §4.

`truncated: true` is rendered honestly in the UI: *"showing 60 of 143 — narrow the filter."*
A silently-truncated network graph is a misleading one.

---

## 5. Audit

### `GET /v1/audit?subject_type=&subject_id=&actor_id=&from=&to=&limit=`

Paginated chain entries with `seq`, `row_hash` and `prev_hash`.

### `GET /v1/audit/verify?from_seq=&to_seq=`

Recomputes the chain and reports the first inconsistency.

```jsonc
{
  "verified": true,
  "from_seq": 1, "to_seq": 4821,
  "checked": 4821,
  "first_bad_seq": null,
  "head_hash": "3f9a…",
  "duration_ms": 340
}
```

This endpoint is a demo asset. Showing a judge a live chain verification over the searches they
just watched being performed is more persuasive than any slide about accountability.

---

## 6. Public (no device key)

Read-only, aggressive rate limits, for the Next.js site.

| Endpoint | Returns |
| --- | --- |
| `GET /v1/public/stats` | counts of persons, cases, searches, decisions — no PII |
| `GET /v1/public/graph/demo` | one fixed, curated synthetic community for the web explorer |
| `GET /v1/public/releases` | latest APK version + GitHub Releases URL |

`/v1/public/graph/demo` returns a **hardcoded, curated subgraph**, not a live query. The public
site must not expose an arbitrary-traversal surface, even over synthetic data — the shape of the
API is what an attacker probes, and there is no reason to hand it over.

---

## 7. Health

| Endpoint | Purpose |
| --- | --- |
| `GET /healthz` | Liveness. No DB touch. Used by the keepalive pinger and app pre-warm. |
| `GET /readyz` | Readiness. Checks the Neon pool and returns migration version. |
| `GET /v1/config` | Public runtime config the apps need: bands, thresholds, quality floor, model allowlist, `dataset_mode`. |

`GET /v1/config` is what lets thresholds be tuned **without shipping an app update**. The client
never hardcodes a band boundary; it fetches them at launch and caches for the session. Given that
threshold tuning is the most likely post-demo change, this saves a 30-minute EAS build every time.

---

## 8. Rate limits

Token bucket per `device_key`, in-process (single Render instance — a distributed limiter would need
Redis, which is not free and not warranted).

| Bucket | Rate | Burst |
| --- | --- | --- |
| `POST /v1/search` | 20 / min | 5 |
| `POST …/decision` | 60 / min | 10 |
| writes (enrolment) | 30 / min | 10 |
| reads | 120 / min | 30 |
| public | 30 / min per IP | 10 |

429 responses carry `Retry-After` and `X-RateLimit-Remaining`.

**The `PENDING_DECISION_LIMIT` is a separate, more interesting brake.** Rate limits bound how fast
you can query. The pending-decision limit bounds how many questions you can leave unanswered — it
is the one that makes human review structural rather than aspirational.

---

## 9. Server-side embedding (specified, disabled)

### `POST /v1/embed` — **`ENABLE_SERVER_EMBED=false` on Render**

Accepts an image, returns an embedding. Fully specified so the contract exists, and permanently
disabled on the current host because ArcFace does not fit in 512 MB alongside FastAPI.

```jsonc
// Request: multipart/form-data, image ≤ 2 MB, JPEG/PNG
// 200
{ "embedding": [/* 512 */], "model_id": "insightface/w600k_r50@1",
  "quality": { "score": 0.81, "det_score": 0.94, "face_px": 198 } }
// 501 when disabled
{ "error": { "code": "SERVER_EMBED_DISABLED",
             "message": "Embedding is computed on-device on this deployment" } }
```

It exists in the spec because the *contract* — "the API takes vectors, and where they came from is
not its business" — is what makes both deployments possible without a fork. Moving to a host with
more memory is an environment-variable change, not a redesign. See
[10 — Deployment](10-DEPLOYMENT.md) §7.

---

## 10. What this API deliberately does not have

| Absent | Why |
| --- | --- |
| `GET /v1/person?name=…` | Not a PII search engine. Face in, candidates out. |
| `POST /v1/verify` returning a boolean | The boolean is the officer's to produce |
| `DELETE /v1/audit/*` | Audit is append-only, at every layer |
| `GET /v1/search/all` | Bulk export of who was stopped is a surveillance dataset |
| Any endpoint returning a full name without a confirmed decision | Purpose-binding |
| A batch search endpoint | Batch face search over a crowd is a different system with a different legal basis. Not by accident, not by us. |

The last one deserves saying out loud: the reason there is no batch endpoint is that adding one
turns roadside identity verification into crowd surveillance, and the difference between those two
systems is one API route. It is left out on purpose.

---

**Next:** [04 — Face Recognition Pipeline](04-FACE-PIPELINE.md)
