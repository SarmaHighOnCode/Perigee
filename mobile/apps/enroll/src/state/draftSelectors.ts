import type { EnrollmentDraft } from '../domain/draft';

export interface DraftStateSlice {
  drafts: Record<string, EnrollmentDraft>;
}

/**
 * Select the persisted record itself so Zustand/React receives a stable
 * snapshot between writes. Derived arrays are intentionally created after
 * selection in the component rather than inside the selector.
 */
export function selectDraftMap(state: DraftStateSlice): Record<string, EnrollmentDraft> {
  return state.drafts;
}
