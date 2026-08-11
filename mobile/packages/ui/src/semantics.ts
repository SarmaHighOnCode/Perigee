import {
  palette,
  statusLabels,
  touchTargets,
  type Tone,
} from '@perigee/design-tokens';

const toneColors: Record<Tone, string> = {
  signal: palette.signal,
  alert: palette.alert,
  data: palette.data,
  clear: palette.clear,
  warn: palette.warn,
  neutral: palette.paper,
};

export function getTonePresentation(tone: Tone) {
  return {
    backgroundColor: toneColors[tone],
    label: statusLabels[tone],
  };
}

export function minimumButtonHeight(size: 'primary' | 'secondary') {
  return touchTargets[size];
}

export const contactActions = {
  repository: 'https://github.com/SarmaHighOnCode/Perigee',
  issues: 'https://github.com/SarmaHighOnCode/Perigee/issues/new',
} as const;
