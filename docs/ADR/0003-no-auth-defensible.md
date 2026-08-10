# ADR-0003 — No authentication; defensibility from attribution, purpose-binding and audit

**Status:** Accepted · **Date:** 2026-08-10

---

## Context

The requirement, as stated: *"no auth to avoid complexity and delays in testing, yet secure enough to
not be questioned."*

Those pull in opposite directions, and pretending otherwise is how a project loses credibility in the
room. A login screen costs real hackathon time — user management, sessions, password reset, a seed
admin, and a demo that begins with someone typing credentials on a phone in front of judges. But a
system handling biometric and criminal-record data with *no* access control invites an obvious and
fatal objection.

The resolution is to be precise about **which security properties actually require authentication**,
and which are commonly assumed to but do not.

## Decision

**No user authentication.** No login, no password, no session.

Instead, eight layers that deliver most of what auth is *used* for, at zero UX cost:

1. **Device key** — `X-Perigee-Device-Key`, provisioned via EAS secrets, `sha256` at rest, revocable
   per handset.
2. **Attribution** — `officer_id` + `reason_code` required on every search, recorded immutably,
   displayed persistently on screen.
3. **Rate limiting** — token bucket per device key.
4. **Pending-decision brake** — 3 unadjudicated searches and the device stops. Enforced by a database
   trigger.
5. **Input validation** — dimension, L2 norm, model allowlist, closed reason enum.
6. **Purpose binding** — PII requires a `search_id` with a `CONFIRMED` decision.
7. **Data separation** — the vector table holds no names.
8. **Audit chain** — append-only, `sha256(prev_hash ‖ row)`.

And, explicitly: **a written statement of what this does not provide** ([08 §1](../08-SECURITY.md#1--what-no-auth-costs-stated-first)).

## Consequences

### Good

- **Zero demo friction.** The app opens to a camera. In a five-minute pitch, thirty seconds of
  credential entry is a meaningful fraction, and it is the least interesting part.
- **Purpose binding delivers more than RBAC would here.** Requiring a confirmed identification before
  a record opens prevents PII browsing outright — a control most authenticated systems do *not* have,
  because auth answers "who are you" and not "why are you looking."
- **The pending-decision brake is stronger than a permission.** It enforces a policy about behaviour
  rather than a boundary about access, and no role-based system does that.
- **The audit chain provides accountability without identity.** Every search, score, decision and
  threshold is bound into a verifiable sequence.
- **The upgrade path is short.** `officer_id` is already threaded through every request and every
  audit row. Phase 2 changes where the value *comes from*, not what the system does with it — roughly
  two days.

### Bad

The genuinely unresolved costs, stated plainly:

- **Identity is asserted, never proven.** Any officer ID string is accepted. Mitigated only by
  recording, displaying, and anomaly detection.
- **Non-repudiation is weak.** The system proves *a device* ran a search at a time, and that the
  record is unaltered. It cannot prove *which human* held the device.
- **Revocation is per-device, not per-officer.**
- **No jurisdiction scoping.** Single-jurisdiction prototype; the clamp is specified, not built.
- **Threat T1 — adversarial embedding submission — is open.** Because the API accepts vectors, a
  compromised device can probe the database with synthesised embeddings. Norm and dimension checks
  catch the trivial cases only. Properly closing this needs device attestation, which needs
  authentication. **This is the clearest single cost of this decision.**
- **A rooted device yields the key.** Acknowledged; the device key sits *below* rate limiting and
  purpose binding in the defence stack precisely because it is not load-bearing.

### Neutral

- The UI never calls this a login, and the Shift Start screen states in plain text that the
  identifier is recorded but not verified. Calling an unverified string a login teaches a false
  expectation.

## Alternatives considered

**Full auth — OIDC, JWT, RBAC.** The correct production answer, and specified as Phase 2. Rejected
for the prototype: roughly two days that buy nothing the demo needs, plus friction in the pitch.

**A shared password on app launch.** Rejected as security theatre. It creates the *appearance* of
access control while providing none of its properties — no per-user attribution, no revocation, no
non-repudiation. Worse than no auth, because it invites everyone to stop asking the question.

**Biometric device unlock (fingerprint to open the app).** Tempting and superficially reassuring.
Rejected: it authenticates *the handset's enrolled user* to the handset, not the officer to the
server. It would let us say "biometrically secured" while changing nothing about what the server
knows — which is exactly the kind of claim this project should not be making.

**Magic-link / OTP to a department email.** Rejected: needs an email service, a user table, and
network connectivity at shift start — the one moment an officer is most likely to be somewhere
without signal.

## Revisit when

Immediately upon any move toward real data. Phase 2 (OIDC + RBAC + jurisdiction clamp) is a hard
prerequisite for a pilot, and is item 2 on the pre-deployment checklist in
[09 §6](../09-COMPLIANCE-INDIA.md#6--pre-deployment-checklist).
