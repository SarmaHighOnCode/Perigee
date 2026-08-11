export const bands = ['NO_MATCH', 'WEAK', 'REVIEW', 'STRONG'] as const;
export type Band = (typeof bands)[number];

export const decisions = ['CONFIRMED', 'NO_MATCH', 'INCONCLUSIVE', 'ABORTED'] as const;
export type Decision = (typeof decisions)[number];

export const reasonCodes = [
  'routine_check',
  'suspicious_conduct',
  'warrant_service',
  'missing_person',
  'post_incident',
  'training',
  'browse',
] as const;
export type ReasonCode = (typeof reasonCodes)[number];

export type DatasetMode = 'synthetic' | 'production' | string;

export interface Quality {
  score: number;
  det_score?: number | null;
  blur?: number | null;
  yaw?: number | null;
  pitch?: number | null;
  face_px?: number | null;
}

export interface SearchRequest {
  embedding: number[];
  model_id: string;
  quality: Quality;
  reason_code: ReasonCode;
  top_k?: number;
  geo?: { lat: number; lon: number };
}

export interface RecordSummary {
  case_count: number;
  convictions: number;
  latest: string | null;
}

export interface Candidate {
  rank: number;
  person_id: string;
  masked_name: string;
  age_band: string | null;
  district: string | null;
  similarity: number;
  band: Band;
  mugshot_url: string | null;
  record_summary: RecordSummary;
}

export interface SearchResponse {
  search_id: string;
  status: 'PENDING_DECISION';
  expires_at: string;
  candidates: Candidate[];
  score_gap: number | null;
  ambiguous: boolean;
  threshold_in_effect: number;
  bands: Record<string, number>;
  advisory: string;
  dataset_mode: DatasetMode;
  model_id: string;
  server_time: string;
}

export interface DecisionRequest {
  decision: Decision;
  confirmed_rank?: number | null;
  note?: string | null;
  quality_override?: boolean;
  latency_ms?: number | null;
}

export interface DecisionDetail {
  decision: Decision;
  confirmed_person_id: string | null;
  confirmed_rank: number | null;
  officer_id: string;
  note: string | null;
  quality_override: boolean;
  decided_at: string;
  latency_ms: number | null;
}

export interface SearchDetail {
  search_id: string;
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
  created_at: string;
  candidates: Candidate[];
  decision: DecisionDetail | null;
  dataset_mode: DatasetMode;
  server_time: string;
}

export interface PendingSearch {
  search_id: string;
  officer_id: string;
  reason_code: string;
  candidate_count: number;
  top_score: number | null;
  created_at: string;
  expires_at: string;
  age_seconds: number;
}

export interface PendingResponse {
  pending: PendingSearch[];
  limit: number;
  dataset_mode: DatasetMode;
  server_time: string;
}

export interface PersonCreate {
  full_name: string;
  aliases?: string[];
  dob?: string | null;
  gender?: 'M' | 'F' | 'O' | 'U' | null;
  address_line?: string | null;
  phone?: string | null;
  age_band?: '18-25' | '26-35' | '36-45' | '46-60' | '60+' | 'UNKNOWN' | null;
  district?: string | null;
  masked_name?: string | null;
}

export interface PersonCreated {
  person_id: string;
  masked_name: string;
  dataset_mode: DatasetMode;
  server_time: string;
}

export interface EmbeddingCreate {
  embedding: number[];
  model_id: string;
  quality_score: number;
  det_score?: number | null;
  yaw?: number | null;
  pitch?: number | null;
  media_id?: string | null;
}

export interface EmbeddingCreated {
  embedding_id: string;
  person_id: string;
  model_id: string;
  dataset_mode: DatasetMode;
  server_time: string;
}

export interface MediaCreate {
  capture_angle: 'frontal' | 'left' | 'right' | 'up' | 'down';
  content_type: 'image/jpeg' | 'image/png';
  is_primary: boolean;
}

export interface MediaRef {
  media_id: string;
  url: string | null;
  angle: string;
  is_primary: boolean;
}

export interface CaseRef {
  case_id: string;
  fir_number: string;
  station: string;
  district: string;
  role: 'accused' | 'convicted' | 'suspect' | 'victim' | 'witness' | 'complainant';
  offence: {
    ipc_section: string | null;
    bns_section: string | null;
    title: string;
    category: string;
    severity: string;
  } | null;
  registered_on: string;
  status: string;
}

export interface PersonDetail {
  person_id: string;
  full_name: string;
  aliases: string[];
  dob: string | null;
  gender: string | null;
  district: string | null;
  status: string;
  media: MediaRef[];
  cases: CaseRef[];
  graph_summary: {
    degree: number;
    community_id: number | null;
    immediate_associates: number;
  };
  dataset_mode: DatasetMode;
  server_time: string;
}

export interface GraphResponse {
  root_person_id: string;
  nodes: unknown[];
  edges: unknown[];
  truncated: boolean;
  dataset_mode: DatasetMode;
  server_time: string;
}

export interface MediaPresigned {
  media_id: string;
  upload_url: string;
  method: string;
  expires_in: number;
  max_bytes: number;
  required_headers: Record<string, string>;
  dataset_mode: DatasetMode;
  server_time: string;
}

export interface MediaCommit {
  sha256: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
  exif_stripped: boolean;
}

export interface MediaCommitted {
  media_id: string;
  person_id: string;
  committed: boolean;
  bytes: number;
  dataset_mode: DatasetMode;
  server_time: string;
}

export interface RuntimeConfig {
  dataset_mode: DatasetMode;
  allowed_model_ids: string[];
  bands: Record<string, number>;
  quality_floor: number;
  ambiguity_gap: number;
  top_k_default: number;
  top_k_min: number;
  top_k_max: number;
  pending_decision_limit: number;
  search_expiry_minutes: number;
  reason_codes: string[];
  advisory: string;
  server_time: string;
}

export interface ReadyResponse {
  status: string;
  database: string;
  migration_version: string | null;
  storage: string;
  dataset_mode: DatasetMode;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    detail?: unknown;
    request_id?: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function isCandidate(value: unknown): value is Candidate {
  if (!isRecord(value)) return false;
  const summary = value.record_summary;
  return (
    typeof value.rank === 'number' &&
    typeof value.person_id === 'string' &&
    typeof value.masked_name === 'string' &&
    isNullableString(value.age_band) &&
    isNullableString(value.district) &&
    typeof value.similarity === 'number' &&
    bands.includes(value.band as Band) &&
    isNullableString(value.mugshot_url) &&
    isRecord(summary) &&
    typeof summary.case_count === 'number' &&
    typeof summary.convictions === 'number' &&
    isNullableString(summary.latest)
  );
}

export function isSearchResponse(value: unknown): value is SearchResponse {
  if (!isRecord(value) || 'is_match' in value || 'matched' in value) return false;
  return (
    typeof value.search_id === 'string' &&
    value.status === 'PENDING_DECISION' &&
    typeof value.expires_at === 'string' &&
    Array.isArray(value.candidates) &&
    value.candidates.every(isCandidate) &&
    (typeof value.score_gap === 'number' || value.score_gap === null) &&
    typeof value.ambiguous === 'boolean' &&
    typeof value.threshold_in_effect === 'number' &&
    isRecord(value.bands) &&
    Object.values(value.bands).every((band) => typeof band === 'number') &&
    typeof value.advisory === 'string' &&
    typeof value.dataset_mode === 'string' &&
    typeof value.model_id === 'string' &&
    typeof value.server_time === 'string'
  );
}
