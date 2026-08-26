# 10 — Deployment Runbook

Every component, on a free tier, at **₹0/month**. Written so it can be followed top to bottom.

> **Updated 2026-08-26.** This runbook originally targeted Render. The team deployed straight to
> Vercel instead once it came time to stand up a real backend — see
> [ADR-0006](ADR/0006-vercel-python-functions.md) for why, and
> [ADR-0004](ADR/0004-render-native-python.md) (now superseded) for the Render plan this replaced.
> Everything below describes the system as actually deployed.

---

## 1. Topology

```mermaid
graph LR
    subgraph SG["🌏 sin1 (Singapore) — colocated with Neon"]
        API["<b>perigee-core</b><br/>Vercel · FastAPI on @vercel/python<br/>Fluid Compute"]
        NEON[("<b>Neon</b> free<br/>Postgres 17 + pgvector<br/>0.5 GB · scale-to-zero")]
    end

    WEB["<b>perigee-web</b><br/>Vercel Hobby<br/>Next.js 16 · global edge"]
    R2[("<b>Cloudflare R2</b><br/>optional, unconfigured<br/>10 GB · zero egress")]
    EAS["<b>Expo EAS</b><br/>30 builds/mo"]
    GH["<b>GitHub</b><br/>Actions + Releases"]

    WEB -->|"fetch, server-side"| API
    API --> NEON
    API -.->|"presign, if configured"| R2
    NEON -.->|"mugshot bytea fallback<br/>when R2 is unset"| API
    EAS --> GH
    GH -->|APK| WEB

    style API fill:#00C2CB,stroke:#0A0A0A,stroke-width:3px,color:#0A0A0A
    style NEON fill:#00C853,stroke:#0A0A0A,stroke-width:3px,color:#0A0A0A
    style WEB fill:#FFE600,stroke:#0A0A0A,stroke-width:3px,color:#0A0A0A
```

**`perigee-core` and Neon must be in the same region.** `sin1` (Singapore) is Vercel's closest region
to India and Neon offers `ap-southeast-1`. Getting this wrong adds ~200 ms to every query — which,
against a 390 ms total budget, is the difference between snappy and sluggish.

`perigee-core` and `perigee-web` are two separate Vercel projects sharing this monorepo — not one
merged deploy — each with its own git-triggered auto-deploy on push to `main`.

---

## 2. Free-tier reality

Know these before building, not during the demo.

| Service | Gives | Costs you |
| --- | --- | --- |
| **Vercel Hobby** | Fluid Compute functions, 100 GB bandwidth, TLS, auto-deploy, both projects | Non-commercial only; a real but much smaller cold start than Render's |
| **Neon free** | 0.5 GB, 100 CU-h/mo, 10 branches, pgvector | Scale-to-zero (~500 ms resume — fine) |
| **Cloudflare R2** | 10 GB, 1 M Class-A ops, **zero egress** — not currently provisioned | Card required at signup; mugshots use a Postgres fallback instead |
| **Expo EAS** | 30 builds/mo (≤15 iOS), OTA to 1,000 MAU | Queue times vary |
| **GitHub** | 2,000 Actions min/mo, unlimited releases | — |

**The Render-era 50-second cold start does not apply here.** Fluid Compute keeps instances warm
across concurrent requests, so §5 below is short.

---

## 3. Database — Neon

```bash
# 1. Create the project — region matters
neonctl projects create --name perigee --region-id aws-ap-southeast-1

# 2. pgvector
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

# 3. Migrations, in order
for f in migrations/*.sql; do psql $DATABASE_URL -f "$f"; done

# 4. Seed
python scripts/seed_synthetic.py --persons 500 --cases 300 --edges 1200

# 5. Graph metrics (offline; networkx)
python scripts/compute_node_metrics.py
```

**Use the pooled connection string** (`-pooler` in the host). Vercel Functions can run as several
concurrent instances, each opening its own asyncpg pool, and Neon's connection limits on the free
tier are tight — a direct (non-pooled) connection string will exhaust them fast.

```
postgresql://user:pass@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/perigee?sslmode=require
```

### Branching — the free feature worth using

Neon gives 10 branches. Create one per environment:

```bash
neonctl branches create --name preview   # PR previews
neonctl branches create --name demo      # frozen, known-good, for the actual presentation
```

**The `demo` branch is the insurance policy.** Freeze a known-good dataset the night before. If
someone corrupts `main` at 3 a.m. — and someone will — repoint `DATABASE_URL` at `demo` and you are
back in thirty seconds.

### Storage budget

| Item | Rows | Bytes each | Total |
| --- | --- | --- | --- |
| `face_embedding` | 1,500 | 2,048 + overhead | ~4 MB |
| HNSW index (halfvec) | — | ~1,100/vector | ~2 MB |
| `person`, `case_record`, `person_case` | ~1,800 | ~500 | ~1 MB |
| `edge`, `node_metric` | ~1,700 | ~200 | ~0.5 MB |
| `audit_event` (7 days demo) | ~5,000 | ~800 | ~4 MB |
| | | **Total** | **~12 MB of 500 MB** |

Comfortable. The free tier holds roughly **60,000 enrolled faces** before storage becomes the
binding constraint — well past anything a hackathon needs.

---

## 4. API — Vercel, Python runtime

Deployed at `https://perigee-core.vercel.app`. `backend/vercel.json` is the entire deploy
configuration — infrastructure in the repo beats clicking through a dashboard:

```json
{
  "regions": ["sin1"],
  "builds": [{ "src": "api/index.py", "use": "@vercel/python" }],
  "routes": [{ "src": "/(.*)", "dest": "api/index.py" }]
}
```

`backend/api/index.py` is the ASGI entrypoint `@vercel/python` looks for; it imports and re-exports
`app` from `app.main`. No Dockerfile, no image registry — same "no Docker" constraint the original
plan had, met a different way.

**The one thing that had to change to make a serverless host safe is the rate limiter.** In-process
buckets are correct only where there is exactly one process; Vercel runs as many concurrent instances
as demand requires, so each would keep its own counters and every configured limit would be silently
multiplied by the instance count. `RATE_LIMIT_BACKEND=postgres` moves the buckets into the database
(migration `0009_rate_bucket`), and `app/main.py` **raises at startup** if that variable is set
without a reachable database, so the unsafe combination cannot happen quietly.

**`pyproject.toml` is excluded via `.vercelignore`**, so the builder installs from
`requirements.txt` instead. That `[project]` table declares no dependencies of its own — a second
list would only drift from the first.

### `requirements.txt` — pinned, and deliberately small

```
fastapi==0.115.*
uvicorn[standard]==0.32.*
asyncpg==0.30.*
pydantic==2.9.*
pydantic-settings==2.6.*
pgvector==0.3.*
boto3==1.35.*          # R2 presigning (S3-compatible)
python-json-logger==2.0.*
```

**No `onnxruntime`, no `numpy`, no `opencv`.** That absence is the on-device decision paying off:
build time under 40 s and a memory footprint of roughly 120 MB. A backend carrying ArcFace would need
~700 MB — the original reason this had to stay tiny even under Render's tighter 512 MB ceiling, and
still the reason it starts up fast and cheap here.

### Memory budget

```
Python 3.13 runtime          ~35 MB
FastAPI + uvicorn + pydantic ~45 MB
asyncpg pool (5 conns)       ~15 MB
boto3                        ~20 MB
application                   ~5 MB
──────────────────────────────────
                            ~120 MB total
```

### Migrations on deploy

A startup guard applies pending migrations inside an advisory lock, so a redeploy cannot race
itself:

```python
# app/db.py
async def apply_migrations(pool):
    async with pool.acquire() as conn:
        await conn.execute("SELECT pg_advisory_lock(4815162342)")
        try:
            applied = await conn.fetchval("SELECT max(version) FROM schema_migration") or 0
            for path in sorted(MIGRATIONS.glob("*.sql")):
                version = int(path.stem.split("_")[0])
                if version <= applied:
                    continue
                async with conn.transaction():
                    await conn.execute(path.read_text())
                    await conn.execute(
                        "INSERT INTO schema_migration (version, checksum) VALUES ($1, $2)",
                        version, sha256(path.read_bytes()).digest(),
                    )
        finally:
            await conn.execute("SELECT pg_advisory_unlock(4815162342)")
```

---

## 5. Cold starts

Fluid Compute keeps warm instances around across concurrent requests, so the elaborate Render-era
mitigation strategy this section used to describe — a pre-warm ping, a calibrated "SYSTEM WAKING"
progress bar, a 10-minute keepalive Action, a manual T-15m warm-up — is no longer load-bearing. What
remains is a real but much smaller cold start on a fresh instance: an asyncpg pool has to spin up,
same as any first request against a scale-to-zero Neon branch.

**Still worth doing before a demo:** hit the API and run one real search fifteen minutes before
presenting. It wakes Neon, primes the connection pool, and populates the HNSW index in shared
buffers — the single most common demo failure is a cold system on the first query, and it costs
nothing to prevent.

---

## 6. Object storage — R2, optional, with a Postgres fallback

**R2 was never provisioned** — Cloudflare requires a card on file even for the free tier, which the
project deliberately avoided. The live deployment instead stores mugshots directly in Postgres:
migration `0010_media_bytes.sql` adds `media.image_bytes bytea` and `media.content_type text`,
`r2_key` became nullable, and `backend/app/services/media_bytes.py` serves stored rows back as a
`data:` URI inline in the JSON response. `POST /v1/person/{id}/media/direct` accepts base64 image
bytes in one call — no presign round trip — decodes, re-derives the SHA-256 server-side rather than
trusting the client, and enforces `settings.media_max_bytes`.

This is sized for the prototype's own scale (roughly 20 enrolled people), not a production dataset:
bytes now transit the API and the database on every read, which is exactly the cost R2's presigned
GET was designed to avoid.

**If R2 credentials are set, the original presigned-upload path still works** and is preferred at any
real scale:

```bash
wrangler r2 bucket create perigee-media          # private. never public.
```

```python
s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name="auto",
)
url = s3.generate_presigned_url("get_object",
    Params={"Bucket": "perigee-media", "Key": key}, ExpiresIn=120)
```

The server presigns a PUT and the client sends bytes straight to R2 — the API itself never touches
the image. **Zero egress fees** is why R2 over S3 if it does get provisioned: mugshot loading in the
app costs nothing regardless of volume.

---

## 7. Migration history

The original plan here was Render, with Hugging Face Spaces documented as the fallback if Render's
15-minute idle spindown proved disruptive in practice — see the (superseded)
[ADR-0004](ADR/0004-render-native-python.md) for that reasoning and the Gradio-mount workaround Spaces
would have required.

Neither happened. The team deployed directly to Vercel — [ADR-0006](ADR/0006-vercel-python-functions.md)
covers what changed and why, and it's the same category of move HF Spaces would have been: solve the
cold-start problem by moving off Render. Vercel's Fluid Compute solved it without a workaround.

**If Vercel's free-tier limits ever become the binding constraint**, the documented next step is
self-hosting ([12 §7](12-SCALING-ROADMAP.md#7--self-hosted-deployment)), not a lateral move to another
free-tier host — by that point the project has outgrown the free-tier era entirely.

---

## 8. Web — Vercel

```bash
vercel link
vercel env add PERIGEE_API_URL production      # server-only, no NEXT_PUBLIC_ prefix
vercel --prod
```

`vercel.ts`:

```ts
import { routes, type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  headers: [
    routes.cacheControl('/(.*)\\.(woff2|png|svg|avif)', {
      public: true, maxAge: '1 year', immutable: true,
    }),
  ],
};
```

Preview deployments per PR come free and are genuinely useful — link one in the submission so judges
can see the deploy pipeline is real.

---

## 9. Mobile — EAS

```bash
eas secret:create --scope project --name PERIGEE_DEVICE_KEY --value "$(openssl rand -hex 32)"
eas build --profile production --platform android    # per app
```

Release automation:

```yaml
# .github/workflows/release.yml
on:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: expo/expo-github-action@v8
        with: { eas-version: latest, token: '${{ secrets.EXPO_TOKEN }}' }
      - run: pnpm install --frozen-lockfile
      - run: eas build --profile production --platform android --non-interactive --wait
      - run: |
          eas build:download --platform android --output ./field.apk
          sha256sum ./field.apk > ./field.apk.sha256
      - uses: softprops/action-gh-release@v2
        with: { files: |
            field.apk
            field.apk.sha256 }
```

**Publish the SHA-256 alongside every APK.** A sideloaded police application with no integrity story
invites exactly the question you do not want, and the fix costs one line.

---

## 10. CI

```yaml
# .github/workflows/ci.yml — perigee-core
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg17
        env: { POSTGRES_PASSWORD: postgres }
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-retries 5
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.13' }
      - run: pip install -r requirements.txt -r requirements-dev.txt
      - run: ruff check .
      - run: ruff format --check .
      - run: pytest tests -q
      - uses: gitleaks/gitleaks-action@v2
```

The `pgvector/pgvector:pg17` service image means CI tests run against real pgvector, including the
HNSW index. Mocking the vector layer would leave the most failure-prone part of the system untested.

---

## 11. Monitoring

| Concern | Tool | Free tier |
| --- | --- | --- |
| Errors | Sentry | 5k events/mo — both apps and the API |
| Uptime | UptimeRobot | 5 min checks on `/healthz` |
| DB | Neon dashboard | Built in |
| Web vitals | Vercel Analytics | Included |
| Logs | Vercel dashboard | Both projects, per-deployment |

Structured JSON logging from day one. Every log line carries `request_id`, `device_id`, `officer_id`,
and route — and **never** an embedding, a name, or an image key. A log that accumulates the data it
is monitoring is a second breach surface.

---

## 12. Environment variables

```bash
# ── perigee-core (Vercel) ────────────────────────────────
DATABASE_URL=postgresql://…-pooler.ap-southeast-1.aws.neon.tech/perigee?sslmode=require
DATASET_MODE=synthetic                    # no default; the server refuses to start without it
ENABLE_SERVER_EMBED=false
RATE_LIMIT_BACKEND=postgres               # required on Vercel; multiple instances share no process memory
ALLOWED_MODEL_IDS=insightface/w600k_r50@1
QUALITY_FLOOR=0.35
BAND_NO_MATCH=0.28
BAND_WEAK=0.42
BAND_REVIEW=0.58
MAX_PENDING_DECISIONS=3
SEARCH_EXPIRY_MINUTES=30
R2_ACCOUNT_ID=…                           # optional — unset means mugshots use the Postgres bytea fallback
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_BUCKET=perigee-media
DEVICE_KEY_PEPPER=…
CORS_ORIGINS=https://perigee-web.vercel.app
SENTRY_DSN=…

# ── perigee-web (Vercel) ────────────────────────────────
PERIGEE_API_URL=https://perigee-core.vercel.app     # server-only

# ── perigee-mobile (EAS secrets) ────────────────────────
EXPO_PUBLIC_API_URL=https://perigee-core.vercel.app
PERIGEE_DEVICE_KEY=…                                  # injected at build
```

Thresholds are **environment variables, not constants**, so tuning them the night before the demo is
a redeploy rather than a 30-minute EAS build. Clients read them from `GET /v1/config`.

---

## 13. Demo-day run of show

```
T-24h  ☐ Freeze the Neon `demo` branch with the known-good dataset
       ☐ Build and install final APKs on the demo devices
       ☐ Run packages/face self-test on every device — record p95 latency
       ☐ Full dry run, end to end, on venue Wi-Fi if possible
       ☐ Record a 90-second screen capture as the fallback

T-1h   ☐ Warm the API; run one real search
       ☐ Verify the audit chain: GET /v1/audit/verify
       ☐ Charge devices; disable auto-lock and battery saver
       ☐ Airplane-mode test — confirm the offline queue engages

T-15m  ☐ One live search end to end
       ☐ Open the web /explore graph in a tab
       ☐ Tether ready as a Wi-Fi fallback

DEMO   1. The problem — 3 hours vs 8 seconds
       2. Live capture → candidates → NO MATCH → the person walks   ← lead with the release
       3. Second capture → STRONG CANDIDATE → confirm → record
       4. Graph expansion — the network
       5. /v1/audit/verify, live, on the searches just performed    ← the closing move
```

**Lead with a `NO MATCH`.** Every other team's face-recognition demo opens with a triumphant match.
Opening with an innocent person being released in eight seconds states the thesis before a single
slide, and it is what the system is actually for.

**Close with a live audit verification** over the searches the judges just watched. It is the most
persuasive thing in the build and it takes twenty seconds.

---

**Next:** [11 — Graph Intelligence](11-GRAPH-INTELLIGENCE.md)
