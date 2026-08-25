import type { SearchResponse } from '@perigee/api-client';
import type { MediaRecord } from '@perigee/camera';
import { create } from 'zustand';

import type { ProbeFixtureBundle } from '../domain/fixtures';
import type { ShiftSession } from '../domain/session';
import type { ProcessedProbe } from '../services/processProbe';

export interface ActivityEntry {
  id: string;
  title: string;
  detail: string;
  tone: 'clear' | 'data' | 'alert' | 'warn';
  createdAt: string;
}

interface FieldState {
  session: ShiftSession | null;
  apiUrl: string;
  deviceKey: string;
  media: MediaRecord | null;
  probe: ProcessedProbe | null;
  fixtureBundle: ProbeFixtureBundle | null;
  search: SearchResponse | null;
  activities: ActivityEntry[];
  setSession: (session: ShiftSession | null) => void;
  setConnection: (apiUrl: string, deviceKey: string) => void;
  setMedia: (media: MediaRecord | null) => void;
  setProbe: (probe: ProcessedProbe | null) => void;
  setFixtureBundle: (bundle: ProbeFixtureBundle | null) => void;
  setSearch: (search: SearchResponse | null) => void;
  addActivity: (entry: ActivityEntry) => void;
  resetScreening: () => void;
}

export const useFieldStore = create<FieldState>((set) => ({
  session: null,
  apiUrl: 'http://10.0.2.2:8000',
  deviceKey: '',
  media: null,
  probe: null,
  fixtureBundle: null,
  search: null,
  activities: [],
  setSession: (session) => set({ session }),
  setConnection: (apiUrl, deviceKey) => set({ apiUrl: apiUrl.trim(), deviceKey: deviceKey.trim() }),
  setMedia: (media) => set({ media }),
  setProbe: (probe) => set({ probe }),
  setFixtureBundle: (fixtureBundle) => set({ fixtureBundle }),
  setSearch: (search) => set({ search }),
  addActivity: (entry) => set((state) => ({ activities: [entry, ...state.activities].slice(0, 50) })),
  resetScreening: () => set({ media: null, probe: null, search: null }),
}));
