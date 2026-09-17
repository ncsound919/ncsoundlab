/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ComponentProps } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SynthVisualizer } from './SynthVisualizer';
import {
  DEFAULT_ENVELOPE,
  DEFAULT_SYNTH,
  type Envelope,
  type SynthSettings,
} from '../types';

type Mock = ReturnType<typeof vi.fn>;

const baseSynth = (overrides: Partial<SynthSettings> = {}): SynthSettings => ({
  ...DEFAULT_SYNTH,
  ...overrides,
});

interface RenderVizOptions {
  synth?: Partial<SynthSettings>;
  envelope?: Partial<Envelope>;
  onUpdateSynth?: Mock;
  onPlay?: Mock | null;
  withEnvelope?: boolean;
}

const renderViz = (opts: RenderVizOptions = {}) => {
  const onUpdateSynth = opts.onUpdateSynth ?? vi.fn();
  const onPlay = opts.onPlay === null ? undefined : (opts.onPlay ?? vi.fn());
  const withEnvelope = opts.withEnvelope !== false;

  const props: ComponentProps<typeof SynthVisualizer> = {
    synth: baseSynth(opts.synth),
    onUpdateSynth,
  };
  if (withEnvelope) props.envelope = { ...DEFAULT_ENVELOPE, ...(opts.envelope ?? {}) };
  if (onPlay) props.onPlay = onPlay;

  const utils = render(<SynthVisualizer {...props} />);
  return { ...utils, onUpdateSynth, onPlay };
};

beforeEach(() => {
  // The scope trace and harmonic bars consume Math.random(); pin it so renders
  // are byte-for-byte deterministic across runs.
  vi.spyOn(Math, 'random').mockReturnValue(0.42);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SynthVisualizer A/B slot memory', () => {
  it('stores slot B, morphs between patches, recalls slot A and copies slots', () => {
    const onUpdateSynth = vi.fn();
    const { container } = renderViz({ onUpdateSynth });

    // First "Slot B" press snapshots the current patch into slot B.
    fireEvent.click(screen.getByRole('button', { name: /^Slot B/ }));
    expect(onUpdateSynth).toHaveBeenCalledTimes(1);
    expect(onUpdateSynth).toHaveBeenCalledWith(baseSynth());

    // The morph crossfader only appears once slot B exists.
    const morph = container.querySelector(
      'input[type="range"][step="0.01"]'
    ) as HTMLInputElement;
    expect(morph).toBeTruthy();
    expect(screen.getByText(/A ↔ B Continuous Patch Morph/)).toBeTruthy();

    fireEvent.change(morph, { target: { value: '0.5' } });
    expect(onUpdateSynth).toHaveBeenCalledTimes(2);
    const morphed = onUpdateSynth.mock.calls[1][0] as Partial<SynthSettings>;
    expect(typeof morphed.detune).toBe('number');
    expect(typeof morphed.filterDrive).toBe('number');
    expect(screen.getByText('50% B')).toBeTruthy();

    // A second "Slot B" press reuses the stored slot B (else branch).
    fireEvent.click(screen.getByRole('button', { name: /^Slot B/ }));
    expect(onUpdateSynth).toHaveBeenCalledTimes(3);
    expect(onUpdateSynth).toHaveBeenLastCalledWith(baseSynth());

    // Copy while B is active lands in slot A (else branch of handleCopyAtoB).
    fireEvent.click(screen.getByRole('button', { name: 'A↔B' }));

    // Recalling slot A pushes the stored A patch back out.
    fireEvent.click(screen.getByRole('button', { name: /^Slot A/ }));
    expect(onUpdateSynth).toHaveBeenCalledTimes(4);
    expect(onUpdateSynth).toHaveBeenLastCalledWith(baseSynth());

    // Copy while A is active lands in slot B (if branch of handleCopyAtoB).
    fireEvent.click(screen.getByRole('button', { name: 'A↔B' }));
    expect(screen.getByRole('button', { name: /^Slot B/ }).textContent).toContain('•');
  });
});

describe('SynthVisualizer pitch audition strip', () => {
  it('writes the note frequency and fires onPlay for a register button', () => {
    const onUpdateSynth = vi.fn();
    const onPlay = vi.fn();
    renderViz({ onUpdateSynth, onPlay });

    fireEvent.click(screen.getByRole('button', { name: 'C1 Sub' }));

    expect(onUpdateSynth).toHaveBeenCalledWith({
      frequency: 440 * Math.pow(2, (36 - 69) / 12),
    });
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('auditions a pitch without an onPlay handler', () => {
    const onUpdateSynth = vi.fn();
    renderViz({ onUpdateSynth, onPlay: null });

    fireEvent.click(screen.getByRole('button', { name: 'C6 Air' }));
    expect(onUpdateSynth).toHaveBeenCalledWith({
      frequency: 440 * Math.pow(2, (96 - 69) / 12),
    });
  });
});

describe('SynthVisualizer audition button', () => {
  it('renders and triggers the audition button when onPlay is provided', () => {
    const onPlay = vi.fn();
    renderViz({ onPlay });

    fireEvent.click(screen.getByRole('button', { name: /Audition/i }));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('hides the audition button when no onPlay handler is provided', () => {
    renderViz({ onPlay: null });
    expect(screen.queryByRole('button', { name: /Audition/i })).toBeNull();
  });
});

describe('SynthVisualizer view tabs', () => {
  it('switches through every view tab', () => {
    const { container } = renderViz();

    fireEvent.click(screen.getByRole('button', { name: /Harmonics/i }));
    expect(screen.getByText('H1')).toBeTruthy();
    expect(screen.getByText('H16')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Morph XY Pad/i }));
    expect(screen.getByText(/CLICK & DRAG TO MORPH TIMBRE LIVE/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /ADSR Curve/i }));
    expect(screen.getByText(/ATTACK:/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Oscilloscope/i }));
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders without an envelope and without the ADSR tab', () => {
    renderViz({ withEnvelope: false });
    expect(screen.queryByRole('button', { name: /ADSR Curve/i })).toBeNull();
  });
});

describe('SynthVisualizer XY morph pad', () => {
  it('writes morph parameters on a primary-button drag only', () => {
    const onUpdateSynth = vi.fn();
    renderViz({ onUpdateSynth });

    fireEvent.click(screen.getByRole('button', { name: /Morph XY Pad/i }));
    const pad = screen.getByText(/CLICK & DRAG TO MORPH TIMBRE LIVE/i)
      .parentElement as HTMLElement;

    fireEvent.mouseDown(pad, { buttons: 1, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(pad, { buttons: 1, clientX: 100, clientY: 100 });

    expect(onUpdateSynth).toHaveBeenCalledTimes(2);
    const updates = onUpdateSynth.mock.calls[0][0] as Partial<SynthSettings>;
    expect(typeof updates.filterDrive).toBe('number');
    expect(typeof updates.warmthEngine).toBe('number');
    expect(typeof updates.fmDepth).toBe('number');
    expect(typeof updates.wavefoldDepth).toBe('number');

    // Non-primary buttons must be ignored by handleXYMove.
    onUpdateSynth.mockClear();
    fireEvent.mouseMove(pad, { buttons: 0, clientX: 100, clientY: 100 });
    expect(onUpdateSynth).not.toHaveBeenCalled();
  });
});

describe('SynthVisualizer scope themes', () => {
  it('cycles every phosphor theme button', () => {
    renderViz();

    for (const theme of ['green', 'amber', 'cyan', 'orange']) {
      const button = screen.getByTitle(`${theme} CRT Phosphor Theme`);
      fireEvent.click(button);
      expect(button.className).toContain('ring-2');
    }
  });
});

describe('SynthVisualizer macro sliders', () => {
  it('updates synth from every macro range input', () => {
    const onUpdateSynth = vi.fn();
    const { container } = renderViz({ onUpdateSynth });

    const ranges = Array.from(
      container.querySelectorAll('input[type="range"]')
    ) as HTMLInputElement[];
    expect(ranges).toHaveLength(4);

    fireEvent.change(ranges[0], { target: { value: '0.5' } });
    fireEvent.change(ranges[1], { target: { value: '0.6' } });
    fireEvent.change(ranges[2], { target: { value: '0.4' } });
    fireEvent.change(ranges[3], { target: { value: '0.7' } });

    expect(onUpdateSynth).toHaveBeenCalledTimes(4);

    const punch = onUpdateSynth.mock.calls[0][0] as Partial<SynthSettings>;
    expect(punch.subLevel).toBe(0.5);
    expect(punch.pitchEnvAmount).toBe(12);

    const warmth = onUpdateSynth.mock.calls[1][0] as Partial<SynthSettings>;
    expect(warmth.warmthEngine).toBe(0.6);
    expect(warmth.filterDrive).toBeCloseTo(0.48, 6);
    expect(warmth.slopAmount).toBeCloseTo(0.3, 6);

    const fold = onUpdateSynth.mock.calls[2][0] as Partial<SynthSettings>;
    expect(fold.wavefoldDepth).toBeCloseTo(1.2, 6);
    expect(fold.fmDepth).toBeCloseTo(1.6, 6);

    const dimension = onUpdateSynth.mock.calls[3][0] as Partial<SynthSettings>;
    expect(dimension.unisonVoices).toBe(5);
    expect(dimension.unisonDetune).toBeCloseTo(24.5, 6);
    expect(dimension.unisonWidth).toBe(0.7);
  });
});

describe('SynthVisualizer patch tag classifier', () => {
  it.each([
    ['#DeepSub', { subLevel: 0.5 }],
    ['#GlassyFM', { fmDepth: 0.6 }],
    ['#Wavefolded', { wavefoldDepth: 0.5 }],
    ['#SuperSawUnison', { unisonVoices: 4 }],
    ['#AnalogWarmth', { warmthEngine: 0.6 }],
    ['#AnalogWarmth', { warmthEngine: 0.1, filterDrive: 0.4 }],
    ['#TexturalNoise', { noiseLevel: 0.4 }],
    ['#ChaoticDrone', { macroChaos: 0.4 }],
    ['#ChaoticDrone', { macroChaos: 0, lorenzRate: 0.5 }],
  ])('renders the %s tag for %o', (tag, overrides) => {
    renderViz({ synth: overrides as Partial<SynthSettings> });
    expect(screen.getByText(tag)).toBeTruthy();
  });

  it('renders the clean synth tag when nothing is pushed', () => {
    renderViz();
    expect(screen.getByText('#CleanSynth')).toBeTruthy();
    expect(screen.queryByText('#DeepSub')).toBeNull();
  });

  it('falls back to the legacy wavefold field for the wavefold tag', () => {
    renderViz({ synth: { wavefoldDepth: undefined, wavefold: 0.5 } });
    expect(screen.getByText('#Wavefolded')).toBeTruthy();
  });
});

describe('SynthVisualizer harmonic spectrum oscillator branches', () => {
  it.each(['sine', 'triangle', 'sawtooth', 'square'] as const)(
    'renders harmonic bars for a %s oscillator',
    (oscType) => {
      renderViz({ synth: { oscType } });
      fireEvent.click(screen.getByRole('button', { name: /Harmonics/i }));
      expect(screen.getByText('H16')).toBeTruthy();
    }
  );
});

describe('SynthVisualizer sparse/legacy synth shapes', () => {
  it('falls back to defaults for an undefined synth shape', () => {
    const onUpdateSynth = vi.fn();
    const { container } = renderViz({
      onUpdateSynth,
      synth: {
        oscType: undefined,
        osc2Type: undefined,
        osc2Mix: undefined,
        osc2Detune: undefined,
        subLevel: undefined,
        fmDepth: 0.6,
        fmRatio: undefined,
        fmFeedback: undefined,
        wavefoldDepth: undefined,
        wavefold: undefined,
        noiseLevel: undefined,
        phaseChaos: undefined,
        filterDrive: undefined,
        unisonVoices: undefined,
        warmthEngine: undefined,
        macroChaos: undefined,
        lorenzRate: undefined,
      },
    });

    // Fallback values render, and the FM tag still fires.
    expect(screen.getByText('#GlassyFM')).toBeTruthy();
    expect(screen.getByText(/1V UNISON/)).toBeTruthy();

    // Exercise the XY target indicator + macro sliders with undefined fields.
    fireEvent.click(screen.getByRole('button', { name: /Morph XY Pad/i }));
    const pad = screen.getByText(/CLICK & DRAG TO MORPH TIMBRE LIVE/i)
      .parentElement as HTMLElement;
    fireEvent.mouseMove(pad, { buttons: 1, clientX: 40, clientY: 40 });

    const ranges = Array.from(
      container.querySelectorAll('input[type="range"]')
    ) as HTMLInputElement[];
    fireEvent.change(ranges[3], { target: { value: '0.2' } });
    expect(onUpdateSynth).toHaveBeenCalled();
  });

  it('renders an unknown oscillator shape through the evalWave fallback', () => {
    renderViz({ synth: { oscType: 'custom' as unknown as SynthSettings['oscType'] } });
    expect(screen.getByText(/CUSTOM/)).toBeTruthy();
  });

  it('falls back to envelope defaults when stages are undefined', () => {
    renderViz({
      envelope: {
        attack: undefined,
        decay: undefined,
        sustain: undefined,
        release: undefined,
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /ADSR Curve/i }));
    expect(screen.getByText(/ATTACK:/i)).toBeTruthy();
  });
});
