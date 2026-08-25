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
  type SubmissionOutcome,
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

export interface SubmitOptions {
  /** Retry after an unknown person-creation outcome. May create a duplicate person. */
  forceAfterUnknown?: boolean;
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
  /** True when a forced retry could unblock a `needs_recovery` result. */
  canForceRetry?: boolean;
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
  options: SubmitOptions = {},
): Promise<SubmitResult> {
  const readiness = reviewReadiness(initialDraft);
  if (!readiness.ready) {
    return { status: 'blocked', draft: initialDraft, message: readiness.issues.join('. ') };
  }

  const outcome: SubmissionOutcome = {
    finishedAt: '',
    embeddings: 0,
    embeddingErrors: [],
    mediaErrors: [],
    casesLinked: 0,
    caseErrors: [],
    relationshipsCreated: 0,
    relationshipErrors: [],
  };

  let draft = initialDraft;
  const personStatus = draft.submission.person.status;
  if (personStatus === 'unknown' || personStatus === 'creating') {
    if (!options.forceAfterUnknown) {
      return {
        status: 'needs_recovery',
        draft,
        canForceRetry: true,
        message: 'A previous attempt may have created this person on the server. Retry to submit anyway (risking a duplicate), or start a fresh enrollment.',
      };
    }
    draft = await checkpoint(draft, deps, (current) => withPerson(current, { status: 'idle' }));
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
        canForceRetry: true,
        message: 'Person creation outcome is unknown; automatic retry is disabled to prevent duplicates.',
      };
    }
  }

  // MEDIA FIRST, THEN EMBEDDINGS - and never the other way round.
  //
  // The embedding is what makes a person findable; the mugshot is what makes a
  // candidate legible once found. Writing the embedding used to be nested inside
  // the media-commit success path, so a deployment with no object storage
  // configured (R2 unset -> 503 STORAGE_UNAVAILABLE on presign) enrolled people
  // who could never be matched: identity row present, zero vectors, invisible to
  // search. That is the silent failure docs/05 warns about, reached through the
  // ordinary happy path.
  //
  // So media failure now degrades instead of aborting. A DEFINITIVE refusal from
  // the server (storage is off) is recorded and skipped; an AMBIGUOUS one (the
  // request may or may not have landed) still stops everything, because retrying
  // those is what creates duplicates.
  const mediaIds: Partial<Record<RequiredCaptureAngle, string>> = {};

  for (const angle of requiredCaptureAngles) {
    const capture = draft.captures[angle];
    if (!capture) return { status: 'blocked', draft, message: `Missing ${angle} capture` };
    let media = draft.submission.media[angle] ?? { status: 'idle' as const };
    if (media.status === 'committed') {
      if (media.mediaId) mediaIds[angle] = media.mediaId;
      continue;
    }
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
      outcome.mediaErrors.push(`${angle}: ${errorMessage(error)}`);
      continue;
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
        // The server names this STORAGE_UNAVAILABLE. This used to compare
        // against 'OBJECT_STORAGE_UNAVAILABLE', which no endpoint emits, so a
        // definitive 503 was misread as an ambiguous outcome and the operator
        // was told to "inspect the server" over a setting that is simply off.
        const storageUnavailable = errorCode(error) === 'STORAGE_UNAVAILABLE';
        media = {
          status: storageUnavailable ? 'failed' : 'unknown',
          error: errorMessage(error),
        };
        draft = await checkpoint(draft, deps, (current) => withMedia(current, angle, media));
        if (!storageUnavailable) {
          return {
            status: 'needs_recovery',
            draft,
            message: `${angle} media reservation outcome is unknown.`,
          };
        }
        outcome.mediaErrors.push(`${angle}: ${errorMessage(error)}`);
        continue;
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
        outcome.mediaErrors.push(`${angle}: ${errorMessage(error)}`);
        continue;
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
      if (media.mediaId) mediaIds[angle] = media.mediaId;
    } catch (error) {
      media = { ...media, status: 'uploaded', error: errorMessage(error) };
      draft = await checkpoint(draft, deps, (current) => withMedia(current, angle, media));
      outcome.mediaErrors.push(`${angle}: ${errorMessage(error)}`);
    }
  }

  // Unconditional: a capture that produced an embedding gets that embedding
  // written, whatever happened to its mugshot. media_id is attached only when
  // the upload actually committed.
  for (const angle of requiredCaptureAngles) {
    const capture = draft.captures[angle];
    if (!capture?.embedding) continue;
    const mediaId = mediaIds[angle];
    try {
      await deps.client.addEmbedding(personId, {
        embedding: Array.from(capture.embedding),
        model_id: capture.modelId ?? 'insightface/w600k_r50@1',
        quality_score: capture.quality?.score ?? 0.8,
        ...(capture.quality?.detScore !== undefined ? { det_score: capture.quality.detScore } : {}),
        ...(capture.quality?.yaw !== undefined ? { yaw: capture.quality.yaw } : {}),
        ...(capture.quality?.pitch !== undefined ? { pitch: capture.quality.pitch } : {}),
        ...(mediaId ? { media_id: mediaId } : {}),
      });
      outcome.embeddings += 1;
    } catch (error) {
      outcome.embeddingErrors.push(`${angle}: ${errorMessage(error)}`);
    }
  }

  for (const caseLink of draft.cases) {
    try {
      await deps.client.linkCase(personId, {
        case_id: caseLink.caseId,
        role: caseLink.role,
      });
      outcome.casesLinked += 1;
    } catch (error) {
      outcome.caseErrors.push(`${caseLink.caseId}: ${errorMessage(error)}`);
    }
  }

  for (const rel of draft.relationships) {
    try {
      await deps.client.createRelationship(personId, {
        target_person_id: rel.targetPersonId,
        edge_type: rel.relationshipType as any,
        evidence_case_ids: rel.evidenceCaseIds,
      });
      outcome.relationshipsCreated += 1;
    } catch (error) {
      outcome.relationshipErrors.push(`${rel.targetPersonId}: ${errorMessage(error)}`);
    }
  }

  const failures = [
    ...outcome.mediaErrors,
    ...outcome.embeddingErrors,
    ...outcome.caseErrors,
    ...outcome.relationshipErrors,
  ];
  outcome.finishedAt = new Date().toISOString();
  draft = await checkpoint(draft, deps, (current) => setSubmission(current, {
    ...current.submission,
    outcome,
  }));

  if (failures.length > 0) {
    return {
      status: 'partial',
      draft,
      message: `Person and media committed with ${failures.length} issue(s): ${failures.join(' · ')}`,
    };
  }

  return { status: 'complete', draft };
}
