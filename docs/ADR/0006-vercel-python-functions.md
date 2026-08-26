# ADR-0006 — Vercel Python Functions, superseding Render

**Status:** Accepted · **Date:** 2026-08-26 · **Supersedes:** [0004](0004-render-native-python.md)

---

## Context

[ADR-0004](0004-render-native-python.md) chose Render's free tier and named its own rejection of
Vercel Python Functions **"the closest call in the document,"** on two concerns: a persistent
asyncpg pool sitting awkwardly inside the function execution model, and coupling the API's deploy
lifecycle to the marketing site's when they were expected to be owned by different people during
the hackathon.

Neither concern survived contact with the actual build. `perigee-core` and `perigee-web` ended up as
two separate Vercel projects sharing one monorepo, not one merged deploy — so the ownership coupling
ADR-0004 worried about never materialised. And the connection-pool-per-invocation risk turned out to
have a narrower, more specific shape than "does this work at all": Vercel runs functions as multiple
concurrent instances, which is fine for a stateless asyncpg pool but breaks any *in-process* state
that assumes exactly one process — which is exactly what the rate limiter assumed.

Render was never actually deployed to. The team went to Vercel directly once it came time to stand
up a real, reachable backend, for reasons ADR-0004 had already priced in: Fluid Compute removes the
cold-start problem that consumed a third of the original deployment runbook, and free-tier limits are
generous enough that the 512 MB ceiling driving half of ADR-0004's design (`--workers 1`, `no Docker`,
the entire object-storage-bypass argument) stopped being the binding constraint.

## Decision

**Vercel, Python runtime, Fluid Compute — for both `perigee-core` and `perigee-web`, as two separate
Vercel projects in the same monorepo.**

`backend/vercel.json` points at `backend/api/index.py` as the ASGI entrypoint:

```json
{
  "regions": ["sin1"],
  "builds": [{ "src": "api/index.py", "use": "@vercel/python" }],
  "routes": [{ "src": "/(.*)", "dest": "api/index.py" }]
}
```

Region `sin1` (Singapore) preserves the region-parity reasoning from ADR-0004 — still colocated with
Neon's `ap-southeast-1`.

**The one thing that had to change, not sidestep, to make this safe:** `RATE_LIMIT_BACKEND=postgres`
(`backend/app/config.py`, migration `0009_rate_bucket`) moves the rate-limit buckets out of process
memory and into the database. `app/main.py` **raises at startup** if `RATE_LIMIT_BACKEND=postgres` is
set without a reachable database, so the unsafe combination — multiple instances, each keeping its
own counters, silently multiplying every configured limit — cannot happen quietly.

Object storage also moved off the presign-only design ADR-0004 assumed: `backend/migrations/0010_media_bytes.sql`
adds an `image_bytes bytea` column, and mugshots fall back to storing bytes directly in Postgres when
R2 credentials are absent (`backend/app/services/media_bytes.py`). This wasn't forced by Vercel — it
was a separate call to avoid requiring a Cloudflare account with a card on file — but it does mean the
"uploads bypass the API entirely" argument in ADR-0004 §6 no longer describes the primary path.

## Consequences

### Good

- **The 50-second cold start is gone.** Fluid Compute reuses warm instances across concurrent
  requests. The entire four-layer mitigation strategy in the old deployment runbook — pre-warm ping,
  honest "SYSTEM WAKING" UI, a keepalive GitHub Action, a manual T-15m warm-up — is no longer
  load-bearing.
- **One platform for both deployables**, with git-triggered auto-deploy on push to `main` for both
  projects — the ownership-coupling risk ADR-0004 flagged didn't apply once they stayed separate
  Vercel projects rather than one merged deploy.
- **No 512 MB ceiling.** `ENABLE_SERVER_EMBED=false` remains correct (there is still no reason to run
  ArcFace server-side when the phone already does it — see [ADR-0001](0001-on-device-embedding.md)),
  but it is no longer the only thing standing between this backend and an out-of-memory kill.
- **Preview deployments per PR**, for both projects — free, and already useful for review.

### Bad

- **The rate limiter needed a real fix, not a config flag.** `RATE_LIMIT_BACKEND=postgres` adds one
  round trip per rate-limited request that `memory` (Render's correct setting, with its single
  worker) never paid. Accepted: correctness under multi-instance execution is not optional.
- **A cold start still exists**, just a much smaller one — a fresh asyncpg pool has to spin up per
  cold instance. Materially different from Render's 50 seconds, not literally zero.
- **`pyproject.toml` is excluded via `.vercelignore`** so the build installs from `requirements.txt`
  rather than risking two dependency lists drifting apart. Nothing files under `[project]` in
  `pyproject.toml` matters for the deployed build.

### Neutral

- Region parity, the free/₹0 constraint, and the zero-ML-dependency footprint from ADR-0001 all carry
  over unchanged — none of that reasoning was Render-specific.

## Alternatives considered

Already covered by ADR-0004's own "Alternatives considered" section, which evaluated Vercel Python
Functions on their merits and called the pool-per-invocation risk "worth revisiting if cold starts
prove more disruptive than expected." That risk turned out to be resolvable with one migration and
one settings flag, not a reason to avoid the platform.

## Revisit when

- Vercel's Python Functions free-tier limits stop being generous enough — the self-hosted path in
  [12 §7](../12-SCALING-ROADMAP.md#7--self-hosted-deployment) is the documented next step, unchanged
  by this ADR.
- R2 credentials get provisioned and the Postgres `bytea` mugshot fallback needs revisiting for scale
  — it was sized for roughly 20 people, not a production dataset.
