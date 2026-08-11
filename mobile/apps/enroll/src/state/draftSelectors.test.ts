import { describe, expect, it } from 'vitest';

import { createDraft } from '../domain/draft';
import { selectDraftMap } from './draftSelectors';

describe('selectDraftMap', () => {
  it('returns the same snapshot reference between store writes', () => {
    const drafts = { one: createDraft('one') };
    const state = { drafts };

    expect(selectDraftMap(state)).toBe(drafts);
    expect(selectDraftMap(state)).toBe(selectDraftMap(state));
  });
});
