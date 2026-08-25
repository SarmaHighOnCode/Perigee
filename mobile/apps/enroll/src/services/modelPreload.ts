import { modelBaseUrl, prepareFaceModels, type ModelProgress } from '@perigee/face';
import { create } from 'zustand';

export type ModelPreloadStatus = 'idle' | 'preparing' | 'ready' | 'failed';
export type ModelKey = 'det_10g' | 'w600k_r50';

interface ModelPreloadState {
  status: ModelPreloadStatus;
  progress: Partial<Record<ModelKey, ModelProgress>>;
  error: string | null;
  start: () => void;
}

export const useModelPreload = create<ModelPreloadState>((set, get) => ({
  status: 'idle',
  progress: {},
  error: null,
  start: () => {
    const { status } = get();
    if (status === 'preparing' || status === 'ready') return;
    set({ status: 'preparing', error: null, progress: {} });
    void prepareFaceModels(modelBaseUrl(), (progress) => {
      set((state) => ({ progress: { ...state.progress, [progress.key]: progress } }));
    })
      .then(() => set({ status: 'ready' }))
      .catch((error) => set({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      }));
  },
}));

function percent(progress: ModelProgress | undefined): number | null {
  if (!progress || progress.totalBytes === 0) return null;
  return Math.min(100, Math.round((progress.receivedBytes / progress.totalBytes) * 100));
}

export function modelPreloadSummary(progress: ModelPreloadState['progress']): string {
  const detector = percent(progress.det_10g);
  const recogniser = percent(progress.w600k_r50);
  if (recogniser !== null) return `recogniser ${recogniser}%`;
  if (detector !== null) return `detector ${detector}%`;
  return 'preparing';
}
