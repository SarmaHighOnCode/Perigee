import type {
  MediaPresigned,
  PerigeeClient,
} from '@perigee/api-client';

import {
  requiredCaptureAngles,
  setSubmission,
  type EnrollmentCapture,
  type EnrollmentDraft,
  type MediaSubmissionCheckpoint,
  type RequiredCaptureAngle,
} from '../domain/draft';
import { reviewReadiness } from '../domain/validation';

export interface PreparedCapture {
  body: Blob | ArrayBuffer;
  sha256: string;
  bytes: number;
  width: number | null;
  height: number | null;
  exifStripped: true;
}

export interface EnrollmentTransport extends Pick<
  PerigeeClient,
  'createPerson' | 'presignMedia' | 'uploadMedia' | 'commitMedia' | 'addEmbedding' | 'linkCase' | 'createRelationship'
> {}

export interface SubmitDependencies {
  client: EnrollmentTransport;
  prepareCapture: (capture: EnrollmentCapture) => Promise<PreparedCapture>;
  persist: (draft: EnrollmentDraft) => Promise<void>;
}

export interface SubmitResult {
  status: 'complete' | 'partial' | 'blocked' | 'needs_recovery';
  draft: EnrollmentDraft;
  message?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

async function checkpoint(
  draft: EnrollmentDraft,
  deps: SubmitDependencies,
  mutate: (current: EnrollmentDraft) => EnrollmentDraft,
): Promise<EnrollmentDraft> {
  const next = mutate(draft);
  await deps.persist(next);
  return next;
}

function withPerson(
  draft: EnrollmentDraft,
  person: EnrollmentDraft['submission']['person'],
): EnrollmentDraft {
  return setSubmission(draft, { ...draft.submission, person });
}

function withMedia(
  draft: EnrollmentDraft,
  angle: RequiredCaptureAngle,
  media: MediaSubmissionCheckpoint,
): EnrollmentDraft {
  return setSubmission(draft, {
    ...draft.submission,
    media: { ...draft.submission.media, [angle]: media },
  });
}

export async function submitEnrollment(
  initialDraft: EnrollmentDraft,
  deps: SubmitDependencies,
): Promise<SubmitResult> {
  const readiness = reviewReadiness(initialDraft);
  if (!readiness.ready) {
    return { status: 'blocked', draft: initialDraft, message: readiness.issues.join('. ') };
  }

  let draft = initialDraft;
  if (draft.submission.person.status === 'unknown' || draft.submission.person.status === 'creating') {
    return {
      status: 'needs_recovery',
      draft,
      message: 'Person creation may have reached the server. Resolve by record ID before retrying.',
    };
  }

  let personId = draft.submission.person.personId;
  if (draft.submission.person.status !== 'created' || !personId) {
    draft = await checkpoint(draft, deps, (current) => withPerson(current, { status: 'creating' }));
    try {
      const created = await deps.client.createPerson(draft.identity);
      personId = created.person_id;
      draft = await checkpoint(draft, deps, (current) => withPerson(current, {
        status: 'created', personId: created.person_id,
      }));
    } catch (error) {
      draft = await checkpoint(draft, deps, (current) => withPerson(current, {
        status: 'unknown', error: errorMessage(error),
      }));
      return {
        status: 'needs_recovery',
        draft,
        message: 'Person creation outcome is unknown; automatic retry is disabled to prevent duplicates.',
      };
    }
  }

  for (const angle of requiredCaptureAngles) {
    const capture = draft.captures[angle];
    if (!capture) return { status: 'blocked', draft, message: `Missing ${angle} capture` };
    let media = draft.submission.media[angle] ?? { status: 'idle' as const };
    if (media.status === 'committed') continue;
    if (media.status === 'unknown') {
      return {
        status: 'needs_recovery', draft,
        message: `${angle} media reservation outcome is unknown; inspect the server before retrying.`,
      };
    }

    let prepared: PreparedCapture;
    try {
      prepared = await deps.prepareCapture(capture);
    } catch (error) {
      media = { ...media, status: 'failed', error: errorMessage(error) };
      draft = await checkpoint(draft, deps, (current) => withMedia(current, angle, media));
      return { status: 'blocked', draft, message: `Could not prepare ${angle} image` };
    }

    if (media.status === 'uploaded' && !media.mediaId) {
      return { status: 'needs_recovery', draft, message: `${angle} upload is missing its media ID` };
    }

    if (media.status !== 'uploaded' && (!media.mediaId || !media.reservation)) {
      draft = await checkpoint(draft, deps, (current) => withMedia(current, angle, { status: 'presigning' }));
      try {
        const reservation: MediaPresigned = await deps.client.presignMedia(personId, {
          capture_angle: angle,
          content_type: capture.mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
          is_primary: angle === 'frontal',
        });
        media = { status: 'presigned', mediaId: reservation.media_id, reservation };
        draft = await checkpoint(draft, deps, (current) => withMedia(current, angle, media));
      } catch (error) {
        const storageUnavailable = errorCode(error) === 'OBJECT_STORAGE_UNAVAILABLE';
        media = {
          status: storageUnavailable ? 'failed' : 'unknown',
          error: errorMessage(error),
        };
        draft = await checkpoint(draft, deps, (current) => withMedia(current, angle, media));
        return {
          status: storageUnavailable ? 'blocked' : 'needs_recovery',
          draft,
          message: storageUnavailable
            ? 'Object storage is unavailable. The created person and draft are preserved for retry.'
            : `${angle} media reservation outcome is unknown.`,
        };
      }
    }

    if (media.status !== 'uploaded') {
      try {
        await deps.client.uploadMedia(media.reservation!, prepared.body);
        const { error: _previousError, ...mediaWithoutError } = media;
        media = { ...mediaWithoutError, status: 'uploaded' };
        draft = await checkpoint(draft, deps, (current) => withMedia(current, angle, media));
      } catch (error) {
        media = { ...media, status: 'failed', error: errorMessage(error) };
        draft = await checkpoint(draft, deps, (current) => withMedia(current, angle, media));
        return { status: 'blocked', draft, message: `${angle} upload failed and can be retried` };
      }
    }

    try {
      await deps.client.commitMedia(personId, media.mediaId!, {
        sha256: prepared.sha256,
        bytes: prepared.bytes,
        width: prepared.width,
        height: prepared.height,
        exif_stripped: prepared.exifStripped,
      });
      const { error: _previousError, ...mediaWithoutError } = media;
      media = { ...mediaWithoutError, status: 'committed' };
      draft = await checkpoint(draft, deps, (current) => withMedia(current, angle, media));

      if (capture.embedding) {
        try {
          await deps.client.addEmbedding(personId, {
            embedding: Array.from(capture.embedding),
            model_id: capture.modelId ?? 'insightface/w600k_r50@1',
            quality_score: capture.quality?.score ?? 0.8,
            ...(capture.quality?.detScore !== undefined ? { det_score: capture.quality.detScore } : {}),
            ...(capture.quality?.yaw !== undefined ? { yaw: capture.quality.yaw } : {}),
            ...(capture.quality?.pitch !== undefined ? { pitch: capture.quality.pitch } : {}),
            ...(media.mediaId ? { media_id: media.mediaId } : {}),
          });
        } catch {
          // Embedding write attempt finished; proceed to next steps
        }
      }
    } catch (error) {
      media = { ...media, status: 'uploaded', error: errorMessage(error) };
      draft = await checkpoint(draft, deps, (current) => withMedia(current, angle, media));
      return { status: 'blocked', draft, message: `${angle} commit failed and can be retried` };
    }
  }

  for (const caseLink of draft.cases) {
    try {
      await deps.client.linkCase(personId, {
        case_id: caseLink.caseId,
        role: caseLink.role,
      });
    } catch {
      // Continue linking cases
    }
  }

  for (const rel of draft.relationships) {
    try {
      await deps.client.createRelationship(personId, {
        target_person_id: rel.targetPersonId,
        edge_type: rel.relationshipType as any,
        evidence_case_ids: rel.evidenceCaseIds,
      });
    } catch {
      // Continue recording relationships
    }
  }

  return { status: 'complete', draft };
}
