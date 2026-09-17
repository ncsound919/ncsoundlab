/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Interaction coverage for the drum-folder import workspace: file staging and
 * dedupe, audition/transport, selection + FX toggles, the DSP tweak panel, the
 * semantic naming assistant and kit compilation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AudioAnalysisResult } from '../types';

vi.mock('../lib/batchAudioProcessor', () => ({
  analyzeAudioBuffer: vi.fn(),
  processAudioBuffer: vi.fn(),
  generateVariants: vi.fn(),
}));

import { FolderUploadModal, StagedSampleWaveform } from './FolderUploadModal';
import { audioEngine } from '../audio/AudioEngine';
import { analyzeAudioBuffer, processAudioBuffer, generateVariants } from '../lib/batchAudioProcessor';

const makeBuf = (): AudioBuffer => {
  const data = new Float32Array(256).fill(0.2);
  return {
    numberOfChannels: 1,
    length: data.length,
    sampleRate: 44100,
    duration: data.length / 44100,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
};

const analysisFor = (category: AudioAnalysisResult['suggestedCategory'] = 'Kick'): AudioAnalysisResult => ({
  peakDb: -3,
  rmsDb: -12,
  lufsDb: -14,
  transientSharpness: 6,
  estimatedKey: 'C',
  estimatedBpm: 90,
  durationSeconds: 0.5,
  sampleRate: 44100,
  channels: 1,
  suggestedCategory: category,
});

const makeFile = (name: string, relative = '') =>
  ({
    name,
    size: 2048,
    webkitRelativePath: relative,
    arrayBuffer: vi.fn(async () => new ArrayBuffer(16)),
  }) as unknown as File;

let createdSources: any[] = [];

const makeCtx = (overrides: Record<string, unknown> = {}) => {
  createdSources = [];
  return {
    state: 'running',
    resume: vi.fn(async () => {}),
    decodeAudioData: vi.fn(async () => makeBuf()),
    destination: {},
    createBufferSource: vi.fn(() => {
      const source: any = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        onended: null,
      };
      createdSources.push(source);
      return source;
    }),
    ...overrides,
  };
};

const setCtx = (ctx: unknown) => {
  (audioEngine as unknown as { getContext: () => unknown }).getContext = vi.fn(() => ctx);
};

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

const selectFiles = (files: File[]) => {
  const input = fileInput();
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  fireEvent.change(input);
};

const stageFiles = async (files: File[]) => {
  selectFiles(files);
  await waitFor(() =>
    expect(screen.getAllByTitle('Audition sound').length).toBeGreaterThan(0)
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  createdSources = [];
  vi.mocked(analyzeAudioBuffer).mockImplementation(() => analysisFor());
  vi.mocked(processAudioBuffer).mockImplementation((_ctx, buf) => buf);
  vi.mocked(generateVariants).mockImplementation(async () => [
    makeBuf(),
    makeBuf(),
    makeBuf(),
    makeBuf(),
  ]);
  setCtx(makeCtx());
});

describe('FolderUploadModal', () => {
  it('decodes and stages selected files with metadata', async () => {
    render(<FolderUploadModal onAddSamplesToKit={vi.fn()} />);
    await stageFiles([makeFile('kick.wav')]);

    expect(screen.getByDisplayValue('KICK')).toBeDefined();
    expect(screen.getByText('-3 dB')).toBeDefined();
    expect(screen.getByText('6/10')).toBeDefined();
    expect(screen.getByText('C')).toBeDefined();
    expect(screen.getByText(/1 sound\(s\) selected/)).toBeDefined();
  });

  it('ignores non-audio files entirely', async () => {
    render(<FolderUploadModal onAddSamplesToKit={vi.fn()} />);
    selectFiles([makeFile('notes.txt')]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTitle('Audition sound')).toBeNull();
  });

  it('reports a missing AudioContext', async () => {
    setCtx(null);
    render(<FolderUploadModal onAddSamplesToKit={vi.fn()} />);
    selectFiles([makeFile('kick.wav')]);
    await waitFor(() =>
      expect(screen.getByText(/AudioContext is not available/)).toBeDefined()
    );
  });

  it('resumes a suspended context and records a per-file decode failure', async () => {
    const ctx = makeCtx({ state: 'suspended' });
    ctx.decodeAudioData = vi
      .fn()
      .mockResolvedValueOnce(makeBuf())
      .mockRejectedValueOnce(new Error('bad decode'));
    setCtx(ctx);

    render(<FolderUploadModal onAddSamplesToKit={vi.fn()} />);
    await stageFiles([makeFile('kick.wav'), makeFile('broken.wav')]);

    expect(ctx.resume).toHaveBeenCalled();
    expect(screen.getByText(/broken.wav: bad decode/)).toBeDefined();
    expect(screen.getAllByTitle('Audition sound')).toHaveLength(1);
  });

  it('reports a context that refuses to unlock', async () => {
    const ctx = makeCtx({ state: 'suspended', resume: vi.fn(async () => Promise.reject(new Error('nope'))) });
    setCtx(ctx);
    render(<FolderUploadModal onAddSamplesToKit={vi.fn()} />);
    selectFiles([makeFile('kick.wav')]);
    await waitFor(() => expect(screen.getByText(/Could not unlock AudioContext/)).toBeDefined());
  });

  it('dedupes identical files within one drop but keeps distinct relative paths', async () => {
    render(<FolderUploadModal onAddSamplesToKit={vi.fn()} />);
    await stageFiles([makeFile('kick.wav'), makeFile('kick.wav')]);
    expect(screen.getAllByTitle('Audition sound')).toHaveLength(1);

    selectFiles([makeFile('kick.wav', 'A/kick.wav')]);
    await waitFor(() => expect(screen.getAllByTitle('Audition sound')).toHaveLength(2));
  });

  it('dedupes a file that was already staged in an earlier drop', async () => {
    render(<FolderUploadModal onAddSamplesToKit={vi.fn()} />);
    await stageFiles([makeFile('kick.wav')]);
    selectFiles([makeFile('kick.wav')]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getAllByTitle('Audition sound')).toHaveLength(1);
  });

  it('rebrands staged names from the vibe prompt', async () => {
    render(<FolderUploadModal onAddSamplesToKit={vi.fn()} />);
    await stageFiles([makeFile('kick.wav')]);

    const vibe = screen.getByPlaceholderText(/Vibe Name/);
    fireEvent.change(vibe, { target: { value: 'drill' } });
    fireEvent.click(screen.getByRole('button', { name: /Re-brand Names/ }));
    expect(screen.getByDisplayValue('DRILL_KICK_01_C')).toBeDefined();

    fireEvent.change(vibe, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /Re-brand Names/ }));
    expect(screen.getByDisplayValue('DRILL_KICK_01_C')).toBeDefined();
  });

  it('toggles select-all / deselect-all and FX-all, disabling compile when empty', async () => {
    render(<FolderUploadModal onAddSamplesToKit={vi.fn()} />);
    await stageFiles([makeFile('kick.wav'), makeFile('snare.wav')]);

    fireEvent.click(screen.getByRole('button', { name: 'Deselect All' }));
    expect(screen.getByText(/0 sound\(s\) selected/)).toBeDefined();
    expect((screen.getByRole('button', { name: /Compile .* Sounds/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
    expect(screen.getByText(/2 sound\(s\) selected/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Apply FX to All' }));
    expect(screen.getAllByRole('button', { name: '+ FX ON' })).toHaveLength(2);
    expect(screen.getByText(/\(2 with FX\)/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Keep All Raw' }));
    expect(screen.getAllByRole('button', { name: 'RAW (OFF)' })).toHaveLength(2);
  });

  it('edits, selects, toggles FX and removes individual rows', async () => {
    render(<FolderUploadModal onAddSamplesToKit={vi.fn()} />);
    await stageFiles([makeFile('kick.wav'), makeFile('snare.wav')]);

    const nameInput = screen.getByDisplayValue('KICK');
    fireEvent.change(nameInput, { target: { value: 'MY KICK' } });
    expect(screen.getByDisplayValue('MY KICK')).toBeDefined();

    fireEvent.change(screen.getAllByDisplayValue('Kick')[0], { target: { value: 'Snare' } });
    expect(screen.getAllByDisplayValue('Snare')).toHaveLength(1);

    const checkboxes = document.querySelectorAll('tbody input[type="checkbox"]');
    fireEvent.click(checkboxes[0]);
    expect(screen.getByText(/1 sound\(s\) selected/)).toBeDefined();

    fireEvent.click(screen.getAllByRole('button', { name: 'RAW (OFF)' })[0]);
    expect(screen.getAllByRole('button', { name: '+ FX ON' })).toHaveLength(1);

    fireEvent.click(screen.getAllByTitle('Remove from workspace')[0]);
    expect(screen.getAllByTitle('Audition sound')).toHaveLength(1);
  });

  it('auditions a raw sample, stops it, and handles the natural end', async () => {
    render(<FolderUploadModal onAddSamplesToKit={vi.fn()} />);
    await stageFiles([makeFile('kick.wav')]);

    fireEvent.click(screen.getAllByTitle('Audition sound')[0]);
    expect(createdSources).toHaveLength(1);
    expect(createdSources[0].start).toHaveBeenCalled();

    fireEvent.click(screen.getAllByTitle('Audition sound')[0]);
    expect(createdSources[0].stop).toHaveBeenCalled();

    fireEvent.click(screen.getAllByTitle('Audition sound')[0]);
    act(() => {
      createdSources[1].onended?.();
    });
    expect(createdSources[1].disconnect).toHaveBeenCalled();
  });

  it('renders a processed preview when auditioning in FX mode', async () => {
    render(<FolderUploadModal onAddSamplesToKit={vi.fn()} />);
    await stageFiles([makeFile('kick.wav')]);

    fireEvent.click(screen.getByRole('button', { name: 'FX Processed' }));
    fireEvent.click(screen.getAllByTitle('Audition sound')[0]);
    expect(processAudioBuffer).toHaveBeenCalled();
  });

  it('generates a processed preview on the fly for an FX-enabled item', async () => {
    render(<FolderUploadModal onAddSamplesToKit={vi.fn()} />);
    await stageFiles([makeFile('kick.wav')]);

    fireEvent.click(screen.getByRole('button', { name: 'RAW (OFF)' }));
    expect(processAudioBuffer).toHaveBeenCalled();
  });

  it('opens the DSP panel and changes profile, variant count, normalize and knobs', async () => {
    render(<FolderUploadModal onAddSamplesToKit={vi.fn()} />);
    await stageFiles([makeFile('kick.wav')]);

    fireEvent.click(screen.getByRole('button', { name: /Tweak FX Options/ }));
    expect(screen.getByText(/Optional DSP Transformation Controls/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'LoFi' }));
    fireEvent.change(screen.getByDisplayValue('Single (1)'), { target: { value: '4' } });

    const normalize = screen.getByText('Normalize').parentElement?.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    fireEvent.click(normalize);

    const punch = screen.getByRole('slider', { name: 'Transient Punch' });
    fireEvent.keyDown(punch, { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Tube Drive' }), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Pitch Shift' }), { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Reverb Space' }), { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Bitcrusher' }), { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Stereo Width' }), { key: 'ArrowUp' });

    fireEvent.click(screen.getByRole('button', { name: /Hide FX Tweaks/ }));
    expect(screen.queryByText(/Optional DSP Transformation Controls/)).toBeNull();
  });

  it('compiles selected raw samples into the kit and closes', async () => {
    const onAddSamplesToKit = vi.fn();
    const onClose = vi.fn();
    render(<FolderUploadModal onAddSamplesToKit={onAddSamplesToKit} onClose={onClose} />);
    await stageFiles([makeFile('kick.wav'), makeFile('snare.wav')]);

    fireEvent.click(screen.getByRole('button', { name: /Compile .* Sounds into Kit/ }));
    await waitFor(() => expect(onAddSamplesToKit).toHaveBeenCalledTimes(1));

    const samples = onAddSamplesToKit.mock.calls[0][0];
    expect(samples).toHaveLength(2);
    expect(samples[0].tags).toContain('raw_clean');
    expect(onClose).toHaveBeenCalled();
  });

  it('compiles FX-applied samples with the analog tag', async () => {
    const onAddSamplesToKit = vi.fn();
    render(<FolderUploadModal onAddSamplesToKit={onAddSamplesToKit} />);
    await stageFiles([makeFile('kick.wav')]);

    fireEvent.click(screen.getByRole('button', { name: 'RAW (OFF)' }));
    fireEvent.click(screen.getByRole('button', { name: /Compile .* Sounds into Kit/ }));
    await waitFor(() => expect(onAddSamplesToKit).toHaveBeenCalledTimes(1));
    expect(onAddSamplesToKit.mock.calls[0][0][0].tags).toContain('analog_dsp');
  });

  it('generates variants when compiling with a variant count above one', async () => {
    const onAddSamplesToKit = vi.fn();
    render(<FolderUploadModal onAddSamplesToKit={onAddSamplesToKit} />);
    await stageFiles([makeFile('kick.wav')]);

    fireEvent.click(screen.getByRole('button', { name: /Tweak FX Options/ }));
    fireEvent.change(screen.getByDisplayValue('Single (1)'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /Compile .* Sounds into Kit/ }));

    await waitFor(() => expect(generateVariants).toHaveBeenCalled());
    await waitFor(() => expect(onAddSamplesToKit).toHaveBeenCalled());
    expect(onAddSamplesToKit.mock.calls[0][0]).toHaveLength(4);
    expect(onAddSamplesToKit.mock.calls[0][0][0].tags).toContain('evolved');
  });

  it('reports a compilation failure', async () => {
    const onAddSamplesToKit = vi.fn(() => {
      throw new Error('split the kit');
    });
    render(<FolderUploadModal onAddSamplesToKit={onAddSamplesToKit} />);
    await stageFiles([makeFile('kick.wav')]);

    fireEvent.click(screen.getByRole('button', { name: /Compile .* Sounds into Kit/ }));
    await waitFor(() => expect(screen.getByText(/Compile failed: split the kit/)).toBeDefined());
  });

  it('handles drop, drag-over/leave and opening the picker from the drop zone', async () => {
    render(<FolderUploadModal onAddSamplesToKit={vi.fn()} />);
    const dropZone = screen.getByText(/Click or Drag Audio Files/).closest('div') as HTMLElement;

    fireEvent.dragOver(dropZone);
    expect(screen.getByText('Drop Sound Files Here')).toBeDefined();
    fireEvent.dragLeave(dropZone);
    expect(screen.getByText(/Click or Drag Audio Files/)).toBeDefined();

    fireEvent.drop(dropZone, { dataTransfer: { files: [makeFile('kick.wav')] } });
    await waitFor(() => expect(screen.getAllByTitle('Audition sound')).toHaveLength(1));

    const clickSpy = vi.spyOn(fileInput(), 'click');
    fireEvent.click(dropZone);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('closes from Escape, the backdrop, and both exit buttons', async () => {
    const onClose = vi.fn();
    const { container, unmount } = render(<FolderUploadModal onAddSamplesToKit={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: /Exit Workspace/ }));
    fireEvent.click(screen.getByRole('button', { name: /Back to Kit Studio/ }));
    expect(onClose).toHaveBeenCalledTimes(4);
    unmount();
  });

  it('renders the staged waveform including the sharp-transient marker', () => {
    const { container } = render(
      <>
        <StagedSampleWaveform buffer={makeBuf()} />
        <StagedSampleWaveform buffer={makeBuf()} transientSharpness={8} color="#fff" transientColor="#000" height={40} />
      </>
    );
    expect(container.querySelectorAll('canvas')).toHaveLength(2);
  });
});
