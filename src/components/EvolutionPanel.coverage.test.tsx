/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extra coverage for `EvolutionPanel` — the rating-session flow (disabled
 * gate, open with no seed, open with seed, close, use-parent hit/miss), the
 * Recourse style/seed/URL inputs, Recourse pull error + no-context branches,
 * evolve-single/batch without `onSetVariations`, batch error recovery, raw
 * audition across two recordings + natural end + unmount cleanup, variation
 * label fallbacks, buffer-without-duration preview, and the absent-callback
 * branches. `evolutionEngine`, `recourseEvolution` and `RatingSessionView`
 * are stubbed; the global `audioEngine` mock is driven per-test.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { EvolutionPanel } from './EvolutionPanel';
import { audioEngine } from '../lib/audioEngine';
import { generateEvolutionVariations } from '../lib/evolutionEngine';

vi.mock('../lib/evolutionEngine', () => ({
  generateEvolutionVariations: vi.fn(),
}));
vi.mock('../lib/recourseEvolution', () => ({
  fetchRecoursePiece: vi.fn(async () => ({ title: 'Test Piece', style: 'steely-dan' })),
  renderRecoursePiece: vi.fn(async () => ({ duration: 8 }) as unknown as AudioBuffer),
  recoursePieceUrl: vi.fn(() => 'http://recourse.test/piece'),
  DEFAULT_RECOURSE_BASE: 'http://localhost:3050',
  RECOURSE_STYLES: ['steely-dan', 'airplane'],
}));
vi.mock('./RatingSessionView', () => ({
  RatingSessionView: ({ variations, onClose, onUseParent }: any) => (
    <div data-testid="rating-stub">
      <button onClick={onClose}>CLOSE_RATING</button>
      <button onClick={() => onUseParent(variations[0]?.paramHash)}>USE_FIRST</button>
      <button onClick={() => onUseParent('no-such-hash')}>USE_MISS</button>
    </div>
  ),
}));

import { fetchRecoursePiece, recoursePieceUrl } from '../lib/recourseEvolution';

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

const rawSources: any[] = [];
const makeCtx = (overrides: Record<string, unknown> = {}) => ({
  state: 'running',
  resume: vi.fn(async () => {}),
  decodeAudioData: vi.fn(async () => makeBuffer()),
  createBufferSource: vi.fn(() => {
    const s: any = { buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
    rawSources.push(s);
    return s;
  }),
  destination: {},
  ...overrides,
});

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
    />,
  );
  return { ...utils, calls };
};

const stageFile = async (name = 'loop.wav', type = 'audio/wav') => {
  const dropzone = screen.getByText(/Drop Field Recordings/).parentElement as HTMLElement;
  fireEvent.drop(dropzone, { dataTransfer: { files: [new File(['audio-data'], name, { type })] } });
  await waitFor(() => expect(screen.getByText(/Staged Recordings \(1\)/)).toBeDefined());
};

describe('EvolutionPanel coverage', () => {
  beforeEach(() => {
    rawSources.length = 0;
    vi.mocked(generateEvolutionVariations).mockReset();
    vi.mocked(generateEvolutionVariations).mockResolvedValue([]);
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

  it('disables Rate Variations until two variations exist', () => {
    const v = makeVariation('v1');
    renderPanel({ variations: [v] });
    const btn = screen.getByTestId('open-rating-session');
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.getAttribute('title')).toContain('at least 2');
  });

  it('opens nothing when rating with variations but no staged seed', () => {
    renderPanel({ variations: [makeVariation('v1'), makeVariation('v2')] });
    fireEvent.click(screen.getByTestId('open-rating-session'));
    // showRating is true but there is no seed batch item, so no modal.
    expect(screen.queryByTestId('rating-stub')).toBeNull();
  });

  it('opens the rating session from a staged seed and closes it', async () => {
    renderPanel({ variations: [makeVariation('v1'), makeVariation('v2')] });
    await stageFile();
    fireEvent.click(screen.getByTestId('open-rating-session'));
    expect(screen.getByTestId('rating-stub')).toBeDefined();
    fireEvent.click(screen.getByText('CLOSE_RATING'));
    expect(screen.queryByTestId('rating-stub')).toBeNull();
  });

  it('adopts the rated parent and closes on hash hit, stays open on miss', async () => {
    renderPanel({ variations: [makeVariation('v1'), makeVariation('v2')] });
    await stageFile();
    fireEvent.click(screen.getByTestId('open-rating-session'));
    fireEvent.click(screen.getByText('USE_MISS'));
    expect(screen.getByTestId('rating-stub')).toBeDefined();
    fireEvent.click(screen.getByText('USE_FIRST'));
    expect(screen.queryByTestId('rating-stub')).toBeNull();
  });

  it('passes default mode+fx through when generating with untouched selectors', () => {
    const { calls } = renderPanel();
    fireEvent.click(screen.getByText('Mutations'));
    fireEvent.click(screen.getByText(/Mutate All/));
    fireEvent.click(screen.getByText('Generate New Generation'));
    expect(calls.onReEvolve).toHaveBeenCalledWith('mutations', 'mutate');
  });

  it('hides the empty state while evolving', () => {
    renderPanel({ isEvolving: true });
    expect(screen.queryByText(/No variations generated yet/i)).toBeNull();
    expect(screen.getByText('Evolving...')).toBeDefined();
  });

  it('hides Send to Pads without the callback and Discard without onDiscard', () => {
    renderPanel({ variations: [makeVariation('v1')], onSendToPads: undefined, onDiscard: undefined });
    expect(screen.queryByTitle('Send these variations to the MPC pads as a program')).toBeNull();
    expect(screen.queryByTitle('Discard mutant')).toBeNull();
  });

  it('falls back to generated labels when role/name are missing', () => {
    renderPanel({ variations: [makeVariation('abcd1234efgh', { role: undefined, name: '' })] });
    expect(screen.getByText('Mutant Generation 1')).toBeDefined();
    expect(screen.getByText('ABCD1234')).toBeDefined();
  });

  it('previews a variation whose buffer has no duration', () => {
    renderPanel({ variations: [makeVariation('v1', { buffer: makeBuffer({ duration: undefined }) })] });
    fireEvent.click(screen.getByTitle('Preview mutant'));
    expect(audioEngine.playLayer).toHaveBeenCalled();
  });

  it('edits the Recourse style, seed and base URL inputs', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Recourse style'), { target: { value: 'airplane' } });
    fireEvent.change(screen.getByLabelText('Recourse seed'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Recourse base URL'), { target: { value: 'http://r.test' } });
    fireEvent.click(screen.getByRole('button', { name: /Add to Batch/i }));
    await waitFor(() => expect(fetchRecoursePiece).toHaveBeenCalled());
    expect(recoursePieceUrl).toHaveBeenCalledWith('http://r.test', 'airplane', 7);
  });

  it('coerces a blank Recourse seed to zero', async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Recourse seed'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Add to Batch/i }));
    await waitFor(() => expect(fetchRecoursePiece).toHaveBeenCalled());
    expect(recoursePieceUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), 0);
  });

  it('pulls and evolves without onSetVariations without crashing', async () => {
    renderPanel({ onSetVariations: undefined });
    fireEvent.click(screen.getByRole('button', { name: /Pull & Evolve/i }));
    await waitFor(() => expect(generateEvolutionVariations).toHaveBeenCalled());
  });

  it('surfaces an AudioContext-unavailable error on Pull & Evolve', async () => {
    (audioEngine.getContext as any).mockReturnValue(null);
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Pull & Evolve/i }));
    await waitFor(() =>
      expect(screen.getByText('AudioContext unavailable')).toBeDefined(),
    );
  });

  it('evolves a single recording without onSetVariations without crashing', async () => {
    renderPanel({ onSetVariations: undefined });
    await stageFile();
    vi.mocked(generateEvolutionVariations).mockResolvedValue([makeVariation('g')]);
    fireEvent.click(screen.getByTitle('Generate 6 unique mutated variations of this recording'));
    await waitFor(() => expect(generateEvolutionVariations).toHaveBeenCalled());
  });

  it('shows the per-recording Evolving state', async () => {
    let resolveGen!: (v: ReturnType<typeof makeVariation>[]) => void;
    vi.mocked(generateEvolutionVariations).mockImplementation(
      () => new Promise((res) => { resolveGen = res; }),
    );
    renderPanel();
    await stageFile();
    fireEvent.click(screen.getByTitle('Generate 6 unique mutated variations of this recording'));
    expect(await screen.findByText('Evolving...')).toBeDefined();
    resolveGen([makeVariation('g')]);
    await waitFor(() => expect(screen.queryByText('Evolving...')).toBeNull());
  });

  it('recovers the batch button when whole-batch evolution fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(generateEvolutionVariations).mockRejectedValue(new Error('batch boom'));
    renderPanel();
    await stageFile();
    fireEvent.click(screen.getByText(/Evolve Entire Batch \(1\)/));
    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(screen.getByText(/Evolve Entire Batch \(1\)/)).toBeDefined();
    errorSpy.mockRestore();
  });

  it('shows the batch Evolving state while the whole batch runs', async () => {
    let resolveGen!: (v: ReturnType<typeof makeVariation>[]) => void;
    vi.mocked(generateEvolutionVariations).mockImplementation(
      () => new Promise((res) => { resolveGen = res; }),
    );
    renderPanel();
    await stageFile();
    fireEvent.click(screen.getByText(/Evolve Entire Batch \(1\)/));
    expect(await screen.findByText('Evolving Batch...')).toBeDefined();
    resolveGen([makeVariation('g')]);
    await waitFor(() => expect(screen.queryByText('Evolving Batch...')).toBeNull());
  });

  it('switches raw audition between two staged recordings', async () => {
    renderPanel();
    const dropzone = screen.getByText(/Drop Field Recordings/).parentElement as HTMLElement;
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [
          new File(['a'], 'a.wav', { type: 'audio/wav' }),
          new File(['b'], 'b.wav', { type: 'audio/wav' }),
        ],
      },
    });
    await waitFor(() => expect(screen.getByText(/Staged Recordings \(2\)/)).toBeDefined());
    const auditions = screen.getAllByTitle('Audition raw unmodified field recording');
    fireEvent.click(auditions[0]);
    expect(rawSources).toHaveLength(1);
    fireEvent.click(auditions[1]);
    expect(rawSources).toHaveLength(2);
    expect(audioEngine.stop).toHaveBeenCalled();
  });

  it('clears raw playback when the source ends naturally', async () => {
    renderPanel();
    await stageFile();
    fireEvent.click(screen.getByTitle('Audition raw unmodified field recording'));
    expect(rawSources).toHaveLength(1);
    act(() => {
      rawSources[0].onended();
    });
    // A fresh audition starts a new source instead of toggling stop.
    fireEvent.click(screen.getByTitle('Audition raw unmodified field recording'));
    expect(rawSources).toHaveLength(2);
  });

  it('stops the raw source on unmount', async () => {
    const { unmount } = renderPanel();
    await stageFile();
    fireEvent.click(screen.getByTitle('Audition raw unmodified field recording'));
    expect(rawSources).toHaveLength(1);
    unmount();
    expect(rawSources[0].stop).toHaveBeenCalled();
  });
});
