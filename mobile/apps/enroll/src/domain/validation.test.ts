import { describe, expect, it } from 'vitest';

import { createDraft, setCapture, setIdentity } from './draft';
import {
  canSubmitRelationship,
  requiredAnglesComplete,
  reviewReadiness,
  validateIdentity,
} from './validation';

describe('enrollment validation', () => {
  it('requires a meaningful name', () => {
    expect(validateIdentity({ full_name: '   ', aliases: [] })).toContain('Full name is required');
    expect(validateIdentity({ full_name: 'Asha Rao', aliases: [] })).toEqual([]);
  });

  it('requires frontal, left and right captures', () => {
    let draft = setIdentity(createDraft('draft-1'), { full_name: 'Asha Rao' });
    expect(requiredAnglesComplete(draft.captures)).toBe(false);
    for (const angle of ['frontal', 'left', 'right'] as const) {
      draft = setCapture(draft, {
        angle, uri: `file:///${angle}.jpg`, width: 100, height: 100, bytes: 10,
        mimeType: 'image/jpeg', source: 'camera', acquiredAt: 'now',
      });
    }
    expect(requiredAnglesComplete(draft.captures)).toBe(true);
    expect(reviewReadiness(draft)).toEqual({ ready: true, issues: [] });
  });

  it('keeps case role per case and requires evidence for relationships', () => {
    expect(canSubmitRelationship({ targetPersonId: 'person-2', relationshipType: 'associate', evidenceCaseIds: [] })).toBe(false);
    expect(canSubmitRelationship({ targetPersonId: 'person-2', relationshipType: 'associate', evidenceCaseIds: ['case-1'] })).toBe(true);
  });
});
