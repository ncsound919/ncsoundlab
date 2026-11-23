/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sound Lab mirror of `shared/studio-ui/spec/studio-ui.v2.json` (Overlay UI
 * Protocol) and `StudioPalette` in `shared/studio-ui/.../StudioControls.kt`.
 *
 * NC Studio and NC Phone Beat compile the Compose implementation directly;
 * the web app uses these tokens so knobs, faders, meters and buttons read the
 * same on every surface. `tokens.test.ts` fails if this file drifts from the
 * shared spec.
 */

export const STUDIO = {
  background: '#08080A',
  surface: '#0E0E11',
  card: '#141417',
  border: '#26262C',
  inset: '#0A0A0C',
  raised: '#1A1A1F',
  control: '#202026',
  textPrimary: '#FBF9F5',
  textSecondary: '#F1EEE7',
  textMuted: '#8B867D',
  textBody: '#B5B0A6',
  textDim: '#63605A',
  accent: '#FF8A00',
  accentHot: '#FFC98A',
  accentDim: 'rgba(255,138,0,0.14)',
  accentLine: 'rgba(255,138,0,0.34)',
  lime: '#55D18B',
  amber: '#FF8A00',
  purple: '#B98CFF',
  danger: '#FF5A4A',
  gr: '#E0567A',
  mod: '#35D0D8',
  lcd: '#FFB347',
  lcdBg: '#120C05',
  onAccent: '#1A0D00',
} as const;

export const STUDIO_KNOB = {
  startAngleDeg: 135,
  sweepDeg: 270,
  fullRangeDragPx: 240,
  capRadiusRatio: 0.72,
  tickAnglesDeg: [135, 270, 405],
  defaultSizeDp: 54,
  dialLadderDp: { xs: 34, sm: 42, md: 54, lg: 68, xl: 82 },
  dialCompactDp: { xs: 28, sm: 32, md: 40, lg: 48 },
  capGradient: ['#2D2D34', '#1B1B20', '#101014'],
  pointerTip: '#FFD9A8',
  fineDragFactor: 0.12,
  gainSnapDb: 0.3,
} as const;

export const STUDIO_FADER = {
  trackHeightDp: 150,
  defaultWidthDp: 58,
  capHeightDp: 18,
  tickDivisions: 6,
  capGradient: ['#2D2D34', '#101014'],
} as const;

export const STUDIO_METER = {
  minDb: -60,
  maxDb: 0,
  referenceDb: -20,
  dangerDb: -3,
  warningDb: -12,
  peakHoldDecayPerTick: 0.006,
  scaleMarksDb: [0, -12, -24, -48],
  faderFloorDb: -60,
} as const;

/**
 * Overlay365 brand chrome under the Overlay UI Protocol: the near-black warm
 * surface shell and the single amber accent. Studio surfaces keep STUDIO.*
 * above; BRAND.* is for app chrome, headers, primary CTAs and cross-app
 * identity. Amber marks live/selected only — meters keep the semantic ramp
 * (green below -12, amber to -3, red above) so mix reads never shift hue.
 */
export const BRAND = {
  canvas: '#08080A',
  shell: '#0E0E11',
  panel: '#141417',
  raised: '#1A1A1F',
  accent: '#FF8A00',
  accentHot: '#FFC98A',
  accentDim: 'rgba(255,138,0,0.14)',
  accentLine: 'rgba(255,138,0,0.34)',
  mod: '#35D0D8',
  ok: '#55D18B',
  danger: '#FF5A4A',
  gr: '#E0567A',
  fontDisplay: 'Archivo Variable',
  fontBody: 'Archivo Variable',
  fontMono: 'JetBrains Mono',
} as const;

export const STUDIO_BUTTON = {
  minHeightDp: 48,
  cornerRadiusDp: 6,
  labelSizeSp: 10,
} as const;

export const STUDIO_WAVEFORM = {
  cornerRadiusDp: 8,
  trimShadeOpacity: 0.5,
  gridDivisions: 8,
  emptyStateLabel: 'NO SIGNAL',
} as const;

export const STUDIO_TYPE = {
  fontUi: 'Archivo Variable, Archivo, Segoe UI, sans-serif',
  fontMono: 'JetBrains Mono, ui-monospace, Cascadia Mono, monospace',
  labelSizePx: 10,
  valueSizePx: 11,
  microSizePx: 9,
  labelTrackingEm: 0.12,
  typeFloorPx: 9,
  numbersTabular: true,
} as const;

export const STUDIO_MOTION = {
  fastMs: 110,
  medMs: 170,
  ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  pressTranslatePx: 1,
} as const;

export const STUDIO_HIT_TARGET_MIN_PX = 24;
export const STUDIO_RADIUS_DP = { chip: 4, control: 6, cardInner: 8, card: 12 } as const;

/** Shared value formatting: integers stay whole, one decimal otherwise, k above 1000. */
export function formatStudioValue(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  const rounded = Math.round(value * 10) / 10;
  return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
}

/** Map a linear level (0..1) to dB on the shared -60..0 meter scale. */
export function levelToDb(level: number): number {
  if (level <= 1e-6) return STUDIO_METER.minDb;
  const db = 20 * Math.log10(level);
  return Math.min(STUDIO_METER.maxDb, Math.max(STUDIO_METER.minDb, db));
}

/** Meter colour for a dB value: green below -12, amber to -3, red above. */
export function meterColorForDb(db: number, accent: string = STUDIO.lime): string {
  if (db >= STUDIO_METER.dangerDb) return STUDIO.danger;
  if (db >= STUDIO_METER.warningDb) return STUDIO.amber;
  return accent;
}

/** 0..1 position of a dB value on the shared meter scale. */
export function dbToFraction(db: number): number {
  const span = STUDIO_METER.maxDb - STUDIO_METER.minDb;
  return Math.min(1, Math.max(0, (db - STUDIO_METER.minDb) / span));
}
