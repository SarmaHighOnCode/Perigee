import { PerigeeApiError } from './errors';
import {
  isSearchResponse,
  type ApiErrorEnvelope,
  type DecisionRequest,
  type EmbeddingCreate,
  type EmbeddingCreated,
  type GraphResponse,
  type MediaCommit,
  type MediaCommitted,
  type MediaCreate,
  type MediaPresigned,
  type PendingResponse,
  type PersonCreate,
  type PersonCreated,
  type PersonDetail,
  type ReadyResponse,
  type RuntimeConfig,
  type SearchDetail,
  type SearchRequest,
  type SearchResponse,
} from './types';

type Fetch = typeof globalThis.fetch;

export interface PerigeeClientOptions {
  baseUrl: string;
  deviceKey: string;
  officerId: string;
  fetch?: Fetch;
  requestId?: () => string;
  timeoutMs?: number;
}

export interface PerigeeClient {
  health(): Promise<{ status: string; dataset_mode: string }>;
  ready(): Promise<ReadyResponse>;
  config(): Promise<RuntimeConfig>;
  search(request: SearchRequest): Promise<SearchResponse>;
  searchDetail(searchId: string): Promise<SearchDetail>;
  pending(): Promise<PendingResponse>;
  decide(searchId: string, decision: DecisionRequest): Promise<void>;
  person(personId: string, searchId: string): Promise<PersonDetail>;
  graph(
    personId: string,
    options?: { depth?: number; maxNodes?: number },
  ): Promise<GraphResponse>;
  createPerson(person: PersonCreate): Promise<PersonCreated>;
  createEmbedding(personId: string, embedding: EmbeddingCreate): Promise<EmbeddingCreated>;
  presignMedia(personId: string, media: MediaCreate): Promise<MediaPresigned>;
  uploadMedia(reservation: MediaPresigned, body: Blob | ArrayBuffer): Promise<void>;
  commitMedia(personId: string, mediaId: string, media: MediaCommit): Promise<MediaCommitted>;
}

function defaultRequestId(): string {
  return `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = value.error;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

function requireObject<T>(payload: unknown, contract: string): T {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new PerigeeApiError({
      status: 200,
      code: 'INVALID_RESPONSE',
      message: `${contract} response was not a JSON object`,
    });
  }
  return payload as T;
}

export function createPerigeeClient(options: PerigeeClientOptions): PerigeeClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetch = options.fetch ?? globalThis.fetch;
  const requestId = options.requestId ?? defaultRequestId;
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function requestJson(
    path: string,
    init: RequestInit = {},
    authenticated = true,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('X-Request-ID', requestId());
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');
    if (authenticated) {
      headers.set('X-Perigee-Device-Key', options.deviceKey);
      headers.set('X-Perigee-Officer-Id', options.officerId);
    }

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (isErrorEnvelope(payload)) {
          throw new PerigeeApiError({
            status: response.status,
            code: payload.error.code,
            message: payload.error.message,
            detail: payload.error.detail,
            requestId: payload.error.request_id ?? response.headers.get('X-Request-ID'),
          });
        }
        throw new PerigeeApiError({
          status: response.status,
          code: 'HTTP_ERROR',
          message: `Perigee API returned HTTP ${response.status}`,
          requestId: response.headers.get('X-Request-ID'),
        });
      }
      return payload;
    } catch (error) {
      if (error instanceof PerigeeApiError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PerigeeApiError({
          status: 0,
          code: 'TIMEOUT',
          message: `Perigee API did not respond within ${timeoutMs} ms`,
        });
      }
      throw new PerigeeApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network request failed',
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async health() {
      const payload = await requestJson('/healthz', {}, false);
      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('status' in payload) ||
        typeof payload.status !== 'string' ||
        !('dataset_mode' in payload) ||
        typeof payload.dataset_mode !== 'string'
      ) {
        throw new PerigeeApiError({
          status: 200,
          code: 'INVALID_RESPONSE',
          message: 'The health response did not match the Perigee contract',
        });
      }
      return { status: payload.status, dataset_mode: payload.dataset_mode };
    },

    async ready() {
      return requireObject<ReadyResponse>(
        await requestJson('/readyz', {}, false),
        'Readiness',
      );
    },

    async config() {
      return requireObject<RuntimeConfig>(
        await requestJson('/v1/config', {}, false),
        'Runtime config',
      );
    },

    async search(searchRequest) {
      const payload = await requestJson('/v1/search', {
        method: 'POST',
        body: JSON.stringify(searchRequest),
      });
      if (!isSearchResponse(payload)) {
        throw new PerigeeApiError({
          status: 200,
          code: 'INVALID_RESPONSE',
          message: 'The search response did not match the ranked-candidate contract',
        });
      }
      return payload;
    },

    async searchDetail(searchId) {
      return requireObject<SearchDetail>(
        await requestJson(`/v1/search/${encodeURIComponent(searchId)}`),
        'Search detail',
      );
    },

    async pending() {
      return requireObject<PendingResponse>(
        await requestJson('/v1/search/pending'),
        'Pending searches',
      );
    },

    async decide(searchId, decision) {
      await requestJson(`/v1/search/${encodeURIComponent(searchId)}/decision`, {
        method: 'POST',
        body: JSON.stringify(decision),
      });
    },

    async person(personId, searchId) {
      return requireObject<PersonDetail>(
        await requestJson(
          `/v1/person/${encodeURIComponent(personId)}?search_id=${encodeURIComponent(searchId)}`,
        ),
        'Person',
      );
    },

    async graph(personId, graphOptions = {}) {
      const query: string[] = [];
      if (graphOptions.depth !== undefined) query.push(`depth=${graphOptions.depth}`);
      if (graphOptions.maxNodes !== undefined) query.push(`max_nodes=${graphOptions.maxNodes}`);
      const suffix = query.length > 0 ? `?${query.join('&')}` : '';
      return requireObject<GraphResponse>(
        await requestJson(`/v1/graph/${encodeURIComponent(personId)}${suffix}`),
        'Graph',
      );
    },

    async createPerson(person) {
      return requireObject<PersonCreated>(
        await requestJson('/v1/person', {
          method: 'POST',
          body: JSON.stringify(person),
        }),
        'Person creation',
      );
    },

    async createEmbedding(personId, embedding) {
      return requireObject<EmbeddingCreated>(
        await requestJson(`/v1/person/${encodeURIComponent(personId)}/embedding`, {
          method: 'POST',
          body: JSON.stringify(embedding),
        }),
        'Embedding creation',
      );
    },

    async presignMedia(personId, media) {
      return requireObject<MediaPresigned>(
        await requestJson(`/v1/person/${encodeURIComponent(personId)}/media`, {
          method: 'POST',
          body: JSON.stringify(media),
        }),
        'Media reservation',
      );
    },

    async uploadMedia(reservation, body) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(reservation.upload_url, {
          method: reservation.method || 'PUT',
          headers: reservation.required_headers,
          body,
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new PerigeeApiError({
            status: response.status,
            code: 'UPLOAD_FAILED',
            message: `Object storage returned HTTP ${response.status}`,
          });
        }
      } catch (error) {
        if (error instanceof PerigeeApiError) throw error;
        if (error instanceof Error && error.name === 'AbortError') {
          throw new PerigeeApiError({
            status: 0,
            code: 'UPLOAD_TIMEOUT',
            message: `Object upload did not respond within ${timeoutMs} ms`,
          });
        }
        throw new PerigeeApiError({
          status: 0,
          code: 'UPLOAD_NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Object upload failed',
        });
      } finally {
        clearTimeout(timeout);
      }
    },

    async commitMedia(personId, mediaId, media) {
      return requireObject<MediaCommitted>(
        await requestJson(
          `/v1/person/${encodeURIComponent(personId)}/media/${encodeURIComponent(mediaId)}/commit`,
          { method: 'POST', body: JSON.stringify(media) },
        ),
        'Media commit',
      );
    },
  };
}
