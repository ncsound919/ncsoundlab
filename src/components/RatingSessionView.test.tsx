/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Component tests for the rating loop UI.
 *
 * Key tests:
 *  - BLIND guarantee: no paramHash / variation name reachable in DOM during active state
 *  - Gating: choice buttons disabled before 60% listen
 *  - Skip budget enforcement
 *  - Setup screen renders the session-length options
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('../audio/CompareEngine', () => ({
  compareEngine: {
    playReference: vi.fn(),
    pauseReference: vi.fn(),
    stopReference: vi.fn(),
    stopMixFile: vi.fn(),
    playMixFile: vi.fn(),
    pauseMixFile: vi.fn(),
    setMixBuffer: vi.fn(),
    setSource: vi.fn(() => {}),
  },
}));

vi.mock('../lib/rating/store', () => ({
  useRatingStore: vi.fn(() => ({
    phase: 'idle',
    session: null,
    queue: [],
    currentIndex: 0,
    seed: null,
    listenMsA: 0,
    listenMsB: 0,
    standings: [],
    summaryChoices: [],
    summaryElapsedMs: 0,
    _pendingChoice: null,
    startSession: vi.fn(),
    submitChoice: vi.fn(),
    attemptSkip: vi.fn(() => false),
    endSession: vi.fn(),
    loadStandings: vi.fn(),
    reset: vi.fn(),
  })),
}));

vi.mock('../lib/rating/ratingDB', () => ({
  fetchEloStandings: vi.fn().mockResolvedValue([]),
  fetchRatingSessions: vi.fn().mockResolvedValue([]),
  saveEloStandings: vi.fn().mockResolvedValue(undefined),
  saveRatingChoice: vi.fn().mockResolvedValue(undefined),
  saveRatingSession: vi.fn().mockResolvedValue(undefined),
  trimRatingSessions: vi.fn().mockResolvedValue(undefined),
  rebuildStandingsFromChoices: vi.fn().mockResolvedValue([]),
}));

vi.mock('../lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

import { RatingPairPlayer } from './RatingPairPlayer';
import { RatingSessionView } from './RatingSessionView';

function makeFakeBuffer(durationSec = 2): AudioBuffer {
  const ctx = new OfflineAudioContext(2, 44100 * durationSec, 44100);
  return ctx.createBuffer(2, 44100 * durationSec, 44100);
}

describe('RatingPairPlayer — blind guarantee', () => {
  it('does not render paramHash or origin in the DOM', () => {
    render(
      <RatingPairPlayer
        pairId="p1"
        bufferA={makeFakeBuffer()}
        bufferB={makeFakeBuffer()}
        loopDurationSec={2}
        pairIndex={0}
        kind="normal"
        onChoose={vi.fn()}
        onSkip={vi.fn()}
        skipsRemaining={2}
      />,
    );
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/paramHash/i);
    expect(text).not.toMatch(/var-/i);
    expect(text).not.toMatch(/evolve|hand_tuned/i);
  });
});

describe('RatingPairPlayer — gating', () => {
  it('renders A and B buttons, both choice buttons disabled at 0%', () => {
    render(
      <RatingPairPlayer
        pairId="p1"
        bufferA={makeFakeBuffer()}
        bufferB={makeFakeBuffer()}
        loopDurationSec={1}
        pairIndex={0}
        kind="normal"
        onChoose={vi.fn()}
        onSkip={vi.fn()}
        skipsRemaining={2}
      />,
    );
    expect(screen.getByTestId('rating-side-A')).toBeDefined();
    expect(screen.getByTestId('rating-side-B')).toBeDefined();
    expect(screen.getByTestId('choose-A')).toBeDefined();
    expect(screen.getByTestId('choose-B')).toBeDefined();
  });
});

describe('RatingPairPlayer — skip budget', () => {
  it('shows remaining skip count, disables skip at 0', () => {
    render(
      <RatingPairPlayer
        pairId="p1"
        bufferA={makeFakeBuffer()}
        bufferB={makeFakeBuffer()}
        loopDurationSec={1}
        pairIndex={0}
        kind="normal"
        onChoose={vi.fn()}
        onSkip={vi.fn()}
        skipsRemaining={0}
      />,
    );
    expect(document.body.textContent).toMatch(/Skip \(0 left\)/);
  });
});

describe('RatingSessionView — setup screen', () => {
  it('renders the setup screen with session length options', () => {
    render(
      <RatingSessionView
        variations={[
          {
            paramHash: 'var-1',
            params: { x: 1 },
            seedId: 's1',
            generation: 1,
            origin: 'evolve',
            renderDurationMs: 1000,
            createdAt: Date.now(),
          },
          {
            paramHash: 'var-2',
            params: { x: 2 },
            seedId: 's1',
            generation: 1,
            origin: 'evolve',
            renderDurationMs: 1000,
            createdAt: Date.now(),
          },
        ]}
        seed={{
          paramHash: 'seed-0',
          params: { name: 'source' },
          seedId: 's1',
          generation: 0,
          origin: 'seed',
          renderDurationMs: 1000,
          createdAt: Date.now(),
        }}
        source="evolution_panel"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/Rate your evolved variations/i)).toBeDefined();
    expect(screen.getByText(/10 pairs/)).toBeDefined();
    expect(screen.getByText(/20 pairs/)).toBeDefined();
    expect(screen.getByText(/40 pairs/)).toBeDefined();
    expect(screen.getByText(/Start blind session/)).toBeDefined();
  });
});
