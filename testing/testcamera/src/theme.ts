export const palette = {
  ink: '#0A0A0A',
  paper: '#FFFEF0',
  signal: '#FFE600',
  data: '#00C2CB',
  clear: '#00C853',
  alert: '#FF3EA5',
  warn: '#FF6B00',
  white: '#FFFFFF',
} as const;

export const structure = {
  borderWidth: 3,
  shadowOffset: 5,
} as const;

export type Tone = keyof Pick<
  typeof palette,
  'paper' | 'signal' | 'data' | 'clear' | 'alert' | 'warn' | 'ink'
>;
