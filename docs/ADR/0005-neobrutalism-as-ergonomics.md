# ADR-0005 — Neobrutalist design as a field-ergonomics decision

**Status:** Accepted · **Date:** 2026-08-10

---

## Context

The aesthetic direction requested was neobrutalist with a cyberpunk influence. That is a legitimate
stylistic preference, and for most products it would be recorded as a preference and nothing more.

Here it is worth interrogating, because this interface is used under conditions that most design
systems never account for:

- Direct Indian sunlight, on a phone screen, outdoors
- One-handed, possibly gloved, while the other hand is occupied
- Under time pressure, with a person standing in front of the officer watching
- By users with wide variation in age, eyesight and technical familiarity
- Where a misread produces a wrongful detention

The question is not "does this look good." It is whether the aesthetic is *correct* for that
environment, or merely fashionable in spite of it.

## Decision

**Adopt neobrutalism**, and document it as an **ergonomic** decision that happens to also be
stylistically distinctive — not the reverse.

The system in three rules: `border: 3px solid #0A0A0A`, `box-shadow: 5px 5px 0 #0A0A0A`,
`border-radius: 0`. Everything else serves them.

Cyberpunk enters as a **night mode** (`void` #0B0B10, neon accents, Skia scanlines), which is
operationally justified: a significant share of patrol work happens after dark, and a white screen at
2 a.m. destroys night vision.

Typography deliberately avoids the defaults that make an interface read as generated:
**Archivo** (signage grotesque, display) · **Martian Mono** (machined, all data) ·
**Public Sans** (the U.S. Web Design System face — chosen because this is pitched for government
adoption).

## Consequences

### Good

Each maps to a field requirement rather than a taste:

| Field requirement | Delivered by |
| --- | --- |
| Readable in direct sun | 19.8:1 contrast on primary text; no greys, no low-opacity anything |
| One-handed, gloved | 64 dp primary targets, bottom-anchored within thumb reach |
| Zero ambiguity under stress | Thick borders, hard edges, exactly one primary action per screen |
| Instant state legibility | Solid colour-coded bands; no gradient subtlety to squint at |
| Non-dismissible warnings | Hard-bordered blocks that cannot be visually tuned out |
| Score comparison at a glance | Martian Mono tabular figures — compare by column, not by reading |

- **The aesthetic reinforces the governance.** A system that renders `HUMAN VERIFICATION REQUIRED` in
  a 3 px-bordered black-on-yellow block is harder to ignore than one that renders it in 12 pt grey.
  Visual weight and policy weight align.
- **Memorable in a room of demos.** Genuine value in a hackathon, and honestly stated as such.
- **Cheap to implement.** No gradients, no blur, no shadow tuning. Two rules and a palette.
- **`NO MATCH` can be made visually dominant.** A full-bleed green stamp for the outcome we want most
  often — a person walking away — is only possible in a system with this much colour weight to spend.

### Bad

- **Accent contrast is a live risk.** NN/g flags neobrutalist palettes specifically. Handled by an
  audited pairing table with two explicitly banned combinations
  ([07 §3](../07-DESIGN-SYSTEM.md#3--colour)), enforced by a lint rule rather than by discipline.
- **React Native does not do hard shadows natively.** `boxShadow` requires RN 0.76+ on the New
  Architecture; Android `elevation` produces a soft blur, which is precisely the thing this system
  exists to avoid. Handled by a `<Brut>` primitive that picks between `boxShadow` and an offset
  sibling `View` at runtime.
- **Can read as unserious.** A police system that looks like a design portfolio invites the wrong
  first impression from a government evaluator. Mitigated by the ergonomic justification being
  *stated*, not merely true — this ADR exists partly so the answer is ready when the question is
  asked.
- **Uppercase display type reduces reading speed for long text.** Confined to headings and labels;
  body copy is sentence case in Public Sans.

### Neutral

- Tokens live in one package consumed by both React Native apps and the Next.js site, so the
  aesthetic cannot drift between surfaces.

## Alternatives considered

**Material Design 3.** The safe institutional choice, excellent accessibility defaults, and free
components. Rejected: elevation-by-blur and low-contrast surface tints perform poorly in direct
sunlight, and it would be visually indistinguishable from every other submission. The accessibility
properties are worth keeping, and are reimplemented explicitly in the contrast table and touch-target
rules.

**A conventional "government portal" aesthetic.** Maximum institutional credibility, minimum
memorability, and — importantly — the same sunlight legibility problems, because those palettes are
built for desktops in offices.

**Pure cyberpunk / dark-only.** On-brief for the stated inspiration and genuinely striking. Rejected
as a default: a dark interface in direct sunlight is close to unreadable. Retained as night mode,
where it is not merely acceptable but better.

**Neobrutalism applied to the marketing site only, with a conventional app.** Rejected: the shared
token package is what keeps them coherent, and the ergonomic argument means the app is the surface
that *most* benefits from high contrast, not least.

## Revisit when

Real officers use it outdoors. Field feedback beats every argument in this document, including the
ones that are correct.
