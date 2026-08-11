import {
  palette,
  statusLabels,
  touchTargets,
  type Tone,
} from '@perigee/design-tokens';

export function getTonePresentation(tone: Tone | 'neutral') {
  return {
    backgroundColor: tone === 'neutral' ? palette.paper : palette[tone],
    label: tone in statusLabels ? statusLabels[tone as keyof typeof statusLabels] : tone.toUpperCase(),
  };
}

export function minimumButtonHeight(size: 'primary' | 'secondary') {
  return touchTargets[size];
}

export const contactActions = {
  repository: 'https://github.com/SarmaHighOnCode/Perigee',
  issues: 'https://github.com/SarmaHighOnCode/Perigee/issues/new',
} as const;
