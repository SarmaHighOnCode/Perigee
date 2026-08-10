# 11 — Graph Intelligence

Confirming *who* someone is answers one question. The more useful one is *who they operate with* —
finding the helpers, the fences, the drivers, the people whose names never appear on an FIR but
whose phone number appears on three.

Schema and semantics are deliberately identical to KAVAL's `grf_edges` / `grf_node_metrics`, so a
person enrolled through Perigee in the field is queryable in KAVAL's analysis interface the same
evening. See [01 §9](01-ARCHITECTURE.md#9--relationship-to-kaval).

---

## 1. Edge semantics

An edge asserts that two people are connected. Because that assertion can end up in an investigation,
**every edge must cite the case files that produced it.** `evidence_case_ids` is `NOT NULL`, and the
Enroll app disables the save button until at least one is supplied.

| `edge_type` | Derivation | Base weight | Strength |
| --- | --- | --- | --- |
| `co_accused` | Both named in the same FIR | 0.60 | **Strong** — documented |
| `shared_phone` | Same phone number on record | 0.55 | Strong |
| `shared_address` | Same address on record | 0.45 | Moderate — families, tenants |
| `family` | Manually recorded relation | 0.50 | Moderate |
| `known_associate` | Officer-recorded observation | 0.35 | **Weak** — subjective |
| `same_mo` | Modus-operandi similarity | 0.25 | **Weakest** — inferential |

### Weight

```
weight = clamp(base + 0.15·log₂(1 + shared_case_count) − 0.10·years_since_last_seen, 0, 1)
```

Co-occurrence in five cases is far stronger evidence than in one, but not five times stronger — hence
the logarithm. Recency decay matters because a connection from 2009 says little about today.

### `same_mo` is generated but never surfaced alone

Modus-operandi similarity is an inference, not an observation. It is computed and stored, and the UI
never renders a `same_mo` edge as the sole link between two people — it appears only as a
*corroborating* edge alongside a documented one.

The reason is specific: MO clustering is exactly the mechanism by which a network graph turns into
guilt by association. Two burglars who both enter through kitchen windows are not associates. Left
unconstrained, this edge type would generate thousands of confident-looking, evidentially worthless
links, and those links would look identical to real ones.

---

## 2. Building the graph

Offline, in `scripts/compute_edges.py`. Never in a request path.

```python
# 1. co_accused — the spine
#    every pair of persons sharing a case, both in accused-like roles
INSERT INTO edge (src_person_id, dst_person_id, edge_type, weight, evidence_case_ids, …)
SELECT LEAST(a.person_id, b.person_id),      -- canonical ordering: CHECK (src < dst)
       GREATEST(a.person_id, b.person_id),
       'co_accused',
       LEAST(1.0, 0.60 + 0.15 * log(2, 1 + count(*))),
       array_agg(DISTINCT a.case_id),
       min(c.registered_on), max(c.registered_on)
FROM   person_case a
JOIN   person_case b ON a.case_id = b.case_id AND a.person_id < b.person_id
JOIN   case_record c ON c.case_id = a.case_id
WHERE  a.role IN ('accused','convicted','suspect')
  AND  b.role IN ('accused','convicted','suspect')
GROUP  BY 1, 2
ON CONFLICT (src_person_id, dst_person_id, edge_type) DO UPDATE
    SET weight = EXCLUDED.weight,
        evidence_case_ids = EXCLUDED.evidence_case_ids,
        computed_at = now();
```

`LEAST`/`GREATEST` enforce the `CHECK (src_person_id < dst_person_id)` constraint from
[02 §5](02-DATA-MODEL.md#5--graph), so an undirected edge has exactly one row and `ON CONFLICT`
actually catches duplicates.

**`role` filtering matters here.** Victims and witnesses are excluded. A victim is not an associate
of the person who robbed them, and generating that edge would be both wrong and defamatory.

### Node metrics — networkx, offline

```python
G = nx.Graph()
G.add_weighted_edges_from(rows)

degree      = dict(G.degree())
betweenness = nx.betweenness_centrality(G, weight='weight', k=min(200, len(G)))  # k = sampled
community   = nx.community.louvain_communities(G, weight='weight', seed=42)
```

- **Degree** — raw connectivity.
- **Betweenness** — who sits on paths between others. The broker, the fixer, the fence. Usually the
  operationally interesting person, and rarely the one with the longest record.
- **Louvain community** — clusters that look like operating groups. `seed=42` fixes the partition, so
  colours do not change between runs; a graph that recolours itself on refresh is unusable for
  anything a person needs to remember.

Betweenness is O(V·E). Sampled with `k=200` it is seconds at hackathon scale and minutes at 10⁵
nodes. It runs nightly, never in a request.

---

## 3. Traversal

Bounded breadth-first, as a recursive CTE.

```sql
WITH RECURSIVE frontier AS (
    -- seed
    SELECT $1::uuid AS person_id, 0 AS hop, ARRAY[$1::uuid] AS path

    UNION ALL

    SELECT nb.neighbour, f.hop + 1, f.path || nb.neighbour
    FROM   frontier f
    CROSS  JOIN LATERAL (
        SELECT CASE WHEN e.src_person_id = f.person_id
                    THEN e.dst_person_id ELSE e.src_person_id END AS neighbour
        FROM   edge e
        WHERE  (e.src_person_id = f.person_id OR e.dst_person_id = f.person_id)
          AND  e.weight >= $3
          AND  e.edge_type = ANY($4::text[])
    ) nb
    WHERE  f.hop < $2                        -- depth bound, hard cap 3
      AND  NOT nb.neighbour = ANY(f.path)    -- cycle guard — without this it never terminates
)
SELECT DISTINCT ON (person_id) person_id, hop
FROM   frontier
ORDER  BY person_id, hop                     -- keeps the SHORTEST path to each node
LIMIT  $5;                                   -- node cap, default 60
```

Three details that are easy to get wrong and expensive to debug:

1. **The cycle guard is mandatory.** Criminal networks are densely cyclic. Without
   `NOT neighbour = ANY(path)` this query runs until the connection dies.
2. **`DISTINCT ON (person_id) … ORDER BY person_id, hop`** keeps the *minimum* hop per person. A
   node reachable at both 1 and 2 hops is a direct associate, and rendering it on the outer ring
   would be actively misleading.
3. **Both index directions are needed** — `idx_edge_src` and `idx_edge_dst` — because the `OR` in the
   lateral hits either column.

### Cost

| Depth | Nodes at hackathon scale | p50 | Verdict |
| --- | --- | --- | --- |
| 1 | ~8 | 4 ms | Trivial |
| 2 | ~40 | 18 ms | **Default** |
| 3 | ~180 | 95 ms | Capped, acceptable |
| 4 | ~900 | 800 ms+ | **Blocked at the API** |
| 5+ | exponential | seconds → timeout | Never |

The depth cap of 3 is a hard API constraint, not a default. Recursive CTEs degrade badly beyond it —
the planner produces nested loops over an exponentially growing working set. At depth 5 on a
few-million-row table this is a multi-second query or a memory exhaustion. If deeper traversal ever
becomes a product requirement, that is the signal to move to a real graph engine, not to raise the
cap — see [12 §4](12-SCALING-ROADMAP.md).

**Depth 3 is also an analytical limit, not just a technical one.** Three hops from almost anyone in a
dense network reaches almost everyone. A graph that shows everything shows nothing, and in this
domain it also implicates everyone.

---

## 4. Presentation

### Mobile — the orbit view

Concentric rings, one per hop. Detailed in [07 §8](07-DESIGN-SYSTEM.md#8--the-orbit-graph).

Radial rather than force-directed, for three reasons:

- **Deterministic.** Angle seeded from `person_id`, so the same network always draws identically.
  Force layouts settle differently every time, which makes them unusable for something an officer
  may open twice.
- **Hop distance is legible.** Ring number *is* degrees of separation. That is the question being
  asked, answered by the geometry rather than by reading labels.
- **Cheap.** No physics simulation on a phone; no battery drain, no jitter on low-end hardware.

Skia, ~60 nodes maximum, `withSpring` re-centring at ~400 ms when a node is tapped.

### Web — force-directed

`react-force-graph-2d` over WebGL on `/explore`. A desktop has the power, and an analyst genuinely
benefits from seeing cluster structure emerge — which is what force layouts are good at and radial
layouts are not. Two contexts, two correct answers.

---

## 5. Reading the graph responsibly

The failure mode of network analysis in policing is guilt by association: appearing in a graph is not
evidence of anything, and a well-drawn graph is extremely persuasive regardless of whether it should
be. Constraints built into the presentation:

| Rule | Implementation |
| --- | --- |
| Every edge is evidenced | `evidence_case_ids NOT NULL`; tapping an edge lists the FIRs |
| Weak edges look weak | Stroke width ∝ weight; `known_associate` and `same_mo` render dashed |
| `same_mo` never stands alone | Suppressed unless a documented edge also exists |
| Victims and witnesses excluded | `role` filter at edge construction |
| Masked names in the graph | Full identity still requires a `CONFIRMED` decision |
| Truncation is disclosed | `truncated: true` renders *"showing 60 of 143 — narrow the filter"* |
| No risk scores | **There is no "threat score" and there will not be one** |

That last row is a product decision worth defending. Centrality metrics are analytical descriptions
of a graph's shape, not statements about a person. The moment a system renders `RISK: 84` next to
someone's face, every downstream human treats it as a fact about them rather than a fact about the
data. `degree` and `betweenness` are shown as raw numbers with their definitions available — not
composed into a single number that invites being read as a verdict.

---

## 6. Where this goes

Not built. Ordered by value per unit of effort:

| Capability | Approach | Effort |
| --- | --- | --- |
| **Temporal graphs** | Filter edges by date range; watch a network form | Small — `first_seen`/`last_seen` exist |
| **Shortest path between two persons** | Bidirectional BFS, capped at 4 | Small |
| **Community drift** | Compare Louvain partitions across snapshots | Medium |
| **Link prediction** | Adamic-Adar on the co-accused graph — *strictly investigative leads* | Medium, **high governance risk** |
| **Geo-temporal** | Join `case_record` geometry; PostGIS, as KAVAL does | Medium |
| **Cross-jurisdiction** | Federated queries across district instances | Large |

**Link prediction is flagged deliberately.** Predicting "these two people probably know each other"
is technically straightforward and ethically loaded — it generates edges with no evidence, which
violates the one rule this entire chapter is built around. If it is ever built, predicted edges must
be a visually distinct class, never mixed with documented ones, and never permitted as grounds for
a stop.

---

**Next:** [12 — Scaling & Roadmap](12-SCALING-ROADMAP.md)
