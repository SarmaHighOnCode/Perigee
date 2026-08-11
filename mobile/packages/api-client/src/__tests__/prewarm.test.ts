import { describe, expect, it } from 'vitest';

import type { FetchLike } from '../client';
import { type PrewarmProgress, prewarm } from '../prewarm';

const HEALTHY = () =>
  new Response(JSON.stringify({ status: 'ok', dataset_mode: 'synthetic' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('prewarm', () => {
  it('hits /healthz and reports elapsed time', async () => {
    const urls: string[] = [];
    const fetchImpl: FetchLike = (url) => {
      urls.push(url);
      return Promise.resolve(HEALTHY());
    };

    const result = await prewarm({ baseUrl: 'https://perigee-core.example/', fetch: fetchImpl });

    expect(urls).toEqual(['https://perigee-core.example/healthz']);
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.health).toEqual({ status: 'ok', dataset_mode: 'synthetic' });
    expect(result.error).toBeNull();
  });

  it('ends at fraction 1 so the bar completes rather than sticking', async () => {
    const progress: PrewarmProgress[] = [];

    const result = await prewarm({
      baseUrl: 'https://perigee-core.example',
      fetch: () => Promise.resolve(HEALTHY()),
      onProgress: (p) => progress.push(p),
    });

    expect(result.ok).toBe(true);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[progress.length - 1]!.fraction).toBe(1);
  });

  it('keeps trying while the instance is still spinning up', async () => {
    let attempt = 0;
    const fetchImpl: FetchLike = () => {
      attempt += 1;
      return Promise.resolve(attempt === 1 ? new Response('', { status: 502 }) : HEALTHY());
    };

    const result = await prewarm({
      baseUrl: 'https://perigee-core.example',
      fetch: fetchImpl,
      timeoutMs: 10_000,
    });

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    // A wait long enough to have shown SYSTEM WAKING is reported as a cold start.
    expect(result.coldStart).toBe(true);
  });

  it('reports the last failure instead of throwing, so launch can continue', async () => {
    const result = await prewarm({
      baseUrl: 'https://perigee-core.example',
      fetch: () => Promise.reject(new TypeError('Network request failed')),
      timeoutMs: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.health).toBeNull();
    expect(result.error?.code).toBe('NETWORK_ERROR');
  });
});
