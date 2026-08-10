# ADR-0002 — One Postgres for relational, vector and graph data

**Status:** Accepted · **Date:** 2026-08-10

---

## Context

Perigee stores four kinds of data with genuinely different access patterns:

| Data | Pattern |
| --- | --- |
| Persons, cases, media | Classic relational |
| Face embeddings | 512-d approximate nearest neighbour |
| Criminal network | Bounded graph traversal, 1–3 hops |
| Audit chain | Append-only, strictly sequential |

The obvious specialist stack is Postgres + Pinecone/Qdrant + Neo4j. Three systems, three failure
modes, three backup stories, and synchronisation between them.

## Decision

**One Postgres 17 instance on Neon**, with `pgvector` for embeddings and native recursive CTEs over
an `edge` table for the graph. No separate vector database. No separate graph database.

Specifically:

- **Vectors** — `vector(512)` as the source of truth; the HNSW index built on
  `(embedding::halfvec(512)) halfvec_cosine_ops`, partial per `model_id`.
- **Graph** — an `edge` table with canonical ordering (`CHECK src < dst`), plus `node_metric`
  populated offline by networkx.
- **Audit** — a hash-chained append-only table with `BEFORE UPDATE/DELETE` triggers.

## Consequences

### Good

- **One transaction boundary.** Enrolling a person writes identity, media rows and embeddings
  atomically. With a separate vector store this is a distributed transaction, and the failure mode —
  a person who exists but is unsearchable — is silent and hard to notice.
- **One connection, one pool, one backup, one restore.**
- **Vector search can filter on relational predicates** in the same query: jurisdiction, status,
  `model_id`. Cross-system filtering means fetching a wide candidate set and filtering in
  application code, which is slower and easy to get subtly wrong.
- **Fits the free tier.** Neon free covers all four workloads. Qdrant Cloud plus Neo4j Aura plus
  Postgres does not.
- **Portable.** The self-hosted deployment ([12 §7](../12-SCALING-ROADMAP.md#7--self-hosted-deployment))
  is one Postgres, which a department's DBAs already know how to run. Introducing Neo4j into a
  government procurement is a conversation with a cost.
- **Schema-compatible with KAVAL**, which is already Postgres + pgvector.

### Bad

- **Graph traversal degrades past depth 3.** Recursive CTEs produce nested loops over an
  exponentially growing working set; at depth 5 on a few-million-row table this is seconds or a
  memory exhaustion. Handled by a hard API cap at depth 3 — which is also an *analytical* limit,
  since three hops in a dense network reaches nearly everyone.
- **No graph algorithms in the database.** Betweenness and Louvain run offline in networkx and are
  materialised into `node_metric`. Acceptable: these are nightly-batch concerns, not request-path
  ones.
- **HNSW index memory becomes the binding constraint** around 10⁶ vectors. Mitigation ladder in
  [12 §3–4](../12-SCALING-ROADMAP.md).
- **pgvector on shared free-tier Postgres competes with other queries for CPU.** Irrelevant at
  prototype scale; real at 10⁵.

### Neutral

- `halfvec` indexing was adopted from the start. Retrofitting quantization onto a large table is
  painful; starting with it is free.

## Alternatives considered

**Postgres + a dedicated vector DB (Qdrant, Milvus, Pinecone).** Better ANN performance and richer
filtering at scale. Rejected for now: two datastores means a synchronisation job that will
eventually drift, and drift here means a person enrolled but unsearchable. The migration trigger is
specified and measurable — p95 above 300 ms after Path A tuning, or recall below 0.95 — rather than
a feeling that it is time.

**Postgres + Neo4j.** Genuinely better at deep traversal and graph algorithms. Rejected: Neo4j Aura
Free caps at 100k nodes / 1M relationships with no SLA, it is a second system to operate, and
Perigee's traversal is bounded at 3 hops by design. Buying deep-traversal performance we have
deliberately forbidden ourselves from using is a poor trade.

**Apache AGE (openCypher inside Postgres).** Attractive — one database, real Cypher. Rejected:
**Neon does not support custom extensions**, so adopting AGE means abandoning the free managed tier
and self-hosting on day one. Reconsider at self-hosting time, when the constraint disappears.

**SQLite + `sqlite-vec` on-device.** Interesting for a fully-offline variant, and genuinely worth
revisiting for rural deployment. Rejected here: the database is shared across officers, and
replicating a criminal-records database onto every handset is a far worse security posture than
querying a server.

## Revisit when

- Enrolled faces exceed 10⁶, **or**
- Graph traversal beyond 3 hops becomes a genuine product requirement, **or**
- The deployment self-hosts, at which point Apache AGE becomes available for free.
