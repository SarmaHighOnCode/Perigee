import { describe, expect, it, vi } from 'vitest';

import { createPerigeeClient } from './client';
import { PerigeeApiError } from './errors';

const created = {
  person_id: 'person-1', masked_name: 'A*** R**', dataset_mode: 'synthetic',
  server_time: '2026-08-11T00:00:00Z',
};

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Perigee Enroll commands', () => {
  it('uses exact person, embedding, media reservation and commit contracts', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(created, 201))
      .mockResolvedValueOnce(json({
        embedding_id: 'embedding-1', person_id: 'person-1', model_id: 'model@1',
        dataset_mode: 'synthetic', server_time: '2026-08-11T00:00:00Z',
      }, 201))
      .mockResolvedValueOnce(json({
        media_id: 'media-1', upload_url: 'https://objects.example/upload', method: 'PUT',
        expires_in: 600, max_bytes: 8_000_000, required_headers: { 'Content-Type': 'image/jpeg', 'x-amz-checksum-sha256': 'checksum' },
        dataset_mode: 'synthetic', server_time: '2026-08-11T00:00:00Z',
      }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(json({
        media_id: 'media-1', person_id: 'person-1', committed: true, bytes: 3,
        dataset_mode: 'synthetic', server_time: '2026-08-11T00:00:00Z',
      }));
    const client = createPerigeeClient({
      baseUrl: 'https://api.example.test', deviceKey: 'secret', officerId: 'OP-1', fetch,
      requestId: () => 'request-1',
    });

    await client.createPerson({ full_name: 'Asha Rao', aliases: [] });
    await client.createEmbedding('person-1', {
      embedding: [1, 0], model_id: 'model@1', quality_score: 0.8, media_id: 'media-1',
    });
    const reservation = await client.presignMedia('person-1', {
      capture_angle: 'frontal', content_type: 'image/jpeg', is_primary: true,
    });
    await client.uploadMedia(reservation, new Uint8Array([1, 2, 3]).buffer);
    await client.commitMedia('person-1', 'media-1', {
      sha256: 'a'.repeat(64), bytes: 3, width: 100, height: 120, exif_stripped: true,
    });

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.test/v1/person',
      'https://api.example.test/v1/person/person-1/embedding',
      'https://api.example.test/v1/person/person-1/media',
      'https://objects.example/upload',
      'https://api.example.test/v1/person/person-1/media/media-1/commit',
    ]);
    expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body))).toEqual({
      capture_angle: 'frontal', content_type: 'image/jpeg', is_primary: true,
    });
    const uploadHeaders = new Headers(fetch.mock.calls[3]?.[1]?.headers);
    expect(uploadHeaders.get('Content-Type')).toBe('image/jpeg');
    expect(uploadHeaders.get('x-amz-checksum-sha256')).toBe('checksum');
    expect(uploadHeaders.has('X-Perigee-Device-Key')).toBe(false);
    expect(uploadHeaders.has('X-Request-ID')).toBe(false);
  });

  it('preserves object-storage unavailable as a structured retryable boundary', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({
      error: {
        code: 'STORAGE_UNAVAILABLE', message: 'Object storage is not configured',
        request_id: 'server-1',
      },
    }, 503));
    const client = createPerigeeClient({
      baseUrl: 'https://api.example.test', deviceKey: 'secret', officerId: 'OP-1', fetch,
    });

    const error = await client.presignMedia('person-1', {
      capture_angle: 'left', content_type: 'image/jpeg', is_primary: false,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PerigeeApiError);
    // STORAGE_UNAVAILABLE is what app/errors.py emits. The fabricated
    // OBJECT_STORAGE_UNAVAILABLE used here before matched no server response,
    // so enroll's handler for it was dead code that never ran in production.
    expect(error).toMatchObject({ status: 503, code: 'STORAGE_UNAVAILABLE', requestId: 'server-1' });
  });

  it('supports listCases, linkCase, and createRelationship contracts', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({
        cases: [{
          case_id: 'case-1',
          fir_number: 'FIR-123/2026',
          station: 'Central',
          district: 'Urban',
          registered_on: '2026-01-01',
          status: 'under_investigation',
        }],
        count: 1,
        truncated: false,
        dataset_mode: 'synthetic',
        server_time: '2026-08-11T00:00:00Z',
      }))
      .mockResolvedValueOnce(json({
        person_id: 'person-1',
        case_id: 'case-1',
        role: 'accused',
        already_linked: false,
        dataset_mode: 'synthetic',
        server_time: '2026-08-11T00:00:00Z',
      }, 201))
      .mockResolvedValueOnce(json({
        edge_id: 'edge-1',
        src_person_id: 'person-1',
        dst_person_id: 'person-2',
        edge_type: 'known_associate',
        weight: 0.8,
        evidence_case_ids: ['case-1'],
        already_existed: false,
        dataset_mode: 'synthetic',
        server_time: '2026-08-11T00:00:00Z',
      }, 201));

    const client = createPerigeeClient({
      baseUrl: 'https://api.example.test',
      deviceKey: 'secret',
      officerId: 'OP-1',
      fetch,
      requestId: () => 'request-1',
    });

    const cases = await client.listCases({ q: 'FIR-123', district: 'Urban', limit: 10 });
    expect(cases.cases).toHaveLength(1);
    expect(cases.cases[0]?.fir_number).toBe('FIR-123/2026');

    const linked = await client.linkCase('person-1', { case_id: 'case-1', role: 'accused' });
    expect(linked.role).toBe('accused');

    const rel = await client.createRelationship('person-1', {
      target_person_id: 'person-2',
      edge_type: 'known_associate',
      evidence_case_ids: ['case-1'],
      weight: 0.8,
    });
    expect(rel.edge_id).toBe('edge-1');

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.test/v1/cases?q=FIR-123&district=Urban&limit=10',
      'https://api.example.test/v1/person/person-1/cases',
      'https://api.example.test/v1/person/person-1/relationships',
    ]);
  });
});

