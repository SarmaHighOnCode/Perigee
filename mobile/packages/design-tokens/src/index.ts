export * from './bands';
export * from './contrast';
export * from './motion';
export * from './palette';
export * from './space';
export * from './structure';
export * from './type';

import { fonts, scale } from './type';
import { touch } from './space';

export const touchTargets = touch;
export const type = fonts;
export const typeScale = {
  hero: { fontSize: scale.hero.size, lineHeight: scale.hero.lh, fontWeight: scale.hero.weight, letterSpacing: scale.hero.tracking },
  h1: { fontSize: scale.h1.size, lineHeight: scale.h1.lh, fontWeight: scale.h1.weight, letterSpacing: scale.h1.tracking },
  h2: { fontSize: scale.h2.size, lineHeight: scale.h2.lh, fontWeight: scale.h2.weight, letterSpacing: scale.h2.tracking },
  label: { fontSize: scale.label.size, lineHeight: scale.label.lh, fontWeight: scale.label.weight, letterSpacing: scale.label.tracking },
  body: { fontSize: scale.body.size, lineHeight: scale.body.lh, fontWeight: scale.body.weight },
  bodySmall: { fontSize: scale.bodySm.size, lineHeight: scale.bodySm.lh, fontWeight: scale.bodySm.weight },
  score: { fontSize: scale.score.size, lineHeight: scale.score.lh, fontWeight: scale.score.weight },
  mono: { fontSize: scale.mono.size, lineHeight: scale.mono.lh, fontWeight: scale.mono.weight },
} as const;
export const statusLabels = {
  signal: 'ACTION REQUIRED', alert: 'STRONG / ALERT', data: 'REVIEW / INFORMATION',
  clear: 'CLEAR / COMPLETE', warn: 'WEAK / DEGRADED', neutral: 'NOT TESTED',
} as const;
