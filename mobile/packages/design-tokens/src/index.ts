export const palette = {
  ink: '#0A0A0A',
  paper: '#FFFEF0',
  void: '#0B0B10',
  slab: '#16161F',
  bone: '#E8E6D9',
  signal: '#FFE600',
  alert: '#FF3EA5',
  data: '#00C2CB',
  clear: '#00C853',
  warn: '#FF6B00',
} as const;

export const structure = {
  borderWidth: 3,
  shadowOffset: 5,
  radius: 0,
} as const;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
  24: 96,
} as const;

export const touchTargets = {
  primary: 64,
  secondary: 56,
  icon: 48,
  candidate: 96,
} as const;

export const type = {
  display: 'Archivo',
  data: 'MartianMono',
  body: 'PublicSans',
} as const;

export const typeScale = {
  hero: { fontSize: 56, lineHeight: 52, fontWeight: '900' as const, letterSpacing: -1.5 },
  h1: { fontSize: 34, lineHeight: 34, fontWeight: '900' as const, letterSpacing: -0.8 },
  h2: { fontSize: 24, lineHeight: 26, fontWeight: '800' as const, letterSpacing: -0.4 },
  label: { fontSize: 12, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 1.6 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  score: { fontSize: 44, lineHeight: 44, fontWeight: '700' as const },
  mono: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
} as const;

export const motion = {
  pressMs: 100,
  routeMs: 200,
  candidateStaggerMs: 60,
  stampMs: 120,
} as const;

export const statusLabels = {
  signal: 'ACTION REQUIRED',
  alert: 'STRONG / ALERT',
  data: 'REVIEW / INFORMATION',
  clear: 'CLEAR / COMPLETE',
  warn: 'WEAK / DEGRADED',
  neutral: 'NOT TESTED',
} as const;

export type Tone = keyof typeof statusLabels;
