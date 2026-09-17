/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exhaustive interaction coverage for `RatingPairPlayer`: default render,
 * listen-gate gating, play/pause toggling per side, skip budget, keyboard
 * shortcuts, the post-choice micro-form (tags/confidence/note/continue),
 * pair-change reset, unmount cleanup, and the blind-DOM guarantee.
 */

import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RatingPairPlayer } from './RatingPairPlayer';

vi.mock('../audio/CompareEngine', () => ({
  compareEngine: {
    setSource: vi.fn(),
    playReference: vi.fn(),
    setMixBuffer: vi.fn(),
    playMixFile: vi.fn(),
    pauseReference: vi.fn(),
    stopReference: vi.fn(),
    stopMixFile: vi.fn(),
  },
}));

import { compareEngine } from '../audio/CompareEngine';

const mockedEngine = vi.mocked(compareEngine, true);

const fakeBuffer = () =>
  ({
    numberOfChannels: 1,
    length: 44100,
    sampleRate: 44100,
    duration: 1,
    getChannelData: () => new Float32Array(44100),
  }) as unknown as AudioBuffer;

// loopDurationSec = 0 → gate = 0ms → ready immediately (pct falls back to 1).
const baseProps = () => ({
  pairId: 'pair-1',
  bufferA: fakeBuffer(),
  bufferB: fakeBuffer(),
  loopDurationSec: 0,
  pairIndex: 0,
  kind: 'normal',
  onChoose: vi.fn(),
  onSkip: vi.fn(),
  skipsRemaining: 2,
});

const rafQueue: FrameRequestCallback[] = [];
const keyDownOnWindow = (key: string, extra: KeyboardEventInit = {}) => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...extra }));
  });
};

describe('RatingPairPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rafQueue.length = 0;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb: FrameRequestCallback) => {
        rafQueue.push(cb);
        return rafQueue.length;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders the pair header, sides, choose buttons and skip budget', () => {
    const props = baseProps();
    render(<RatingPairPlayer {...props} />);
    expect(screen.getByText(/Pair 1/)).toBeDefined();
    expect(screen.getByTestId('rating-side-A')).toBeDefined();
    expect(screen.getByTestId('rating-side-B')).toBeDefined();
    expect(screen.getByTestId('choose-A')).toBeDefined();
    expect(screen.getByTestId('choose-B')).toBeDefined();
    expect(screen.getByRole('button', { name: /Skip \(2 left\)/ })).toBeDefined();
  });

  it('shows the listen-gate hint and disabled choices when the gate is not met', () => {
    const props = { ...baseProps(), loopDurationSec: 10 };
    render(<RatingPairPlayer {...props} />);
    expect(screen.getByTestId('choose-A').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('choose-B').hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/Listen to both sides until the bars fill/)).toBeDefined();
    // Gate-met render hides the hint and enables choices.
    cleanup();
    render(<RatingPairPlayer {...baseProps()} />);
    expect(screen.queryByText(/Listen to both sides until the bars fill/)).toBeNull();
    expect(screen.getByTestId('choose-A').hasAttribute('disabled')).toBe(false);
  });

  it('disables skip at zero budget and fires onSkip otherwise', () => {
    const props = { ...baseProps(), skipsRemaining: 0 };
    const { rerender } = render(<RatingPairPlayer {...props} />);
    expect(screen.getByRole('button', { name: /Skip \(0 left\)/ }).hasAttribute('disabled')).toBe(true);

    const live = baseProps();
    rerender(<RatingPairPlayer {...live} />);
    fireEvent.click(screen.getByRole('button', { name: /Skip \(2 left\)/ }));
    expect(live.onSkip).toHaveBeenCalledTimes(1);
  });

  it('plays side A via the reference path and toggles pause on a second click', () => {
    render(<RatingPairPlayer {...baseProps()} />);
    const sideA = screen.getByTestId('rating-side-A');
    fireEvent.click(sideA);
    expect(mockedEngine.setSource).toHaveBeenCalledWith('A');
    expect(mockedEngine.playReference).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Playing')).toBeDefined();

    // Second click on the active side pauses.
    fireEvent.click(sideA);
    expect(mockedEngine.pauseReference).toHaveBeenCalledTimes(1);
    expect(mockedEngine.stopMixFile).toHaveBeenCalled();
    expect(screen.getAllByText('Click to play')).toHaveLength(2);
  });

  it('plays side B via the mix path', () => {
    const props = baseProps();
    render(<RatingPairPlayer {...props} />);
    fireEvent.click(screen.getByTestId('rating-side-B'));
    expect(mockedEngine.setSource).toHaveBeenCalledWith('B');
    expect(mockedEngine.setMixBuffer).toHaveBeenCalledWith(props.bufferB);
    expect(mockedEngine.playMixFile).toHaveBeenCalledWith(0);
  });

  it('switches sides without pausing (B while A plays)', () => {
    render(<RatingPairPlayer {...baseProps()} />);
    fireEvent.click(screen.getByTestId('rating-side-A'));
    fireEvent.click(screen.getByTestId('rating-side-B'));
    expect(mockedEngine.setSource).toHaveBeenLastCalledWith('B');
    expect(mockedEngine.playMixFile).toHaveBeenCalledTimes(1);
    // Pause was only for the toggle-off path, not the switch path.
    expect(mockedEngine.pauseReference).not.toHaveBeenCalled();
  });

  it('choose buttons open the pending form and Continue reports meta to onChoose', () => {
    const props = baseProps();
    render(<RatingPairPlayer {...props} />);
    fireEvent.click(screen.getByTestId('choose-A'));
    expect(mockedEngine.pauseReference).toHaveBeenCalled();
    expect(screen.getByText('You chose A')).toBeDefined();

    // Tag toggle on then off, confidence to "Sure", then continue.
    const knock = screen.getByRole('button', { name: 'knock' });
    fireEvent.click(knock);
    fireEvent.click(knock);
    fireEvent.click(screen.getByRole('button', { name: /3 · Sure/ }));
    fireEvent.change(screen.getByPlaceholderText('One line of context…'), {
      target: { value: 'great low end' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));

    expect(props.onChoose).toHaveBeenCalledTimes(1);
    const [choice, meta] = props.onChoose.mock.calls[0] as unknown as [
      string,
      { confidence: number; dimensions: { tags: string[]; note?: string }; listenMsA: number; listenMsB: number; elapsedMs: number },
    ];
    expect(choice).toBe('A');
    expect(meta.confidence).toBe(3);
    expect(meta.dimensions.tags).toEqual([]);
    expect(meta.dimensions.note).toBe('great low end');
    expect(typeof meta.listenMsA).toBe('number');
    expect(typeof meta.elapsedMs).toBe('number');
  });

  it('submits tags + confidence 1 with an empty note (note stays undefined)', () => {
    const props = baseProps();
    render(<RatingPairPlayer {...props} />);
    fireEvent.click(screen.getByTestId('choose-B'));
    expect(screen.getByText('You chose B')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'warmth' }));
    fireEvent.click(screen.getByRole('button', { name: 'movement' }));
    fireEvent.click(screen.getByRole('button', { name: /1 · Coin flip/ }));
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    const [, meta] = props.onChoose.mock.calls[0] as unknown as [
      string,
      { confidence: number; dimensions: { tags: string[]; note?: string } },
    ];
    expect(meta.confidence).toBe(1);
    expect(meta.dimensions.tags).toEqual(['warmth', 'movement']);
    expect(meta.dimensions.note).toBeUndefined();
  });

  it('truncates notes longer than 200 chars', () => {
    const props = baseProps();
    render(<RatingPairPlayer {...props} />);
    fireEvent.click(screen.getByTestId('choose-A'));
    fireEvent.change(screen.getByPlaceholderText('One line of context…'), {
      target: { value: 'x'.repeat(250) },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    const [, meta] = props.onChoose.mock.calls[0] as unknown as [
      string,
      { dimensions: { note?: string } },
    ];
    expect(meta.dimensions.note!.length).toBeLessThanOrEqual(200);
  });

  it('keyboard: a/b play sides, Enter chooses when ready, s skips, space is a no-op', () => {
    const props = baseProps();
    render(<RatingPairPlayer {...props} />);
    keyDownOnWindow('a');
    expect(mockedEngine.setSource).toHaveBeenCalledWith('A');
    keyDownOnWindow('2');
    expect(mockedEngine.setSource).toHaveBeenCalledWith('B');
    keyDownOnWindow('s');
    expect(props.onSkip).toHaveBeenCalledTimes(1);
    keyDownOnWindow(' ');
    expect(props.onChoose).not.toHaveBeenCalled();

    // Active side is B after the '2' press, so Enter chooses B.
    keyDownOnWindow('Enter');
    expect(screen.getByText(/You chose/)).toBeDefined();
    expect(props.onChoose).not.toHaveBeenCalled();
  });

  it('keyboard Enter does nothing while the gate is unmet and s is blocked after a choice', () => {
    render(<RatingPairPlayer {...{ ...baseProps(), loopDurationSec: 10 }} />);
    keyDownOnWindow('Enter');
    expect(screen.queryByText(/You chose/)).toBeNull();

    cleanup();
    const props = baseProps();
    render(<RatingPairPlayer {...props} />);
    fireEvent.click(screen.getByTestId('choose-B'));
    const skipsBefore = props.onSkip.mock.calls.length;
    keyDownOnWindow('s');
    keyDownOnWindow('Enter');
    expect(props.onSkip.mock.calls.length).toBe(skipsBefore);
  });

  it('ignores shortcuts typed into text inputs', () => {
    const props = baseProps();
    render(<RatingPairPlayer {...props} />);
    fireEvent.click(screen.getByTestId('choose-A'));
    const setSourceCalls = mockedEngine.setSource.mock.calls.length;
    const note = screen.getByPlaceholderText('One line of context…') as HTMLInputElement;
    act(() => {
      note.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });
    expect(mockedEngine.setSource.mock.calls.length).toBe(setSourceCalls);
  });

  it('runs the rAF listen-tracker loop without crashing', () => {
    render(<RatingPairPlayer {...baseProps()} />);
    expect(rafQueue.length).toBeGreaterThan(0);
    act(() => {
      const cb = rafQueue.shift();
      cb?.(16.7);
      rafQueue[0]?.(33.4);
    });
  });

  it('resets pending choice + playback when pairId changes and stops engine on unmount', () => {
    const props = baseProps();
    const { rerender, unmount } = render(<RatingPairPlayer {...props} />);
    fireEvent.click(screen.getByTestId('choose-A'));
    expect(screen.getByText('You chose A')).toBeDefined();

    rerender(<RatingPairPlayer {...props} pairId="pair-2" />);
    expect(screen.queryByText(/You chose/)).toBeNull();
    expect(screen.getByTestId('rating-side-A')).toBeDefined();

    unmount();
    expect(mockedEngine.stopReference).toHaveBeenCalled();
    expect(mockedEngine.stopMixFile).toHaveBeenCalled();
  });

  it('keeps param hashes out of the DOM (blind guarantee)', () => {
    const { container } = render(
      <RatingPairPlayer {...baseProps()} kind="blind-kind" />,
    );
    expect(container.textContent).not.toContain('paramHash');
    expect(container.textContent).not.toContain('secret-hash');
  });
});
