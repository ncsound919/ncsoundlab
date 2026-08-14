/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/lib/soundPresets.ts` — the producer sound presets.
 * Verifies preset data integrity and that `apply()` produces valid, safe,
 * non-mutating SoundLayers.
 */

import { describe, expect, it } from 'vitest';
import { PRODUCER_SOUND_PRESETS } from './soundPresets';
import { DEFAULT_SYNTH, DEFAULT_FX, DEFAULT_ENVELOPE } from '../types';

const baseLayer = (): any => ({
  id: 'layer-1',
  name: 'Test Layer',
  type: 'synth',
  enabled: true,
  gain: 0.8,
  pan: 0,
  pitch: 0,
  envelope: { ...DEFAULT_ENVELOPE },
  fx: { ...DEFAULT_FX },
  synth: { ...DEFAULT_SYNTH },
});

describe('PRODUCER_SOUND_PRESETS', () => {
  it('is a non-empty list of well-formed presets', () => {
    expect(PRODUCER_SOUND_PRESETS.length).toBeGreaterThan(0);
    for (const p of PRODUCER_SOUND_PRESETS) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.name).toBe('string');
      expect(typeof p.apply).toBe('function');
    }
    const ids = PRODUCER_SOUND_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length); // unique ids
  });

  it('apply() returns a valid layer without mutating the input', () => {
    for (const preset of PRODUCER_SOUND_PRESETS) {
      const input = baseLayer();
      const out = preset.apply(input);
      // Input untouched.
      expect(input.name).toBe('Test Layer');
      expect(input.gain).toBe(0.8);
      // Output keeps identity fields and stays structurally complete.
      expect(out.id).toBe('layer-1');
      expect(out.enabled).toBe(true);
      expect(typeof out.gain).toBe('number');
      expect(Number.isFinite(out.gain)).toBe(true);
      expect(out.envelope).toBeDefined();
      expect(out.fx).toBeDefined();
      // Envelope values are sane.
      const e = out.envelope;
      for (const key of ['attack', 'decay', 'sustain', 'release'] as const) {
        expect(Number.isFinite(e[key])).toBe(true);
        expect(e[key]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('presets produce genuinely different sounds (distinct synth/fx signatures)', () => {
    const signatures = new Set<string>();
    for (const preset of PRODUCER_SOUND_PRESETS) {
      const out = preset.apply(baseLayer());
      signatures.add(`${out.synth?.oscType}:${out.synth?.subLevel ?? 0}:${out.fx?.distortion ?? 0}`);
    }
    expect(signatures.size).toBeGreaterThan(2); // more than a couple identical
  });

  it('every preset keeps DEFAULT_FX/DEFAULT_SYNTH spread (no missing sections)', () => {
    for (const preset of PRODUCER_SOUND_PRESETS) {
      const out = preset.apply(baseLayer());
      expect(out.synth).toBeDefined();
      expect(out.fx).toBeDefined();
      // FX object should carry the default keys (proves it was spread, not replaced).
      expect('distortion' in out.fx).toBe(true);
      expect('reverbMix' in out.fx).toBe(true);
      expect(typeof out.synth.frequency).toBe('number');
    }
  });
});
