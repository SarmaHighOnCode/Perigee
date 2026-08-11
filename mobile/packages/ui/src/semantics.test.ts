import { describe, expect, it } from 'vitest';

import {
  contactActions,
  getTonePresentation,
  minimumButtonHeight,
} from './semantics';

describe('shared UI semantics', () => {
  it('pairs each tone with visible language', () => {
    expect(getTonePresentation('clear')).toEqual({
      backgroundColor: '#00C853',
      label: 'CLEAR / COMPLETE',
    });
    expect(getTonePresentation('alert').label).toBe('STRONG / ALERT');
  });

  it('keeps primary and secondary actions above field target minimums', () => {
    expect(minimumButtonHeight('primary')).toBe(64);
    expect(minimumButtonHeight('secondary')).toBe(56);
  });

  it('uses the repository for contact and issue actions', () => {
    expect(contactActions.repository).toBe(
      'https://github.com/SarmaHighOnCode/Perigee',
    );
    expect(contactActions.issues).toBe(
      'https://github.com/SarmaHighOnCode/Perigee/issues/new',
    );
  });
});
