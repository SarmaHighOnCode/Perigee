import { describe, expect, it, vi } from 'vitest';

import { createPerigeeClient } from './client';
import { PerigeeApiError } from './errors';
import type { SearchRequest, SearchResponse } from './types';

const request: SearchRequest = {
  embedding: [1, 0, 0],
  model_id: 'fixture/model@1',
  quality: { score: 0.9 },
  reason_code: 'training',
};

const response: SearchResponse = {
  search_id: '018f2c52-38da-7d1a-a5fd-677004ea6c21',
  status: 'PENDING_DECISION',
  expires_at: '2026-08-11T12:30:00Z',
  candidates: [],
  score_gap: null,
  ambiguous: false,
  threshold_in_effect: 0.42,
  bands: { no_match: 0.28, review: 0.42, strong: 0.58 },
  advisory: 'Human decision required.',
  dataset_mode: 'synthetic',
  model_id: 'fixture/model@1',
  server_time: '2026-08-11T12:00:00Z',
};

describe('createPerigeeClient', () => {
  it('adds exact device, officer, and request attribution headers to search', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createPerigeeClient({
      baseUrl: 'https://api.example.test/',
      deviceKey: 'device-secret',
      officerId: 'OFFICER-1147',
      fetch,
      requestId: () => 'request-123',
    });

    await expect(client.search(request)).resolves.toEqual(response);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.example.test/v1/search');
    expect(new Headers(init?.headers)).toMatchObject(
      expect.objectContaining({}),
    );
    const headers = new Headers(init?.headers);
    expect(headers.get('X-Perigee-Device-Key')).toBe('device-secret');
    expect(headers.get('X-Perigee-Officer-Id')).toBe('OFFICER-1147');
    expect(headers.get('X-Request-ID')).toBe('request-123');
    expect(JSON.parse(String(init?.body))).toEqual(request);
  });

  it('keeps liveness public and normalizes the base URL', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', dataset_mode: 'synthetic' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createPerigeeClient({
      baseUrl: 'https://api.example.test///',
      deviceKey: 'secret',
      officerId: 'OFFICER-1',
      fetch,
    });

    await client.health();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.example.test/healthz');
    const headers = new Headers(init?.headers);
    expect(headers.has('X-Perigee-Device-Key')).toBe(false);
    expect(headers.has('X-Perigee-Officer-Id')).toBe(false);
  });

  it('surfaces structured pending-limit errors without discarding details', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'PENDING_DECISION_LIMIT',
            message: 'Resolve pending searches first',
            detail: { open_search_ids: ['search-1'] },
            request_id: 'server-request',
          },
        }),
        { status: 429, headers: { 'content-type': 'application/json' } },
      ),
    );
    const client = createPerigeeClient({
      baseUrl: 'https://api.example.test',
      deviceKey: 'secret',
      officerId: 'OFFICER-1',
      fetch,
    });

    const error = await client.search(request).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PerigeeApiError);
    expect(error).toMatchObject({
      status: 429,
      code: 'PENDING_DECISION_LIMIT',
      requestId: 'server-request',
      detail: { open_search_ids: ['search-1'] },
    });
  });

  it('rejects a search response that claims a match', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ...response, is_match: true }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createPerigeeClient({
      baseUrl: 'https://api.example.test',
      deviceKey: 'secret',
      officerId: 'OFFICER-1',
      fetch,
    });

    await expect(client.search(request)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('routes pending, decision, person and graph calls through the exact contract paths', async () => {
    const json = (body: unknown, status = 200) => new Response(
      status === 204 ? null : JSON.stringify(body),
      { status, headers: { 'content-type': 'application/json' } },
    );
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({
        pending: [], limit: 3, dataset_mode: 'synthetic', server_time: '2026-08-11T12:00:00Z',
      }))
      .mockResolvedValueOnce(json(null, 204))
      .mockResolvedValueOnce(json({
        person_id: 'person-1', full_name: 'Synthetic Person', aliases: [], dob: null,
        gender: null, district: 'Demo', status: 'active', media: [], cases: [],
        graph_summary: { degree: 0, community_id: null, immediate_associates: 0 },
        dataset_mode: 'synthetic', server_time: '2026-08-11T12:00:00Z',
      }))
      .mockResolvedValueOnce(json({
        root_person_id: 'person-1', nodes: [], edges: [], truncated: false,
        dataset_mode: 'synthetic', server_time: '2026-08-11T12:00:00Z',
      }));
    const client = createPerigeeClient({
      baseUrl: 'https://api.example.test', deviceKey: 'secret', officerId: 'OFFICER-1', fetch,
    });

    await client.pending();
    await client.decide('search-1', { decision: 'NO_MATCH', latency_ms: 1200 });
    await client.person('person-1', 'search-1');
    await client.graph('person-1', { depth: 2, maxNodes: 100 });

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.test/v1/search/pending',
      'https://api.example.test/v1/search/search-1/decision',
      'https://api.example.test/v1/person/person-1?search_id=search-1',
      'https://api.example.test/v1/graph/person-1?depth=2&max_nodes=100',
    ]);
    expect(fetch.mock.calls[1]?.[1]?.method).toBe('POST');
  });

  it('fetches public readiness and runtime configuration without device attribution', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'ok', database: 'ok', migration_version: '0008', storage: 'disabled',
        dataset_mode: 'synthetic',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        dataset_mode: 'synthetic', allowed_model_ids: ['fixture/model@1'],
        quality_floor: 0.35, bands: { no_match: 0.28 }, ambiguity_gap: 0.03,
        top_k_default: 5, top_k_min: 3, top_k_max: 10, pending_decision_limit: 3,
        search_expiry_minutes: 30, reason_codes: ['training'], advisory: 'Human decision required.',
        server_time: '2026-08-11T12:00:00Z',
      }), { status: 200 }));
    const client = createPerigeeClient({
      baseUrl: 'https://api.example.test', deviceKey: 'secret', officerId: 'OFFICER-1', fetch,
    });

    await client.ready();
    await client.config();
    for (const [, init] of fetch.mock.calls) {
      expect(new Headers(init?.headers).has('X-Perigee-Device-Key')).toBe(false);
    }
  });
});
