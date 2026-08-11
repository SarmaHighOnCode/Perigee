import type { PersonCreate } from '@perigee/api-client';

import {
  requiredCaptureAngles,
  type EnrollmentDraft,
  type RelationshipDraft,
} from './draft';

export function validateIdentity(identity: PersonCreate): string[] {
  const issues: string[] = [];
  const fullName = identity.full_name.trim();
  if (!fullName) issues.push('Full name is required');
  if (fullName.length > 200) issues.push('Full name must be 200 characters or fewer');
  if ((identity.aliases?.length ?? 0) > 20) issues.push('No more than 20 aliases are allowed');
  return issues;
}

export function requiredAnglesComplete(captures: EnrollmentDraft['captures']): boolean {
  return requiredCaptureAngles.every((angle) => {
    const capture = captures[angle];
    return Boolean(capture?.uri && (capture.width ?? 0) > 0 && (capture.height ?? 0) > 0);
  });
}

export function canSubmitRelationship(relationship: RelationshipDraft): boolean {
  return Boolean(
    relationship.targetPersonId.trim() &&
    relationship.relationshipType.trim() &&
    relationship.evidenceCaseIds.length > 0,
  );
}

export function reviewReadiness(draft: EnrollmentDraft): { ready: boolean; issues: string[] } {
  const issues = validateIdentity(draft.identity);
  if (!requiredAnglesComplete(draft.captures)) {
    issues.push('Frontal, left and right captures are required');
  }
  if (draft.relationships.some((relationship) => !canSubmitRelationship(relationship))) {
    issues.push('Every relationship must reference at least one evidence case');
  }
  return { ready: issues.length === 0, issues };
}
