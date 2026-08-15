# 10 — Deployment Runbook

Every component, on a free tier, at **₹0/month**. Written so it can be followed top to bottom.

---

## 1. Topology

```mermaid
graph LR
    subgraph SG["🌏 ap-southeast-1 (Singapore) — colocated"]
        RENDER["<b>Render</b> free web service<br/>FastAPI · native Python 3.13<br/>512 MB · 0.1 CPU"]
        NEON[("<b>Neon</b> free<br/>Postgres 17 + pgvector<br/>0.5 GB · scale-to-zero")]
    end

    VERCEL["<b>Vercel</b> Hobby<br/>Next.js 16 · global edge"]
    R2[("<b>Cloudflare R2</b><br/>10 GB · zero egress")]
    EAS["<b>Expo EAS</b><br/>30 builds/mo"]
    GH["<b>GitHub</b><br/>Actions + Releases"]

    VERCEL -->|"allowlisted proxy"| RENDER
    RENDER --> NEON
    RENDER -->|presign only| R2
    EAS --> GH
    GH -->|APK| VERCEL

    style RENDER fill:#00C2CB,stroke:#0A0A0A,stroke-width:3px,color:#0A0A0A
    style NEON fill:#00C853,stroke:#0A0A0A,stroke-width:3px,color:#0A0A0A
    style VERCEL fill:#FFE600,stroke:#0A0A0A,stroke-width:3px,color:#0A0A0A
```

**Render and Neon must be in the same region.** Singapore is the closest Render region to India and
Neon offers `ap-southeast-1`. Getting this wrong adds ~200 ms to every query — which, against a
390 ms total budget, is the difference between snappy and sluggish.

---

## 2. Free-tier reality

Know these before building, not during the demo.

| Service | Gives | Costs you |
| --- | --- | --- |
| **Render free** | 512 MB, 0.1 CPU, 750 h/mo, TLS, auto-deploy | **Spins down after 15 min idle; ~50 s cold start** |
| **Neon free** | 0.5 GB, 100 CU-h/mo, 10 branches, pgvector | Scale-to-zero (~500 ms resume — fine) |
| **Cloudflare R2** | 10 GB, 1 M Class-A ops, **zero egress** | Card required at signup |
| **Vercel Hobby** | 100 GB bandwidth, unlimited static | Non-commercial only |
| **Expo EAS** | 30 builds/mo (≤15 iOS), OTA to 1,000 MAU | Queue times vary |
| **GitHub** | 2,000 Actions min/mo, unlimited releases | — |

**The 50-second cold start is the only genuine threat to a live demo.** Mitigations in §5, applied in
layers.

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

**Use the pooled connection string** (`-pooler` in the host). Render free has one small instance, but
Neon's connection limits on the free tier are tight and a direct connection will exhaust them under
even light concurrency.

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

## 4. API — Render, native Python

> **Currently deployed to Vercel instead**, at `https://perigee-core.vercel.app`
> (`backend/vercel.json`, entrypoint `backend/api/index.py`). Render remains the
> designed target and `render.yaml` is still correct and current.
>
> The one thing that had to change to make a serverless host safe is the rate
> limiter. In-process buckets are correct only where there is exactly one
> process; Vercel runs as many instances as it likes, so each would keep its own
> counters and every configured limit would be multiplied by the instance count.
> `RATE_LIMIT_BACKEND=postgres` moves the buckets into the database
> (migration `0009_rate_bucket`), and `app/main.py` **raises at startup** if that
> variable is set without a database, so the unsafe combination cannot happen
> quietly. Render should keep `RATE_LIMIT_BACKEND=memory` — one worker, no round
> trip.
>
> Known trade-offs on Vercel versus Render: a cold start builds a fresh asyncpg
> pool per instance, and `pyproject.toml` is excluded via `.vercelignore` so the
> builder installs from `requirements.txt` (that `[project]` table declares no
> dependencies, and a second list would drift from the first).

**No Docker**, per requirement. Render's native Python runtime.

`render.yaml` (Blueprint — commit it; infrastructure in the repo beats clicking through a dashboard):

```yaml
services:
  - type: web
    name: perigee-core
    runtime: python
    plan: free
    region: singapore
    branch: main
    buildCommand: pip install --no-cache-dir -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1
    healthCheckPath: /healthz
    autoDeploy: true
    envVars:
      - key: PYTHON_VERSION
        value: "3.13.0"
      - key: DATASET_MODE
        value: synthetic
      - key: ENABLE_SERVER_EMBED
        value: "false"          # ArcFace does not fit in 512 MB
      - key: DATABASE_URL
        sync: false             # set in the dashboard, never in git
      - key: R2_ACCOUNT_ID
        sync: false
      - key: R2_ACCESS_KEY_ID
        sync: false
      - key: R2_SECRET_ACCESS_KEY
        sync: false
      - key: DEVICE_KEY_PEPPER
        sync: false
      - key: CORS_ORIGINS
        value: https://perigee.vercel.app
```

**`--workers 1` is deliberate.** 512 MB does not hold two uvicorn workers plus an asyncpg pool. One
worker with async I/O handles far more concurrency than this demo will ever see, and multiple
workers would also break the in-process rate limiter.

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
build time under 40 s, memory footprint ~120 MB, and comfortable headroom in 512 MB. A backend
carrying ArcFace would need ~700 MB and would simply not run here.

### Memory budget

```
Python 3.13 runtime          ~35 MB
FastAPI + uvicorn + pydantic ~45 MB
asyncpg pool (5 conns)       ~15 MB
boto3                        ~20 MB
application                   ~5 MB
──────────────────────────────────
                            ~120 MB of 512 MB   ✅ 4× headroom
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

## 5. The cold-start problem

Render free spins down after 15 minutes idle. The next request waits ~50 s. Four layers, cheapest
first:

### Layer 1 — the app pre-warms

Fire `GET /healthz` on launch, before the officer has typed anything. By the time they reach the
camera, the instance is warm. Costs nothing and handles the common case.

### Layer 2 — honest UI

If a request exceeds 3 s, the app shows `SYSTEM WAKING` with a determinate progress bar calibrated to
~50 s — **not a spinner**. A spinner says "something is wrong"; a labelled progress bar says "this is
expected and will finish". Same wait, entirely different perception.

### Layer 3 — keepalive during demo windows

```yaml
# .github/workflows/keepalive.yml
name: keepalive
on:
  schedule:
    - cron: '*/10 * * * *'     # every 10 min
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -sf https://perigee-core.onrender.com/healthz || exit 1
```

~4,300 runs/month against a 2,000-minute budget — each run is a few seconds, so it fits comfortably.

> **Enable this only during the hackathon window and disable it afterwards.** Keeping a free instance
> permanently awake is against the spirit of the tier. It is a demo-window measure, not a
> deployment strategy, and pretending otherwise in front of judges would be a bad look.

### Layer 4 — the manual pre-flight

Fifteen minutes before presenting, hit the API and run one real search. Warms Render, wakes Neon,
primes the connection pool, and populates the HNSW index in shared buffers.

Add it to the run-of-show. The single most common demo failure is a cold system on the first query,
and it is entirely preventable.

---

## 6. Object storage — R2

```bash
wrangler r2 bucket create perigee-media          # private. never public.
```

CORS, for the direct browser/app upload path:

```json
[{
  "AllowedOrigins": ["https://perigee.vercel.app"],
  "AllowedMethods": ["GET", "PUT"],
  "AllowedHeaders": ["content-type", "content-md5"],
  "MaxAgeSeconds": 3600
}]
```

Access is exclusively presigned:

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

**Uploads bypass Render entirely.** The server presigns a PUT and the client sends bytes straight to
R2. On a 512 MB instance, proxying image uploads is how you get OOM-killed mid-demo.

**Zero egress fees** is why R2 over S3: mugshot loading in the app costs nothing regardless of
volume.

---

## 7. Migrating to Hugging Face Spaces

Planned as a possible later move, and there is a caveat worth knowing **before** committing to it.

**Free HF Spaces gives 2 vCPU / 16 GB RAM and only sleeps after 48 h idle** — dramatically better
than Render's 15 minutes, and enough RAM to enable `/v1/embed` for server-side inference.

**The caveat:** Spaces runs FastAPI natively only under the Gradio or Streamlit SDK. Raw FastAPI
normally requires the Docker SDK, which is excluded. The workaround is to mount the FastAPI app
inside a Gradio app:

```python
# app.py — Space entrypoint, gradio SDK, no Docker
import gradio as gr
from app.main import app as fastapi_app

with gr.Blocks() as status:
    gr.Markdown("## PERIGEE CORE\nAPI is live. See `/docs`.")

demo = gr.mount_gradio_app(fastapi_app, status, path="/status")
# Spaces runs this; FastAPI routes are served alongside the Gradio page.
```

Trade-offs to weigh honestly:

| | Render | HF Spaces |
| --- | --- | --- |
| Idle timeout | 15 min | **48 h** |
| RAM | 512 MB | **16 GB** |
| Server-side embedding | Impossible | **Possible** |
| Setup | Native, clean | Gradio-mount workaround |
| Custom domain | Yes | No |
| Optics for a government pitch | Neutral | An ML-demo host |

**Recommendation: stay on Render for the hackathon**, and treat Spaces as the fallback if cold starts
prove disruptive in practice. The API code is identical either way — only the entrypoint differs.

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
| Logs | Render dashboard | 7-day retention |

Structured JSON logging from day one. Every log line carries `request_id`, `device_id`, `officer_id`,
and route — and **never** an embedding, a name, or an image key. A log that accumulates the data it
is monitoring is a second breach surface.

---

## 12. Environment variables

```bash
# ── perigee-core (Render) ────────────────────────────────
DATABASE_URL=postgresql://…-pooler.ap-southeast-1.aws.neon.tech/perigee?sslmode=require
DATASET_MODE=synthetic                    # no default; the server refuses to start without it
ENABLE_SERVER_EMBED=false
ALLOWED_MODEL_IDS=insightface/w600k_r50@1
QUALITY_FLOOR=0.35
BAND_NO_MATCH=0.28
BAND_WEAK=0.42
BAND_REVIEW=0.58
MAX_PENDING_DECISIONS=3
SEARCH_EXPIRY_MINUTES=30
R2_ACCOUNT_ID=…
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_BUCKET=perigee-media
DEVICE_KEY_PEPPER=…
CORS_ORIGINS=https://perigee.vercel.app
SENTRY_DSN=…

# ── perigee-web (Vercel) ────────────────────────────────
PERIGEE_API_URL=https://perigee-core.onrender.com     # server-only

# ── perigee-mobile (EAS secrets) ────────────────────────
EXPO_PUBLIC_API_URL=https://perigee-core.onrender.com
PERIGEE_DEVICE_KEY=…                                  # injected at build
```

Thresholds are **environment variables, not constants**, so tuning them the night before the demo is
a Render restart rather than a 30-minute EAS build. Clients read them from `GET /v1/config`.

---

## 13. Demo-day run of show

```
T-24h  ☐ Freeze the Neon `demo` branch with the known-good dataset
       ☐ Build and install final APKs on the demo devices
       ☐ Run packages/face self-test on every device — record p95 latency
       ☐ Full dry run, end to end, on venue Wi-Fi if possible
       ☐ Record a 90-second screen capture as the fallback

T-1h   ☐ Enable the keepalive workflow
       ☐ Warm the API; run one real search
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
