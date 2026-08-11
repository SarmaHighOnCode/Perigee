import { describe, expect, it } from 'vitest';

import {
  DEVICE_KEY_HEADER,
  OFFICER_ID_HEADER,
  REQUEST_ID_HEADER,
  createClient,
  type FetchLike,
} from '../client';
import type { SearchRequest, SearchResponse } from '../types';

interface Call {
  url: string;
  init: RequestInit;
}

function recorder(responder: (index: number) => Response): { calls: Call[]; fetch: FetchLike } {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(responder(calls.length - 1));
  };
  return { calls, fetch: fetchImpl };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorBody(code: string, status: number): Response {
  return json(
    { error: { code, message: `simulated ${code}`, detail: {}, request_id: 'server-id' } },
    status,
  );
}

function headersOf(call: Call): Record<string, string> {
  return call.init.headers as Record<string, string>;
}

const SEARCH_REQUEST: SearchRequest = {
  embedding: new Array<number>(512).fill(1 / Math.sqrt(512)),
  model_id: 'insightface/w600k_r50@1',
  quality: { score: 0.87, det_score: 0.96, blur: 142.3, yaw: -4.2, pitch: 2.1, face_px: 224 },
  reason_code: 'suspicious_conduct',
  top_k: 5,
};

const SEARCH_RESPONSE: SearchResponse = {
  search_id: '018f2c00-0000-4000-8000-000000000001',
  status: 'PENDING_DECISION',
  expires_at: '2026-08-10T14:52:31Z',
  candidates: [],
  score_gap: null,
  ambiguous: false,
  threshold_in_effect: 0.42,
  bands: { no_match: 0.28, weak: 0.42, review: 0.58 },
  advisory: 'HUMAN VERIFICATION REQUIRED. This system does not identify persons.',
  dataset_mode: 'synthetic',
  model_id: 'insightface/w600k_r50@1',
  server_time: '2026-08-10T14:22:31.482Z',
};

function client(fetchImpl: FetchLike) {
  return createClient({
    baseUrl: 'https://perigee-core.example/',
    deviceKey: 'device-key',
    officerId: 'OFFICER-1147',
    fetch: fetchImpl,
  });
}

describe('headers and url construction', () => {
  it('sends the device key, officer id and a fresh uuid request id', async () => {
    const { calls, fetch } = recorder(() => json(SEARCH_RESPONSE));
    await client(fetch).search(SEARCH_REQUEST);

    const headers = headersOf(calls[0]!);
    expect(headers[DEVICE_KEY_HEADER]).toBe('device-key');
    expect(headers[OFFICER_ID_HEADER]).toBe('OFFICER-1147');
    expect(headers[REQUEST_ID_HEADER]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('generates a distinct request id per request', async () => {
    const { calls, fetch } = recorder(() => json(SEARCH_RESPONSE));
    const api = client(fetch);
    await api.search(SEARCH_REQUEST);
    await api.search(SEARCH_REQUEST);

    expect(headersOf(calls[0]!)[REQUEST_ID_HEADER]).not.toBe(
      headersOf(calls[1]!)[REQUEST_ID_HEADER],
    );
  });

  it('omits Content-Type on a GET, which has no body', async () => {
    const { calls, fetch } = recorder(() => json({ status: 'ok', dataset_mode: 'synthetic' }));
    await client(fetch).health();

    expect(headersOf(calls[0]!)['Content-Type']).toBeUndefined();
    expect(calls[0]!.url).toBe('https://perigee-core.example/healthz');
  });

  it('carries the purpose binding as a query parameter', async () => {
    const { calls, fetch } = recorder(() => json({}));
    await client(fetch).getPerson('person-1', 'search-1');

    expect(calls[0]!.url).toBe('https://perigee-core.example/v1/person/person-1?search_id=search-1');
  });

  it('joins graph edge types and drops unset options', async () => {
    const { calls, fetch } = recorder(() => json({}));
    await client(fetch).graph('person-1', { depth: 2, edge_types: ['co_accused', 'family'] });

    expect(calls[0]!.url).toBe(
      'https://perigee-core.example/v1/graph/person-1?depth=2&edge_types=co_accused%2Cfamily',
    );
  });
});

describe('error envelope handling', () => {
  it('throws a PerigeeApiError carrying the server code and status', async () => {
    const { fetch } = recorder(() => errorBody('QUALITY_BELOW_FLOOR', 422));

    await expect(client(fetch).search(SEARCH_REQUEST)).rejects.toMatchObject({
      code: 'QUALITY_BELOW_FLOOR',
      httpStatus: 422,
      requestId: 'server-id',
    });
  });

  it('does not invent a code when the body is not an envelope', async () => {
    const { fetch } = recorder(
      () => new Response('<html>502 Bad Gateway</html>', { status: 500 }),
    );

    await expect(client(fetch).search(SEARCH_REQUEST)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      httpStatus: 500,
    });
  });

  it('surfaces a transport failure as NETWORK_ERROR', async () => {
    const fetchImpl: FetchLike = () => Promise.reject(new TypeError('Network request failed'));

    await expect(client(fetchImpl).search(SEARCH_REQUEST)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      httpStatus: 0,
    });
  });
});

describe('retry policy', () => {
  it('never retries POST /v1/search, because each attempt burns a pending-decision slot', async () => {
    const { calls, fetch } = recorder(() => errorBody('DATABASE_UNAVAILABLE', 503));

    await expect(client(fetch).search(SEARCH_REQUEST)).rejects.toMatchObject({
      code: 'DATABASE_UNAVAILABLE',
    });
    expect(calls).toHaveLength(1);
  });

  it('never retries a search POST that failed at the transport layer', async () => {
    let attempts = 0;
    const fetchImpl: FetchLike = () => {
      attempts += 1;
      return Promise.reject(new TypeError('Network request failed'));
    };

    await expect(client(fetchImpl).search(SEARCH_REQUEST)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    expect(attempts).toBe(1);
  });

  it('never retries a decision, because the second write is a 409', async () => {
    const { calls, fetch } = recorder(() => errorBody('DATABASE_UNAVAILABLE', 503));

    await expect(
      client(fetch).decide('search-1', { decision: 'NO_MATCH' }),
    ).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
    expect(calls).toHaveLength(1);
  });

  it('retries an idempotent GET at most twice', async () => {
    const { calls, fetch } = recorder(() => errorBody('DATABASE_UNAVAILABLE', 503));

    await expect(client(fetch).pending()).rejects.toMatchObject({
      code: 'DATABASE_UNAVAILABLE',
    });
    expect(calls).toHaveLength(3);
  });

  it('stops retrying a GET as soon as one succeeds', async () => {
    const { calls, fetch } = recorder((index) =>
      index === 0 ? errorBody('DATABASE_UNAVAILABLE', 503) : json({ pending: [], limit: 3 }),
    );

    await expect(client(fetch).pending()).resolves.toMatchObject({ limit: 3 });
    expect(calls).toHaveLength(2);
  });

  it('does not retry a rate limit, on any method', async () => {
    const { calls, fetch } = recorder(() => errorBody('PENDING_DECISION_LIMIT', 429));

    await expect(client(fetch).pending()).rejects.toMatchObject({
      code: 'PENDING_DECISION_LIMIT',
    });
    expect(calls).toHaveLength(1);
  });
});

describe('the search contract', () => {
  it('returns a 204 decision as void without parsing a body', async () => {
    const { fetch } = recorder(() => new Response(null, { status: 204 }));

    await expect(
      client(fetch).decide('search-1', { decision: 'CONFIRMED', confirmed_rank: 1 }),
    ).resolves.toBeUndefined();
  });

  it('has no is_match field, and must never grow one', async () => {
    const { fetch } = recorder(() => json(SEARCH_RESPONSE));
    const response = await client(fetch).search(SEARCH_REQUEST);

    // @ts-expect-error — the API returns ranked candidates. Asserting an
    // identification is not a question the machine is permitted to answer.
    expect(response.is_match).toBeUndefined();
    expect(response.status).toBe('PENDING_DECISION');
  });
});
