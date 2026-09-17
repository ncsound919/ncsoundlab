/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Orchestrator coverage for `RatingSessionView`: setup screen (length
 * selection, prior-session lineage, start/cancel), bootstrap (standings load
 * vs rebuild vs failure), active phase (buffers-missing branch + player
 * delegation for choose/skip), and the summary screen (board, empty board,
 * tags, export, use-as-parent with/without callback, close persistence).
 */

import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RatingSessionView } from './RatingSessionView';
import { useRatingStore } from '../lib/rating/store';
import * as ratingDB from '../lib/rating/ratingDB';
import * as ratingExport from '../lib/rating/export';

vi.mock('../lib/rating/ratingDB', () => ({
  fetchEloStandings: vi.fn(),
  fetchRatingSessions: vi.fn(),
  saveEloStandings: vi.fn(),
  saveRatingChoice: vi.fn(),
  saveRatingSession: vi.fn(),
  trimRatingSessions: vi.fn(),
  rebuildStandingsFromChoices: vi.fn(),
}));

vi.mock('../lib/rating/export', () => ({
  buildExportEnvelope: vi.fn(),
  downloadExport: vi.fn(),
}));

vi.mock('./RatingPairPlayer', () => ({
  RatingPairPlayer: (props: {
    onChoose: (c: 'A' | 'B', meta: Record<string, unknown>) => void;
    onSkip: () => void;
  }) => (
    <div data-testid="mock-pair-player">
      <button
        type="button"
        onClick={() =>
          props.onChoose('A', {
            confidence: 2,
            dimensions: { tags: [] as string[] },
            listenMsA: 11,
            listenMsB: 22,
            elapsedMs: 33,
          })
        }
      >
        mock-choose
      </button>
      <button type="button" onClick={props.onSkip}>
        mock-skip
      </button>
    </div>
  ),
}));

const db = vi.mocked(ratingDB, true);
const exp = vi.mocked(ratingExport, true);

const fakeBuffer = () =>
  ({
    numberOfChannels: 1,
    length: 44100,
    sampleRate: 44100,
    duration: 1,
    getChannelData: () => new Float32Array(44100),
  }) as unknown as AudioBuffer;

const makeVariation = (i: number, withBuffer = false) => ({
  paramHash: `hash-${i}`,
  params: { cutoff: 1000 + i },
  seedId: `seed-${i}`,
  generation: i === 0 ? 0 : 1,
  origin: (i === 0 ? 'seed' : 'evolve') as 'seed' | 'evolve',
  renderDurationMs: 4000,
  createdAt: Date.now(),
  ...(withBuffer ? { buffer: fakeBuffer() } : {}),
});

const viewProps = (withBuffers = false) => ({
  variations: Array.from({ length: 6 }, (_, i) => makeVariation(i + 1, withBuffers)),
  seed: { ...makeVariation(0, withBuffers), origin: 'seed' as const },
  onClose: vi.fn(),
  onUseParent: vi.fn(),
  source: 'manual' as const,
});

const startActiveSession = (withBuffers = true) => {
  const props = viewProps(withBuffers);
  const vars = props.variations.map((v) => ({ ...v, origin: v.origin as 'evolve' | 'seed' | 'hand_tuned' }));
  useRatingStore.getState().startSession({
    batch: vars,
    seed: { ...props.seed, origin: 'seed' as const },
    sessionLen: 10,
    source: 'manual',
    appVersion: '1.1.0',
  });
  // Attach runtime buffers to the queued pairs (the store descriptors lack them).
  const st = useRatingStore.getState();
  const queue = st.queue.map((p) => ({
    ...p,
    a: { ...p.a, buffer: fakeBuffer() } as typeof p.a,
    b: { ...p.b, buffer: fakeBuffer() } as typeof p.b,
  }));
  useRatingStore.setState({ queue });
  return props;
};

describe('RatingSessionView', () => {
  beforeEach(() => {
    useRatingStore.getState().reset();
    vi.clearAllMocks();
    db.fetchEloStandings.mockResolvedValue([]);
    db.fetchRatingSessions.mockResolvedValue([]);
    db.rebuildStandingsFromChoices.mockResolvedValue([]);
    db.saveEloStandings.mockResolvedValue(undefined);
    db.saveRatingChoice.mockResolvedValue(undefined);
    db.saveRatingSession.mockResolvedValue(undefined);
    db.trimRatingSessions.mockResolvedValue(undefined);
    exp.buildExportEnvelope.mockReturnValue({ format: 'soundlab.ratings.v1' } as never);
    exp.downloadExport.mockReturnValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the setup screen and rebuilds standings when none are stored', async () => {
    const props = viewProps();
    render(<RatingSessionView {...props} />);
    expect(await screen.findByText('Rate your evolved variations')).toBeDefined();
    expect(screen.getByRole('button', { name: /10 pairs/ })).toBeDefined();
    await waitFor(() => expect(db.rebuildStandingsFromChoices).toHaveBeenCalled());
  });

  it('uses stored standings directly when they exist', async () => {
    db.fetchEloStandings.mockResolvedValue([
      {
        paramHash: 'hash-9',
        rating: 1500,
        wins: 2,
        losses: 0,
        exposures: 2,
        lastSeenAt: Date.now(),
        seedId: 'seed-9',
        generation: 1,
      },
    ]);
    render(<RatingSessionView {...viewProps()} />);
    await screen.findByText('Rate your evolved variations');
    await waitFor(() => expect(db.rebuildStandingsFromChoices).not.toHaveBeenCalled());
    expect(useRatingStore.getState().standings).toHaveLength(1);
  });

  it('degrades gracefully when the bootstrap throws', async () => {
    db.fetchEloStandings.mockRejectedValue(new Error('idb locked'));
    render(<RatingSessionView {...viewProps()} />);
    expect(await screen.findByText('Rate your evolved variations')).toBeDefined();
  });

  it('shows prior-session lineage when sessions exist', async () => {
    db.fetchRatingSessions.mockResolvedValue([
      { sessionId: 's1', startedAt: 1 } as never,
      { sessionId: 's2', startedAt: 2 } as never,
    ]);
    db.fetchEloStandings.mockResolvedValue([
      {
        paramHash: 'h',
        rating: 1200,
        wins: 1,
        losses: 1,
        exposures: 2,
        lastSeenAt: Date.now(),
        seedId: 'sd',
        generation: 0,
      },
    ]);
    render(<RatingSessionView {...viewProps()} />);
    expect(await screen.findByText(/Continuing a lineage with 2 prior sessions/)).toBeDefined();
  });

  it('selects session length and starts a blind session; cancel closes', async () => {
    const props = viewProps();
    render(<RatingSessionView {...props} />);
    await screen.findByText('Rate your evolved variations');
    fireEvent.click(screen.getByRole('button', { name: /20 pairs/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Start blind session' }));
    expect(useRatingStore.getState().phase).toBe('active');
    expect(useRatingStore.getState().session?.plannedPairs).toBe(20);

    // Cancel path from a fresh setup render.
    cleanup();
    useRatingStore.getState().reset();
    const props2 = viewProps();
    render(<RatingSessionView {...props2} />);
    await screen.findByText('Rate your evolved variations');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props2.onClose).toHaveBeenCalledTimes(1);
    expect(useRatingStore.getState().phase).toBe('idle');
  });

  it('persists the session record once active', async () => {
    startActiveSession(false);
    render(<RatingSessionView {...viewProps(false)} />);
    await waitFor(() => expect(db.saveRatingSession).toHaveBeenCalled());
  });

  it('shows the missing-buffers fallback when variation renders are absent', async () => {
    useRatingStore.getState().reset();
    const props = viewProps(false);
    const vars = props.variations.map((v) => ({ ...v, origin: v.origin as 'evolve' | 'seed' | 'hand_tuned' }));
    useRatingStore.getState().startSession({
      batch: vars,
      seed: { ...props.seed, origin: 'seed' as const },
      sessionLen: 10,
      source: 'manual',
      appVersion: '1.1.0',
    });
    render(<RatingSessionView {...props} />);
    expect(await screen.findByText('Audio buffers missing')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('delegates to the pair player: choose persists + advances, skip consumes budget', async () => {
    const props = startActiveSession(true);
    render(<RatingSessionView {...props} />);
    expect(await screen.findByTestId('mock-pair-player')).toBeDefined();

    fireEvent.click(screen.getByText('mock-choose'));
    await waitFor(() => expect(db.saveRatingChoice).toHaveBeenCalled());
    expect(useRatingStore.getState().session?.completedPairs).toBe(1);

    fireEvent.click(screen.getByText('mock-skip'));
    expect(useRatingStore.getState().session?.skippedPairs).toBe(1);
  });

  it('closing mid-session ends the session before resetting', async () => {
    // Missing-buffer fallback exposes Close while phase === 'active'.
    useRatingStore.getState().reset();
    const props = viewProps(false);
    const vars = props.variations.map((v) => ({ ...v, origin: v.origin as 'evolve' | 'seed' | 'hand_tuned' }));
    useRatingStore.getState().startSession({
      batch: vars,
      seed: { ...props.seed, origin: 'seed' as const },
      sessionLen: 10,
      source: 'manual',
      appVersion: '1.1.0',
    });
    render(<RatingSessionView {...props} />);
    await screen.findByText('Audio buffers missing');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(useRatingStore.getState().phase).toBe('idle');
    expect(props.onClose).toHaveBeenCalled();
  });

  it('summary: empty board message when nothing was rated', async () => {
    const props = viewProps();
    useRatingStore.setState({
      phase: 'summary',
      session: {
        sessionId: 's1',
        schemaVersion: 1,
        appVersion: '1.1.0',
        startedAt: Date.now(),
        source: 'manual',
        seedId: 'seed-0',
        plannedPairs: 10,
        completedPairs: 0,
        skippedPairs: 1,
        ratingSystem: 'elo_v1_k32',
        contextLatencyHint: 'playback',
      },
      summaryChoices: [],
      summaryElapsedMs: 5000,
      standings: [],
      seed: { ...props.seed, origin: 'seed' as const },
    });
    render(<RatingSessionView {...props} />);
    expect(await screen.findByText('No normal pairs rated yet.')).toBeDefined();
    expect(screen.getByText(/0 pairs · 1 skip/)).toBeDefined();
    expect(screen.getByText(/Seed: seed-0/)).toBeDefined();
  });

  it('summary: board rows, tags, export, use-as-parent promotion and close persistence', async () => {
    const props = viewProps();
    const now = Date.now();
    useRatingStore.setState({
      phase: 'summary',
      session: {
        sessionId: 's9',
        schemaVersion: 1,
        appVersion: '1.1.0',
        startedAt: now,
        source: 'manual',
        seedId: 'seed-0',
        plannedPairs: 10,
        completedPairs: 2,
        skippedPairs: 0,
        ratingSystem: 'elo_v1_k32',
        contextLatencyHint: 'playback',
      },
      summaryChoices: [
        {
          pairId: 'p1',
          sessionId: 's9',
          choice: 'A',
          confidence: 3,
          dimensions: { tags: ['knock', 'warmth'] },
          listenMsA: 1,
          listenMsB: 2,
          decidedAt: now,
          elapsedMs: 3,
        },
        {
          pairId: 'p2',
          sessionId: 's9',
          choice: 'B',
          confidence: 2,
          dimensions: { tags: ['knock'] },
          listenMsA: 1,
          listenMsB: 2,
          decidedAt: now,
          elapsedMs: 3,
        },
      ],
      summaryElapsedMs: 9000,
      // NOTE: standings are (re)set after render — the bootstrap effect calls
      // loadStandings([]) on mount and would overwrite a preset here.
      standings: [],
      seed: { ...props.seed, origin: 'seed' as const },
    });
    render(<RatingSessionView {...props} />);
    expect(await screen.findByText(/Lineage board/)).toBeDefined();
    act(() => {
      useRatingStore.setState({
        standings: [
          {
            paramHash: 'abcdef1234567890',
            rating: 1320,
            wins: 2,
            losses: 1,
            exposures: 3,
            lastSeenAt: now,
            seedId: 'seed-1',
            generation: 1,
          },
        ],
      });
    });
    // Tag frequencies aggregated across choices.
    expect(screen.getByText('knock · 2')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Export ratings JSON/ }));
    await waitFor(() => expect(exp.buildExportEnvelope).toHaveBeenCalled());
    expect(exp.downloadExport).toHaveBeenCalled();

    // Promote the top row, then close: onUseParent fires with the pending hash.
    fireEvent.click(screen.getByRole('button', { name: /Use as parent/ }));
    fireEvent.click(screen.getByRole('button', { name: /Close/ }));
    await waitFor(() => expect(db.saveEloStandings).toHaveBeenCalled());
    expect(db.trimRatingSessions).toHaveBeenCalled();
    expect(props.onUseParent).toHaveBeenCalledWith('abcdef1234567890');
    expect(props.onClose).toHaveBeenCalled();
    expect(useRatingStore.getState().phase).toBe('idle');
  });

  it('summary close without an onUseParent callback does not throw', async () => {
    const { onUseParent: _omit, ...rest } = viewProps();
    void _omit;
    const props = { ...rest, onUseParent: undefined };
    useRatingStore.setState({
      phase: 'summary',
      session: {
        sessionId: 's2',
        schemaVersion: 1,
        appVersion: '1.1.0',
        startedAt: Date.now(),
        source: 'manual',
        seedId: 'seed-0',
        plannedPairs: 10,
        completedPairs: 1,
        skippedPairs: 1,
        ratingSystem: 'elo_v1_k32',
        contextLatencyHint: 'playback',
      },
      summaryChoices: [],
      summaryElapsedMs: 1000,
      standings: [],
      seed: null,
    });
    render(<RatingSessionView {...props} />);
    await screen.findByText('No normal pairs rated yet.');
    // No standings → no promote button → pendingUseParent stays null.
    fireEvent.click(screen.getByRole('button', { name: /Close/ }));
    await waitFor(() => expect(rest.onClose).toHaveBeenCalled());
  });
});
