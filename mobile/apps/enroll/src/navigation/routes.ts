export const sourceRepositoryUrl = 'https://github.com/SarmaHighOnCode/Perigee';

export const enrollRoutes = [
  '/',
  '/operator',
  '/(tabs)/roster',
  '/(tabs)/drafts',
  '/(tabs)/activity',
  '/(tabs)/more',
  '/enroll/identity',
  '/enroll/capture-front',
  '/enroll/capture-left',
  '/enroll/capture-right',
  '/enroll/cases',
  '/enroll/relationships',
  '/enroll/review',
  '/enroll/receipt',
  '/person/[id]',
  '/settings/connection',
  '/settings/uploads',
  '/settings/diagnostics',
  '/settings/about',
] as const;

export const wizardSteps = [
  { key: 'identity', label: 'Identity', route: '/enroll/identity', requiredCapture: false },
  { key: 'frontal', label: 'Front', route: '/enroll/capture-front', requiredCapture: true },
  { key: 'left', label: 'Left', route: '/enroll/capture-left', requiredCapture: true },
  { key: 'right', label: 'Right', route: '/enroll/capture-right', requiredCapture: true },
  { key: 'cases', label: 'Cases', route: '/enroll/cases', requiredCapture: false },
  { key: 'relationships', label: 'Relationships', route: '/enroll/relationships', requiredCapture: false },
  { key: 'review', label: 'Review', route: '/enroll/review', requiredCapture: false },
] as const;
