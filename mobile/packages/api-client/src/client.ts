/**
 * The typed HTTP client for perigee-core.
 *
 * Zero runtime dependencies: global `fetch` and `AbortController` only. Nothing
 * here imports react-native, so the same client runs in Node, in a test, and on
 * a handset.
 */

import { PerigeeApiError, parseErrorEnvelope } from './errors';
import type {
  AuditVerifyOptions,
  AuditVerifyResponse,
  ConfigResponse,
  DecisionRequest,
  EmbeddingCreate,
  EmbeddingCreated,
  GraphOptions,
  GraphResponse,
  HealthResponse,
  MediaCommit,
  MediaCommitted,
  MediaCreate,
  MediaPresigned,
  PendingResponse,
  PersonCreate,
  PersonCreated,
  PersonDetail,
  ReadyResponse,
  SearchDetail,
  SearchRequest,
  SearchResponse,
  Uuid,
} from './types';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export const DEFAULT_TIMEOUT_MS = 15_000;

/** Idempotent GETs only. See `send()` for why nothing else is retried. */
const MAX_GET_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 300;

/**
 * 502/504 are the Render edge while the instance spins up; 503 is
 * `DATABASE_UNAVAILABLE`, which is Neon waking. All three are transient and
 * worth one more GET. 429 is not retried — retrying a rate limit is how you
 * stay rate limited.
 */
const RETRYABLE_STATUS = new Set([502, 503, 504]);

export const DEVICE_KEY_HEADER = 'X-Perigee-Device-Key';
export const OFFICER_ID_HEADER = 'X-Perigee-Officer-Id';
export const REQUEST_ID_HEADER = 'X-Request-Id';

export interface ClientOptions {
  /**
   * Origin only — `https://perigee-core.onrender.com`. Paths carry their own
   * prefix, because `/healthz` and `/readyz` sit outside `/v1`.
   */
  baseUrl: string;
  /** Provisioned at build time. Identifies a handset, not a person. */
  deviceKey: string;
  /** Asserted, never verified. Attribution, not authentication. */
  officerId: string;
  fetch?: FetchLike;
  /** Per-request timeout. Default 15 s. */
  timeoutMs?: number;
}

export interface PerigeeClient {
  health(): Promise<HealthResponse>;
  ready(): Promise<ReadyResponse>;
  config(): Promise<ConfigResponse>;

  search(req: SearchRequest): Promise<SearchResponse>;
  getSearch(searchId: Uuid): Promise<SearchDetail>;
  pending(): Promise<PendingResponse>;
  /** Write-once. A second call returns 409 `DECISION_ALREADY_RECORDED`. */
  decide(searchId: Uuid, req: DecisionRequest): Promise<void>;

  createPerson(body: PersonCreate): Promise<PersonCreated>;
  addEmbedding(personId: Uuid, body: EmbeddingCreate): Promise<EmbeddingCreated>;
  createMedia(personId: Uuid, body?: MediaCreate): Promise<MediaPresigned>;
  commitMedia(personId: Uuid, mediaId: Uuid, body: MediaCommit): Promise<MediaCommitted>;
  /** `searchId` is the purpose binding. Without it: 403. */
  getPerson(personId: Uuid, searchId: Uuid): Promise<PersonDetail>;

  graph(personId: Uuid, opts?: GraphOptions): Promise<GraphResponse>;
  auditVerify(opts?: AuditVerifyOptions): Promise<AuditVerifyResponse>;
}

type QueryValue = string | number | undefined;

interface RequestSpec {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** 204 endpoints have no body to parse. */
  expectNoContent?: boolean;
}

/**
 * An unbound `globalThis.fetch` throws "Illegal invocation" in browsers and in
 * React Native, so it has to be bound to its owner before being stored.
 */
function resolveFetch(custom: FetchLike | undefined): FetchLike {
  if (custom) return custom;
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('@perigee/api-client requires a global fetch, or an explicit `fetch` option');
  }
  return globalThis.fetch.bind(globalThis) as FetchLike;
}

/**
 * `crypto.randomUUID` is present in Node 20+ and modern browsers but not on
 * every React Native runtime, so there is a fallback. This value is echoed back
 * by the server and written into the audit log; it does not need to be
 * unguessable, only unique.
 */
function newRequestId(): string {
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') return cryptoRef.randomUUID();

  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else if (i === 19) out += ((Math.random() * 4) | 8).toString(16);
    else out += ((Math.random() * 16) | 0).toString(16);
  }
  return out;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(baseUrl: string, path: string, query: Record<string, QueryValue> | undefined) {
  const url = `${baseUrl}${path}`;
  if (!query) return url;

  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length === 0 ? url : `${url}?${parts.join('&')}`;
}

async function errorFromResponse(
  response: Response,
  requestId: string,
): Promise<PerigeeApiError> {
  const echoed = response.headers.get(REQUEST_ID_HEADER) ?? requestId;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new PerigeeApiError({
      code: 'INVALID_RESPONSE',
      message: `HTTP ${response.status} with an unreadable body`,
      requestId: echoed,
      httpStatus: response.status,
    });
  }

  return (
    parseErrorEnvelope(body, response.status, echoed) ??
    new PerigeeApiError({
      code: 'INVALID_RESPONSE',
      message: `HTTP ${response.status} did not carry an error envelope`,
      requestId: echoed,
      httpStatus: response.status,
    })
  );
}

export function createClient(options: ClientOptions): PerigeeClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const doFetch = resolveFetch(options.fetch);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function once<T>(spec: RequestSpec): Promise<T> {
    const requestId = newRequestId();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      [DEVICE_KEY_HEADER]: options.deviceKey,
      [OFFICER_ID_HEADER]: options.officerId,
      [REQUEST_ID_HEADER]: requestId,
    };
    if (spec.body !== undefined) headers['Content-Type'] = 'application/json';

    try {
      let response: Response;
      try {
        response = await doFetch(buildUrl(baseUrl, spec.path, spec.query), {
          method: spec.method,
          headers,
          ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
          signal: controller.signal,
        });
      } catch (cause) {
        if (controller.signal.aborted) {
          throw new PerigeeApiError({
            code: 'TIMEOUT',
            message: `${spec.method} ${spec.path} exceeded ${timeoutMs} ms`,
            detail: { path: spec.path, timeout_ms: timeoutMs },
            requestId,
            httpStatus: 0,
          });
        }
        throw new PerigeeApiError({
          code: 'NETWORK_ERROR',
          message: cause instanceof Error ? cause.message : String(cause),
          detail: { path: spec.path },
          requestId,
          httpStatus: 0,
        });
      }

      if (!response.ok) throw await errorFromResponse(response, requestId);
      if (spec.expectNoContent || response.status === 204) return undefined as T;

      try {
        return (await response.json()) as T;
      } catch {
        throw new PerigeeApiError({
          code: 'INVALID_RESPONSE',
          message: `${spec.method} ${spec.path} returned a body that is not JSON`,
          requestId: response.headers.get(REQUEST_ID_HEADER) ?? requestId,
          httpStatus: response.status,
        });
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * ONLY idempotent GETs are retried.
   *
   * Retrying `POST /v1/search` burns one of the device's three pending-decision
   * slots per attempt, so a flaky connection would lock the officer out of the
   * feature by itself. Retrying a decision hits the write-once 409. Both
   * failures are silent from the caller's side, which is why the guard is
   * structural — the retry loop is only ever entered for a GET.
   */
  async function send<T>(spec: RequestSpec): Promise<T> {
    const maxAttempts = spec.method === 'GET' ? MAX_GET_RETRIES + 1 : 1;

    for (let attempt = 0; ; attempt++) {
      try {
        return await once<T>(spec);
      } catch (err) {
        const apiError =
          err instanceof PerigeeApiError
            ? err
            : new PerigeeApiError({
                code: 'NETWORK_ERROR',
                message: err instanceof Error ? err.message : String(err),
                requestId: '',
                httpStatus: 0,
              });

        const retryable =
          apiError.code === 'NETWORK_ERROR' ||
          apiError.code === 'TIMEOUT' ||
          RETRYABLE_STATUS.has(apiError.httpStatus);

        if (attempt >= maxAttempts - 1 || !retryable) throw apiError;
      }
      await delay(RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }

  return {
    health: () => send<HealthResponse>({ method: 'GET', path: '/healthz' }),
    ready: () => send<ReadyResponse>({ method: 'GET', path: '/readyz' }),
    config: () => send<ConfigResponse>({ method: 'GET', path: '/v1/config' }),

    search: (req) => send<SearchResponse>({ method: 'POST', path: '/v1/search', body: req }),

    getSearch: (searchId) =>
      send<SearchDetail>({ method: 'GET', path: `/v1/search/${encodeURIComponent(searchId)}` }),

    pending: () => send<PendingResponse>({ method: 'GET', path: '/v1/search/pending' }),

    decide: (searchId, req) =>
      send<void>({
        method: 'POST',
        path: `/v1/search/${encodeURIComponent(searchId)}/decision`,
        body: req,
        expectNoContent: true,
      }),

    createPerson: (body) => send<PersonCreated>({ method: 'POST', path: '/v1/person', body }),

    addEmbedding: (personId, body) =>
      send<EmbeddingCreated>({
        method: 'POST',
        path: `/v1/person/${encodeURIComponent(personId)}/embedding`,
        body,
      }),

    createMedia: (personId, body) =>
      send<MediaPresigned>({
        method: 'POST',
        path: `/v1/person/${encodeURIComponent(personId)}/media`,
        body: body ?? {},
      }),

    commitMedia: (personId, mediaId, body) =>
      send<MediaCommitted>({
        method: 'POST',
        path: `/v1/person/${encodeURIComponent(personId)}/media/${encodeURIComponent(mediaId)}/commit`,
        body,
      }),

    getPerson: (personId, searchId) =>
      send<PersonDetail>({
        method: 'GET',
        path: `/v1/person/${encodeURIComponent(personId)}`,
        query: { search_id: searchId },
      }),

    graph: (personId, opts) =>
      send<GraphResponse>({
        method: 'GET',
        path: `/v1/graph/${encodeURIComponent(personId)}`,
        query: {
          depth: opts?.depth,
          min_weight: opts?.min_weight,
          edge_types: opts?.edge_types?.join(','),
          limit: opts?.limit,
        },
      }),

    auditVerify: (opts) =>
      send<AuditVerifyResponse>({
        method: 'GET',
        path: '/v1/audit/verify',
        query: { from_seq: opts?.from_seq, to_seq: opts?.to_seq },
      }),
  };
}
