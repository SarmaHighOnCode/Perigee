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
