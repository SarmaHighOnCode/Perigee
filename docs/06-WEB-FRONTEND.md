# 06 — Web Frontend

`perigee-web` — Next.js 16 App Router on Vercel. The public face: what Perigee is, why it is built
the way it is, and where to download it.

---

## 1. Job to be done

Three audiences, in priority order:

| Audience | Wants | What they get |
| --- | --- | --- |
| **Hackathon judges** | To grasp the idea in 60 seconds and probe it for weaknesses | Hero + live graph demo + the governance section that answers the objection they were forming |
| **Officers / departments** | The APK | An unmissable download block with the Android caveat stated plainly |
| **Engineers** | Whether this is real | Architecture diagrams, the docs tree, the GitHub repos |

This is a **pitch surface, not an application**. No login, no dashboard, no search UI. Putting a
face-search box on a public website would undermine every claim the project makes about purpose-
binding.

---

## 2. Stack

```jsonc
{
  "next": "16.x",                       // App Router, Cache Components
  "react": "19.x",
  "tailwindcss": "^4.0.0",
  "@perigee/design-tokens": "workspace", // the same tokens the apps use
  "motion": "^11.x",                     // scroll + reveal
  "react-force-graph-2d": "^1.25.0",     // WebGL graph explorer
  "@vercel/analytics": "^1.4.0"
}
```

Deployed on Vercel Hobby. Mostly static/ISR; a single dynamic route proxies the public API.

```
app/
├── layout.tsx
├── page.tsx                  # the pitch
├── how-it-works/page.tsx     # the pipeline, animated
├── governance/page.tsx       # the section that wins arguments
├── explore/page.tsx          # live graph demo
├── download/page.tsx         # APK + caveats
├── docs/[...slug]/page.tsx   # renders docs/ from GitHub at build time
└── api/proxy/[...path]/route.ts
```

---

## 3. Rendering strategy

| Route | Strategy | Why |
| --- | --- | --- |
| `/`, `/how-it-works`, `/governance` | Static | Never changes between deploys |
| `/download` | ISR, 5 min | Follows GitHub Releases without a redeploy |
| `/explore` | Static shell + client fetch | Graph data from the public API |
| `/docs/*` | Static, generated at build | Markdown from the repo — one source of truth |
| `/api/proxy/*` | Dynamic, Node runtime | Hides the Render origin; adds caching and rate limiting |

**Why proxy the API.** Three reasons, in order: the browser never learns the Render origin (which is
otherwise trivially DoS-able on a free tier), responses can be cached at the edge so a cold Render
instance does not stall the page, and CORS collapses to a same-origin problem.

```ts
// app/api/proxy/[...path]/route.ts
export const runtime = 'nodejs';

const ALLOWED = new Set(['stats', 'graph/demo', 'releases']);   // allowlist, never a passthrough

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/');
  if (!ALLOWED.has(path)) return Response.json({ error: 'not_found' }, { status: 404 });

  const res = await fetch(`${process.env.PERIGEE_API_URL}/v1/public/${path}`, {
    next: { revalidate: 300 },
  });
  return new Response(res.body, {
    status: res.status,
    headers: { 'content-type': 'application/json',
               'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600' },
  });
}
```

`stale-while-revalidate=3600` is doing real work: when Render is cold-starting, visitors get the
last good response instead of a 50-second hang. The free tier's worst property, hidden at the edge.

---

## 4. The landing page

Neobrutalism on the web can go further than on a phone — a desktop viewport tolerates grid-breaking,
rotation and density that would be reckless in a field app.

### Hero

```
┌──────────────────────────────────────────────────────────────┐
│  ▓▓▓ PERIGEE                          GOVERNANCE  DOCS  ↓APK  │
│                                                               │
│      THE POINT OF                    ┌───────────────────┐    │
│      CLOSEST                         │  ┌─────┐  0.6412  │    │  ← card rotated -2deg,
│      APPROACH.                       │  │ 👤  │  STRONG  │    │    overlapping the
│                                      │  └─────┘  CANDIDATE│   │    headline column
│      ▓ Roadside identity screening   └───────────────────┘    │
│        that ends in release, not      ┌───────────────────┐   │
│        detention.                     │  NO CANDIDATES    │   │  ← green, rotated +1.5deg
│                                       │  RELEASE          │   │
│      ┏━━━━━━━━━━━━━━━━┓               └───────────────────┘   │
│      ┃  DOWNLOAD APK  ┃  ┌─────────────┐                      │
│      ┗━━━━━━━━━━━━━━━━┛  │ HOW IT WORKS│                      │
│                          └─────────────┘                      │
│  ─────────────────────────────────────────────────────────    │
│  8s vs 3hrs   ·   0 photos stored   ·   100% human decisions  │  Martian Mono
└──────────────────────────────────────────────────────────────┘
```

`Archivo Black` at `clamp(3rem, 9vw, 7.5rem)`, `-0.04em` tracking, uppercase, `line-height: 0.88`.
Background: `paper` with a subtle 2 px `ink` dot grid at 6% opacity, plus an SVG grain overlay —
texture that keeps a flat colour field from reading as unfinished.

**The two floating cards are the pitch.** They are the actual result states, rendered with the real
components. One shows a strong candidate; the other shows a release. Placing them side by side
communicates the product's thesis before a single sentence is read.

### Scroll composition

| Section | Idea | Treatment |
| --- | --- | --- |
| **The 3-hour problem** | Side-by-side timeline, today vs Perigee | Two columns, one collapsing to 8 s on scroll |
| **The photo never leaves** | The architectural bet | Animated diagram; the image stays on the phone as a 2 KB packet travels |
| **The machine does not decide** | Governance | Full-bleed `ink` block, `signal` text — a hard tonal break |
| **The network** | Graph teaser | Live orbit preview → `/explore` |
| **Built for adoption** | DPDP, audit chain, KAVAL | Three cards, staggered reveal |
| **Download** | APK + honest caveats | `signal` block, unmissable |

### Motion

`motion` (Framer Motion v11) — scroll-linked, restrained:

```tsx
// One well-orchestrated load beats scattered micro-interactions.
<motion.h1
  initial={{ y: 40, opacity: 0 }}
  animate={{ y: 0, opacity: 1 }}
  transition={{ type: 'spring', damping: 14, stiffness: 200 }}
/>
// Cards stamp in after the headline, 80ms apart, overshooting.
```

Same grammar as the apps: **mechanical, not organic.** Spring overshoot, hard stops, no long
ease-out tails. Everything behind `prefers-reduced-motion`.

---

## 5. `/explore` — the graph demo

The interactive moment. A judge who *plays* with the graph remembers the project.

- `react-force-graph-2d` over WebGL — desktop has the power a phone does not (see
  [07 §8](07-DESIGN-SYSTEM.md#8--the-orbit-graph) for why mobile uses a radial layout instead)
- Data from `GET /v1/public/graph/demo` — a **curated, hardcoded** synthetic community, not a live
  traversal. The public site must not expose an arbitrary-query surface even over fake data.
- Nodes coloured by `community_id`, sized by degree, `ink`-bordered
- Click a node → side panel with masked name, case count, edges
- Click an edge → the FIRs justifying it — reinforcing that every link is evidenced
- Filter by `edge_type`; a depth slider capped at 3

Persistent `SYNTHETIC DATA` watermark, same as the apps.

---

## 6. `/download`

```
┌──────────────────────────────────────────────────────┐
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓   │
│  ┃  PERIGEE FIELD          v0.4.1 · 28.4 MB      ┃   │  signal yellow
│  ┃  ↓ DOWNLOAD APK                               ┃   │
│  ┃  SHA-256 a3f9…c21b                            ┃   │  Martian Mono
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛   │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓   │
│  ┃  PERIGEE ENROLL         v0.4.1 · 27.9 MB      ┃   │  cyan
│  ┃  ↓ DOWNLOAD APK                               ┃   │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛   │
│                                                       │
│  ⚠ ANDROID ONLY. iOS distribution requires a paid    │
│    Apple Developer account. See the docs.            │
│  ⚠ First launch downloads a 183 MB recognition model.│
│  ⚠ Requires Android 8.0+ and 4 GB RAM.               │
│  ⚠ SYNTHETIC DATA ONLY. Not an operational system.   │
└──────────────────────────────────────────────────────┘
```

Version and size come from the GitHub Releases API at build time via ISR:

```ts
export const revalidate = 300;

async function latestRelease() {
  const res = await fetch('https://api.github.com/repos/<org>/perigee-mobile/releases/latest',
    { next: { revalidate: 300 } });
  return res.json();   // tag_name, assets[].browser_download_url, assets[].size
}
```

**The four caveats are on the page, not in a footnote.** Judges have seen a hundred demos that
overstate readiness; a project that volunteers its own limits reads as more competent, not less.

---

## 7. `/docs` — rendered from this repository

The `docs/` markdown is rendered at build time so the site and the repo cannot disagree.

```ts
// Read from the local checkout at build; no runtime fetch, no drift.
import { readFile } from 'node:fs/promises';
export async function generateStaticParams() { /* enumerate docs/*.md */ }
```

Mermaid diagrams render client-side. Code blocks get Shiki with a custom Perigee theme derived from
the token palette. Prose is styled with `@tailwindcss/typography`, overridden to the design system —
`Public Sans` body, `Martian Mono` code, `ink` borders on tables and blockquotes, and no rounded
corners anywhere.

---

## 8. Performance and SEO

| Target | Approach |
| --- | --- |
| LCP < 1.5 s | Static hero, fonts self-hosted and preloaded, no render-blocking JS |
| CLS < 0.05 | Explicit dimensions on every image and card |
| Fonts | `next/font/local` with `display: swap`, subset to Latin + Devanagari |
| Images | `next/image`, AVIF, sized per breakpoint |
| Graph bundle | `react-force-graph` dynamically imported, `/explore` only (~180 KB) |
| Lighthouse | ≥ 95 across all four categories |

Metadata: OG image generated with `next/og` from the design tokens — an `ink`-bordered card with the
`signal` wordmark, rendered at request time so it always matches the current palette. Shared links
look designed rather than defaulted.

---

## 9. Security posture

The website has no authentication and no privileged data, but it is the public attack surface:

| Control | Implementation |
| --- | --- |
| CSP | Strict; `script-src 'self'`; no inline scripts except the nonce'd Next.js bootstrap |
| API exposure | Allowlisted proxy only; Render origin never in client code |
| Rate limiting | Vercel edge middleware, 30 req/min per IP on `/api/proxy/*` |
| Secrets | `PERIGEE_API_URL` server-only; no `NEXT_PUBLIC_` key that reaches an origin |
| Headers | HSTS, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin` |
| Dependencies | Dependabot; `npm audit` in CI |

`PERIGEE_DEVICE_KEY` **never** appears in the web app. Public endpoints require no device key, and
shipping one to a browser would hand every visitor a credential for the search API.

---

**Next:** [08 — Security & Governance](08-SECURITY.md)
