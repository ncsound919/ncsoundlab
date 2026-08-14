/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `applySemitoneShift` in `src/lib/sequencerHelpers.ts`.
 * Synth layers scale oscillator frequency by 2^(semitones/12); sample layers
 * offset the accumulated `pitch`. The input layer is never mutated.
 */

import { describe, expect, it } from 'vitest';
import { applySemitoneShift } from '../lib/sequencerHelpers';
import type { SoundLayer } from '../types';
import { DEFAULT_FX, DEFAULT_SYNTH } from '../types';

function makeSynthLayer(): SoundLayer {
  return {
    id: 'synth-1',
    name: 'Lead',
    type: 'synth',
    enabled: true,
    gain: 0.5,
    pan: 0,
    pitch: 0,
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 },
    fx: { ...DEFAULT_FX },
    synth: { ...DEFAULT_SYNTH, oscType: 'sawtooth', frequency: 440 },
  };
}

function makeSampleLayer(): SoundLayer {
  return {
    id: 'sam-1',
    name: 'Vinyl',
    type: 'sample',
    enabled: true,
    gain: 0.5,
    pan: 0,
    pitch: 0,
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 },
    fx: { ...DEFAULT_FX },
  };
}

describe('applySemitoneShift', () => {
  it('returns a new object and never mutates the input', () => {
    const layer = makeSynthLayer();
    const result = applySemitoneShift(layer, 12);
    expect(result).not.toBe(layer);
    expect(layer.synth!.frequency).toBe(440); // untouched
  });

  it('scales synth oscillator frequency by 2^(semitones/12)', () => {
    const layer = makeSynthLayer(); // frequency 440
    expect(applySemitoneShift(layer, 12).synth!.frequency).toBeCloseTo(880, 5);
    expect(applySemitoneShift(layer, -12).synth!.frequency).toBeCloseTo(220, 5);
    expect(applySemitoneShift(layer, 0).synth!.frequency).toBeCloseTo(440, 5);
  });

  it('defaults synth frequency to 440 when synth.frequency is absent', () => {
    const layer = makeSynthLayer();
    delete (layer.synth as Partial<typeof DEFAULT_SYNTH>).frequency;
    const result = applySemitoneShift(layer, 12);
    expect(result.synth!.frequency).toBeCloseTo(880, 5);
  });

  it('offsets sample layer pitch by the semitones', () => {
    const layer = makeSampleLayer();
    expect(applySemitoneShift(layer, 5).pitch).toBe(5);
    expect(applySemitoneShift(layer, -3).pitch).toBe(-3);
  });

  it('accumulates onto an existing sample pitch', () => {
    const layer = { ...makeSampleLayer(), pitch: 7 };
    expect(applySemitoneShift(layer, -2).pitch).toBe(5);
  });

  it('zero semitones returns an equal but independent copy', () => {
    const layer = makeSampleLayer();
    const result = applySemitoneShift(layer, 0);
    expect(result).not.toBe(layer);
    expect(result.pitch).toBe(layer.pitch);
    expect(result.gain).toBe(layer.gain);
  });

  it('preserves the rest of the layer fields', () => {
    const layer = makeSampleLayer();
    const result = applySemitoneShift(layer, 3);
    expect(result.id).toBe(layer.id);
    expect(result.name).toBe(layer.name);
    expect(result.type).toBe('sample');
    expect(result.gain).toBe(layer.gain);
    expect(result.envelope).toEqual(layer.envelope);
  });
});