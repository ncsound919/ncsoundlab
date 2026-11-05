/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sound Lab mirror of `shared/studio-ui/spec/studio-ui.v1.json` and
 * `StudioPalette` in `shared/studio-ui/.../StudioControls.kt`.
 *
 * NC Studio and NC Phone Beat compile the Compose implementation directly;
 * the web app uses these tokens so knobs, faders, meters and buttons read the
 * same on every surface. `tokens.test.ts` fails if this file drifts from the
 * shared spec.
 */

export const STUDIO = {
  background: '#0A0D14',
  surface: '#131822',
  card: '#1C2230',
  border: '#2B3448',
  inset: '#070A0F',
  raised: '#232B3B',
  textPrimary: '#F0F4F8',
  textSecondary: '#B6B6C6',
  textMuted: '#74839A',
  accent: '#00E5FF',
  lime: '#00E676',
  amber: '#FFB300',
  purple: '#D05CE3',
  danger: '#FF5C7A',
  onAccent: '#061018',
} as const;

export const STUDIO_KNOB = {
  startAngleDeg: 135,
  sweepDeg: 270,
  fullRangeDragPx: 240,
  capRadiusRatio: 0.72,
  tickAnglesDeg: [135, 270, 405],
  defaultSizeDp: 58,
} as const;

export const STUDIO_FADER = {
  trackHeightDp: 150,
  defaultWidthDp: 58,
  capHeightDp: 18,
  tickDivisions: 6,
} as const;

export const STUDIO_METER = {
  minDb: -60,
  maxDb: 0,
  referenceDb: -20,
  dangerDb: -3,
  warningDb: -12,
  peakHoldDecayPerTick: 0.006,
} as const;

/**
 * Overlay365 brand chrome (marketing-studio DESIGN-KIT + brand/tokens).
 * Studio surfaces keep STUDIO.* above; BRAND.* is for app chrome, headers,
 * primary CTAs and cross-app identity. Studio accent #00E5FF and brand
 * cyan-elec #22D3EE are intentionally paired, not merged: meters and
 * control states stay on the studio ramp so mix reads never shift hue.
 */
export const BRAND = {
  midnight: '#05060A',
  graphite: '#0E1117',
  slate: '#141924',
  cyanElec: '#22D3EE',
  gold: '#F5C451',
  goldSoft: '#F7D983',
  softWhite: '#F6F7F9',
  fontDisplay: 'Bricolage Grotesque',
  fontBody: 'Plus Jakarta Sans',
  fontMono: 'JetBrains Mono',
} as const;

export const STUDIO_BUTTON = {
  minHeightDp: 48,
  cornerRadiusDp: 8,
  labelSizeSp: 10,
} as const;

export const STUDIO_WAVEFORM = {
  cornerRadiusDp: 8,
  trimShadeOpacity: 0.5,
  gridDivisions: 8,
} as const;

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
