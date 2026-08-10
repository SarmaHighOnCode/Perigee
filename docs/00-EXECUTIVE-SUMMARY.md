# 00 — Executive Summary

**Read time: 3 minutes.** Everything else in `docs/` elaborates on this page.

---

## The problem, stated precisely

An officer on patrol develops reasonable suspicion about a person. To act on it, they must verify
identity and check prior history. Today that means physically escorting the person to the **thana**,
making a register entry, and querying records by hand.

The cost is asymmetric and mostly falls on the innocent:

| | Officer | Person stopped |
| --- | --- | --- |
| **Time** | 1–3 hours off patrol | 1–3 hours detained |
| **Outcome, typical** | No match | Released, no charge |
| **Recorded** | Register entry | A detention on their day |

Most stops end in nothing. The system spends its most expensive resource — an officer's patrol
hours — producing that nothing, one person at a time.

## What Perigee does

The officer photographs the person. The **phone** detects the face, aligns it, and computes a
512-dimensional embedding locally. That vector — not the photograph — goes to the server, which
returns the five nearest records from a criminal database with cosine similarity scores.

The officer looks at five faces next to the one in front of them and decides.

**Median end-to-end: ~390 ms. Target p95: under 800 ms.**

If nothing matches, the person walks. That is the primary outcome and the primary value.

## Why this is not the usual facial recognition pitch

Most systems in this category are built to *catch*. Perigee is architected to *release* — and the
difference shows up in the schema, not the marketing.

**1. There is no `is_match` field anywhere in the system.**
The API returns ranked candidates with scores. It is structurally incapable of asserting an
identification, because that is not a question a machine gets to answer.

**2. A search does not close until a human adjudicates it.**
`search_event` opens in `PENDING_DECISION`. A device carrying too many undecided searches is
rate-limited to a halt. You cannot fish.

**3. The photograph never leaves the phone.**
Inference is on-device. The server receives 512 floats. This is a privacy property enforced by
network topology, not by a policy document — and it also happens to make the backend free to run.

**4. Minimum three candidates, always.**
Even when the top score is overwhelming. Forced comparison is the cheapest known countermeasure to
automation bias, which is the actual failure mode of these systems in the field.

**5. The audit log is hash-chained.**
`sha256(prev_hash ‖ row)`. Every search, every score shown, every decision made, every threshold in
effect at the time. Rewriting history is detectable.

## The architectural bet

> **Push the model to the edge. Keep the server dumb.**

Running SCRFD + ArcFace on the handset instead of the server buys four things at once:

- **Privacy** — the raw biometric never transits the network.
- **Cost** — the backend has *zero* ML dependencies and fits in a free 512 MB Render instance.
- **Resilience** — works on a weak rural connection; only 2 KB goes over the wire.
- **Latency** — no image upload, no server-side inference queue, no GPU cold start.

The server becomes what it should be: a vector index, a relational store, and an audit log.

## Cost

| Component | Service | Tier | Cost |
| --- | --- | --- | --- |
| API | Render | Free web service (native Python, no Docker) | ₹0 |
| Database | Neon | Free — Postgres 17 + pgvector, 0.5 GB | ₹0 |
| Object storage | Cloudflare R2 | Free — 10 GB, zero egress | ₹0 |
| Website | Vercel | Hobby | ₹0 |
| Mobile builds | Expo EAS | Free — 30 builds/month | ₹0 |
| CI, monitoring | GitHub Actions, Sentry, UptimeRobot | Free | ₹0 |
| | | **Total** | **₹0 / month** |

Full runbook with the migration path off each free tier: [10 — Deployment](10-DEPLOYMENT.md).

## What we are honest about

A senior engineer's credibility comes from the limitations they volunteer. Ours:

- **Accuracy is demographic-dependent.** NIST FRVT consistently measures differential error rates
  across skin tone, age and sex. Publicly available models are trained on Western- and East-Asian-
  heavy corpora. For an Indian deployment this is a live risk, not a footnote. Mitigation is
  structural — the human decides, always — and per-cohort metrics are published, not hidden.
- **No liveness detection in this prototype.** A printed photograph would fool it. Out of scope for
  the demo, specified as the first post-hackathon addition.
- **Synthetic data only.** Enforced by a hard `DATASET_MODE` flag and a permanent on-screen
  watermark in both apps.
- **No authentication.** A deliberate prototype decision, compensated by device keys, mandatory
  officer attribution, purpose-binding, and rate limiting. See [08 — Security](08-SECURITY.md).
- **Android distribution only.** iOS side-loading is not possible without a paid Apple developer
  account; TestFlight is the documented alternative.
- **India has no FRT-specific statute.** The Facial Recognition Technology (Regulation of Police
  Powers) Bill, 2023 remains pending. We build to its proposed standard anyway. See
  [09 — Compliance](09-COMPLIANCE-INDIA.md).

## Where it goes

Phase two is the **criminal network graph**: co-accused links, shared addresses and phones, shared
modus operandi. Confirm one person and the app expands into concentric orbit rings — one ring per
hop — showing who they are connected to and which case file establishes each edge. Finding the
helpers, not just the principal.

The graph model is deliberately identical to that of
[KAVAL](https://github.com/SarmaHighOnCode/KSPDatathon), so records enrolled through Perigee in the
field are immediately queryable in KAVAL's natural-language analysis interface. Perigee is the
hand; KAVAL is the head.

---

**Next:** [01 — System Architecture](01-ARCHITECTURE.md)
