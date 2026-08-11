/**
 * Cold-start pre-warm.
 *
 * Render's free tier spins down after 15 minutes idle and the next request
 * waits ~50 s (docs/10 §5). The app fires this at launch, before the officer
 * has typed anything, so the instance is warm by the time they reach the
 * camera.
 *
 * `onProgress` exists because the second half of that mitigation is honest UI:
 * a spinner says "something is wrong", a determinate bar calibrated to ~50 s
 * says "this is expected and will finish". Same wait, entirely different
 * perception. The fraction is deliberately capped below 1 until the request
 * actually returns — a bar parked at 100% is a spinner with extra steps.
 *
 * `/healthz` is used rather than `/readyz` because it does not touch the
 * database: waking Neon on every launch turns a free liveness check into a cost.
 * No device key is required, so this runs before a client exists.
 */

import { PerigeeApiError } from './errors';
import type { FetchLike } from './client';
import type { HealthResponse } from './types';

/** Observed Render free-tier cold start. Calibrates the progress bar. */
export const COLD_START_ESTIMATE_MS = 50_000;

/** Past this, show the `SYSTEM WAKING` state instead of ordinary loading. */
export const WAKING_THRESHOLD_MS = 3_000;

const DEFAULT_TOTAL_TIMEOUT_MS = 75_000;
const DEFAULT_PROGRESS_INTERVAL_MS = 250;
const ATTEMPT_TIMEOUT_MS = 12_000;
const RETRY_DELAY_MS = 1_500;

export interface PrewarmProgress {
  elapsedMs: number;
  /** 0–0.99 while waiting, exactly 1 once the instance answered. */
  fraction: number;
  /** 1-based. A spinning-up instance 502s from the edge before it answers. */
  attempt: number;
  /** Elapsed has passed `WAKING_THRESHOLD_MS`. Render `SYSTEM WAKING`. */
  waking: boolean;
}

export interface PrewarmOptions {
  /** Origin only — `https://perigee-core.onrender.com`. */
  baseUrl: string;
  fetch?: FetchLike;
  onProgress?: (progress: PrewarmProgress) => void;
  progressIntervalMs?: number;
  coldStartEstimateMs?: number;
  /** Give up after this. Default 75 s. */
  timeoutMs?: number;
}

export interface PrewarmResult {
  ok: boolean;
  elapsedMs: number;
  attempts: number;
  /**
   * The instance was asleep. True when the first attempt did not answer — a
   * spinning-up Render service 502s from the edge — or when the wait passed
   * `WAKING_THRESHOLD_MS`.
   */
  coldStart: boolean;
  health: HealthResponse | null;
  error: PerigeeApiError | null;
}

function resolveFetch(custom: FetchLike | undefined): FetchLike {
  if (custom) return custom;
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('prewarm() requires a global fetch, or an explicit `fetch` option');
  }
  return globalThis.fetch.bind(globalThis) as FetchLike;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function prewarm(options: PrewarmOptions): Promise<PrewarmResult> {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const doFetch = resolveFetch(options.fetch);
  const totalTimeoutMs = options.timeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
  const estimateMs = options.coldStartEstimateMs ?? COLD_START_ESTIMATE_MS;
  const onProgress = options.onProgress;

  const started = Date.now();
  const elapsed = () => Date.now() - started;

  let attempts = 0;

  const report = (fraction: number) => {
    if (!onProgress) return;
    const ms = elapsed();
    onProgress({
      elapsedMs: ms,
      fraction,
      attempt: Math.max(attempts, 1),
      waking: ms >= WAKING_THRESHOLD_MS,
    });
  };

  const ticker = onProgress
    ? setInterval(
        () => report(Math.min(elapsed() / estimateMs, 0.99)),
        options.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS,
      )
    : undefined;

  // The interval is cleared by the outer `finally`, which runs before any
  // further tick can fire.
  const finish = (result: PrewarmResult): PrewarmResult => {
    report(result.ok ? 1 : Math.min(elapsed() / estimateMs, 0.99));
    return result;
  };

  let lastError: PerigeeApiError | null = null;

  try {
    while (elapsed() < totalTimeoutMs) {
      attempts += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

      try {
        const response = await doFetch(`${baseUrl}/healthz`, {
          method: 'GET',
          signal: controller.signal,
        });

        if (response.ok) {
          const health = (await response.json()) as HealthResponse;
          return finish({
            ok: true,
            elapsedMs: elapsed(),
            attempts,
            coldStart: attempts > 1 || elapsed() >= WAKING_THRESHOLD_MS,
            health,
            error: null,
          });
        }

        lastError = new PerigeeApiError({
          code: 'NETWORK_ERROR',
          message: `/healthz returned HTTP ${response.status}`,
          httpStatus: response.status,
        });
      } catch (cause) {
        lastError = new PerigeeApiError({
          code: controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
          message: cause instanceof Error ? cause.message : String(cause),
          httpStatus: 0,
        });
      } finally {
        clearTimeout(timer);
      }

      // No point sleeping into a deadline that has already gone.
      if (elapsed() + RETRY_DELAY_MS >= totalTimeoutMs) break;
      await delay(RETRY_DELAY_MS);
    }

    return finish({
      ok: false,
      elapsedMs: elapsed(),
      attempts,
      coldStart: true,
      health: null,
      error:
        lastError ??
        new PerigeeApiError({
          code: 'TIMEOUT',
          message: `/healthz did not answer within ${totalTimeoutMs} ms`,
          httpStatus: 0,
        }),
    });
  } finally {
    if (ticker !== undefined) clearInterval(ticker);
  }
}
