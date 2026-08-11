import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createDraft, migrateDraft, type EnrollmentDraft } from '../domain/draft';

export interface EnrollActivity {
  id: string;
  title: string;
  detail: string;
  tone: 'clear' | 'data' | 'alert' | 'warn';
  createdAt: string;
}

interface EnrollState {
  operatorId: string;
  apiUrl: string;
  deviceKey: string;
  drafts: Record<string, EnrollmentDraft>;
  activeDraftId: string | null;
  activities: EnrollActivity[];
  setOperator: (operatorId: string) => void;
  setConnection: (apiUrl: string, deviceKey: string) => void;
  startDraft: () => EnrollmentDraft;
  setActiveDraft: (draftId: string | null) => void;
  saveDraft: (draft: EnrollmentDraft) => void;
  discardDraft: (draftId: string) => void;
  addActivity: (activity: EnrollActivity) => void;
}

function localId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useEnrollStore = create<EnrollState>()(persist(
  (set, get) => ({
    operatorId: '',
    apiUrl: 'http://10.0.2.2:8000',
    deviceKey: '',
    drafts: {},
    activeDraftId: null,
    activities: [],
    setOperator: (operatorId) => set({ operatorId: operatorId.trim() }),
    setConnection: (apiUrl, deviceKey) => set({ apiUrl: apiUrl.trim(), deviceKey: deviceKey.trim() }),
    startDraft: () => {
      const draft = createDraft(localId('draft'));
      set((state) => ({ drafts: { ...state.drafts, [draft.draftId]: draft }, activeDraftId: draft.draftId }));
      return draft;
    },
    setActiveDraft: (activeDraftId) => set({ activeDraftId }),
    saveDraft: (draft) => set((state) => ({
      drafts: { ...state.drafts, [draft.draftId]: draft }, activeDraftId: draft.draftId,
    })),
    discardDraft: (draftId) => set((state) => {
      const drafts = { ...state.drafts };
      delete drafts[draftId];
      return { drafts, activeDraftId: state.activeDraftId === draftId ? null : state.activeDraftId };
    }),
    addActivity: (activity) => set((state) => ({
      activities: [activity, ...state.activities].slice(0, 100),
    })),
  }),
  {
    name: 'perigee-enroll-drafts-v1',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (state) => ({
      operatorId: state.operatorId,
      drafts: state.drafts,
      activeDraftId: state.activeDraftId,
      activities: state.activities,
    }),
    merge: (persisted, current) => {
      const saved = persisted as Partial<EnrollState>;
      const migratedDrafts = Object.fromEntries(
        Object.entries(saved.drafts ?? {}).map(([id, draft]) => [id, migrateDraft(draft)]),
      );
      return { ...current, ...saved, drafts: migratedDrafts };
    },
  },
));

export function activeDraft(state: Pick<EnrollState, 'activeDraftId' | 'drafts'>): EnrollmentDraft | null {
  return state.activeDraftId ? state.drafts[state.activeDraftId] ?? null : null;
}
