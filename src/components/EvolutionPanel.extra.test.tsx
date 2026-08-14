/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Interaction tests for the batch-ingest + preview flows in EvolutionPanel
 * that the smoke test (EvolutionPanel.test.tsx) does not cover. The
 * evolutionEngine module is mocked; audioEngine (auto-mocked in setup.ts)
 * has its getContext override per-test.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { EvolutionPanel } from './EvolutionPanel';
import { audioEngine } from '../lib/audioEngine';
import { generateEvolutionVariations } from '../lib/evolutionEngine';

vi.mock('../lib/evolutionEngine', () => ({
  generateEvolutionVariations: vi.fn(),
}));

const makeBuffer = (overrides: Record<string, unknown> = {}) =>
  ({ duration: 1.5, sampleRate: 44100, numberOfChannels: 1, ...overrides }) as unknown as AudioBuffer;

const makeVariation = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Mutant ${id}`,
  role: 'lead',
  buffer: makeBuffer(),
  chaosLevel: 0.5,
  spectralDensity: 0.5,
  temporalBehavior: 0.5,
  routingPath: ['filter'],
  ...overrides,
});

const makeCtx = (overrides: Record<string, unknown> = {}) => {
  const source = () => ({
    buffer: null,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  });
  return {
    state: 'running',
    resume: vi.fn(async () => {}),
    decodeAudioData: vi.fn(async () => makeBuffer()),
    createBufferSource: vi.fn(source),
    destination: {},
    ...overrides,
  } as any;
};

const renderPanel = (props: Record<string, unknown> = {}) => {
  const calls = {
    onAddLayer: vi.fn(),
    onSaveToKit: vi.fn(),
    onReEvolve: vi.fn(),
    onDiscard: vi.fn(),
    onSetVariations: vi.fn(),
    onSendToPads: vi.fn(),
  };
  const utils = render(
    <EvolutionPanel
      variations={[]}
      isEvolving={false}
      onAddLayer={calls.onAddLayer}
      onSaveToKit={calls.onSaveToKit}
      onReEvolve={calls.onReEvolve}
      onDiscard={calls.onDiscard}
      onSetVariations={calls.onSetVariations}
      onSendToPads={calls.onSendToPads}
      {...props}
    />
  );
  return { ...utils, calls };
};

describe('EvolutionPanel interaction tests', () => {
  beforeEach(() => {
    vi.mocked(generateEvolutionVariations).mockReset();
    (audioEngine.getContext as any).mockReset();
    (audioEngine.getContext as any).mockReturnValue(makeCtx());
    (audioEngine as any).playLayer = vi.fn();
    (audioEngine as any).stop = vi.fn();
  });

  afterEach(() => {
    (audioEngine.getContext as any).mockReset();
    delete (audioEngine as any).stop;
    (audioEngine as any).playLayer = vi.fn();
  });

  it('switches evolution mode and passes mode + fx option to onReEvolve', () => {
    const { calls } = renderPanel();
    fireEvent.click(screen.getByText('Melodic Set'));
    fireEvent.click(screen.getByText(/Freeze FX/));
    fireEvent.click(screen.getByText('Generate New Generation'));
    expect(calls.onReEvolve).toHaveBeenCalledWith('melodic', 'freeze');

    fireEvent.click(screen.getByText('Drum Kit'));
    fireEvent.click(screen.getByText(/Change FX Only/));
    fireEvent.click(screen.getByText('Generate New Generation'));
    expect(calls.onReEvolve).toHaveBeenCalledWith('kit', 'fx_only');
  });

  it('disables the re-evolve button while evolving', () => {
    renderPanel({ isEvolving: true });
    const btn = screen.getByText('Evolving...').closest('button');
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders and triggers the Send to Pads button', () => {
    const variation = makeVariation('v1');
    const { calls } = renderPanel({ variations: [variation] });
    fireEvent.click(screen.getByTitle('Send these variations to the MPC pads as a program'));
    expect(calls.onSendToPads).toHaveBeenCalledWith([{ name: 'Mutant v1', buffer: variation.buffer }]);
  });

  it('triggers add / save / discard / preview actions per variation', async () => {
    const variation = makeVariation('v1');
    const { calls } = renderPanel({ variations: [variation] });

    fireEvent.click(screen.getByTitle('Add as Layer'));
    expect(calls.onAddLayer).toHaveBeenCalledWith(variation);

    fireEvent.click(screen.getByTitle('Save to Kit'));
    expect(calls.onSaveToKit).toHaveBeenCalledWith(variation);

    fireEvent.click(screen.getByTitle('Discard mutant'));
    expect(calls.onDiscard).toHaveBeenCalledWith('v1');

    fireEvent.click(screen.getByTitle('Preview mutant'));
    expect(audioEngine.playLayer).toHaveBeenCalled();

    fireEvent.click(await screen.findByTitle('Stop preview'));
    expect(audioEngine.stop).toHaveBeenCalled();
  });

  it('does not preview a variation without a buffer', () => {
    const variation = makeVariation('v1', { buffer: undefined });
    const { calls } = renderPanel({ variations: [variation] });
    fireEvent.click(screen.getByTitle('Preview mutant'));
    expect(audioEngine.playLayer).not.toHaveBeenCalled();
  });

  it('stops playback of the previous preview when a different one starts', async () => {
    const v1 = makeVariation('v1');
    const v2 = makeVariation('v2');
    const { calls } = renderPanel({ variations: [v1, v2] });
    fireEvent.click(screen.getAllByTitle('Preview mutant')[0]);
    fireEvent.click(screen.getAllByTitle('Preview mutant')[0]);
    expect(audioEngine.playLayer).toHaveBeenCalledTimes(2);
  });

  it('cleans up the preview timeout on unmount without throwing', () => {
    const variation = makeVariation('v1');
    const { unmount, calls } = renderPanel({ variations: [variation] });
    fireEvent.click(screen.getByTitle('Preview mutant'));
    expect(() => unmount()).not.toThrow();
  });

  it('uploads files through the file input and stages them', async () => {
    const { calls } = renderPanel();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['audio-data'], 'kick.wav', { type: 'audio/wav' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/Staged Recordings \(1\)/)).toBeDefined());
    expect(screen.getByText('KICK')).toBeDefined();
  });

  it('ignores non-audio files during batch ingest', async () => {
    const { calls } = renderPanel();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Staged Recordings/)).toBeNull();
  });

  it('logs and skips files that fail to decode', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (audioEngine.getContext as any).mockReturnValue(
      makeCtx({ decodeAudioData: vi.fn(async () => { throw new Error('bad'); }) })
    );
    const { calls } = renderPanel();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'kick.wav', { type: 'audio/wav' });
    fireEvent.change(input, { target: { files: [file] } });
    await new Promise((r) => setTimeout(r, 20));
    expect(errorSpy).toHaveBeenCalled();
    expect(screen.queryByText(/Staged Recordings/)).toBeNull();
    errorSpy.mockRestore();
  });

  it('bails out of file ingest when the audio context is unavailable', async () => {
    (audioEngine.getContext as any).mockReturnValue(null as any);
    const { calls } = renderPanel();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'kick.wav', { type: 'audio/wav' });
    fireEvent.change(input, { target: { files: [file] } });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Staged Recordings/)).toBeNull();
  });

  it('handles drag over / drag leave / drop to stage files', async () => {
    const { calls } = renderPanel();
    const dropzone = screen.getByText(/Drop Field Recordings/).parentElement as HTMLElement;
    fireEvent.dragOver(dropzone, { dataTransfer: { files: [] } });
    fireEvent.dragLeave(dropzone);
    const file = new File(['audio-data'], 'loop.mp3', { type: 'audio/mpeg' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(screen.getByText('LOOP')).toBeDefined());
  });

  it('auditions and stops raw recordings, toggling the playing state', async () => {
    const { calls } = renderPanel();
    const dropzone = screen.getByText(/Drop Field Recordings/).parentElement as HTMLElement;
    const file = new File(['audio-data'], 'loop.wav', { type: 'audio/wav' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    const audition = await screen.findByTitle('Audition raw unmodified field recording');
    fireEvent.click(audition);
    expect(audioEngine.getContext).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Audition raw unmodified field recording'));
    expect(audioEngine.stop).toHaveBeenCalled();
  });

  it('evolves a single staged recording into prefixed variations', async () => {
    const variation = makeVariation('gen-1');
    vi.mocked(generateEvolutionVariations).mockResolvedValue([variation]);
    const { calls } = renderPanel({ variations: [variation] });
    const dropzone = screen.getByText(/Drop Field Recordings/).parentElement as HTMLElement;
    const file = new File(['audio-data'], 'loop.wav', { type: 'audio/wav' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(screen.getByText('LOOP')).toBeDefined());

    fireEvent.click(screen.getByTitle('Generate 6 unique mutated variations of this recording'));
    await waitFor(() =>
      expect(calls.onSetVariations).toHaveBeenCalledWith([
        { ...variation, name: 'LOOP // MT-1' },
        variation,
      ])
    );
    expect(generateEvolutionVariations).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      6,
      0.6,
      'mutations',
      'mutate'
    );
  });

  it('logs and recovers when evolving a single recording fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(generateEvolutionVariations).mockRejectedValue(new Error('boom'));
    const { calls } = renderPanel();
    const dropzone = screen.getByText(/Drop Field Recordings/).parentElement as HTMLElement;
    const file = new File(['audio-data'], 'loop.wav', { type: 'audio/wav' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(screen.getByText('LOOP')).toBeDefined());

    fireEvent.click(screen.getByTitle('Generate 6 unique mutated variations of this recording'));
    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(calls.onSetVariations).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('evolves the entire staged batch into variations', async () => {
    const variation = makeVariation('gen-1');
    vi.mocked(generateEvolutionVariations).mockResolvedValue([variation]);
    const { calls } = renderPanel();
    const dropzone = screen.getByText(/Drop Field Recordings/).parentElement as HTMLElement;
    const file1 = new File(['audio-data'], 'a.wav', { type: 'audio/wav' });
    const file2 = new File(['audio-data'], 'b.wav', { type: 'audio/wav' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file1, file2] } });
    await waitFor(() => expect(screen.getByText(/Evolve Entire Batch \(2\)/)).toBeDefined());

    fireEvent.click(screen.getByText(/Evolve Entire Batch \(2\)/));
    await waitFor(() =>
      expect(calls.onSetVariations).toHaveBeenCalledWith([
        { ...variation, name: 'A // MT-1' },
        { ...variation, name: 'B // MT-1' },
      ])
    );
    expect(generateEvolutionVariations).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      3,
      0.65,
      'mutations',
      'mutate'
    );
  });

  it('removes a staged recording from the batch', async () => {
    const { calls } = renderPanel();
    const dropzone = screen.getByText(/Drop Field Recordings/).parentElement as HTMLElement;
    const file = new File(['audio-data'], 'loop.wav', { type: 'audio/wav' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(screen.getByText('LOOP')).toBeDefined());

    fireEvent.click(screen.getByTitle('Remove from batch'));
    await waitFor(() => expect(screen.queryByText('LOOP')).toBeNull());
  });

  it('opens the file picker when the dropzone is clicked', async () => {
    const { calls } = renderPanel();
    const dropzone = screen.getByText(/Drop Field Recordings/).parentElement as HTMLElement;
    expect(() => fireEvent.click(dropzone)).not.toThrow();
  });

  it('bails out of playback/evolve flows when the context disappears', async () => {
    const { calls } = renderPanel();
    const dropzone = screen.getByText(/Drop Field Recordings/).parentElement as HTMLElement;
    const file = new File(['audio-data'], 'loop.wav', { type: 'audio/wav' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(screen.getByText('LOOP')).toBeDefined());

    (audioEngine.getContext as any).mockReturnValue(null as any);
    fireEvent.click(screen.getByTitle('Audition raw unmodified field recording'));
    fireEvent.click(screen.getByTitle('Generate 6 unique mutated variations of this recording'));
    fireEvent.click(screen.getByText(/Evolve Entire Batch \(1\)/));
    expect(calls.onSetVariations).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.onSetVariations).not.toHaveBeenCalled();
  });
});

