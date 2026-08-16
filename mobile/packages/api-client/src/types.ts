/**
 * Wire types for perigee-core.
 *
 * Hand-written mirrors of the Pydantic models in `backend/app/models/`. Those
 * models are the source of truth; where docs/03-API-SPEC.md and the backend
 * disagree, the backend wins and the divergence is recorded in the block at the
 * end of this file.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THERE IS NO `is_match`, `matched`, OR `identity_confirmed` FIELD.
 * The API returns ranked candidates with similarity scores. Asserting an
 * identification is not a question the machine is permitted to answer, and
 * `backend/tests/test_search_contract.py` enforces the absence against the live
 * OpenAPI schema. Do not add one here either.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Field names are snake_case because that is what goes over the wire. No
 * camelCase mapping layer: one shape, no chance of a rename losing a field.
 *
 * Note that responses do NOT share a single envelope. Most carry
 * `dataset_mode` + `server_time`; only some also carry `model_id`, and
 * `/healthz` and `/readyz` carry neither timestamp. Each interface therefore
 * spells out exactly what its endpoint returns.
 */

/** A UUID rendered as a string. */
export type Uuid = string;
/** ISO-8601 timestamp, e.g. `2026-08-10T14:22:31.482Z`. */
export type IsoDateTime = string;
/** ISO-8601 calendar date, e.g. `1994-03-12`. */
export type IsoDate = string;

export type Band = 'NO_MATCH' | 'WEAK' | 'REVIEW' | 'STRONG';

export type Decision = 'CONFIRMED' | 'NO_MATCH' | 'INCONCLUSIVE' | 'ABORTED';

export type ReasonCode =
  | 'routine_check'
  | 'suspicious_conduct'
  | 'warrant_service'
  | 'missing_person'
  | 'post_incident'
  | 'training'
  /** Reaches PII without a CONFIRMED decision. Permitted, and logged under a
   *  distinct audit action so it stands out in review. */
  | 'browse';

export const reasonCodes: readonly ReasonCode[] = [
  'routine_check', 'suspicious_conduct', 'warrant_service', 'missing_person',
  'post_incident', 'training', 'browse',
];

export type Gender = 'M' | 'F' | 'O' | 'U';

export type AgeBand = '18-25' | '26-35' | '36-45' | '46-60' | '60+' | 'UNKNOWN';

export type CaptureAngle = 'frontal' | 'left' | 'right' | 'up' | 'down';

export type PersonRole =
  | 'accused'
  | 'convicted'
  | 'suspect'
  | 'victim'
  | 'witness'
  | 'complainant';

export type EdgeType =
  | 'co_accused'
  | 'shared_address'
  | 'shared_phone'
  | 'same_mo'
  | 'family'
  | 'known_associate';

// ── Errors ──────────────────────────────────────────────────────────────────

export interface ErrorDetail {
  /** Stable and machine-readable. Clients switch on this, never on `message`. */
  code: string;
  message: string;
  detail: Record<string, unknown>;
  request_id: string;
}

export interface ErrorResponse {
  error: ErrorDetail;
}

// ── Health and config ───────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  dataset_mode: string;
}

export interface ReadyResponse {
  status: string;
  database: string;
  migration_version: string | null;
  storage: string;
  dataset_mode: string;
}

/**
 * Runtime config fetched at launch.
 *
 * `bands`, `quality_floor` and `ambiguity_gap` come from here and are never
 * hardcoded in a client — docs/04 §9. Note there is no `model_id` field: the
 * allowlist is `allowed_model_ids`.
 */
export interface ConfigResponse {
  dataset_mode: string;
  allowed_model_ids: string[];
  quality_floor: number;
  bands: Record<string, number>;
  ambiguity_gap: number;
  top_k_default: number;
  top_k_min: number;
  top_k_max: number;
  pending_decision_limit: number;
  search_expiry_minutes: number;
  reason_codes: string[];
  advisory: string;
  server_time: IsoDateTime;
}

// ── Search ──────────────────────────────────────────────────────────────────

/** On-device quality report. Computed where the camera is, before the network. */
export interface Quality {
  /** 0–1 composite. */
  score: number;
  /** Detector confidence, 0–1. */
  det_score?: number | null;
  /** Variance of Laplacian. */
  blur?: number | null;
  /** Degrees. */
  yaw?: number | null;
  /** Degrees. */
  pitch?: number | null;
  /** Aligned crop source size in pixels. */
  face_px?: number | null;
}

export interface Geo {
  lat: number;
  lon: number;
}

export interface SearchRequest {
  /** Exactly 512 finite floats with 0.99 ≤ ‖v‖₂ ≤ 1.01, else 422. */
  embedding: number[];
  model_id: string;
  quality: Quality;
  reason_code: ReasonCode;
  /**
   * Server accepts 1–10 and clamps up to `top_k_min` (3). docs/03 says "3–10";
   * the Pydantic bound is `ge=1`, so 1 and 2 are accepted and clamped rather
   * than rejected.
   */
  top_k?: number;
  geo?: Geo;
}

export interface RecordSummary {
  case_count: number;
  convictions: number;
  latest: string | null;
}

export interface Candidate {
  rank: number;
  person_id: Uuid;
  /** Masked, never the full name. Four of five candidates are innocent. */
  masked_name: string;
  age_band: string | null;
  district: string | null;
  similarity: number;
  band: Band;
  mugshot_url: string | null;
  record_summary: RecordSummary;
}

export interface SearchResponse {
  search_id: Uuid;
  status: 'PENDING_DECISION';
  expires_at: IsoDateTime;
  /** Zero on a genuine no-match, otherwise at least three. docs/CONTRACT-NOTES #1. */
  candidates: Candidate[];
  /** rank-1 minus rank-2; null with fewer than two candidates. */
  score_gap: number | null;
  ambiguous: boolean;
  threshold_in_effect: number;
  /** Keys: `no_match`, `weak`, `review`. Render these, never a hardcoded constant. */
  bands: Record<string, number>;
  /** Rendered verbatim, non-dismissible, in the results header. */
  advisory: string;

  dataset_mode: string;
  model_id: string;
  server_time: IsoDateTime;
}

export interface DecisionRequest {
  decision: Decision;
  /** Required iff `decision` is `CONFIRMED`; rejected otherwise. */
  confirmed_rank?: number;
  note?: string;
  quality_override?: boolean;
  /** Time from render to tap. A sub-second confirmation is not careful review. */
  latency_ms?: number;
}

export interface DecisionDetail {
  decision: string;
  confirmed_person_id: Uuid | null;
  confirmed_rank: number | null;
  officer_id: string;
  note: string | null;
  quality_override: boolean;
  decided_at: IsoDateTime;
  latency_ms: number | null;
}

export interface SearchDetail {
  search_id: Uuid;
  status: string;
  officer_id: string;
  reason_code: string;
  model_id: string;
  probe_quality: number;
  threshold_in_effect: number;
  bands: Record<string, number>;
  top_score: number | null;
  score_gap: number | null;
  candidate_count: number;
  created_at: IsoDateTime;
  candidates: Candidate[];
  decision: DecisionDetail | null;

  dataset_mode: string;
  server_time: IsoDateTime;
}

export interface PendingSearch {
  search_id: Uuid;
  officer_id: string;
  reason_code: string;
  candidate_count: number;
  top_score: number | null;
  created_at: IsoDateTime;
  expires_at: IsoDateTime;
  age_seconds: number;
}

export interface PendingResponse {
  pending: PendingSearch[];
  limit: number;
  dataset_mode: string;
  server_time: IsoDateTime;
}

// ── Person and enrolment ────────────────────────────────────────────────────

export interface PersonCreate {
  full_name: string;
  aliases?: string[];
  dob?: IsoDate | null;
  gender?: Gender | null;
  address_line?: string | null;
  phone?: string | null;
  age_band?: AgeBand | null;
  district?: string | null;
  /** Derived from `full_name` when omitted. */
  masked_name?: string;
}

export interface PersonCreated {
  person_id: Uuid;
  masked_name: string;
  dataset_mode: string;
  server_time: IsoDateTime;
}

export interface EmbeddingCreate {
  embedding: number[];
  model_id: string;
  /** Enrolment floor is 0.60, stricter than search's 0.35, with no override. */
  quality_score: number;
  det_score?: number;
  yaw?: number;
  pitch?: number;
  media_id?: Uuid;
}

export interface EmbeddingCreated {
  embedding_id: Uuid;
  person_id: Uuid;
  model_id: string;
  dataset_mode: string;
  server_time: IsoDateTime;
}

export interface MediaCreate {
  capture_angle?: CaptureAngle;
  content_type?: 'image/jpeg' | 'image/png';
  is_primary?: boolean;
}

export interface MediaPresigned {
  media_id: Uuid;
  upload_url: string;
  method: string;
  expires_in: number;
  max_bytes: number;
  required_headers: Record<string, string>;
  dataset_mode: string;
  server_time: IsoDateTime;
}

export interface MediaCommit {
  /** 64 hex characters. */
  sha256: string;
  /** Accepted but not trusted: the server HEADs the object and stores the true size. */
  bytes: number;
  width?: number | null;
  height?: number | null;
  exif_stripped?: boolean;
}

export interface MediaCommitted {
  media_id: Uuid;
  person_id: Uuid;
  committed: boolean;
  /** The measured size, which may differ from what was posted. */
  bytes: number;
  dataset_mode: string;
  server_time: IsoDateTime;
}

export interface MediaRef {
  media_id: Uuid;
  url: string | null;
  angle: string;
  is_primary: boolean;
}

export interface OffenceRef {
  ipc_section: string | null;
  bns_section: string | null;
  title: string;
  category: string;
  severity: string;
}

export interface CaseRef {
  case_id: Uuid;
  fir_number: string;
  station: string;
  district: string;
  /** Surfaced per case and never aggregated: one conviction plus two withdrawn
   *  accusations is not "3 cases". */
  role: PersonRole;
  offence: OffenceRef | null;
  registered_on: IsoDate;
  status: string;
}

export interface CaseSummary {
  case_id: Uuid;
  fir_number: string;
  station: string;
  district: string;
  registered_on: IsoDate;
  status: string;
}

export interface CaseListResponse {
  cases: CaseSummary[];
  count: number;
  truncated: boolean;
  dataset_mode: string;
  server_time: IsoDateTime;
}

export interface CaseLinkCreate {
  case_id: Uuid;
  role: PersonRole;
}

export interface CaseLinkCreated {
  person_id: Uuid;
  case_id: Uuid;
  role: PersonRole;
  already_linked: boolean;
  dataset_mode: string;
  server_time: IsoDateTime;
}

export interface RelationshipCreate {
  target_person_id: Uuid;
  edge_type: EdgeType;
  evidence_case_ids: Uuid[];
  weight?: number;
}

export interface RelationshipCreated {
  edge_id: Uuid;
  src_person_id: Uuid;
  dst_person_id: Uuid;
  edge_type: EdgeType;
  weight: number;
  evidence_case_ids: Uuid[];
  already_existed: boolean;
  dataset_mode: string;
  server_time: IsoDateTime;
}

export interface GraphSummary {
  degree: number;
  community_id: number | null;
  immediate_associates: number;
}

/** Full PII. Reachable only via a CONFIRMED decision, or a `browse` search. */
export interface PersonDetail {
  person_id: Uuid;
  full_name: string;
  aliases: string[];
  dob: IsoDate | null;
  gender: string | null;
  district: string | null;
  status: string;
  media: MediaRef[];
  cases: CaseRef[];
  graph_summary: GraphSummary;

  dataset_mode: string;
  server_time: IsoDateTime;
}

// ── Graph ───────────────────────────────────────────────────────────────────

export interface GraphNode {
  person_id: Uuid;
  masked_name: string;
  age_band: string | null;
  district: string | null;
  hop: number;
  degree: number;
  betweenness: number;
  community_id: number | null;
  case_count: number;
}

export interface GraphEdge {
  src: Uuid;
  dst: Uuid;
  edge_type: string;
  weight: number;
  /** An edge without a citable case file is an unfalsifiable accusation. */
  evidence_case_ids: Uuid[];
  evidence_count: number;
  /** `same_mo` is inferential and must be rendered distinctly. */
  inferred: boolean;
}

export interface Community {
  community_id: number;
  size: number;
  label: string;
}

export interface GraphResponse {
  root: Uuid;
  depth: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Render honestly: "showing 60 of 143 — narrow the filter." */
  truncated: boolean;
  communities: Community[];

  dataset_mode: string;
  server_time: IsoDateTime;
}

/** Query parameters for `GET /v1/graph/{person_id}`. Over-cap values are
 *  rejected 400, not clamped: a client asking for depth 5 has a wrong mental
 *  model and should be told. */
export interface GraphOptions {
  /** 1–3, default 2. */
  depth?: number;
  /** 0–1, default 0. */
  min_weight?: number;
  edge_types?: readonly EdgeType[];
  /** 1–200, default 60. */
  limit?: number;
  /** @deprecated Use `limit`; retained for the camera proof app. */
  maxNodes?: number;
}

/** Compatibility names used by the redesigned Expo apps. */
export type RuntimeConfig = ConfigResponse;
export interface ApiErrorEnvelope extends ErrorResponse {}

/** Runtime safety boundary: the server must never assert an identification. */
export function isSearchResponse(value: unknown): value is SearchResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if ('is_match' in record || 'matched' in record || 'identity_confirmed' in record) return false;
  if (typeof record['search_id'] !== 'string' || record['status'] !== 'PENDING_DECISION') return false;
  if (!Array.isArray(record['candidates'])) return false;
  return record['candidates'].every((candidate) => {
    if (typeof candidate !== 'object' || candidate === null) return false;
    const row = candidate as Record<string, unknown>;
    return typeof row['person_id'] === 'string' && typeof row['band'] === 'string';
  });
}

// ── Audit ───────────────────────────────────────────────────────────────────

export interface AuditVerifyResponse {
  verified: boolean;
  from_seq: number | null;
  to_seq: number | null;
  checked: number;
  first_bad_seq: number | null;
  head_hash: string | null;
  duration_ms: number;
  dataset_mode: string;
  server_time: IsoDateTime;
}

export interface AuditVerifyOptions {
  from_seq?: number;
  to_seq?: number;
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE THESE TYPES DIFFER FROM docs/03-API-SPEC.md
 *
 * The spec's JSON samples are abbreviated in places. These types follow
 * `backend/app/models/`, which is what actually serialises.
 *
 *  1. `GraphNode` also carries `age_band`, `district` and `betweenness`.
 *  2. `GraphEdge` also carries `inferred` — true for `same_mo`, which is an
 *     inference and must be rendered distinctly.
 *  3. `MediaRef` also carries `is_primary`; `OffenceRef` also carries
 *     `category`; `CaseRef` also carries `district`.
 *  4. `MediaPresigned` also carries `expires_in`, `max_bytes` and
 *     `required_headers` — the client needs all three to perform the PUT.
 *  5. `AuditVerifyResponse.from_seq` / `.to_seq` are nullable.
 *  6. `DecisionRequest.quality_override` exists; the spec's decision sample
 *     omits it.
 *  7. `top_k` is validated `1..10`, not `3..10`. Values below 3 are clamped
 *     server-side rather than rejected.
 *  8. Spec §1 says every 2xx carries `dataset_mode`, `model_id` and
 *     `server_time`. Only `SearchResponse` and `EmbeddingCreated` carry
 *     `model_id`; `/healthz` and `/readyz` carry neither `model_id` nor
 *     `server_time`.
 *  9. `INTERNAL_ERROR` (500) and `STORAGE_UNAVAILABLE` (503) are absent from
 *     the spec's error table but reachable. See `errors.ts`.
 * 10. `SERVER_EMBED_DISABLED` (spec §9) has no route behind it — `/v1/embed`
 *     is not registered at all — so it is not in the error union.
 * 11. Graph `depth` and `limit` over their caps are rejected 400
 *     `MALFORMED_REQUEST`, not clamped.
 * ─────────────────────────────────────────────────────────────────────────────
 */
