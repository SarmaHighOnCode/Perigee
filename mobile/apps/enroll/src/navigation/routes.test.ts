import { describe, expect, it } from 'vitest';

import { enrollRoutes, sourceRepositoryUrl, wizardSteps } from './routes';

describe('Perigee Enroll navigation contract', () => {
  it('exposes the approved operator, tab, wizard, person and settings routes', () => {
    expect(enrollRoutes).toEqual(expect.arrayContaining([
      '/operator', '/(tabs)/roster', '/(tabs)/drafts', '/(tabs)/activity', '/(tabs)/more',
      '/enroll/identity', '/enroll/capture-front', '/enroll/capture-left',
      '/enroll/capture-right', '/enroll/cases', '/enroll/relationships',
      '/enroll/review', '/enroll/receipt', '/person/[id]', '/settings/connection',
      '/settings/uploads', '/settings/diagnostics', '/settings/about',
    ]));
  });

  it('keeps the wizard ordered and camera requirements explicit', () => {
    expect(wizardSteps.map((step) => step.key)).toEqual([
      'identity', 'frontal', 'left', 'right', 'cases', 'relationships', 'review',
    ]);
    expect(wizardSteps.filter((step) => step.requiredCapture).map((step) => step.key)).toEqual([
      'frontal', 'left', 'right',
    ]);
  });

  it('links contacts to the actual repository and never advertises name search', () => {
    expect(sourceRepositoryUrl).toBe('https://github.com/SarmaHighOnCode/Perigee');
    expect(JSON.stringify({ enrollRoutes, wizardSteps }).toLowerCase()).not.toContain('name search');
  });
});
