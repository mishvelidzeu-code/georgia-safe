export const colors = {
  safe: '#15803d',
  caution: '#4ade80',
  risk: '#ef4444',
  // Separate from `caution` (which is the map's safety-zone tone) — used for
  // the Alerts screen's "medium risk" scam severity badge, so it doesn't
  // turn green and read as "safe" now that `caution` is a light green.
  warning: '#f97316',

  background: '#0f172a',
  card: '#1e293b',
  text: '#f8fafc',
  textMuted: '#94a3b8',
  border: '#334155',

  white: '#ffffff',
  black: '#000000',
} as const;

export type ColorKey = keyof typeof colors;
