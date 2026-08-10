# Contract Notes

Where the backend implementation differs from, or resolves an ambiguity in,
[02 — Data Model](02-DATA-MODEL.md) and [03 — API Spec](03-API-SPEC.md).

The handoff rule is: *if implementation requires changing a contract, discuss and document the
change instead of silently diverging.* This file is that record. Each entry states what the spec
said, what was built, and why.

---

## 1. Candidate assembly when "zero candidates" and "minimum three" collide

**Spec was ambiguous.** [03 §2](03-API-SPEC.md) states two rules without saying which wins:

- *"`NO_MATCH`-band candidates omitted entirely — below 0.28 is noise"*
- *"Minimum 3 candidates — forced comparison counters automation bias"*

If every result is below the floor, these contradict: omit everything, or return three?

**Resolved as:**

| Condition | Behaviour |
| --- | --- |
| Best similarity **< `band_no_match`** | Return **zero** candidates |
| Otherwise | Return **at least 3** (padding below the band if needed), up to `top_k` |

**Why.** The two rules protect against different failures, and each should win where its failure is
live. When there is genuinely nothing, the risk is an officer pattern-matching against noise — so
show nothing, and let the app render the `NO CANDIDATES · RELEASE` outcome the product is built
around. When there *is* something, the risk is automation bias on a single result — so force a
comparison.

Padding entries carry their **true** band (typically `NO_MATCH`), so filler can never read as a
contender.

Implemented in `app/services/scoring.py::assemble_candidates`; covered by
`test_scoring.py::test_genuine_no_match_returns_zero_candidates` and `::test_pads_to_minimum_three`.

---

## 2. `media` rows exist before the upload does

**Spec:** [02 §3.2](02-DATA-MODEL.md) declares `sha256`, `width`, `height`, `bytes` as `NOT NULL`.

**Built:** those columns are nullable, and a `committed boolean NOT NULL DEFAULT false` column was
added.

**Why.** The upload is two-step by design — the client PUTs bytes directly to R2 so they never
transit a 512 MB instance. The `media` row must therefore be created at *presign* time, before any
of those values exist. Marking them `NOT NULL` would make the documented upload flow impossible.

Only `committed = true` rows are ever served or listed, so an abandoned presign is inert rather than
a half-visible record.

---

## 3. `system_config` table (new)

**Spec:** [02 §7](02-DATA-MODEL.md) hardcodes `max_open constant int := 3` inside the trigger.

**Built:** a single-row `system_config` table holding `pending_decision_limit`, which the trigger
reads and the application syncs from `SEARCH_PENDING_LIMIT` at startup.

**Why.** A hardcoded trigger constant and a configurable application setting silently disagree the
moment anyone changes the env var. Environment stays the single source of truth; the trigger stays
authoritative, so a bypassed or buggy application still cannot exceed the limit.

---

## 4. Uploaded object size is measured, not accepted

**Spec:** [03 §3](03-API-SPEC.md) shows the commit call sending `{"sha256": …, "bytes": 84213}`.

**Built:** the client-supplied `bytes` is accepted in the request but **not trusted**. The server
issues a `HEAD` against the object and stores the true size, rejecting and deleting anything over
`MEDIA_MAX_BYTES`.

**Why.** A client that uploads directly to storage is the only party that knows what it sent.
Trusting its self-report would let an app claim 2 KB and store 50 MB, on a free tier with a hard
storage cap.

---

## 5. `schema_migration.version` is `text`

**Spec:** [02 §11](02-DATA-MODEL.md) implies an integer version.

**Built:** `text` primary key holding the filename stem (`0001_extensions`), per the backend handoff.

**Why.** The stem is self-describing in `--status` output and cannot collide when two branches both
add a migration numbered `0009`. Ordering is still lexicographic over zero-padded prefixes.

---

## 6. Enrolment quality floor is a code constant, not an env var

`ENROLMENT_QUALITY_FLOOR = 0.60` lives in `app/routers/person.py`, while the *search* floor is the
tunable `QUALITY_FLOOR`.

**Why.** The search floor is a live operational trade-off — too strict and officers cannot use the
app in bad light. The enrolment floor is a data-quality invariant: a bad enrolment silently degrades
every future search against that person and is never retried. It should not be adjustable under
demo-day pressure. [04 §8](04-FACE-PIPELINE.md) already specifies no override at enrolment.

---

## 7. `GET /v1/public/releases` reads environment, not the GitHub API

**Spec:** [03 §6](03-API-SPEC.md) describes it as returning the latest APK version and URL.

**Built:** values come from environment variables, defaulting to the `/releases/latest` URL.

**Why.** A live GitHub API call would put a third-party network dependency and an unauthenticated
rate limit behind a public marketing endpoint on a free instance. The Next.js site queries GitHub
directly with ISR instead ([06 §6](06-WEB-FRONTEND.md)), which is both cached and closer to the
consumer.

---

## 8. Vector parameters are bound as `text` and double-cast

Queries use `$1::text::vector(512)` rather than `$1::vector(512)`.

**Why.** With a single cast, Postgres infers the parameter's type as `vector`, and asyncpg then
needs a registered codec for it — registration that must be re-applied on every pooled connection
and is easy to lose silently after a reconnect. Binding as `text` and letting Postgres do
`text → vector` keeps the pgvector Python package out of the runtime dependencies entirely.

The index expression match is unaffected: only the `ORDER BY` left-hand side has to match the index,
and it still reads `embedding::halfvec(512)`.

---

## Not deviations

For the avoidance of doubt, these were implemented exactly as specified and must stay that way:

- No `is_match` / `matched` / `identity_confirmed` field anywhere — asserted against the live
  OpenAPI schema in CI
- Search opens `PENDING_DECISION`; the 4th concurrent search is blocked by a database trigger
- Decisions are write-once (`409` on retry)
- PII requires a `CONFIRMED` decision, with `reason_code='browse'` as the logged valve
- Candidates return `masked_name`, never `full_name`
- Audit is append-only and hash-chained, `sha256(prev_hash ‖ canonical_json(row))`
- The probe photograph is never stored, and probe embeddings are off by default
- `dataset_mode` on every response
- Graph traversal hard-capped at depth 3 / 200 nodes
- No batch search endpoint, and no person lookup by name
