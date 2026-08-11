import { createPerigeeClient } from '@perigee/api-client';
import { useMemo } from 'react';

import { useFieldStore } from '../state/fieldStore';

export function usePerigeeClient() {
  const apiUrl = useFieldStore((state) => state.apiUrl);
  const deviceKey = useFieldStore((state) => state.deviceKey);
  const officerId = useFieldStore((state) => state.session?.officerId ?? 'UNSET-OFFICER');
  return useMemo(
    () => createPerigeeClient({ baseUrl: apiUrl, deviceKey, officerId }),
    [apiUrl, deviceKey, officerId],
  );
}
