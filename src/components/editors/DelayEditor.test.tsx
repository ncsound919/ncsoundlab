/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DelayEditor } from './DelayEditor';
import { TAPE_DELAY_PRESETS } from '../../lib/convolutionAndTapePresets';

const knob = (name: string) => screen.getByRole('slider', { name });
const turnUp = (name: string) => fireEvent.keyDown(knob(name), { key: 'ArrowUp' });

describe('DelayEditor', () => {
  let onChange: ReturnType<typeof vi.fn<(s: any) => void>>;

  beforeEach(() => {
    onChange = vi.fn<(s: any) => void>();
  });

  it('renders defaults from the first preset when settings has no tapeDelayPreset', () => {
    render(<DelayEditor settings={{}} onChange={onChange} />);
    const first = TAPE_DELAY_PRESETS[0];
    expect(screen.getByText('MULTI-HEAD TAPE DELAY DSP')).toBeDefined();
    expect(screen.getByText(`${first.heads.count}-Head Delay`)).toBeDefined();
    // All category filter buttons render
    for (const cat of ['all', 'utility', 'space', 'character', 'fx']) {
      expect(screen.getByRole('button', { name: cat })).toBeDefined();
    }
    // Preset selector defaults to the first preset
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe(first.id);
    expect(select.options.length).toBe(TAPE_DELAY_PRESETS.length);
    // Every knob module renders
    for (const label of ['HP Cut', 'LP Cut', 'Tape Drive', 'Bias Tilt', 'Head 1 (ms)', 'Head 2 (ms)', 'Wow Depth', 'Wow Rate', 'Flutter Depth', 'Flutter Rate', 'Feedback', 'Loop Filter', 'Wet Mix']) {
      expect(knob(label)).toBeDefined();
    }
  });

  it('honours an explicit tapeDelayPreset in settings', () => {
    const preset = TAPE_DELAY_PRESETS[2];
    render(<DelayEditor settings={{ tapeDelayPreset: preset, time: 999, feedback: 50 }} onChange={onChange} />);
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe(preset.id);
    expect(screen.getByText(`${preset.heads.count}-Head Delay`)).toBeDefined();
  });

  it('filters presets by category', () => {
    render(<DelayEditor settings={{}} onChange={onChange} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.click(screen.getByRole('button', { name: 'fx' }));
    const fxCount = TAPE_DELAY_PRESETS.filter((p) => p.category === 'fx').length;
    expect(select.options.length).toBe(fxCount);
    fireEvent.click(screen.getByRole('button', { name: 'space' }));
    expect(select.options.length).toBe(TAPE_DELAY_PRESETS.filter((p) => p.category === 'space').length);
    fireEvent.click(screen.getByRole('button', { name: 'utility' }));
    expect(select.options.length).toBe(TAPE_DELAY_PRESETS.filter((p) => p.category === 'utility').length);
    fireEvent.click(screen.getByRole('button', { name: 'character' }));
    expect(select.options.length).toBe(TAPE_DELAY_PRESETS.filter((p) => p.category === 'character').length);
    fireEvent.click(screen.getByRole('button', { name: 'all' }));
    expect(select.options.length).toBe(TAPE_DELAY_PRESETS.length);
  });

  it('selects a preset from the dropdown and derives time/feedback', () => {
    render(<DelayEditor settings={{ foo: 1 }} onChange={onChange} />);
    const target = TAPE_DELAY_PRESETS[1];
    fireEvent.change(screen.getByRole('combobox'), { target: { value: target.id } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const payload = onChange.mock.calls[0][0];
    expect(payload.tapeDelayPreset).toBe(target);
    expect(payload.time).toBe(target.heads.timesMs[0] || 250);
    expect(payload.feedback).toBe(Math.round(target.feedback.amount * 100));
    expect(payload.foo).toBe(1);
  });

  it('updates pre-filter knobs', () => {
    render(<DelayEditor settings={{}} onChange={onChange} />);
    const active = TAPE_DELAY_PRESETS[0];
    turnUp('HP Cut');
    let payload = onChange.mock.calls[0][0];
    expect(payload.tapeDelayPreset.preFilter.hpFreq).toBe(active.preFilter.hpFreq + 5);
    expect(payload.time).toBe(active.heads.timesMs[0] || 250);

    turnUp('LP Cut');
    payload = onChange.mock.calls[1][0];
    expect(payload.tapeDelayPreset.preFilter.lpFreq).toBe(active.preFilter.lpFreq + 100);
  });

  it('updates saturation knobs', () => {
    render(<DelayEditor settings={{}} onChange={onChange} />);
    const active = TAPE_DELAY_PRESETS[0];
    turnUp('Tape Drive');
    expect(onChange.mock.calls[0][0].tapeDelayPreset.saturation.drive).toBeCloseTo(active.saturation.drive + 0.05, 5);
    turnUp('Bias Tilt');
    expect(onChange.mock.calls[1][0].tapeDelayPreset.saturation.biasTilt).toBeCloseTo(active.saturation.biasTilt + 0.05, 5);
  });

  it('switches virtual head count', () => {
    render(<DelayEditor settings={{}} onChange={onChange} />);
    for (const n of [2, 3, 4, 1]) {
      fireEvent.click(screen.getByRole('button', { name: `${n}H` }));
    }
    expect(onChange).toHaveBeenCalledTimes(4);
    expect(onChange.mock.calls[0][0].tapeDelayPreset.heads.count).toBe(2);
    expect(onChange.mock.calls[3][0].tapeDelayPreset.heads.count).toBe(1);
  });

  it('updates head time knobs (including the empty-slot fallback)', () => {
    render(<DelayEditor settings={{}} onChange={onChange} />);
    const active = TAPE_DELAY_PRESETS[0];
    turnUp('Head 1 (ms)');
    const times1 = onChange.mock.calls[0][0].tapeDelayPreset.heads.timesMs;
    expect(times1[0]).toBe((active.heads.timesMs[0] || 250) + 5);
    // Second slot falls back to 500 when the preset only defines one head
    turnUp('Head 2 (ms)');
    const times2 = onChange.mock.calls[1][0].tapeDelayPreset.heads.timesMs;
    expect(times2[1]).toBe((active.heads.timesMs[1] || 500) + 5);
  });

  it('updates wow & flutter knobs', () => {
    render(<DelayEditor settings={{}} onChange={onChange} />);
    const active = TAPE_DELAY_PRESETS[0];
    turnUp('Wow Depth');
    expect(onChange.mock.calls[0][0].tapeDelayPreset.modulation.wowDepthMs).toBeCloseTo(active.modulation.wowDepthMs + 0.1, 5);
    turnUp('Wow Rate');
    expect(onChange.mock.calls[1][0].tapeDelayPreset.modulation.wowRateHz).toBeCloseTo(active.modulation.wowRateHz + 0.05, 5);
    turnUp('Flutter Depth');
    expect(onChange.mock.calls[2][0].tapeDelayPreset.modulation.flutterDepthMs).toBeCloseTo(active.modulation.flutterDepthMs + 0.05, 5);
    turnUp('Flutter Rate');
    expect(onChange.mock.calls[3][0].tapeDelayPreset.modulation.flutterRateHz).toBeCloseTo(active.modulation.flutterRateHz + 0.2, 5);
  });

  it('updates feedback, loop filter and wet mix knobs', () => {
    render(<DelayEditor settings={{}} onChange={onChange} />);
    const active = TAPE_DELAY_PRESETS[0];
    turnUp('Feedback');
    const fb = onChange.mock.calls[0][0].tapeDelayPreset.feedback.amount;
    expect(fb).toBeCloseTo(Math.round(active.feedback.amount * 100) / 100 + 0.01, 5);
    turnUp('Loop Filter');
    // Knob snaps to its step grid anchored at min=500, so assert direction
    // rather than an exact value.
    expect(onChange.mock.calls[1][0].tapeDelayPreset.feedback.filterFreq).toBeGreaterThan(active.feedback.filterFreq);
    turnUp('Wet Mix');
    const mix = onChange.mock.calls[2][0].tapeDelayPreset.mix;
    expect(mix.wet).toBeCloseTo(Math.round(active.mix.wet * 100) / 100 + 0.01, 5);
  });
});
