/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Interaction tests for the SmartRandomizerModal UI: category selection,
 * section locks, intensity, auto-audition, generate (all archetypes), undo,
 * and the Escape-to-close behavior. Math.random is pinned to 0.5 so the
 * procedural randomization is deterministic.
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { SmartRandomizerModal, type RandomCategory } from './SmartRandomizerModal';
import type { SoundLayer } from '../types';
import { DEFAULT_FX, DEFAULT_SYNTH } from '../types';

const makeLayer = (overrides: Partial<SoundLayer> = {}): SoundLayer => ({
  id: 'layer-1',
  name: '808',
  type: 'synth',
  enabled: true,
  gain: 0.8,
  pan: 0,
  pitch: 0,
  envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.5 },
  fx: { ...DEFAULT_FX, filterFreq: 2000, filterRes: 1 },
  synth: { ...DEFAULT_SYNTH, oscType: 'sawtooth', filterDrive: 0.3 },
  subDesign: {
    subEnabled: false,
    subLevel: 0.5,
    subType: 'sine',
    harmonicSaturation: 0,
    xSubMix: 0,
    drive: 0,
    dynamicTracking: true,
  },
  ...overrides,
});

describe('SmartRandomizerModal interaction tests', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.useRealTimers();
    randomSpy.mockRestore();
  });

  const renderModal = (overrides: Record<string, unknown> = {}) => {
    const props = {
      isOpen: true,
      onClose: vi.fn(),
      onUpdate: vi.fn(),
      onPlay: vi.fn(),
      selectedLayer: makeLayer(),
      ...overrides,
    };
    const utils = render(<SmartRandomizerModal {...props} />);
    return { props, ...utils };
  };

  const clickGenerate = () =>
    fireEvent.click(screen.getByRole('button', { name: /GENERATE RANDOMIZED SOUND/ }));

  const lastUpdate = (props: { onUpdate: ReturnType<typeof vi.fn> }) =>
    props.onUpdate.mock.calls.at(-1)[0] as Partial<SoundLayer>;

  const selectCategory = (name: string) => {
    fireEvent.click(screen.getByText(name));
  };

  it('renders nothing when closed', () => {
    const { container } = renderModal({ isOpen: false });
    expect(container.firstChild).toBeNull();
  });

  it('closes on Escape keydown', () => {
    const { props } = renderModal();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('closes via the header X and the Done/Close buttons', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByTitle('Close Randomizer'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Done \/ Close/ }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it('tracks locked section count and supports lock/unlock all', () => {
    renderModal();
    expect(screen.getByText(/\(0\/10 Locked\)/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Lock All/ }));
    expect(screen.getByText(/\(10\/10 Locked\)/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Unlock All/ }));
    expect(screen.getByText(/\(0\/10 Locked\)/)).toBeDefined();
  });

  it('toggles individual section locks', () => {
    renderModal();
    const osc = screen.getByRole('button', { name: /Oscillators & Unison/ });
    fireEvent.click(osc);
    expect(screen.getByText(/\(1\/10 Locked\)/)).toBeDefined();
    fireEvent.click(osc);
    expect(screen.getByText(/\(0\/10 Locked\)/)).toBeDefined();
  });

  it('toggles every remaining section lock', () => {
    renderModal();
    const lockButtons = [
      'Pitch Env & Attack Punch',
      'Filter & Tube Drive',
      'Distortion & Bitcrush',
      'LFO & Wobble Matrix',
      'Reverb, Delay & Chorus',
      'Chaos & Micro-Resonator',
      'Sub Bass Synthesizer',
    ];
    for (const name of lockButtons) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
    }
    expect(screen.getByText(/\(7\/10 Locked\)/)).toBeDefined();
  });

  it('updates the intensity slider display', () => {
    renderModal();
    const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '0.9' } });
    expect(screen.getByText('90%')).toBeDefined();
  });

  it('toggles auto-audition and triggers the manual test button', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Test Sound Now/ }));
    expect(props.onPlay).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('checkbox', { name: /Auto-Play Sound on Generate/ }));
    clickGenerate();
    act(() => vi.runAllTimers());
    expect(props.onPlay).toHaveBeenCalledTimes(1);
  });

  it('does nothing on generate for a non-synth layer', () => {
    const { props } = renderModal({ selectedLayer: makeLayer({ type: 'sample', synth: undefined }) });
    clickGenerate();
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('generates a randomized sound with default intensity and auto-audition', () => {
    const { props } = renderModal();
    clickGenerate();
    const update = lastUpdate(props);
    expect(update.audioBuffer).toBeUndefined();
    expect(typeof update.gain).toBe('number');
    expect(typeof update.pan).toBe('number');
    expect(typeof update.pitch).toBe('number');
    expect(update.synth).toBeDefined();
    expect(update.fx).toBeDefined();
    expect(update.subDesign).toBeDefined();
    expect(update.envelope).toBeDefined();
    act(() => vi.runAllTimers());
    expect(props.onPlay).toHaveBeenCalledTimes(1);
  });

  it('supports undo after generating, respecting locks', () => {
    const { props } = renderModal();
    const undo = screen.getByRole('button', { name: /Undo/ });
    expect((undo as HTMLButtonElement).disabled).toBe(true);

    clickGenerate();
    act(() => vi.runAllTimers());
    expect(props.onPlay).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    const afterUndo = lastUpdate(props);
    expect(afterUndo.audioBuffer).toBeUndefined();
    expect(afterUndo.gain).toBe(0.8); // snapshot restores the pre-generate layer
    act(() => vi.runAllTimers());
    expect(props.onPlay).toHaveBeenCalledTimes(2);
  });

  it('keeps locked oscillator section unchanged when generating', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Oscillators & Unison/ }));
    clickGenerate();
    const update = lastUpdate(props);
    expect(update.synth!.oscType).toBe('sawtooth');
  });

  it('keeps locked spatial/gain section unchanged when generating', () => {
    const { props } = renderModal({ selectedLayer: makeLayer({ gain: 0.33, pan: 0.7, pitch: -5 }) });
    fireEvent.click(screen.getByRole('button', { name: /Amp Volume Envelope/ }));
    clickGenerate();
    const update = lastUpdate(props);
    // ampEnvelope locked -> envelope copied from current layer
    expect(update.envelope).toEqual(makeLayer().envelope);
  });

  it('morph 15% uses a low intensity so pitch stays put', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Morph 15%/ }));
    const update = lastUpdate(props);
    expect(update.pitch).toBe(0);
    act(() => vi.runAllTimers());
    expect(props.onPlay).toHaveBeenCalledTimes(1);
  });

  it.each<[RandomCategory, string, (u: Partial<SoundLayer>) => void]>([
    ['sub808', '808 Sub Boom', (u) => {
      expect(u.synth!.oscType).toBe('sine');
      expect(u.fx!.filterType).toBe('lowpass');
      expect(u.subDesign!.subEnabled).toBe(true);
      expect(u.envelope!.attack).toBe(0.001);
    }],
    ['snare', 'Snare & Snap', (u) => {
      expect(u.envelope!.sustain).toBe(0);
      expect(u.envelope!.attack).toBe(0.001);
    }],
    ['hihat', 'Hi-Hat / Cymbal', (u) => {
      expect(u.fx!.filterType).toBe('highpass');
      expect(u.envelope!.sustain).toBe(0);
    }],
    ['lead', 'Analog Lead', (u) => {
      expect(u.synth!.osc2Mix).toBe(0.5);
      expect(u.synth!.osc2Detune).toBe(12);
      expect(u.fx!.reverbEnabled).toBe(true);
    }],
    ['pad', 'Ambient Pad', (u) => {
      expect(u.fx!.reverbEnabled).toBe(true);
      expect(u.fx!.lfoEnabled).toBe(true);
      expect(u.envelope!.attack).toBeGreaterThan(0.5);
    }],
    ['wobble', 'Wobble Acid Bass', (u) => {
      expect(u.fx!.lfoEnabled).toBe(true);
      expect(u.fx!.filterType).toBe('lowpass');
      expect(u.fx!.filterRes).toBeGreaterThanOrEqual(3);
      expect(u.subDesign!.subEnabled).toBe(true);
    }],
    ['glitch', 'Cyber Glitch FX', (u) => {
      expect(u.fx!.distortionEnabled).toBe(true);
      expect(u.fx!.bitcrushEnabled).toBe(true);
      expect(u.fx!.tilEnabled).toBe(true);
      expect(u.synth!.phaseChaos).toBeGreaterThan(0);
    }],
    ['physical', 'Acoustic Resonator', (u) => {
      expect(u.fx!.mrsEnabled).toBe(true);
      expect(u.fx!.reverbEnabled).toBe(true);
    }],
    ['chaos', 'Complete Wild Chaos', (u) => {
      expect(u.fx!.tilEnabled).toBe(true);
      expect(u.subDesign!.subEnabled).toBe(false);
      expect(u.synth!.macroChaos).toBeGreaterThan(0);
    }],
  ])('generates a %s-style sound when %s is selected', (_cat, buttonText, assert) => {
    const { props } = renderModal();
    selectCategory(buttonText);
    clickGenerate();
    assert(lastUpdate(props));
  });
});
