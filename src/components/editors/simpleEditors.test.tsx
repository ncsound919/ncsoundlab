/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Coverage for the nine single-screen FX editors in
 * `src/components/editors/` (Clipper, Chorus, Exciter, Flanger, Imager,
 * Limiter, Phaser, Saturator, TapeEmulation). These were at 0% statement
 * coverage: each is a thin Knob grid over a settings object, so the tests
 * assert default rendering plus that every knob forwards its update while
 * preserving the rest of the settings object.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { ClipperEditor } from './ClipperEditor';
import { ChorusEditor } from './ChorusEditor';
import { ExciterEditor } from './ExciterEditor';
import { FlangerEditor } from './FlangerEditor';
import { ImagerEditor } from './ImagerEditor';
import { LimiterEditor } from './LimiterEditor';
import { PhaserEditor } from './PhaserEditor';
import { SaturatorEditor } from './SaturatorEditor';
import { TapeEmulationEditor } from './TapeEmulationEditor';

const onChange = vi.fn<(s: any) => void>();

beforeEach(() => {
  onChange.mockReset();
});

/** Press ArrowUp on a Knob slider and return the settings object it emitted. */
function turnKnob(label: string): any {
  const slider = screen.getByRole('slider', { name: label });
  fireEvent.keyDown(slider, { key: 'ArrowUp' });
  expect(onChange).toHaveBeenCalledTimes(1);
  const next = onChange.mock.calls[0][0];
  onChange.mockClear();
  return next;
}

describe('ClipperEditor', () => {
  it('renders defaults and forwards knob updates', () => {
    render(<ClipperEditor settings={{}} onChange={onChange} />);
    expect(screen.getByText('SOFT & HARD PEAK CLIPPER')).toBeDefined();
    expect(screen.getByRole('slider', { name: 'Thresh' }).getAttribute('aria-valuenow')).toBe('-3');

    expect(turnKnob('Thresh')).toMatchObject({ threshold: -2.5 });
    expect(turnKnob('Ceil')).toMatchObject({ ceil: 0 });
    expect(turnKnob('Softness')).toMatchObject({ knee: 51 });
    expect(turnKnob('Out Gain')).toMatchObject({ output: 0.1 });
  });

  it('preserves unrelated settings keys', () => {
    render(<ClipperEditor settings={{ threshold: -6, custom: 'keep' }} onChange={onChange} />);
    expect(turnKnob('Thresh')).toMatchObject({ threshold: -5.5, custom: 'keep' });
  });
});

describe('ChorusEditor', () => {
  it('renders defaults and forwards knob updates', () => {
    render(<ChorusEditor settings={{}} onChange={onChange} />);
    expect(screen.getByText('MULTI-VOICE ENSEMBLE CHORUS')).toBeDefined();
    expect(turnKnob('Mix')).toMatchObject({ mix: 41 });
    expect(turnKnob('Rate')).toMatchObject({ rate: 1.3 });
    expect(turnKnob('Depth')).toMatchObject({ depth: 51 });
    expect(turnKnob('Voices')).toMatchObject({ voices: 4 });
  });
});

describe('ExciterEditor', () => {
  it('renders defaults and forwards knob updates', () => {
    render(<ExciterEditor settings={{}} onChange={onChange} />);
    expect(screen.getByText('HARMONIC EXCITER & AURAL CLARITY')).toBeDefined();
    expect(turnKnob('Amount')).toMatchObject({ amount: 36 });
    expect(turnKnob('Freq')).toMatchObject({ freq: 4100 });
    expect(turnKnob('Harmonics')).toMatchObject({ harmonics: 3 });
    expect(turnKnob('Mix')).toMatchObject({ mix: 51 });
  });
});

describe('FlangerEditor', () => {
  it('renders defaults and forwards knob updates', () => {
    render(<FlangerEditor settings={{}} onChange={onChange} />);
    expect(screen.getByText('JET FLANGER & COMB FILTER')).toBeDefined();
    expect(turnKnob('Rate')).toMatchObject({ rate: 0.6 });
    expect(turnKnob('Depth')).toMatchObject({ depth: 71 });
    expect(turnKnob('Feedback')).toMatchObject({ feedback: 51 });
    expect(turnKnob('Manual')).toMatchObject({ manual: 2.1 });
  });
});

describe('ImagerEditor', () => {
  it('renders defaults and forwards knob updates', () => {
    render(<ImagerEditor settings={{}} onChange={onChange} />);
    expect(screen.getByText('MID-SIDE STEREO FIELD WIDENER')).toBeDefined();
    expect(turnKnob('Width')).toMatchObject({ width: 131 });
    expect(turnKnob('Mid Gain')).toMatchObject({ midGain: 0.1 });
    expect(turnKnob('Side Gain')).toMatchObject({ sideGain: 0.1 });
    expect(turnKnob('Bass Mono')).toMatchObject({ bassMonoCutoff: 125 });
  });
});

describe('LimiterEditor', () => {
  it('renders defaults and forwards knob updates', () => {
    render(<LimiterEditor settings={{}} onChange={onChange} />);
    expect(screen.getByText('BRICKWALL MASTERING LIMITER')).toBeDefined();
    expect(turnKnob('Thresh')).toMatchObject({ threshold: -0.5 });
    expect(turnKnob('Release')).toMatchObject({ release: 101 });
    expect(turnKnob('Ceiling')).toMatchObject({ ceiling: 0 });
    expect(turnKnob('ISP Look')).toMatchObject({ lookahead: 2.1 });
  });
});

describe('PhaserEditor', () => {
  it('renders defaults and forwards knob updates', () => {
    render(<PhaserEditor settings={{}} onChange={onChange} />);
    expect(screen.getByText('MULTI-STAGE OPTICAL PHASER')).toBeDefined();
    expect(turnKnob('Rate')).toMatchObject({ rate: 0.9 });
    expect(turnKnob('Depth')).toMatchObject({ depth: 81 });
    expect(turnKnob('Feedback')).toMatchObject({ feedback: 41 });
    expect(turnKnob('Stages')).toMatchObject({ stages: 8 });
  });
});

describe('SaturatorEditor', () => {
  it('renders defaults and forwards knob updates, including harmonic section', () => {
    render(<SaturatorEditor settings={{}} onChange={onChange} />);
    expect(screen.getByText('HARMONIC DRIVE & TUBE WARMTH')).toBeDefined();
    expect(screen.getByText('Harmonic Generation')).toBeDefined();
    expect(turnKnob('Drive')).toMatchObject({ drive: 12.5 });
    expect(turnKnob('Mix')).toMatchObject({ mix: 100 });
    expect(turnKnob('Tone')).toMatchObject({ tone: 51 });
    expect(turnKnob('Output')).toMatchObject({ output: 0.1 });
    expect(turnKnob('2nd Order')).toMatchObject({ harmonic2nd: 1 });
    expect(turnKnob('3rd Order')).toMatchObject({ harmonic3rd: 1 });
  });

  it('clamps the Mix knob at its max', () => {
    // Mix defaults to 100 (max) — ArrowUp must stay at 100, not wrap.
    render(<SaturatorEditor settings={{}} onChange={onChange} />);
    expect(turnKnob('Mix')).toMatchObject({ mix: 100 });
  });
});

describe('TapeEmulationEditor', () => {
  it('renders defaults and forwards knob updates', () => {
    render(<TapeEmulationEditor settings={{}} onChange={onChange} />);
    expect(screen.getByText(/ANALOG TAPE SATURATION/)).toBeDefined();
    expect(turnKnob('Drive')).toMatchObject({ drive: 3.1 });
    expect(turnKnob('Bias')).toMatchObject({ bias: 51 });
    expect(turnKnob('Flutter')).toMatchObject({ wowFlutter: 16 });
    expect(turnKnob('Head Bump')).toMatchObject({ headBump: 2.1 });
  });
});
