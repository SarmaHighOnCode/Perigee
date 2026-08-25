import { describe, expect, it, vi } from 'vitest';

import { createDraft, setCapture, setIdentity } from '../domain/draft';
import { submitEnrollment } from './submitEnrollment';

function completeDraft() {
  let draft = setIdentity(createDraft('draft-1', '2026-08-11T00:00:00Z'), { full_name: 'Asha Rao' });
  for (const angle of ['frontal', 'left', 'right'] as const) {
    draft = setCapture(draft, {
      angle, uri: `file:///${angle}.jpg`, width: 100, height: 120, bytes: 3,
      mimeType: 'image/jpeg', source: 'camera', acquiredAt: 'now',
    });
  }
  return draft;
}

function transport() {
  return {
    createPerson: vi.fn().mockResolvedValue({ person_id: 'person-1' }),
    presignMedia: vi.fn().mockImplementation(async (_personId: string, media: { capture_angle: string }) => ({
      media_id: `media-${media.capture_angle}`, upload_url: `https://upload/${media.capture_angle}`,
      method: 'PUT', expires_in: 600, max_bytes: 1000, required_headers: { 'Content-Type': 'image/jpeg' },
      dataset_mode: 'synthetic', server_time: 'now',
    })),
    uploadMedia: vi.fn().mockResolvedValue(undefined),
    commitMedia: vi.fn().mockImplementation(async (_personId: string, mediaId: string) => ({
      media_id: mediaId, person_id: 'person-1', committed: true, bytes: 3,
    })),
    addEmbedding: vi.fn().mockResolvedValue({ embedding_id: 'emb-1', person_id: 'person-1', model_id: 'insightface/w600k_r50@1' }),
    linkCase: vi.fn().mockResolvedValue({ person_id: 'person-1', case_id: 'case-1', role: 'suspect', already_linked: false }),
    createRelationship: vi.fn().mockResolvedValue({ edge_id: 'edge-1', src_person_id: 'person-1', dst_person_id: 'person-2' }),
  };
}

const prepareCapture = vi.fn().mockResolvedValue({
  body: new Uint8Array([1, 2, 3]).buffer,
  sha256: 'a'.repeat(64), bytes: 3, width: 100, height: 120, exifStripped: true,
});

describe('submitEnrollment', () => {
  it('creates the person once, uploads every required angle, and persists each checkpoint', async () => {
    const client = transport();
    const persist = vi.fn().mockResolvedValue(undefined);
    const result = await submitEnrollment(completeDraft(), { client, prepareCapture, persist });

    expect(result.status).toBe('complete');
    expect(client.createPerson).toHaveBeenCalledOnce();
    expect(client.presignMedia).toHaveBeenCalledTimes(3);
    expect(client.uploadMedia).toHaveBeenCalledTimes(3);
    expect(client.commitMedia).toHaveBeenCalledTimes(3);
    expect(result.draft.submission.person).toMatchObject({ status: 'created', personId: 'person-1' });
    expect(Object.values(result.draft.submission.media).every((item) => item?.status === 'committed')).toBe(true);
    expect(persist.mock.calls.length).toBeGreaterThanOrEqual(10);
  });

  it('resumes committed and uploaded angles without recreating the person or re-uploading bytes', async () => {
    const client = transport();
    const base = completeDraft();
    const draft = {
      ...base,
      submission: {
        ...base.submission,
        person: { status: 'created' as const, personId: 'person-1' },
        media: {
          frontal: { status: 'committed' as const, mediaId: 'media-frontal' },
          left: { status: 'uploaded' as const, mediaId: 'media-left' },
        },
      },
    };
    const result = await submitEnrollment(draft, { client, prepareCapture, persist: async () => undefined });

    expect(result.status).toBe('complete');
    expect(client.createPerson).not.toHaveBeenCalled();
    expect(client.uploadMedia).toHaveBeenCalledTimes(1);
    expect(client.commitMedia).toHaveBeenCalledTimes(2);
  });

  it('does not retry person creation after an unknown network outcome', async () => {
    const client = transport();
    client.createPerson.mockRejectedValueOnce(Object.assign(new Error('socket closed'), { code: 'NETWORK_ERROR' }));
    const first = await submitEnrollment(completeDraft(), { client, prepareCapture, persist: async () => undefined });
    expect(first.status).toBe('needs_recovery');
    expect(first.draft.submission.person.status).toBe('unknown');

    const second = await submitEnrollment(first.draft, { client, prepareCapture, persist: async () => undefined });
    expect(second.status).toBe('needs_recovery');
    expect(client.createPerson).toHaveBeenCalledOnce();
  });

  it('keeps object storage failures resumable and never emits completion', async () => {
    const client = transport();
    // STORAGE_UNAVAILABLE is the code the server actually emits (app/errors.py).
    // This test previously used 'OBJECT_STORAGE_UNAVAILABLE', which nothing
    // emits, so it asserted against a failure mode that could not occur.
    client.presignMedia.mockRejectedValueOnce(Object.assign(new Error('storage disabled'), {
      code: 'STORAGE_UNAVAILABLE', status: 503,
    }));
    const result = await submitEnrollment(completeDraft(), { client, prepareCapture, persist: async () => undefined });
    expect(result.status).toBe('partial');
    expect(result.draft.submission.media.frontal).toMatchObject({ status: 'failed' });
    expect(result.message).toMatch(/storage disabled/);
  });

  it('still writes every embedding when object storage is switched off entirely', async () => {
    // The regression this guards: with R2 unset, presign 503s for all three
    // angles. Embeddings used to be nested inside the media-commit success
    // path, so the person was created with ZERO vectors - present in the
    // database and permanently unfindable by search.
    const client = transport();
    client.presignMedia.mockRejectedValue(Object.assign(new Error('storage disabled'), {
      code: 'STORAGE_UNAVAILABLE', status: 503,
    }));

    let draft = completeDraft();
    for (const angle of ['frontal', 'left', 'right'] as const) {
      draft = setCapture(draft, {
        ...draft.captures[angle]!,
        embedding: new Float32Array(512).fill(0.1),
        modelId: 'insightface/w600k_r50@1',
        quality: { score: 0.82, detScore: 0.95, blur: 120, yaw: 2, pitch: 1, facePx: 220 },
      });
    }

    const result = await submitEnrollment(draft, { client, prepareCapture, persist: async () => undefined });

    expect(client.addEmbedding).toHaveBeenCalledTimes(3);
    expect(result.draft.submission.outcome?.embeddings).toBe(3);
    expect(result.status).toBe('partial');
    // No mugshot committed, so no media_id may be attached to the vector.
    expect(client.addEmbedding.mock.calls[0]?.[1]).not.toHaveProperty('media_id');
  });

  it('attaches media_id to the embedding when the mugshot did commit', async () => {
    const client = transport();
    let draft = completeDraft();
    draft = setCapture(draft, {
      ...draft.captures.frontal!,
      embedding: new Float32Array(512).fill(0.2),
      modelId: 'insightface/w600k_r50@1',
      quality: { score: 0.9, detScore: 0.95, blur: 130, yaw: 1, pitch: 1, facePx: 240 },
    });

    await submitEnrollment(draft, { client, prepareCapture, persist: async () => undefined });

    expect(client.addEmbedding).toHaveBeenCalledOnce();
    expect(client.addEmbedding.mock.calls[0]?.[1]).toMatchObject({ media_id: 'media-frontal' });
  });

  it('still stops on an AMBIGUOUS media failure, which retrying could duplicate', async () => {
    const client = transport();
    client.presignMedia.mockRejectedValueOnce(new Error('socket hang up'));
    const result = await submitEnrollment(completeDraft(), { client, prepareCapture, persist: async () => undefined });
    expect(result.status).toBe('needs_recovery');
    expect(client.addEmbedding).not.toHaveBeenCalled();
  });

  it('links cases and creates relationships when present in draft', async () => {
    const client = transport();
    const draft = {
      ...completeDraft(),
      cases: [{ caseId: 'case-1', role: 'suspect' as const }],
      relationships: [{ targetPersonId: 'person-2', relationshipType: 'known_associate', evidenceCaseIds: ['case-1'] }],
    };
    const result = await submitEnrollment(draft, { client, prepareCapture, persist: async () => undefined });
    expect(result.status).toBe('complete');
    expect(client.linkCase).toHaveBeenCalledWith('person-1', { case_id: 'case-1', role: 'suspect' });
    expect(client.createRelationship).toHaveBeenCalledWith('person-1', {
      target_person_id: 'person-2',
      edge_type: 'known_associate',
      evidence_case_ids: ['case-1'],
    });
  });
});

