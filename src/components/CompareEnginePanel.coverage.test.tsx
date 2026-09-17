/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extra coverage for `CompareEnginePanel`: shortcuts panel + key bindings,
 * monitor-source switching, level match, reference/mix transport, loop editing,
 * snapshots, file loading (picker + drag/drop), waveform canvas seek clicks and
 * the meter/derived-metric branches. The real `CompareEngine` is replaced with
 * a fully controllable mock; the zustand store runs for real.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { Mock } from 'vitest';

const h = vi.hoisted(() => {
  const compareEngine = {
    getMeterData: vi.fn(() => ({
      refPeak: -100,
      refRms: -100,
      refLufs: -100,
      refCorr: 0,
      refWidth: 0,
      mixPeak: -100,
      mixRms: -100,
      mixLufs: -100,
      mixCorr: 0,
      mixWidth: 0,
    })),
    getRefPlaybackPosition: vi.fn(() => 0),
    getMixPlaybackPosition: vi.fn(() => 0),
    getLoopB: vi.fn(() => ({ start: 0, end: 0, enabled: false })),
    getMixTrackBuffer: vi.fn(() => null),
    loadTrackFromFile: vi.fn(async (file: File) => ({
      id: `t-${file.name}`,
      name: file.name,
      duration: 12,
      channels: 2,
      buffer: {},
      peakMap: [],
    })),
    setMixBuffer: vi.fn(),
    setSource: vi.fn(),
    setRefGain: vi.fn(),
    setLoopA: vi.fn(),
    setLoopB: vi.fn(),
    playReference: vi.fn(),
    pauseReference: vi.fn(),
    stopReference: vi.fn(),
    playMixFile: vi.fn(),
    pauseMixFile: vi.fn(),
    stopMixFile: vi.fn(),
  };
  return { compareEngine };
});

vi.mock('../audio/CompareEngine', () => ({ compareEngine: h.compareEngine }));

import { CompareEnginePanel } from './CompareEnginePanel';
import { useCompareEngineStore } from '../store/compareEngineStore';
import type { CompareEngineSnapshot } from '../types';

const makeBuffer = (): AudioBuffer => {
  const data = Float32Array.from({ length: 300 }, () => 0.5);
  return {
    length: data.length,
    sampleRate: 44100,
    duration: data.length / 44100,
    numberOfChannels: 1,
    getChannelData: () => data,
    copyToChannel: vi.fn(),
    copyFromChannel: vi.fn(),
  } as unknown as AudioBuffer;
};

const track = (id = 't1', name = 'REF SONG') => ({
  id,
  name,
  duration: 12,
  channels: 2,
  buffer: {} as AudioBuffer,
  peakMap: [0.1, 0.5, 0.9],
});

const DEFAULTS = {
  referenceTracks: [] as ReturnType<typeof track>[],
  activeTrackId: null as string | null,
  isPlayingRef: false,
  isPlayingMix: false,
  activeSource: 'A' as 'A' | 'B',
  refGainDb: 0,
  loopSync: true,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 10,
  levelMatchEnabled: false,
  snapshots: [] as CompareEngineSnapshot[],
  mixTrackName: null as string | null,
  mixTrackDuration: 0,
};

const engineMocks = () => Object.values(h.compareEngine) as Mock[];

describe('CompareEnginePanel coverage', () => {
  beforeEach(() => {
    useCompareEngineStore.setState({ ...DEFAULTS });
    engineMocks().forEach((fn) => fn.mockClear());

    h.compareEngine.getMeterData.mockReturnValue({
      refPeak: -100,
      refRms: -100,
      refLufs: -100,
      refCorr: 0,
      refWidth: 0,
      mixPeak: -100,
      mixRms: -100,
      mixLufs: -100,
      mixCorr: 0,
      mixWidth: 0,
    });
    h.compareEngine.getMixTrackBuffer.mockReturnValue(null);
    h.compareEngine.getLoopB.mockReturnValue({ start: 0, end: 0, enabled: false });
    h.compareEngine.getRefPlaybackPosition.mockReturnValue(0);
    h.compareEngine.getMixPlaybackPosition.mockReturnValue(0);
    h.compareEngine.loadTrackFromFile.mockImplementation(async (file: File) => ({
      id: `t-${file.name}`,
      name: file.name,
      duration: 12,
      channels: 2,
      buffer: {},
      peakMap: [],
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it('toggles the shortcuts info panel', () => {
    render(<CompareEnginePanel isVisible />);
    expect(screen.queryByText(/Keyboard shortcuts for speed comparison/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Shortcuts/ }));
    expect(screen.getByText(/Keyboard shortcuts for speed comparison/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Shortcuts/ }));
    expect(screen.queryByText(/Keyboard shortcuts for speed comparison/)).toBeNull();
  });

  it('handles keyboard shortcuts and ignores keys while an input is focused', () => {
    useCompareEngineStore.setState({ referenceTracks: [track()], activeTrackId: 't1' });
    render(<CompareEnginePanel isVisible />);

    fireEvent.keyDown(window, { key: 'b' });
    expect(useCompareEngineStore.getState().activeSource).toBe('B');

    fireEvent.keyDown(window, { key: 'a' });
    expect(useCompareEngineStore.getState().activeSource).toBe('A');

    fireEvent.keyDown(window, { key: 'l' });
    expect(useCompareEngineStore.getState().loopEnabled).toBe(true);

    fireEvent.keyDown(window, { key: 'm' });
    expect(useCompareEngineStore.getState().levelMatchEnabled).toBe(true);

    const input = screen.getByLabelText('Loop start time in seconds');
    fireEvent.keyDown(input, { key: 'b' });
    expect(useCompareEngineStore.getState().activeSource).toBe('A');
  });

  it('switches monitor source from the A/B buttons', () => {
    render(<CompareEnginePanel isVisible />);

    fireEvent.click(screen.getByText('Effected (Wet Rack Out)'));
    expect(useCompareEngineStore.getState().activeSource).toBe('B');
    expect(h.compareEngine.setSource).toHaveBeenCalledWith('B');

    fireEvent.click(screen.getByText('Original (Dry Sound)'));
    expect(useCompareEngineStore.getState().activeSource).toBe('A');
  });

  it('level-matches the reference gain from the RMS differential', () => {
    h.compareEngine.getMeterData.mockReturnValue({
      refPeak: -3,
      refRms: -20,
      refLufs: -10,
      refCorr: 0.9,
      refWidth: 100,
      mixPeak: -1,
      mixRms: -8,
      mixLufs: -8,
      mixCorr: 0.5,
      mixWidth: 100,
    });
    render(<CompareEnginePanel isVisible />);

    fireEvent.click(screen.getByRole('button', { name: /Level Match/ }));
    expect(useCompareEngineStore.getState().levelMatchEnabled).toBe(true);
    expect(useCompareEngineStore.getState().refGainDb).toBe(12);
    expect(h.compareEngine.setRefGain).toHaveBeenCalledWith(12);
  });

  it('adjusts the reference gain through the knob', () => {
    render(<CompareEnginePanel isVisible />);
    const gain = screen.getByRole('slider', { name: 'Gain' });
    fireEvent.keyDown(gain, { key: 'ArrowUp' });
    expect(useCompareEngineStore.getState().refGainDb).not.toBe(0);

    fireEvent.doubleClick(gain);
    expect(useCompareEngineStore.getState().refGainDb).toBe(-18);
  });

  it('toggles, pauses and stops the reference transport', () => {
    useCompareEngineStore.setState({ referenceTracks: [track()], activeTrackId: 't1' });
    render(<CompareEnginePanel isVisible />);

    fireEvent.click(screen.getByLabelText('Play reference track'));
    expect(useCompareEngineStore.getState().isPlayingRef).toBe(true);
    expect(h.compareEngine.playReference).toHaveBeenCalled();
    expect(screen.getByLabelText('Pause reference track')).toBeDefined();

    fireEvent.click(screen.getByLabelText('Pause reference track'));
    expect(useCompareEngineStore.getState().isPlayingRef).toBe(false);
    expect(h.compareEngine.pauseReference).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Stop reference track'));
    expect(h.compareEngine.stopReference).toHaveBeenCalled();
  });

  it('toggles loop/sync and edits the loop bounds', () => {
    useCompareEngineStore.setState({ referenceTracks: [track()], activeTrackId: 't1' });
    render(<CompareEnginePanel isVisible />);

    fireEvent.click(screen.getByRole('button', { name: 'Loop' }));
    expect(useCompareEngineStore.getState().loopEnabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Sync/ }));
    expect(useCompareEngineStore.getState().loopSync).toBe(false);

    fireEvent.change(screen.getByLabelText('Loop start time in seconds'), {
      target: { value: '5' },
    });
    expect(useCompareEngineStore.getState().loopStart).toBe(5);

    fireEvent.change(screen.getByLabelText('Loop end time in seconds'), {
      target: { value: '8' },
    });
    expect(useCompareEngineStore.getState().loopEnd).toBe(8);

    // End clamps to the active track duration.
    fireEvent.change(screen.getByLabelText('Loop end time in seconds'), {
      target: { value: '999' },
    });
    expect(useCompareEngineStore.getState().loopEnd).toBe(12);
  });

  it('saves, loads and deletes snapshots', () => {
    useCompareEngineStore.setState({ referenceTracks: [track()], activeTrackId: 't1', refGainDb: 3 });
    render(<CompareEnginePanel isVisible />);

    // Empty name is ignored.
    fireEvent.click(screen.getByRole('button', { name: /Snap/ }));
    expect(useCompareEngineStore.getState().snapshots).toHaveLength(0);

    fireEvent.change(screen.getByPlaceholderText(/Name snapshot/), {
      target: { value: 'Chorus' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Snap/ }));
    expect(useCompareEngineStore.getState().snapshots).toHaveLength(1);
    expect(screen.getByText('Chorus')).toBeDefined();

    h.compareEngine.setRefGain.mockClear();
    fireEvent.click(screen.getByText('Chorus'));
    expect(h.compareEngine.setRefGain).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByLabelText('Delete snapshot'));
    expect(useCompareEngineStore.getState().snapshots).toHaveLength(0);
  });

  it('loads a reference track from the file picker', async () => {
    const { container } = render(<CompareEnginePanel isVisible />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'pick.wav', { type: 'audio/wav' });

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(h.compareEngine.loadTrackFromFile).toHaveBeenCalledWith(file));
    await waitFor(() => expect(useCompareEngineStore.getState().referenceTracks).toHaveLength(1));
  });

  it('loads a reference track via drag and drop', async () => {
    const { container } = render(<CompareEnginePanel isVisible />);
    const drop = container.querySelector('.border-dashed') as HTMLElement;
    const file = new File(['x'], 'drop.wav', { type: 'audio/wav' });

    fireEvent.dragOver(drop);
    fireEvent.drop(drop, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(h.compareEngine.loadTrackFromFile).toHaveBeenCalledWith(file));
  });

  it('selects and removes reference tracks', () => {
    useCompareEngineStore.setState({
      referenceTracks: [track('t1', 'ONE'), track('t2', 'TWO')],
      activeTrackId: 't1',
    });
    render(<CompareEnginePanel isVisible />);

    fireEvent.click(screen.getByText('TWO'));
    expect(useCompareEngineStore.getState().activeTrackId).toBe('t2');

    fireEvent.click(screen.getAllByLabelText('Remove reference track')[0]);
    expect(useCompareEngineStore.getState().referenceTracks.map((t) => t.id)).toEqual(['t2']);
  });

  it('loads a mix file when no mix buffer is set', async () => {
    const { container } = render(<CompareEnginePanel isVisible />);
    const inputs = container.querySelectorAll('input[type="file"]');
    const file = new File(['x'], 'mix.wav', { type: 'audio/wav' });

    fireEvent.change(inputs[1], { target: { files: [file] } });
    await waitFor(() => expect(h.compareEngine.setMixBuffer).toHaveBeenCalled());
    await waitFor(() => expect(useCompareEngineStore.getState().mixTrackName).toBe('mix.wav'));
  });

  it('renders the mix transport when a mix buffer exists and controls it', () => {
    useCompareEngineStore.setState({ mixTrackDuration: 1, mixTrackName: 'MIX.wav' });
    h.compareEngine.getMixTrackBuffer.mockReturnValue(makeBuffer());
    h.compareEngine.getLoopB.mockReturnValue({ start: 0.2, end: 0.8, enabled: true });
    render(<CompareEnginePanel isVisible />);

    expect(screen.getByText('MIX.wav')).toBeDefined();

    fireEvent.click(screen.getByLabelText('Play source mix'));
    expect(useCompareEngineStore.getState().isPlayingMix).toBe(true);
    expect(h.compareEngine.playMixFile).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Pause source mix'));
    expect(useCompareEngineStore.getState().isPlayingMix).toBe(false);
    expect(h.compareEngine.pauseMixFile).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Stop source mix'));
    expect(h.compareEngine.stopMixFile).toHaveBeenCalled();
  });

  it('seeks by clicking the reference and mix waveform canvases', () => {
    useCompareEngineStore.setState({ referenceTracks: [track()], activeTrackId: 't1', mixTrackDuration: 1 });
    h.compareEngine.getMixTrackBuffer.mockReturnValue(makeBuffer());
    const { container } = render(<CompareEnginePanel isVisible />);

    const canvases = container.querySelectorAll('canvas');
    expect(canvases).toHaveLength(2);

    fireEvent.click(canvases[0], { clientX: 100 });
    expect(h.compareEngine.playReference).toHaveBeenCalled();
    expect(h.compareEngine.pauseReference).toHaveBeenCalled();

    fireEvent.click(canvases[1], { clientX: 100 });
    expect(h.compareEngine.playMixFile).toHaveBeenCalled();
    expect(h.compareEngine.pauseMixFile).toHaveBeenCalled();
  });

  it('does not pause the reference when it is already playing', () => {
    useCompareEngineStore.setState({
      referenceTracks: [track()],
      activeTrackId: 't1',
      isPlayingRef: true,
      isPlayingMix: true,
      mixTrackDuration: 1,
    });
    h.compareEngine.getMixTrackBuffer.mockReturnValue(makeBuffer());
    const { container } = render(<CompareEnginePanel isVisible />);

    const canvases = container.querySelectorAll('canvas');
    fireEvent.click(canvases[0], { clientX: 200 });
    fireEvent.click(canvases[1], { clientX: 200 });

    expect(h.compareEngine.playReference).toHaveBeenCalled();
    expect(h.compareEngine.pauseReference).not.toHaveBeenCalled();
    expect(h.compareEngine.playMixFile).toHaveBeenCalled();
    expect(h.compareEngine.pauseMixFile).not.toHaveBeenCalled();
  });

  it('renders loud derived meter metrics from the engine', async () => {
    h.compareEngine.getMeterData.mockReturnValue({
      refPeak: -3,
      refRms: -12,
      refLufs: -10,
      refCorr: 0.9,
      refWidth: 100,
      mixPeak: -1,
      mixRms: -12,
      mixLufs: -8,
      mixCorr: 0.5,
      mixWidth: 100,
    });
    render(<CompareEnginePanel isVisible />);

    await waitFor(() => expect(screen.getByText('+2.0 dB')).toBeDefined());
    expect(screen.getByText('11.0 dB')).toBeDefined();
    expect(screen.getByText('+0.50')).toBeDefined();
  });

  it('renders -∞ for silent meters', () => {
    render(<CompareEnginePanel isVisible />);
    expect(screen.getAllByText('-∞').length).toBeGreaterThanOrEqual(6);
  });

  it('renders a negative loudness delta and a non-finite correlation fallback', async () => {
    h.compareEngine.getMeterData.mockReturnValue({
      refPeak: -3,
      refRms: -12,
      refLufs: -5,
      refCorr: 0.9,
      refWidth: 100,
      mixPeak: -1,
      mixRms: -12,
      mixLufs: -10,
      mixCorr: Number.NaN,
      mixWidth: 100,
    });
    render(<CompareEnginePanel isVisible />);

    await waitFor(() => expect(screen.getByText('-5.0 dB')).toBeDefined());
    expect(screen.getByText('—')).toBeDefined();
  });

  it('renders a negative stereo correlation sign', async () => {
    h.compareEngine.getMeterData.mockReturnValue({
      refPeak: -3,
      refRms: -12,
      refLufs: -10,
      refCorr: 0.9,
      refWidth: 100,
      mixPeak: -1,
      mixRms: -12,
      mixLufs: -8,
      mixCorr: -0.4,
      mixWidth: 100,
    });
    render(<CompareEnginePanel isVisible />);

    await waitFor(() => expect(screen.getByText('-0.40')).toBeDefined());
  });

  it('falls back to default loop display values for NaN bounds', () => {
    useCompareEngineStore.setState({
      referenceTracks: [track()],
      activeTrackId: 't1',
      loopStart: Number.NaN,
      loopEnd: Number.NaN,
    });
    render(<CompareEnginePanel isVisible />);

    expect((screen.getByLabelText('Loop start time in seconds') as HTMLInputElement).value).toBe('0.0');
    expect((screen.getByLabelText('Loop end time in seconds') as HTMLInputElement).value).toBe('10.0');
  });

  it('labels a mono reference track and an orphaned snapshot', () => {
    useCompareEngineStore.setState({
      referenceTracks: [{ ...track('t1', 'MONO REF'), channels: 1 }],
      activeTrackId: 't1',
      snapshots: [
        {
          id: 's1',
          name: 'Ghost',
          refTrackId: 'missing',
          refGainOffset: -2,
          loopStart: 0,
          loopEnd: 1,
          createdAt: '00:00',
        },
      ],
    });
    render(<CompareEnginePanel isVisible />);

    expect(screen.getByText(/0:12\s*\|\s*Mono/)).toBeDefined();
    expect(screen.getByText('Unknown Track | -2.0dB')).toBeDefined();
  });

  it('still renders its sections when hidden', () => {
    render(<CompareEnginePanel isVisible={false} />);
    expect(screen.getByText(/Reference Library/)).toBeDefined();
  });
});
