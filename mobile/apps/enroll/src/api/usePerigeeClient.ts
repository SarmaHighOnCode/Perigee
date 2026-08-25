import { createPerigeeClient } from '@perigee/api-client';
import { useMemo } from 'react';

import { useEnrollStore } from '../state/enrollStore';

export function usePerigeeClient() {
  const apiUrl = useEnrollStore((state) => state.apiUrl);
  const deviceKey = useEnrollStore((state) => state.deviceKey);
  const operatorId = useEnrollStore((state) => state.operatorId);
  return useMemo(() => createPerigeeClient({
    baseUrl: apiUrl, deviceKey, officerId: operatorId || 'UNATTRIBUTED-ENROLL',
    // Serverless cold starts can exceed the 15 s default on write paths.
    timeoutMs: 30_000,
  }), [apiUrl, deviceKey, operatorId]);
}
