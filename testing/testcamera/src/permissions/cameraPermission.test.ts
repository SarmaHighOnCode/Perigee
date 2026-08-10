import { describe, expect, it } from 'vitest';

import { cameraPermissionCheck, hasCameraPermission } from './cameraPermission';

describe('camera permission status', () => {
  it('treats the VisionCamera 5 granted status as authorized', () => {
    expect(hasCameraPermission('granted')).toBe(true);
    expect(hasCameraPermission('authorized')).toBe(true);
    expect(cameraPermissionCheck('granted')).toBe('PASS');
    expect(cameraPermissionCheck('authorized')).toBe('PASS');
  });

  it('keeps undecided permission waiting and rejects denied permission', () => {
    expect(cameraPermissionCheck('not-determined')).toBe('NOT_TESTED');
    expect(cameraPermissionCheck('denied')).toBe('FAIL');
  });
});
