# 07 — Design System

**PERIGEE // FIELD BRUTALIST**

One token package, three consumers: two React Native apps and one Next.js site.
Rationale for the aesthetic: [ADR-0005](ADR/0005-neobrutalism-as-ergonomics.md).

---

## 1. The argument

Neobrutalism was chosen because it is *correct for the operating environment*, and only
incidentally because it looks good.

An officer using this app is standing on a road in direct sunlight, holding a phone in one hand,
under time pressure, with a person watching them. Under those conditions the design language has to
deliver:

| Field requirement | Neobrutalist answer |
| --- | --- |
| Readable in direct sun | Maximum contrast; no soft greys, no low-opacity text |
| Operable one-handed, possibly gloved | 56 dp primary targets, bottom-anchored actions |
| Zero ambiguity under stress | Thick borders, hard edges, one unmistakable primary action |
| Instant state legibility | Colour-coded bands, solid fills, no gradient subtlety |
| Non-negotiable warnings | Hard-bordered blocks that cannot be visually dismissed |

Soft shadows, translucent surfaces and 4 pt hairlines fail every row of that table. The aesthetic
that "looks like a hackathon flex" is the one a human-factors analysis would have arrived at
independently.

The **cyberpunk** layer sits on top as a night mode — and that is operationally justified too, since
a fair share of patrol work happens after dark and a white screen at 2 a.m. destroys night vision.

---

## 2. Typography

Three faces, each doing a job nothing else can do. All open-source, all self-hosted (no CDN, no
Google Fonts request from a police device).

| Role | Face | Why this one |
| --- | --- | --- |
| **Display** | **Archivo** (variable, incl. Black + Expanded) | A grotesque built for signage and high-impact display. Institutional without being corporate. The width axis lets a headline compress to fit a phone without a second font. |
| **Data** | **Martian Mono** | Squared, machined, wide. Every ID, score, timestamp and vector norm. Tabular figures so scores align vertically — you compare 0.6412 against 0.5887 by *column*, not by reading. |
| **Body** | **Public Sans** | The typeface of the U.S. Web Design System. Chosen deliberately: this is pitched for government adoption, and reaching for a face designed to that brief is a substantive choice, not a decorative one. |

Deliberately avoided: Inter, Roboto, system stacks, and Space Grotesk. Those are the defaults that
make an interface read as generated rather than designed.

```ts
export const type = {
  display: 'Archivo',        // 900, uppercase, tight
  data:    'MartianMono',    // tabular numerals, always
  body:    'PublicSans',
} as const;

export const scale = {
  hero:    { size: 56, lh: 52, weight: '900', tracking: -1.5, transform: 'uppercase' },
  h1:      { size: 34, lh: 34, weight: '900', tracking: -0.8, transform: 'uppercase' },
  h2:      { size: 24, lh: 26, weight: '800', tracking: -0.4, transform: 'uppercase' },
  label:   { size: 12, lh: 14, weight: '700', tracking:  1.6, transform: 'uppercase' },
  body:    { size: 16, lh: 24, weight: '400' },
  bodySm:  { size: 14, lh: 20, weight: '400' },
  score:   { size: 44, lh: 44, weight: '700', font: 'data', variant: 'tabular-nums' },
  mono:    { size: 13, lh: 18, weight: '400', font: 'data' },
} as const;
```

**Display type is uppercase.** Lowercase letters have variable x-heights and descenders, which
creates ragged optical noise at large weights. Uppercase in a heavy grotesque reads as a solid
block — which is the entire point.

**`score` is always Martian Mono with tabular figures.** Non-negotiable. Proportional digits make
`0.6412` and `0.5887` different widths, and comparing them becomes a reading task instead of a
glance.

---

## 3. Colour

Two modes. `DAY` is the default; `NIGHT` engages on a manual toggle or automatically after sunset.
These are not light/dark cosmetic variants — they are two operating conditions.

```ts
export const palette = {
  ink:    '#0A0A0A',   // every border, every shadow. The system's skeleton.
  paper:  '#FFFEF0',   // DAY surface — warm off-white, not clinical white
  void:   '#0B0B10',   // NIGHT surface — blue-black, preserves night vision
  slab:   '#16161F',   // NIGHT raised surface
  bone:   '#E8E6D9',   // NIGHT primary text

  signal: '#FFE600',   // electric yellow — primary action, attention
  alert:  '#FF3EA5',   // hot magenta — STRONG candidate, destructive
  data:   '#00C2CB',   // vivid cyan — REVIEW band, informational, telemetry
  clear:  '#00C853',   // signal green — NO MATCH, cleared, proceed
  warn:   '#FF6B00',   // amber — WEAK band, degraded quality
} as const;
```

### Semantic mapping

Colour carries meaning in this system, so it is assigned once and never reused decoratively.

| Token | Meaning | Where |
| --- | --- | --- |
| `signal` | The primary action, exactly one per screen | CAPTURE, CONFIRM, ENROL |
| `alert` | STRONG candidate · destructive · ambiguity | Score badges, warning blocks |
| `data` | REVIEW candidate · scores · IDs · telemetry | Mono text, hop rings |
| `clear` | NO MATCH · cleared · success | The release outcome |
| `warn` | WEAK candidate · degraded quality | Quality banners |
| `ink` | Structure | Every border, every shadow, all DAY text |

> **`clear` green is the outcome we want most often.** Most searches should end with a person walking
> away. In the results screen, `NO MATCH` is rendered *larger and more affirmatively* than any
> candidate card — a green full-bleed block reading `NO CANDIDATES · RELEASE`. A system that makes
> "found nothing" feel like failure will be used until it finds something.

### Contrast — audited, not assumed

NN/g specifically flags neobrutalist palettes for contrast failures. **Rule: accent colours never
touch each other as foreground/background.** Text on an accent fill is always `ink`; text on a dark
surface is always `bone` or an accent.

Computed to WCAG 2.1, not estimated. Asserted in
`packages/design-tokens/src/__tests__/contrast.test.ts`, which fails if either a ratio drifts or a
verdict stops holding — so the palette cannot be nudged without the table noticing.

| Foreground | Background | Ratio | Verdict |
| --- | --- | --- | --- |
| `ink` #0A0A0A | `paper` #FFFEF0 | 19.50 : 1 | AAA |
| `ink` | `signal` #FFE600 | 15.62 : 1 | AAA |
| `ink` | `data` #00C2CB | 9.03 : 1 | AAA |
| `ink` | `clear` #00C853 | 8.85 : 1 | AAA |
| `ink` | `warn` #FF6B00 | 6.93 : 1 | AA |
| `ink` | `alert` #FF3EA5 | 6.11 : 1 | AA (large + body) |
| `bone` #E8E6D9 | `void` #0B0B10 | 15.66 : 1 | AAA |
| `data` | `void` | 8.96 : 1 | AAA |
| ~~`signal`~~ | ~~`data`~~ | 1.73 : 1 | ❌ **banned pairing** |
| ~~`alert`~~ | ~~`warn`~~ | 1.13 : 1 | ❌ **banned pairing** |

The banned pairs are asserted below AA in **both** directions, so neither can be used as foreground
or background for the other.

> **Earlier revisions of this table carried hand-rounded figures**, seven of which were wrong by up
> to 1.14 (`data` on `void` was printed as 10.1 against an actual 8.96). Every verdict still held,
> so nothing needed repalletting — but a table of accessibility numbers that nobody computed is
> worth less than no table. They are now generated and tested.

**Colour is never the sole channel.** Every band carries a text label (`STRONG CANDIDATE`,
`INSUFFICIENT`) and a distinct border treatment, so the interface survives both deuteranopia and a
sun-washed screen.

---

## 4. Structure — borders, shadows, radius

The whole system, in three rules:

```ts
export const structure = {
  border:  { width: 3, color: palette.ink, style: 'solid' },
  shadow:  { x: 5, y: 5, blur: 0, color: palette.ink },
  radius:  { none: 0, input: 4, pill: 999 },
} as const;
```

**`border: 3px solid ink` and `box-shadow: 5px 5px 0 ink` are the entire design system.** Everything
else serves them. Shadow direction is always bottom-right — one light source, top-left, consistently,
because inconsistent shadow direction is what makes neobrutalism look accidental rather than
deliberate.

Radius is `0` almost everywhere. Inputs get 4 px, purely so the caret does not collide with the
corner. Pills exist only for status chips.

### Elevation without blur

There is no blur in this system. Depth comes from shadow *offset*:

| Level | Offset | Use |
| --- | --- | --- |
| 0 | none | Flush surfaces, disabled |
| 1 | `3px 3px 0` | Inputs, chips, list rows |
| 2 | `5px 5px 0` | Cards, buttons — **the default** |
| 3 | `8px 8px 0` | Modals, the ambiguity warning |
| 4 | `12px 12px 0` | The capture button. One per screen, maximum. |

### The React Native caveat

`box-shadow` is not historically a React Native style. Two paths, and the choice matters:

```tsx
// Preferred — RN 0.76+ on the New Architecture (Expo SDK 54+ ships this)
<View style={{ boxShadow: '5px 5px 0 #0A0A0A', borderWidth: 3, borderColor: '#0A0A0A' }} />

// Fallback — a solid offset sibling behind the element.
// Reliable everywhere, and the only option on the Old Architecture,
// because Android `elevation` produces a soft blurred shadow that is
// exactly the thing this design system exists to avoid.
<View style={{ position: 'relative' }}>
  <View style={{ position: 'absolute', inset: 0, transform: [{ translateX: 5 }, { translateY: 5 }],
                 backgroundColor: '#0A0A0A' }} />
  <View style={{ borderWidth: 3, borderColor: '#0A0A0A', backgroundColor: '#FFE600' }}>
    {children}
  </View>
</View>
```

`packages/ui` exports `<Brut>` which picks the path at runtime. Component code never branches on it.

---

## 5. Spacing and layout

4 px base unit. `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96`.

```ts
export const space = { 1:4, 2:8, 3:12, 4:16, 6:24, 8:32, 12:48, 16:64, 24:96 } as const;
```

### Touch targets — the field ergonomics rule

| Element | Size | Rationale |
| --- | --- | --- |
| Primary action | **64 dp** | One-handed, gloved, under stress |
| Secondary | 56 dp | Above the 48 dp WCAG floor by design |
| Candidate card tap zone | full width × 96 dp | The most consequential tap in the app |
| Icon-only | 48 dp minimum | Never smaller, never for a destructive action |

Primary actions are **bottom-anchored within thumb reach**. Nothing consequential lives in the top
third of a Field screen — that region is for status only, because it cannot be reached one-handed on
a 6.7" device.

### Grid

Mobile: single column, 16 px gutters, full-bleed cards. No side-by-side layouts on a phone in the
field.

Web: 12-column, 1280 max, deliberately grid-breaking. Neobrutalist web layout should feel *placed*,
not flowed — cards overlapping the grid edge, headlines running past their container, sections at a
slight rotation (`-1.5deg`). Restrained: two or three grid-breaks per page, not everywhere.

---

## 6. Motion

The "GSAP equivalent in React Native" stack:

| Library | Job |
| --- | --- |
| **react-native-reanimated 4** | The engine. UI-thread worklets, springs, layout animations. |
| **moti** | Declarative layer over Reanimated. The closest thing to GSAP's DX. |
| **react-native-gesture-handler** | Gestures on the UI thread. |
| **@shopify/react-native-skia** | Scanlines, the orbital graph, the score sweep. |

### The motion grammar

> **Neobrutalist motion is mechanical, not organic.** Things snap, stamp, and slam. Nothing floats,
> eases gently, or fades softly. If an animation feels *smooth*, it is wrong for this system.

```ts
export const motion = {
  // Buttons — a physical press with a hard stop.
  press:   { damping: 15, stiffness: 400, mass: 0.7 },
  // Cards entering — overshoot, then snap.
  enter:   { damping: 12, stiffness: 220, mass: 0.9 },
  // State changes — sharp, no ease-out tail.
  snap:    { duration: 140, easing: Easing.bezier(0.2, 0, 0, 1) },
  // The one exception: score counters tick linearly, like a readout.
  readout: { duration: 900, easing: Easing.linear },
  stagger: 60,
} as const;
```

### Signature interactions

**1. Button press — the shadow collapses.**
The element translates into its own shadow. Physical, and it directly encodes the neobrutalist
metaphor of a solid object being pushed against a surface.

```tsx
const p = useSharedValue(0);
const style = useAnimatedStyle(() => ({
  transform: [{ translateX: p.value * 5 }, { translateY: p.value * 5 }],
}));
const shadow = useAnimatedStyle(() => ({ opacity: 1 - p.value }));
// onPressIn:  p.value = withSpring(1, motion.press)
// onPressOut: p.value = withSpring(0, motion.press)
```

**2. The scan — Skia, during embedding.**
A `signal`-yellow horizontal band sweeps the camera preview while ONNX runs. Not decorative: it is
honest progress feedback for a ~180 ms operation that would otherwise feel like a freeze. It sweeps
once per inference, so its *rhythm* communicates device speed.

**3. Candidate reveal — staggered slam.**
```tsx
<Animated.View entering={SlideInDown.delay(i * 60).springify().damping(12)} />
```
Cards arrive bottom-to-top, 60 ms apart, each overshooting and snapping. Rank 1 lands first, and the
stagger buys ~240 ms of enforced looking-before-tapping.

**4. Score readout — counting up.**
`useAnimatedProps` ticks `0.0000 → 0.6412` over 900 ms in Martian Mono. Reads as telemetry, and the
motion draws the eye to the number that matters.

**5. NO MATCH — the full-bleed stamp.**
Green fills the screen from centre, `scale: 0.8 → 1.0`, hard spring, 120 ms. The most satisfying
animation in the app is the one that means *a person is free to go*. That is a deliberate choice
about what the tool rewards.

**6. Ambiguity — the shake.**
When `score_gap < 0.05`, the two tied cards shake horizontally once, 3 px, 80 ms.
Pre-attentive: the officer notices before reading the banner.

### Accessibility

Every animation respects `ReduceMotion.System`. With reduce-motion enabled, transitions become
instant state changes — **never** silently replaced by a fade, which reintroduces the motion the
setting was meant to remove.

```tsx
withSpring(target, { ...motion.press, reduceMotion: ReduceMotion.System })
```

---

## 7. Core components

`packages/ui` — the vocabulary. Every one composes `<Brut>`.

| Component | Notes |
| --- | --- |
| `<Brut>` | Border + offset shadow primitive. Everything else wraps it. |
| `<Button variant tone size>` | `solid \| outline \| ghost`; tone from the semantic palette. |
| `<Card>` | Elevation 2, `ink` border, optional accent header strip. |
| `<ScoreBadge score band>` | Martian Mono, tabular, band-coloured fill, `ink` text. |
| `<CandidateTile>` | Mugshot + masked name + score + band. 96 dp tall. The app's most important surface. |
| `<Banner tone dismissible={false}>` | Advisories. Non-dismissible by default — that is the point. |
| `<QualityMeter>` | Five segmented blocks, no smooth bar. Discrete reads as measured. |
| `<OfficerChip>` | Persistent `SEARCHING AS OFFICER-1147`. Always visible during a search. |
| `<SyntheticWatermark>` | Diagonal repeating `SYNTHETIC DATA`, 8% opacity, rendered above all content whenever `dataset_mode === 'synthetic'`. Cannot be dismissed. |
| `<OrbitGraph>` | Skia. The network view — §8. |

### `<SyntheticWatermark>` is not optional

It mounts at the root of both apps, driven by the `dataset_mode` field present on every API
response. There is no prop to disable it. If a screenshot of this app ever circulates, it must be
impossible to mistake for an operational system — and that guarantee has to be structural, because
screenshots escape.

---

## 8. The orbit graph

The network visualisation, and the place where the product name earns itself.

> **Perigee** is the point of closest approach in an orbit. The graph draws the confirmed person at
> the centre and their network in **concentric rings — one ring per hop**. Direct associates orbit
> closest. Two hops out sit further. Distance on screen *is* distance in the graph.

```
              ○           ← hop 2, faint, small
        ○  ╱     ╲  ○
      ╱    ●  ●    ╲      ← hop 1, on the inner ring
     ○    ╱ ◉ ╲     ○     ← ◉ the confirmed person
      ╲    ●  ●    ╱
        ○  ╲     ╱  ○
              ○
```

Deliberately **not** a force-directed simulation on mobile:

- A physics sim on a phone burns battery and jitters on a low-end device.
- Force layouts are non-deterministic — the same network looks different each open, which is
  disorienting for something an officer may reference repeatedly.
- Radial layout makes hop distance *readable*, which is the actual question being asked.

Radial placement is deterministic (angle seeded from `person_id`), so the same network always draws
identically. Rendered in Skia: hop rings as thin `data`-cyan circles, edges as `ink` strokes with
width `∝ weight`, nodes as bordered circles filled by `community_id`. Tap a node to re-centre —
`withSpring` rotation and radius interpolation, ~400 ms.

The web explorer *does* use `react-force-graph-2d` over WebGL, because a desktop has the power and
an analyst benefits from cluster structure. Two contexts, two correct answers.

---

## 9. Token distribution

One source, three consumers, zero duplication.

```
packages/design-tokens/
├── src/
│   ├── palette.ts      # colours
│   ├── type.ts         # faces + scale
│   ├── space.ts
│   ├── structure.ts    # border, shadow, radius
│   ├── motion.ts       # springs, durations
│   └── index.ts
└── package.json        # "@perigee/design-tokens"
```

- **Mobile** — imported directly by `packages/ui`, and fed into NativeWind's Tailwind config.
- **Web** — the Next.js app imports the same package into `tailwind.config.ts`. A colour change in
  `palette.ts` moves the marketing site and both apps in one commit.
- **Docs** — a `tokens.json` export drives the design reference page on the site.

The web app depends on the mobile monorepo's token package via a git dependency or a published
`@perigee/design-tokens`. Copy-pasting hex values into two repositories is how design systems die,
usually within a week.

---

## 10. Reference — the Field results screen

Everything above, composed:

```
┌═══════════════════════════════════════════┐
│ ▓▓ PERIGEE // FIELD          [◑ NIGHT]    │  ink bar, Archivo Black
│ SEARCHING AS OFFICER-1147 · ROUTINE CHECK │  Martian Mono 12, data cyan
├═══════════════════════════════════════════┤
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│ ┃ ⚠ HUMAN VERIFICATION REQUIRED        ┃  │  Banner, signal fill, ink text
│ ┃ This system does not identify persons┃  │  non-dismissible
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
│                                           │
│ 3 CANDIDATES · Δ 0.0525                   │  label style
│ ┌─────────────────────────────────────┐   │
│ │ ┌──────┐  R***** K****      ┌──────┐│   │  CandidateTile, 96dp
│ │ │ 📷   │  26-35 · BLR STH   │0.6412││   │  score: Martian Mono 44
│ │ │      │  3 cases · 1 conv  │STRONG││   │  badge: alert magenta
│ │ └──────┘                    └──────┘│   │  shadow 5px 5px 0
│ └─────────────────────────────────────┘   │
│ ┌─────────────────────────────────────┐   │
│ │ ┌──────┐  S***** M****      ┌──────┐│   │
│ │ │ 📷   │  36-45 · BLR NTH   │0.5887││   │  badge: data cyan
│ │ └──────┘  1 case            │REVIEW││   │
│ └─────────────────────────────────────┘   │
│                                           │
├═══════════════════════════════════════════┤
│ ┏━━━━━━━━━━━━━━┓ ┏━━━━━━━━━━━━━━━━━━━━┓  │  bottom-anchored, 64dp
│ ┃  NO MATCH    ┃ ┃  CONFIRM SELECTED  ┃  │  clear green │ signal yellow
│ ┗━━━━━━━━━━━━━━┛ ┗━━━━━━━━━━━━━━━━━━━━┛  │  shadow 5px, collapse on press
└═══════════════════════════════════════════┘
     ╲  SYNTHETIC DATA  ╲  SYNTHETIC DATA  ╲   8% opacity, above everything
```

Note what the layout enforces: the advisory cannot be dismissed, `NO MATCH` is equal in visual
weight to `CONFIRM`, the officer's asserted identity is permanently on screen, and the watermark
crosses all of it.

---

**Next:** [05 — Mobile Applications](05-MOBILE-APPS.md)
