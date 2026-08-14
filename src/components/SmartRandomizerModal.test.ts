/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `applyStateWithLocks` in `src/components/SmartRandomizerModal.tsx`.
 * The function merges randomized values from `lastState` into a fresh copy of
 * `currentState`, except for sections whose lock flag is `true`, which keep
 * their current values.
 */

import { describe, expect, it } from 'vitest';
import {
  applyStateWithLocks,
  type SectionLocks,
} from './SmartRandomizerModal';
import type { SoundLayer } from '../types';
import { DEFAULT_FX, DEFAULT_SYNTH } from '../types';

const ALL_UNLOCKED: SectionLocks = {
  oscillators: false,
  pitchEnvelope: false,
  ampEnvelope: false,
  filterDrive: false,
  saturation: false,
  lfoModulation: false,
  timeFx: false,
  chaosGranular: false,
  subDesign: false,
  spatialGain: false,
};

function locks(overrides: Partial<SectionLocks>): SectionLocks {
  return { ...ALL_UNLOCKED, ...overrides };
}

function makeLayer(): SoundLayer {
  return {
    id: 'layer-1',
    name: '808',
    type: 'synth',
    enabled: true,
    gain: 0.8,
    pan: 0,
    pitch: 0,
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.5 },
    fx: { ...DEFAULT_FX, filterFreq: 2000 },
    synth: { ...DEFAULT_SYNTH, oscType: 'sawtooth', filterDrive: 0.3 },
    subDesign: {
      subEnabled: true,
      subLevel: 0.5,
      subType: 'sine',
      harmonicSaturation: 0.2,
      xSubMix: 0.5,
      drive: 0.1,
      dynamicTracking: true,
    },
  };
}

describe('applyStateWithLocks', () => {
  it('merges randomized spatial values from lastState when unlocked', () => {
    const current = makeLayer();
    const last: Partial<SoundLayer> = { gain: 0.2, pan: -0.4, pitch: 12 };
    const result = applyStateWithLocks(last, current, ALL_UNLOCKED);
    expect(result.gain).toBe(0.2);
    expect(result.pan).toBe(-0.4);
    expect(result.pitch).toBe(12);
  });

  it('keeps current spatial values when spatialGain is locked', () => {
    const current = makeLayer();
    const last: Partial<SoundLayer> = { gain: 0.2, pan: -0.4, pitch: 12 };
    const result = applyStateWithLocks(last, current, locks({ spatialGain: true }));
    expect(result.gain).toBe(current.gain);
    expect(result.pan).toBe(current.pan);
    expect(result.pitch).toBe(current.pitch);
  });

  it('falls back to current spatial values when lastState omits them', () => {
    const current = makeLayer();
    const result = applyStateWithLocks({}, current, ALL_UNLOCKED);
    expect(result.gain).toBe(current.gain);
    expect(result.pan).toBe(current.pan);
    expect(result.pitch).toBe(current.pitch);
  });

  it('applies lastState envelope when ampEnvelope unlocked', () => {
    const current = makeLayer();
    const last: Partial<SoundLayer> = { envelope: { attack: 0.5, decay: 0.1, sustain: 0.9, release: 0.01 } };
    const result = applyStateWithLocks(last, current, ALL_UNLOCKED);
    expect(result.envelope).toEqual(last.envelope);
  });

  it('keeps current envelope when ampEnvelope locked', () => {
    const current = makeLayer();
    const last: Partial<SoundLayer> = { envelope: { attack: 0.5, decay: 0.1, sustain: 0.9, release: 0.01 } };
    const result = applyStateWithLocks(last, current, locks({ ampEnvelope: true }));
    expect(result.envelope).toEqual(current.envelope);
  });

  it('clones envelope so the result never aliases currentState', () => {
    const current = makeLayer();
    const result = applyStateWithLocks({}, current, ALL_UNLOCKED);
    expect(result.envelope).not.toBe(current.envelope);
  });

  it('uses lastState subDesign when unlocked', () => {
    const current = makeLayer();
    const last: Partial<SoundLayer> = {
      subDesign: {
        subEnabled: false,
        subLevel: 1,
        subType: 'square',
        harmonicSaturation: 0.9,
        xSubMix: 0,
        drive: 0.8,
        dynamicTracking: false,
      },
    };
    const result = applyStateWithLocks(last, current, ALL_UNLOCKED);
    expect(result.subDesign).toEqual(last.subDesign);
    expect(result.subDesign).not.toBe(current.subDesign);
  });

  it('keeps current subDesign when subDesign locked', () => {
    const current = makeLayer();
    const last: Partial<SoundLayer> = {
      subDesign: {
        subEnabled: false,
        subLevel: 1,
        subType: 'square',
        harmonicSaturation: 0.9,
        xSubMix: 0,
        drive: 0.8,
        dynamicTracking: false,
      },
    };
    const result = applyStateWithLocks(last, current, locks({ subDesign: true }));
    expect(result.subDesign).toEqual(current.subDesign);
  });

  it('applies lastState oscillator params when oscillators unlocked', () => {
    const current = makeLayer();
    const last: Partial<SoundLayer> = {
      synth: { ...DEFAULT_SYNTH, oscType: 'square', osc2Detune: 7, subLevel: 0.3, unisonVoices: 3 },
    };
    const result = applyStateWithLocks(last, current, ALL_UNLOCKED);
    expect(result.synth!.oscType).toBe('square');
    expect(result.synth!.osc2Detune).toBe(7);
    expect(result.synth!.subLevel).toBe(0.3);
    expect(result.synth!.unisonVoices).toBe(3);
  });

  it('keeps current oscillator params when oscillators locked', () => {
    const current = makeLayer();
    const last: Partial<SoundLayer> = {
      synth: { ...DEFAULT_SYNTH, oscType: 'square', osc2Detune: 7, subLevel: 0.3 },
    };
    const result = applyStateWithLocks(last, current, locks({ oscillators: true }));
    expect(result.synth!.oscType).toBe(current.synth!.oscType);
    expect(result.synth!.subLevel).toBe(current.synth!.subLevel);
  });

  it('applies pitchEnvelope (synth + transient) only when unlocked', () => {
    const current = makeLayer();
    const last: Partial<SoundLayer> = {
      synth: { ...DEFAULT_SYNTH, pitchEnvAmount: 12, pitchEnvDecay: 0.5 },
      fx: { ...DEFAULT_FX, transientEnabled: false, transientAttack: 80 },
    };
    const result = applyStateWithLocks(last, current, ALL_UNLOCKED);
    expect(result.synth!.pitchEnvAmount).toBe(12);
    expect(result.synth!.pitchEnvDecay).toBe(0.5);
    expect(result.fx!.transientEnabled).toBe(false);
    expect(result.fx!.transientAttack).toBe(80);

    const locked = applyStateWithLocks(last, current, locks({ pitchEnvelope: true }));
    expect(locked.synth!.pitchEnvAmount).toBe(current.synth!.pitchEnvAmount);
    expect(locked.fx!.transientAttack).toBe(current.fx!.transientAttack);
  });

  it('applies filterDrive only when unlocked', () => {
    const current = makeLayer();
    const last: Partial<SoundLayer> = {
      fx: { ...DEFAULT_FX, filterType: 'highpass', filterFreq: 800, filterRes: 12, filterDrive: 60 },
    };
    const result = applyStateWithLocks(last, current, ALL_UNLOCKED);
    expect(result.fx!.filterType).toBe('highpass');
    expect(result.fx!.filterFreq).toBe(800);
    expect(result.fx!.filterRes).toBe(12);
    expect(result.fx!.filterDrive).toBe(60);

    const locked = applyStateWithLocks(last, current, locks({ filterDrive: true }));
    expect(locked.fx!.filterFreq).toBe(current.fx!.filterFreq);
    expect(locked.fx!.filterDrive).toBe(current.fx!.filterDrive);
  });

  it('applies saturation only when unlocked', () => {
    const current = makeLayer();
    const last: Partial<SoundLayer> = {
      fx: { ...DEFAULT_FX, distortion: 0.7, distortionEnabled: false, bitcrush: 0.4, bitcrushEnabled: false },
    };
    const result = applyStateWithLocks(last, current, ALL_UNLOCKED);
    expect(result.fx!.distortion).toBe(0.7);
    expect(result.fx!.distortionEnabled).toBe(false);
    expect(result.fx!.bitcrush).toBe(0.4);

    const locked = applyStateWithLocks(last, current, locks({ saturation: true }));
    expect(locked.fx!.distortion).toBe(current.fx!.distortion);
    expect(locked.fx!.bitcrushEnabled).toBe(current.fx!.bitcrushEnabled);
  });

  it('applies lfoModulation only when unlocked', () => {
    const current = makeLayer();
    const last: Partial<SoundLayer> = {
      fx: { ...DEFAULT_FX, lfoRate: 3, lfoDepth: 0.8, lfoType: 'triangle', lfoTarget: 'pitch' },
    };
    const result = applyStateWithLocks(last, current, ALL_UNLOCKED);
    expect(result.fx!.lfoRate).toBe(3);
    expect(result.fx!.lfoDepth).toBe(0.8);
    expect(result.fx!.lfoType).toBe('triangle');
    expect(result.fx!.lfoTarget).toBe('pitch');

    const locked = applyStateWithLocks(last, current, locks({ lfoModulation: true }));
    expect(locked.fx!.lfoRate).toBe(current.fx!.lfoRate);
    expect(locked.fx!.lfoTarget).toBe(current.fx!.lfoTarget);
  });

  it('applies timeFx only when unlocked', () => {
    const current = makeLayer();
    const last: Partial<SoundLayer> = {
      fx: { ...DEFAULT_FX, reverbMix: 0.6, reverbEnabled: false, delayTime: 0.5, delayFeedback: 0.9, chorusMix: 0.3, chorusEnabled: false },
    };
    const result = applyStateWithLocks(last, current, ALL_UNLOCKED);
    expect(result.fx!.reverbMix).toBe(0.6);
    expect(result.fx!.delayTime).toBe(0.5);
    expect(result.fx!.delayFeedback).toBe(0.9);
    expect(result.fx!.chorusMix).toBe(0.3);

    const locked = applyStateWithLocks(last, current, locks({ timeFx: true }));
    expect(locked.fx!.reverbMix).toBe(current.fx!.reverbMix);
    expect(locked.fx!.delayFeedback).toBe(current.fx!.delayFeedback);
  });

  it('applies chaosGranular (synth + fx) only when unlocked', () => {
    const current = makeLayer();
    const last: Partial<SoundLayer> = {
      synth: { ...DEFAULT_SYNTH, phaseChaos: 0.5, cycleStretch: 0.2, fractalHarmonics: 0.7, macroChaos: 0.9, lorenzRate: 0.1 },
      fx: { ...DEFAULT_FX, tilEnabled: true, tilTexture: 'grit', tilMix: 0.4, mrsEnabled: true, mrsMix: 0.8, mrsDensity: 0.3, mrsMaterial: 'glass', mrsChaos: 0.6 },
    };
    const result = applyStateWithLocks(last, current, ALL_UNLOCKED);
    expect(result.synth!.phaseChaos).toBe(0.5);
    expect(result.synth!.cycleStretch).toBe(0.2);
    expect(result.synth!.fractalHarmonics).toBe(0.7);
    expect(result.synth!.macroChaos).toBe(0.9);
    expect(result.synth!.lorenzRate).toBe(0.1);
    expect(result.fx!.tilEnabled).toBe(true);
    expect(result.fx!.tilTexture).toBe('grit');
    expect(result.fx!.mrsMaterial).toBe('glass');
    expect(result.fx!.mrsChaos).toBe(0.6);

    const locked = applyStateWithLocks(last, current, locks({ chaosGranular: true }));
    expect(locked.synth!.phaseChaos).toBe(current.synth!.phaseChaos);
    expect(locked.synth!.macroChaos).toBe(current.synth!.macroChaos);
    expect(locked.fx!.tilEnabled).toBe(current.fx!.tilEnabled);
    expect(locked.fx!.mrsDensity).toBe(current.fx!.mrsDensity);
  });

  it('does not alias currentState synth/fx objects', () => {
    const current = makeLayer();
    const result = applyStateWithLocks({}, current, ALL_UNLOCKED);
    expect(result.synth).not.toBe(current.synth);
    expect(result.fx).not.toBe(current.fx);
  });

  it('all-locked keeps every section at its current value', () => {
    const current = makeLayer();
    const last: Partial<SoundLayer> = {
      gain: 0.1,
      envelope: { attack: 9, decay: 9, sustain: 9, release: 9 },
      synth: { ...DEFAULT_SYNTH, oscType: 'square', pitchEnvAmount: 12, phaseChaos: 1 },
      fx: { ...DEFAULT_FX, filterFreq: 100, distortion: 1, lfoDepth: 1, reverbMix: 1 },
    };
    const result = applyStateWithLocks(last, current, locks({
      oscillators: true, pitchEnvelope: true, ampEnvelope: true, filterDrive: true,
      saturation: true, lfoModulation: true, timeFx: true, chaosGranular: true,
      subDesign: true, spatialGain: true,
    }));
    expect(result.gain).toBe(current.gain);
    expect(result.envelope).toEqual(current.envelope);
    expect(result.synth!.oscType).toBe(current.synth!.oscType);
    expect(result.synth!.pitchEnvAmount).toBe(current.synth!.pitchEnvAmount);
    expect(result.synth!.phaseChaos).toBe(current.synth!.phaseChaos);
    expect(result.fx!.filterFreq).toBe(current.fx!.filterFreq);
    expect(result.fx!.distortion).toBe(current.fx!.distortion);
    expect(result.fx!.lfoDepth).toBe(current.fx!.lfoDepth);
    expect(result.fx!.reverbMix).toBe(current.fx!.reverbMix);
    expect(result.subDesign).toEqual(current.subDesign);
  });
});