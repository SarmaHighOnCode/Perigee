import type { MediaPresigned, PersonCreate } from '@perigee/api-client';

export const DRAFT_SCHEMA_VERSION = 1;
export const requiredCaptureAngles = ['frontal', 'left', 'right'] as const;

export type RequiredCaptureAngle = (typeof requiredCaptureAngles)[number];
export type CaseRole = 'accused' | 'convicted' | 'suspect' | 'victim' | 'witness' | 'complainant';

export interface EnrollmentCapture {
  angle: RequiredCaptureAngle;
  uri: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  mimeType: string | null;
  source: 'camera' | 'gallery';
  acquiredAt: string;
  sha256?: string;
  exifStripped?: boolean;
}

export interface CaseLinkDraft {
  caseId: string;
  firNumber?: string;
  role: CaseRole;
}

export interface RelationshipDraft {
  targetPersonId: string;
  relationshipType: string;
  evidenceCaseIds: string[];
}

export type PersonSubmissionStatus = 'idle' | 'creating' | 'created' | 'unknown' | 'failed';
export type MediaSubmissionStatus = 'idle' | 'presigning' | 'presigned' | 'uploaded' | 'committed' | 'unknown' | 'failed';

export interface MediaSubmissionCheckpoint {
  status: MediaSubmissionStatus;
  mediaId?: string;
  reservation?: MediaPresigned;
  error?: string;
}

export interface SubmissionState {
  person: { status: PersonSubmissionStatus; personId?: string; error?: string };
  media: Partial<Record<RequiredCaptureAngle, MediaSubmissionCheckpoint>>;
  embedding: { status: 'deferred' };
}

export interface EnrollmentDraft {
  schemaVersion: typeof DRAFT_SCHEMA_VERSION;
  draftId: string;
  createdAt: string;
  updatedAt: string;
  identity: PersonCreate;
  captures: Partial<Record<RequiredCaptureAngle, EnrollmentCapture>>;
  cases: CaseLinkDraft[];
  relationships: RelationshipDraft[];
  submission: SubmissionState;
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptySubmission(): SubmissionState {
  return { person: { status: 'idle' }, media: {}, embedding: { status: 'deferred' } };
}

export function createDraft(draftId: string, at = nowIso()): EnrollmentDraft {
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    draftId,
    createdAt: at,
    updatedAt: at,
    identity: { full_name: '', aliases: [] },
    captures: {},
    cases: [],
    relationships: [],
    submission: emptySubmission(),
  };
}

export function setIdentity(
  draft: EnrollmentDraft,
  identity: Partial<PersonCreate> & Pick<PersonCreate, 'full_name'>,
  at = nowIso(),
): EnrollmentDraft {
  return {
    ...draft,
    identity: { ...draft.identity, ...identity, aliases: identity.aliases ?? draft.identity.aliases ?? [] },
    updatedAt: at,
  };
}

export function setCapture(
  draft: EnrollmentDraft,
  capture: EnrollmentCapture,
  at = nowIso(),
): EnrollmentDraft {
  return {
    ...draft,
    captures: { ...draft.captures, [capture.angle]: capture },
    submission: {
      ...draft.submission,
      media: { ...draft.submission.media, [capture.angle]: { status: 'idle' } },
    },
    updatedAt: at,
  };
}

export function addCaseLink(draft: EnrollmentDraft, link: CaseLinkDraft, at = nowIso()): EnrollmentDraft {
  return {
    ...draft,
    cases: [...draft.cases.filter((item) => item.caseId !== link.caseId), link],
    updatedAt: at,
  };
}

export function addRelationship(
  draft: EnrollmentDraft,
  relationship: RelationshipDraft,
  at = nowIso(),
): EnrollmentDraft {
  return {
    ...draft,
    relationships: [
      ...draft.relationships.filter((item) =>
        item.targetPersonId !== relationship.targetPersonId || item.relationshipType !== relationship.relationshipType),
      relationship,
    ],
    updatedAt: at,
  };
}

export function setSubmission(
  draft: EnrollmentDraft,
  submission: SubmissionState,
  at = nowIso(),
): EnrollmentDraft {
  return { ...draft, submission, updatedAt: at };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function migrateDraft(value: unknown): EnrollmentDraft {
  if (!isRecord(value)) throw new Error('Draft is not an object');
  if (typeof value.schemaVersion === 'number' && value.schemaVersion > DRAFT_SCHEMA_VERSION) {
    throw new Error('Draft was created by a newer version of Perigee Enroll');
  }

  const draftId = typeof value.draftId === 'string' ? value.draftId : 'legacy-draft';
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : nowIso();
  const base = createDraft(draftId, createdAt);
  const identity = isRecord(value.identity) && typeof value.identity.full_name === 'string'
    ? { ...base.identity, ...value.identity, full_name: value.identity.full_name } as PersonCreate
    : base.identity;

  return {
    ...base,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : createdAt,
    identity,
    captures: isRecord(value.captures) ? value.captures as EnrollmentDraft['captures'] : {},
    cases: Array.isArray(value.cases) ? value.cases as CaseLinkDraft[] : [],
    relationships: Array.isArray(value.relationships) ? value.relationships as RelationshipDraft[] : [],
    submission: isRecord(value.submission) ? value.submission as unknown as SubmissionState : emptySubmission(),
  };
}
