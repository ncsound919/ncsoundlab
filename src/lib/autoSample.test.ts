/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the auto-sampler orchestration: note math, naming, and the
 * per-note retuned renders (the render itself is injected).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  midiNoteName,
  midiToFrequency,
  autoSampleSynthLayer,
  AUTO_SAMPLE_NOTES,
  type AutoSampledNote,
} from './autoSample';
import { DEFAULT_ENVELOPE, DEFAULT_FX, type SoundLayer } from '../types';

const makeSynth = (): SoundLayer => ({
  id: 's1',
  name: 'Bass Patch',
  type: 'synth',
  enabled: true,
  gain: 0.8,
  pan: 0,
  pitch: 0,
  envelope: { ...DEFAULT_ENVELOPE },
  fx: { ...DEFAULT_FX },
});

const fakeBuffer = () => ({ length: 100 }) as AudioBuffer;

describe('midi math', () => {
  it('names notes without throwing', () => {
    expect(midiNoteName(60)).toBe('C4');
    // tonal spells sharps as flats — the name stays filename-safe either way.
    expect(midiNoteName(61)).toBe('Db4');
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
    expect(midiToFrequency(60)).toBeCloseTo(261.63, 2);
  });

  it('covers one bank by default', () => {
    expect(AUTO_SAMPLE_NOTES).toHaveLength(16);
    expect(AUTO_SAMPLE_NOTES[0]).toBe(36);
  });
});

describe('autoSampleSynthLayer', () => {
  it('renders each note retuned and named', async () => {
    const seen: Array<{ midi: number; freq: number }> = [];
    const renderNote = vi.fn(async (pitched: SoundLayer) => {
      seen.push({ midi: 0, freq: pitched.synth?.frequency ?? 0 });
      return fakeBuffer();
    });
    const notes = await autoSampleSynthLayer(makeSynth(), renderNote, { notes: [36, 40, 43] });
    expect(notes).toHaveLength(3);
    expect(renderNote).toHaveBeenCalledTimes(3);
    expect(seen[0].freq).toBeCloseTo(midiToFrequency(36), 6);
    expect(seen[1].freq).toBeCloseTo(midiToFrequency(40), 6);
    const names = notes.map((n: AutoSampledNote) => n.name);
    expect(names[0]).toContain('C2');
    expect(names[1]).toContain('E2');
    expect(names[2]).toContain('G2');
    expect(notes[0].midi).toBe(36);
  });

  it('does not mutate the source layer', async () => {
    const layer = makeSynth();
    await autoSampleSynthLayer(layer, async () => fakeBuffer(), { notes: [48] });
    expect(layer.synth).toBeUndefined();
  });
});
