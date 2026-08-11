import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { requiredRouteFiles } from './routes';

const appRoot = `${process.cwd()}/`;

describe('Field route inventory', () => {
  it('contains every task-first route promised by the navigation design', () => {
    const missing = requiredRouteFiles.filter(
      (route) => !existsSync(`${appRoot}${route}`),
    );
    expect(missing).toEqual([]);
  });

  it('keeps results outside the tab shell so mandatory decisions are focused', () => {
    expect(requiredRouteFiles).toContain('app/results/[searchId].tsx');
    expect(requiredRouteFiles).not.toContain('app/(tabs)/results/[searchId].tsx');
  });
});
