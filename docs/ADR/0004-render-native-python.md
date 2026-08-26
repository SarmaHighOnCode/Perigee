# ADR-0004 — Render free tier, native Python runtime, no Docker

**Status:** Superseded by [0006](0006-vercel-python-functions.md) · **Date:** 2026-08-10

> **Superseded 2026-08-26.** Render was never actually deployed to — the team went to Vercel Python
> Functions directly. The reasoning below is preserved as the historical record of why Render was
> chosen at the time; it is not a description of the live system. See
> [ADR-0006](0006-vercel-python-functions.md) for what changed and why.

---

## Context

The Python backend needs a free host. Candidates evaluated in August 2026:

| Host | Free tier | Idle behaviour |
| --- | --- | --- |
| **Render** | 512 MB, 0.1 CPU, 750 h/mo | Spins down after 15 min; ~50 s cold start |
| **Hugging Face Spaces** | 2 vCPU, 16 GB RAM | Sleeps after **48 h**; ~30–90 s wake |
| **Vercel Python Functions** | Fluid Compute, 300 s timeout | No meaningful cold start |
| **Fly.io** | Effectively withdrawn for new users | — |
| **Railway** | ~$1/mo credit post-trial | — |

Additional constraint: **no Docker**, stated explicitly.

## Decision

**Render free web service, native Python 3.13 runtime**, configured by a committed `render.yaml`
blueprint. One uvicorn worker, `--workers 1`.

Hugging Face Spaces is documented as the migration target if cold starts prove disruptive
([10 §7](../10-DEPLOYMENT.md#7--migrating-to-hugging-face-spaces)), including the Gradio-mount
workaround that Spaces requires for FastAPI without Docker.

## Consequences

### Good

- **Native Python is genuinely simple.** `buildCommand: pip install -r requirements.txt`,
  `startCommand: uvicorn …`. No Dockerfile, no image registry, no layer caching to reason about,
  ~40-second builds.
- **`render.yaml` is infrastructure in the repo.** A reviewer can see the entire deployment
  configuration in one file — better than a dashboard nobody else can inspect.
- **A real custom domain and clean TLS**, which matters for the pitch.
- **512 MB is comfortable** *because* of [ADR-0001](0001-on-device-embedding.md). With no ML
  dependencies the app sits at ~120 MB — four times headroom. This constraint is only survivable
  because of the earlier decision, which is the clearest illustration of how the two interlock.
- **Auto-deploy on push to `main`** with health checks.
- **Region parity with Neon** (Singapore), avoiding ~200 ms of cross-region latency against a 390 ms
  total budget.

### Bad

- **The 50-second cold start is the single largest threat to a live demo.** Four layered mitigations
  in [10 §5](../10-DEPLOYMENT.md#5--the-cold-start-problem): app pre-warm, honest progress UI,
  a GitHub Actions keepalive during demo windows, and a manual T-15m warm-up.
- **Server-side embedding is impossible here.** ArcFace needs ~700 MB. `ENABLE_SERVER_EMBED=false`
  permanently on this host.
- **One worker only.** 512 MB does not hold two uvicorn workers plus an asyncpg pool. Acceptable —
  async I/O handles far more concurrency than this will see — but it also means the in-process rate
  limiter is correct only because there is exactly one process. Adding a worker would silently
  multiply every rate limit.
- **0.1 CPU** makes any synchronous CPU work a bottleneck. Nothing in the request path does any,
  which is deliberate rather than lucky.

### Neutral

- The keepalive workflow is enabled only during the hackathon window. Keeping a free instance
  permanently awake is against the spirit of the tier, and is documented as a demo-window measure
  rather than a deployment strategy.

## Alternatives considered

**Hugging Face Spaces.** Objectively better compute — 16 GB RAM and a 48-hour idle window instead of
15 minutes — and enough memory to enable server-side embedding. Rejected as the primary for three
reasons: FastAPI on Spaces requires either the Docker SDK (excluded) or a Gradio-mount workaround
that is a workaround; there is no custom domain; and an ML-demo host is a slightly odd address for a
system pitched at government adoption. Documented as the fallback, and the API code is identical
either way — only the entrypoint differs.

**Vercel Python Functions.** Genuinely elegant: one repo with the Next.js site, one deploy, Fluid
Compute eliminating cold starts — which would remove the biggest operational risk in the entire
build. Rejected on balance because a persistent asyncpg pool does not fit the function execution
model well (each invocation risks a fresh connection, and Neon's free-tier connection limits are
tight), and because coupling the API's deploy lifecycle to the marketing site's is awkward when they
are owned by different people during a hackathon. **This is the closest call in the document**, and
worth revisiting if cold starts prove more disruptive than expected.

**Fly.io.** Previously the best free option. Its free allowance is effectively withdrawn for new
accounts as of 2026.

**Self-hosting on a VPS.** ~₹400/month violates the ₹0 constraint, and adds TLS, systemd and firewall
management that a hackathon should not be spending time on.

## Revisit when

- Cold starts disrupt an actual rehearsal — move to HF Spaces, half a day.
- Server-side embedding becomes necessary (ADR-0001 verification fails) — HF Spaces, immediately.
- The project moves past prototype — [12 §7](../12-SCALING-ROADMAP.md#7--self-hosted-deployment),
  where none of this applies.
