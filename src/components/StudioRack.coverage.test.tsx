/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extra coverage for `StudioRack` — the duplicated serial/parallel toggle
 * set, A/B copy in both directions, zero-latency toggling off, preset +
 * fullscreen dismissal, the add-menu open/close cycle, every addable module
 * type, and each global-macro scaling branch (compressor / saturator+tape /
 * imager / untouched). Rack state is driven via `useRackStore` directly.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StudioRack } from './StudioRack';
import { useRackStore } from '../store/rackStore';

vi.mock('./PresetBrowser', () => ({ PresetBrowser: () => <div data-testid="preset-browser" /> }));

// Stub the per-module editors: they need canvas/ResizeObserver, while this
// file owns the rack shell (add menu, A/B, routing, macros).
vi.mock('./AdvancedEQEditor', () => ({ AdvancedEQEditor: () => <div data-testid="editor-eq" /> }));
vi.mock('./AdvancedCompEditor', () => ({ AdvancedCompEditor: () => <div data-testid="editor-compressor" /> }));
vi.mock('../audio/dsp/Tremolo', () => ({ AdvancedTremoloEditor: () => <div data-testid="editor-tremolo" /> }));
vi.mock('./editors/TapeEmulationEditor', () => ({ TapeEmulationEditor: () => <div data-testid="editor-tape" /> }));
vi.mock('./editors/ReverbUI', () => ({ ReverbUI: () => <div data-testid="editor-reverb" /> }));
vi.mock('./editors/DelayEditor', () => ({ DelayEditor: () => <div data-testid="editor-delay" /> }));
vi.mock('./editors/ChorusEditor', () => ({ ChorusEditor: () => <div data-testid="editor-chorus" /> }));
vi.mock('./editors/FlangerEditor', () => ({ FlangerEditor: () => <div data-testid="editor-flanger" /> }));
vi.mock('./editors/PhaserEditor', () => ({ PhaserEditor: () => <div data-testid="editor-phaser" /> }));
vi.mock('./editors/SaturatorEditor', () => ({ SaturatorEditor: () => <div data-testid="editor-saturator" /> }));
vi.mock('./editors/ImagerEditor', () => ({ ImagerEditor: () => <div data-testid="editor-imager" /> }));
vi.mock('./editors/ClipperEditor', () => ({ ClipperEditor: () => <div data-testid="editor-clipper" /> }));
vi.mock('./editors/LimiterEditor', () => ({ LimiterEditor: () => <div data-testid="editor-limiter" /> }));
vi.mock('./editors/ExciterEditor', () => ({ ExciterEditor: () => <div data-testid="editor-exciter" /> }));

const resetRack = () =>
  useRackStore.setState({
    modules: [],
    history: { past: [], future: [] },
    activeAbState: 'A',
    snapshotA: [],
    snapshotB: [],
    routingMode: 'serial',
    zeroLatency: false,
  });

describe('StudioRack coverage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    resetRack();
  });

  it('starts with undo/redo disabled and no preset drawer', () => {
    render(<StudioRack />);
    expect(
      (screen.getByTitle('Undo (Ctrl+Z)') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTitle('Redo (Ctrl+Y)') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.queryByTestId('preset-browser')).toBeNull();
  });

  it('toggles routing through the duplicated Serial / Parallel Split set', () => {
    render(<StudioRack />);
    fireEvent.click(screen.getByText('Parallel Split'));
    expect(useRackStore.getState().routingMode).toBe('parallel');
    fireEvent.click(screen.getByText('Serial'));
    expect(useRackStore.getState().routingMode).toBe('serial');
  });

  it('copies A into B and B into A with the label following the slot', () => {
    useRackStore.getState().addModule('chorus');
    render(<StudioRack />);
    expect(screen.getByTitle('Copy current state to other slot').textContent).toContain('B');
    fireEvent.click(screen.getByTitle('Copy current state to other slot'));
    expect(useRackStore.getState().snapshotB).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(screen.getByTitle('Copy current state to other slot').textContent).toContain('A');
    fireEvent.click(screen.getByTitle('Copy current state to other slot'));
    expect(useRackStore.getState().snapshotA).toHaveLength(1);
  });

  it('is a no-op switching to the already-active A/B slot', () => {
    render(<StudioRack />);
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(useRackStore.getState().activeAbState).toBe('A');
  });

  it('toggles zero-latency on and back off', () => {
    render(<StudioRack />);
    fireEvent.click(screen.getByText(/High Quality FFT/i));
    expect(useRackStore.getState().zeroLatency).toBe(true);
    fireEvent.click(screen.getByText(/0-Latency Active/i));
    expect(useRackStore.getState().zeroLatency).toBe(false);
  });

  it('opens and closes the preset drawer', () => {
    render(<StudioRack />);
    fireEvent.click(screen.getByText('Presets'));
    expect(screen.getByTestId('preset-browser')).toBeDefined();
    fireEvent.click(screen.getByText('Presets'));
    expect(screen.queryByTestId('preset-browser')).toBeNull();
  });

  it('enters and exits fullscreen', () => {
    render(<StudioRack />);
    fireEvent.click(screen.getByTitle('Fullscreen Studio Rack'));
    expect(screen.getByTitle('Exit Fullscreen')).toBeDefined();
    fireEvent.click(screen.getByTitle('Exit Fullscreen'));
    expect(screen.getByTitle('Fullscreen Studio Rack')).toBeDefined();
  });

  it('closes the add menu by toggling the trigger', () => {
    render(<StudioRack />);
    const trigger = screen.getByRole('button', { name: /Add Hardware Module/i });
    fireEvent.click(trigger);
    expect(screen.getByText('Parametric EQ')).toBeDefined();
    fireEvent.click(trigger);
    expect(screen.queryByText('Parametric EQ')).toBeNull();
  });

  it('can add every module type from the dropdown', () => {
    const labels = [
      'Parametric EQ',
      'Pro Compressor',
      'Mastering Limiter',
      'Tape Saturator',
      'Harmonic Drive',
      'Peak Clipper',
      'Aural Exciter',
      'Stereo Echo Delay',
      'Convolution Reverb',
      'Ensemble Chorus',
      'Jet Flanger',
      'Optical Phaser',
      'LFO Tremolo',
      'Stereo Imager',
    ];
    render(<StudioRack />);
    for (const label of labels) {
      fireEvent.click(screen.getByRole('button', { name: /Add Hardware Module/i }));
      fireEvent.click(screen.getByText(label));
    }
    expect(useRackStore.getState().modules).toHaveLength(labels.length);
    expect(screen.getByText(/Active Processing Units \(14\)/i)).toBeDefined();
  });

  it('scales compressor makeup gain from macro 1', () => {
    useRackStore.getState().addModule('compressor');
    render(<StudioRack />);
    fireEvent.keyDown(screen.getByLabelText('Macro 1: Saturation'), { key: 'ArrowUp' });
    const mod = useRackStore.getState().modules[0];
    expect((mod.settings as Record<string, number>).makeupGain).toBeCloseTo(6.12, 5);
  });

  it('scales saturator and tape drive from macro 1', () => {
    useRackStore.getState().addModule('saturator');
    useRackStore.getState().addModule('tape');
    render(<StudioRack />);
    fireEvent.keyDown(screen.getByLabelText('Macro 1: Saturation'), { key: 'ArrowUp' });
    const [sat, tape] = useRackStore.getState().modules;
    expect((sat.settings as Record<string, number>).drive).toBeCloseTo(9.18, 5);
    expect((tape.settings as Record<string, number>).drive).toBeCloseTo(9.18, 5);
  });

  it('scales imager width from macro 3', () => {
    useRackStore.getState().addModule('imager');
    render(<StudioRack />);
    fireEvent.keyDown(screen.getByLabelText('Macro 3: Stereo Width'), { key: 'ArrowUp' });
    const mod = useRackStore.getState().modules[0];
    expect((mod.settings as Record<string, number>).width).toBeCloseTo(151, 5);
  });

  it('leaves unmapped module types alone on macro moves', () => {
    useRackStore.getState().addModule('eq');
    const before = JSON.stringify(useRackStore.getState().modules[0].settings);
    render(<StudioRack />);
    fireEvent.keyDown(screen.getByLabelText('Macro 2: Dynamics'), { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByLabelText('Macro 4: Clarity/Air'), { key: 'ArrowDown' });
    expect(JSON.stringify(useRackStore.getState().modules[0].settings)).toBe(before);
  });

  it('drives macros 2-4 labels and values', () => {
    render(<StudioRack />);
    fireEvent.keyDown(screen.getByLabelText('Macro 2: Dynamics'), { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByLabelText('Macro 4: Clarity/Air'), { key: 'ArrowDown' });
    expect(screen.getByText('51%')).toBeDefined();
    expect(screen.getByText('49%')).toBeDefined();
  });
});
