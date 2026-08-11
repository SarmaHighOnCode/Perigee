import { describe, expect, it } from 'vitest';

import {
  DRAFT_SCHEMA_VERSION,
  createDraft,
  migrateDraft,
  setCapture,
  setIdentity,
} from './draft';

describe('enrollment draft', () => {
  it('creates a stable versioned draft and updates identity immutably', () => {
    const draft = createDraft('draft-1', '2026-08-11T00:00:00.000Z');
    const updated = setIdentity(draft, { full_name: 'Asha Rao', aliases: ['A. Rao'] }, '2026-08-11T00:01:00.000Z');

    expect(draft.schemaVersion).toBe(DRAFT_SCHEMA_VERSION);
    expect(draft.identity.full_name).toBe('');
    expect(updated.identity.full_name).toBe('Asha Rao');
    expect(updated.draftId).toBe('draft-1');
  });

  it('replaces only the selected angle and never stores image bytes', () => {
    const draft = createDraft('draft-1');
    const first = setCapture(draft, {
      angle: 'frontal', uri: 'file:///front-a.jpg', width: 3024, height: 4032,
      bytes: 2_100_000, mimeType: 'image/jpeg', source: 'camera', acquiredAt: 'now',
    });
    const replaced = setCapture(first, {
      angle: 'frontal', uri: 'file:///front-b.jpg', width: 3024, height: 4032,
      bytes: 2_000_000, mimeType: 'image/jpeg', source: 'gallery', acquiredAt: 'later',
    });

    expect(replaced.captures.frontal?.uri).toBe('file:///front-b.jpg');
    expect(JSON.stringify(replaced)).not.toContain('base64');
  });

  it('migrates an older safe shape and rejects future schema versions', () => {
    const migrated = migrateDraft({ draftId: 'legacy', identity: { full_name: 'Legacy Person' } });
    expect(migrated.schemaVersion).toBe(DRAFT_SCHEMA_VERSION);
    expect(migrated.identity.full_name).toBe('Legacy Person');
    expect(() => migrateDraft({ schemaVersion: 999, draftId: 'future' })).toThrow(/newer/);
  });
});
