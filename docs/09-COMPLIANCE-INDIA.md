# 09 — India Compliance Annex

> **Not legal advice.** Written by engineers to demonstrate that the legal landscape was studied
> before the system was designed, and to give counsel a concrete artefact to review. Any real
> deployment requires sign-off from the department's legal cell and a formal DPIA.

The purpose of this annex is narrow and worth stating: **India has no facial-recognition statute.**
Building to a standard that does not yet exist — the one the pending Bill proposes — is a design
choice, and it is the one that makes the difference between a prototype a government could adopt and
one it could not.

---

## 1. Landscape

| Instrument | Status | Relevance |
| --- | --- | --- |
| **Constitution, Art. 21** | In force | Right to privacy — *K.S. Puttaswamy v. Union of India* (2017) |
| **DPDP Act, 2023** | In force; Rules notified Nov 2025 | Personal data processing, including biometrics |
| **FRT (Regulation of Police Powers) Bill, 2023** | **Pending** — private member's bill | Would require magistrate authorisation for police FRT |
| **Bharatiya Nyaya Sanhita, 2023** | In force from 1 Jul 2024 | Replaced the IPC — dual citation required |
| **Bharatiya Nagarik Suraksha Sanhita, 2023** | In force | Replaced the CrPC — procedure for stops and detention |
| **Bharatiya Sakshya Adhiniyam, 2023** | In force | Replaced the Evidence Act — admissibility of electronic records |
| **Criminal Procedure (Identification) Act, 2022** | In force | Permits collection of biometrics from certain categories of persons |
| **IT Act, 2000 + SPDI Rules 2011** | In force | Biometric data as "sensitive personal data" |

### The central gap

Facial recognition is deployed by Indian police today — Delhi Police's AFRS being the most
documented case — **without a specific enabling statute.** Commentators and the pending Bill's
statement of objects both note this. It is the single largest legal risk for any system in this
category, and it is not one an engineering team can close.

**What we do about it:** build to the standard the pending Bill proposes, so that if it passes,
compliance is a configuration change rather than a rewrite. Specifically, the Bill contemplates
magistrate-level authorisation and defined accountability mechanisms; the hooks for both are in the
data model already (§5).

---

## 2. Puttaswamy proportionality

Any state intrusion on privacy must clear a four-part test. Mapped to design decisions:

### (i) Legality — a law must authorise it

**Status: not satisfied by us, and not satisfiable by us.** Authorisation must come from statute or
a departmental order under existing powers. What the system provides is the *record* that
authorisation was invoked: `reason_code` on every search, and a `legal_basis` field specified for
deployment (§5).

### (ii) Legitimate aim

Identifying persons with criminal records during a lawful stop, and — the aim we lead with — rapidly
**clearing** persons without one. Both are within ordinary policing functions.

### (iii) Proportionality — the intrusion must be no greater than necessary

Where the architecture does its heaviest legal work:

| Proportionality requirement | Design response |
| --- | --- |
| Minimum data collected | The photograph never leaves the device. The server receives 512 floats. |
| Minimum data retained | Probe images never stored; probe embeddings off by default |
| Minimum persons affected | No batch search. No crowd scanning. **There is no API route for it.** |
| Minimum disclosure | Candidates return `masked_name`; four of five are innocent and stay unidentified |
| Least intrusive alternative | The alternative is detention and transport to a thana — measurably more intrusive |
| No automated decision | Structurally impossible: no `is_match` field exists |

The strongest proportionality argument available: **Perigee is less intrusive than the status quo it
replaces.** Today's process detains a person for hours to answer a question a 400 ms query answers at
the roadside. Reduced intrusion is the product, not a side effect.

### (iv) Procedural safeguards

| Safeguard | Implementation |
| --- | --- |
| Purpose limitation | `reason_code` enum, per search, recorded |
| Audit trail | Append-only hash chain, 7-year retention |
| Human review | Enforced by a database trigger, not a policy document |
| Oversight | `/v1/audit/verify` + the governance queries in [08 §7](08-SECURITY.md) |
| Redress | `person.status = 'expunged'` destroys biometrics, retains the processing record |
| Retention limits | Specified per data class, [02 §9](02-DATA-MODEL.md) |

---

## 3. DPDP Act, 2023

### Roles

- **Data Fiduciary** — the police department deploying the system, not us
- **Data Processor** — the system operator
- **Data Principal** — the enrolled person and the person stopped

Given the volume and sensitivity of biometric processing, a state-wide deployment would likely be
designated a **Significant Data Fiduciary** under the Nov 2025 Rules, triggering DPO appointment,
independent audit, and mandatory DPIA. The architecture assumes that classification rather than
hoping to avoid it.

### Obligations mapped

| DPDP obligation | Response | Status |
| --- | --- | --- |
| **§4** Lawful purpose | Statutory policing function; `legal_basis` recorded | Deployment-dependent |
| **§5** Notice | Enrolment notice specified below; roadside notice is a policy question | Partial |
| **§6** Consent | State functions rely on §7(b)/§17(1) exemptions, not consent | Deployment-dependent |
| **§7** Legitimate uses | Sovereign-function ground | Deployment-dependent |
| **§8(3)** Accuracy | Multi-angle enrolment, quality gates, published per-cohort error rates | ✅ Built |
| **§8(4)** Security safeguards | [08 — Security](08-SECURITY.md) | ✅ Built |
| **§8(5)** Breach notification | Runbook specified; not exercised | Specified |
| **§8(7)** Erasure on purpose completion | `expunged` status cascade | ✅ Built |
| **§9** Children's data | **Out of scope** — enrolment restricted to adults (`age_band` ≥ 18) | ✅ Enforced |
| **§11** Right to access | Requires a citizen-facing channel — not built | ❌ Gap |
| **§12** Right to correction/erasure | Mechanism exists; the request channel does not | Partial |
| **§13** Grievance redressal | Not built | ❌ Gap |

**The two `❌` rows are honest gaps**, and they are the right ones to be missing in a prototype: both
need a citizen-facing service and an institutional owner, neither of which a hackathon can
credibly stand up. They are named here rather than omitted, and they are on the deployment
checklist in §6.

### §17 exemptions — the part to be careful about

DPDP §17(1) exempts certain state processing from several obligations. Commentary has raised
concerns that this operates as a broad carve-out for government surveillance.

**Our position:** the exemption is treated as a legal shield we do not design against. Data
minimisation, retention limits, human review and audit are implemented as if no exemption applied.

Two reasons, and the second is the practical one. First, a system built to the exempt standard
cannot later be raised to the non-exempt one without a rewrite. Second — and more usefully — a
system whose safeguards do not depend on an exemption is a system that survives the exemption being
narrowed. Building to the floor is a bet that the floor never rises.

---

## 4. BNS / IPC dual citation

The Bharatiya Nyaya Sanhita replaced the Indian Penal Code on 1 July 2024. Records before that date
carry IPC sections; records after carry BNS. Officers work across both, daily, and the mapping is
not one-to-one.

The `offence` table stores both columns and the UI renders both, always:

```
IPC 379 / BNS 303(2) — Theft
IPC 302 / BNS 103(1) — Murder
```

This mirrors KAVAL's `map_ipc_bns` bridge, so the two systems cite offences identically. It is a
small detail that signals to an evaluating officer that the team spoke to someone who does the job.

**Bharatiya Sakshya Adhiniyam** governs admissibility of electronic records. The hash-chained audit
log, with its `§63`-style certificate of integrity, is designed to be producible as an electronic
record — but a face-recognition *candidate score* is investigative lead material, not evidence of
identity, and the system's language is deliberate on this point. The docs never call a candidate a
match, and neither should a chargesheet.

---

## 5. Deployment hooks

Fields specified in the data model, unused in the prototype, present so that adding them later is a
migration rather than a redesign:

```sql
ALTER TABLE search_event
    ADD COLUMN legal_basis         text,   -- 'BNSS §35', 'warrant', 'magistrate_order'
    ADD COLUMN authorisation_ref   text,   -- magistrate order reference, per the pending Bill
    ADD COLUMN jurisdiction_code   text;   -- district/station clamp
```

Under the FRT Bill as drafted, police FRT use would require magistrate-level authorisation.
`authorisation_ref` is where that order number goes, and making it `NOT NULL` is the entire
compliance change if the Bill passes.

**Criminal Procedure (Identification) Act, 2022** governs which persons' biometrics may lawfully be
collected. Enrolment therefore records the collection authority:

```sql
ALTER TABLE person
    ADD COLUMN collection_authority text,  -- 'CrPI Act 2022 §3', 'conviction', 'voluntary'
    ADD COLUMN collected_by         text,
    ADD COLUMN collected_on         date;
```

---

## 6. Pre-deployment checklist

Ordered. Not one of these is optional, and the prototype clears none of them.

```
LEGAL
  ☐ Statutory or departmental authorisation for FRT use, in writing
  ☐ DPIA completed and approved
  ☐ DPO appointed (SDF likely)
  ☐ Retention schedule approved by the department
  ☐ Grievance redressal channel live (DPDP §13)
  ☐ Data-principal access and correction channel live (DPDP §11, §12)
  ☐ Model weight licence resolved — InsightFace weights are non-commercial research

TECHNICAL
  ☐ Auth phases 2 and 3 complete (OIDC, RBAC, jurisdiction clamp, mTLS)
  ☐ Liveness / presentation-attack detection deployed
  ☐ Per-cohort accuracy measured on a representative local population
  ☐ Audit chain mirrored to external append-only storage
  ☐ Independent security audit
  ☐ Device attestation (closes threat T1)

OPERATIONAL
  ☐ Officer training on automation bias — the actual failure mode
  ☐ Supervisor co-sign for any confirmation leading to detention
  ☐ Published error rates, per cohort
  ☐ Independent oversight body with access to the audit chain
  ☐ Public transparency report, periodic
```

**The prototype satisfies none of this and is not intended to.** It runs on synthetic data
specifically so that the gap between "works" and "may lawfully be used" stays visible.

---

## 7. Integration path: CCTNS / ICJS

Not built. The realistic route:

```
CCTNS  (Crime and Criminal Tracking Network & Systems)  — FIRs, persons, cases
   ↕
ICJS   (Inter-operable Criminal Justice System)         — police ↔ courts ↔ prisons ↔ forensics
   ↕
PERIGEE — field capture + biometric matching
```

- **Read:** person and case records via NCRB-approved APIs, replacing the synthetic seed
- **Write:** confirmed identifications as investigative leads, never as identity assertions
- **Never:** biometric templates out of the department's control. Embeddings stay in departmental
  infrastructure — which is one of the strongest arguments for the self-hosted deployment path in
  [12 §7](12-SCALING-ROADMAP.md).

Integration requires NCRB approval, a security audit, and MoUs. Months, not days, and correctly so.

---

## 8. What we would tell a judge who asks "is this legal?"

> Not yet, and we have not pretended otherwise.
>
> India has no facial-recognition statute. Systems like AFRS operate today without one, which is
> exactly the problem. We built to the standard the pending FRT Bill proposes — magistrate
> authorisation hooks, mandatory human review, an append-only audit chain, purpose binding — so that
> when a law arrives, compliance is a migration rather than a rewrite.
>
> We also built the parts nobody requires yet: the photograph never leaves the phone, the machine
> cannot assert a match, and four of five candidates are never identified to the officer at all.
>
> This runs on synthetic data. Making it lawful is a checklist we have written down, not a box we
> have ticked.

---

**Next:** [10 — Deployment Runbook](10-DEPLOYMENT.md)
