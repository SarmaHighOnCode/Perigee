# ADR-0001 — Face embedding runs on-device; the API contract is embedding-first

**Status:** Accepted · **Date:** 2026-08-10 · **Supersedes:** —

---

## Context

Perigee must turn a photograph into a 512-dimensional vector and search a database for the nearest
neighbours. That inference has to happen somewhere.

Constraints in force:

- The backend must run on Render's free tier: **512 MB RAM, 0.1 CPU, native Python, no Docker**.
- The system handles biometric data belonging to people who are, in most cases, innocent.
- Officers work on rural connections where a 200 KB upload is not reliable.
- Total infrastructure budget is ₹0.

ArcFace `w600k_r50` needs roughly 700 MB resident alongside FastAPI and onnxruntime. It does not fit.
That fact alone forces the decision, but it is not the reason the decision is *good*.

## Decision

**Face embedding runs on-device**, in `packages/face`, using ONNX Runtime with SCRFD for detection
and ArcFace `w600k_r50` for recognition.

**The API contract is embedding-first, not device-first.** `POST /v1/search` accepts a
`float32[512]` and a `model_id`. Where the vector was computed is not the API's concern.

A server-side `POST /v1/embed` is fully specified and **disabled on Render**
(`ENABLE_SERVER_EMBED=false`). It exists so the contract is host-independent: moving to a machine
with more memory is an environment-variable change, not a redesign.

## Consequences

### Good

- **The photograph never transits the network.** A privacy property enforced by topology, not by a
  policy document — and the strongest single claim the project makes.
- **The backend has zero ML dependencies.** ~120 MB resident, 40-second builds, comfortable in
  512 MB. This is what makes ₹0 hosting real rather than aspirational.
- **2 KB per search instead of ~200 KB.** Works on a weak connection.
- **No server-side inference queue.** No GPU, no cold-start model load, no per-request CPU cost.
- **DPDP data minimisation is structural.** The server is not instructed to discard the image; it is
  never given it.
- **Scales for free.** Inference cost is distributed across handsets already paid for.

### Bad

- **Model drift across devices.** Handled by mandatory `model_id` on every embedding and every query,
  a server-side allowlist, and additive-only model migration ([01 §7](../01-ARCHITECTURE.md#7--model-versioning--the-failure-mode-nobody-plans-for)).
  This is the real cost, and it is the failure mode that would be easiest to ignore.
- **183 MB model download on first launch.** Mitigated by out-of-band download with SHA-256
  verification, not by bundling.
- **Low-end devices are excluded.** Below 4 GB RAM the app blocks rather than degrading — because a
  system that quietly performs worse on cheap handsets misidentifies poorer people more often.
- **Adversarial embedding submission becomes possible.** A compromised device can post synthesised
  vectors to probe the database. Norm and dimension validation catch only the trivial cases. Named
  as threat T1 in [08 §4](../08-SECURITY.md#4--threat-model); properly closed only by device
  attestation, which requires authentication.
- **Larger app bundle and a mandatory custom dev client.** Expo Go cannot load native modules.

### Neutral

- Two mobile apps share one pipeline via `packages/face`, so the complexity is paid once.

## Alternatives considered

**Server-side inference.** Simplest mobile app, trivial model version control. Rejected: does not fit
in 512 MB, uploads the biometric on every search, fails on poor connectivity, and forfeits the
privacy argument that makes the project defensible.

**Hybrid — device first, server fallback per request.** Rejected as a *runtime* strategy: two active
inference paths means two model versions in play, and if they ever differ the embeddings silently
become incomparable. Kept as a *deployment-time* switch instead, which gives the same flexibility
with none of the ambiguity.

**Smaller on-device model (`buffalo_s` / `w600k_mbf`, 12.9 MB).** Rejected. It is a *different model*
producing a *different embedding space*. Substituting it for low-end devices would silently corrupt
every comparison. If it is ever needed it gets its own `model_id`, its own rows, and its own index —
never a substitution.

## Verification

Go/no-go is `packages/face.selfTest()` on the actual demo device, day 1:

- same-identity cosine > 0.55, cross-identity < 0.30
- p95 embed latency < 400 ms
- model SHA-256 verified; a corrupted download is rejected

Failure flips `ENABLE_SERVER_EMBED=true` on a larger host. Roughly half a day, and nothing downstream
changes — which is the whole point of an embedding-first contract.
