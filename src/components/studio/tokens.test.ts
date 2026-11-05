/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Parity guard: the desktop mirror must stay byte-for-byte equal to the
 * shared control spec that NC Studio and NC Phone Beat compile from.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BRAND,
  STUDIO,
  STUDIO_BUTTON,
  STUDIO_FADER,
  STUDIO_KNOB,
  STUDIO_METER,
  STUDIO_WAVEFORM,
  dbToFraction,
  levelToDb,
  meterColorForDb,
} from './tokens';

// Vitest runs with the app directory as cwd; the spec lives at the repo root.
const specPath = resolve(process.cwd(), '..', 'shared', 'studio-ui', 'spec', 'studio-ui.v1.json');
const spec = JSON.parse(readFileSync(specPath, 'utf8')) as Record<string, Record<string, unknown>>;

describe('shared studio control spec parity', () => {
  it('mirrors the palette exactly', () => {
    expect(STUDIO).toEqual(spec.palette);
  });

  it.each([
    ['knob', STUDIO_KNOB],
    ['fader', STUDIO_FADER],
    ['meter', STUDIO_METER],
    ['button', STUDIO_BUTTON],
    ['waveform', STUDIO_WAVEFORM],
  ])('mirrors the %s geometry', (section, tokens) => {
    expect(tokens).toEqual(spec[section]);
  });

  it('maps levels onto the shared -60..0 dB meter scale', () => {
    expect(levelToDb(0)).toBe(-60);
    expect(levelToDb(1)).toBe(0);
    expect(levelToDb(0.5)).toBeCloseTo(-6.02, 1);
    expect(dbToFraction(-60)).toBe(0);
    expect(dbToFraction(0)).toBe(1);
    expect(dbToFraction(-30)).toBeCloseTo(0.5, 5);
  });

  it('mirrors the Overlay365 brand chrome', () => {
    expect(BRAND).toEqual(spec.brand);
  });

  it('uses the Pro Tools zone colours', () => {
    expect(meterColorForDb(-24)).toBe(STUDIO.lime);
    expect(meterColorForDb(-13)).toBe(STUDIO.lime);
    expect(meterColorForDb(-12)).toBe(STUDIO.amber);
    expect(meterColorForDb(-4)).toBe(STUDIO.amber);
    expect(meterColorForDb(-3)).toBe(STUDIO.danger);
  });
});
