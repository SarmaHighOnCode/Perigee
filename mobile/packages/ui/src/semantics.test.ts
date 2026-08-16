import { palette } from '@perigee/design-tokens';
import { describe, expect, it } from 'vitest';

import {
  contactActions,
  getTonePresentation,
  minimumButtonHeight,
} from './semantics';

describe('shared UI semantics', () => {
  it('pairs each tone with visible language', () => {
    // Resolved from the palette, not a copied hex: the point of the assertion
    // is that a tone reaches its colour and its words, not what the colour is.
    expect(getTonePresentation('clear')).toEqual({
      backgroundColor: palette.clear,
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
