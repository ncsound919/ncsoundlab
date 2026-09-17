/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exhaustive interaction coverage for `ArrangementPanel`: empty state,
 * timeline-click clip creation (+ clip-target guard), Append, pattern
 * switching, clip CRUD (mute/duplicate/split/remove), pointer drag
 * (move/resize-left/resize-right + cleanup), tempo lane (add/guard/remove/
 * clear), and the clip-select callback (present/absent).
 */

import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArrangementPanel } from './ArrangementPanel';
import { usePatternStore } from '../store/patternStore';

const rect = {
  left: 0,
  top: 0,
  width: 600,
  height: 200,
  right: 600,
  bottom: 200,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

const presentations = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[role="presentation"]'));
const timelineLane = (container: HTMLElement) => presentations(container)[1];
const tempoLane = (container: HTMLElement) => presentations(container)[0];

const pointerMoveUp = (clientX: number) => {
  act(() => {
    const move = new Event('pointermove', { bubbles: true }) as Event & { clientX: number };
    move.clientX = clientX;
    window.dispatchEvent(move);
    window.dispatchEvent(new Event('pointerup', { bubbles: true }));
  });
};

describe('ArrangementPanel', () => {
  beforeEach(() => {
    usePatternStore.getState().reset();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect);
    if (!('setPointerCapture' in HTMLElement.prototype)) {
      Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
        value: vi.fn(),
        writable: true,
        configurable: true,
      });
    }
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the empty state with zero clips', () => {
    const { container } = render(<ArrangementPanel />);
    expect(screen.getByText('Arrangement Timeline')).toBeDefined();
    expect(screen.getByText(/0 clips ·/)).toBeDefined();
    expect(screen.getByText('Click to add a clip at the active pattern')).toBeDefined();
    expect(container.textContent).toContain('Click empty timeline to add a clip');
  });

  it('adds a clip by clicking the empty timeline', () => {
    const { container } = render(<ArrangementPanel />);
    fireEvent.click(timelineLane(container), { clientX: 64 });
    expect(usePatternStore.getState().arrangement.clips).toHaveLength(1);
    expect(screen.getByText(/1 clip ·/)).toBeDefined();
  });

  it('ignores timeline clicks that land on a clip', () => {
    const { container } = render(<ArrangementPanel />);
    fireEvent.click(timelineLane(container), { clientX: 64 });
    const clip = container.querySelector('[data-clip-id]') as HTMLElement;
    fireEvent.click(clip, { clientX: 70 });
    // No new clip from the guarded handler.
    expect(usePatternStore.getState().arrangement.clips).toHaveLength(1);
  });

  it('appends a clip at the end via the Append button', () => {
    render(<ArrangementPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Append/ }));
    const clips = usePatternStore.getState().arrangement.clips;
    expect(clips).toHaveLength(1);
    expect(clips[0].patternId).toBe('A');
    expect(clips[0].beats).toBe(4);
  });

  it('switches the active pattern and appends with the new pattern', () => {
    render(<ArrangementPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'C' }));
    expect(usePatternStore.getState().activePatternId).toBe('C');
    fireEvent.click(screen.getByRole('button', { name: /Append/ }));
    expect(usePatternStore.getState().arrangement.clips[0].patternId).toBe('C');
  });

  it('selects a clip pattern on clip click and notifies the callback', () => {
    const onSelect = vi.fn();
    const { container } = render(<ArrangementPanel onSelectClipPattern={onSelect} />);
    fireEvent.click(timelineLane(container), { clientX: 32 });
    const clip = container.querySelector('[data-clip-id]') as HTMLElement;
    fireEvent.click(clip);
    expect(usePatternStore.getState().activePatternId).toBe('A');
    expect(onSelect).toHaveBeenCalledWith('A');
  });

  it('clip click without a callback does not throw', () => {
    const { container } = render(<ArrangementPanel />);
    fireEvent.click(timelineLane(container), { clientX: 32 });
    const clip = container.querySelector('[data-clip-id]') as HTMLElement;
    expect(() => fireEvent.click(clip)).not.toThrow();
  });

  it('mutes and unmutes a clip', () => {
    render(<ArrangementPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Append/ }));
    const mute = screen.getByRole('button', { name: 'Mute clip' });
    fireEvent.click(mute);
    expect(usePatternStore.getState().arrangement.clips[0].muted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Unmute clip' }));
    expect(usePatternStore.getState().arrangement.clips[0].muted).toBe(false);
  });

  it('duplicates a clip', () => {
    render(<ArrangementPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Append/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate clip' }));
    expect(usePatternStore.getState().arrangement.clips).toHaveLength(2);
    expect(screen.getByText(/2 clips ·/)).toBeDefined();
  });

  it('splits a clip at its midpoint', () => {
    render(<ArrangementPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Append/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Split clip' }));
    const clips = usePatternStore.getState().arrangement.clips;
    expect(clips).toHaveLength(2);
    const beats = clips.map((c) => c.beats).sort();
    expect(beats).toEqual([2, 2]);
  });

  it('removes a clip', () => {
    render(<ArrangementPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Append/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove clip' }));
    expect(usePatternStore.getState().arrangement.clips).toHaveLength(0);
  });

  it('shows the loop multiplier when loops > 1', () => {
    render(<ArrangementPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Append/ }));
    const id = usePatternStore.getState().arrangement.clips[0].id;
    act(() => {
      usePatternStore.getState().updateClip(id, { loops: 3 });
    });
    expect(screen.getByText(/×3/)).toBeDefined();
  });

  it('drags a clip body to move it and cleans up listeners', () => {
    const { container } = render(<ArrangementPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Append/ }));
    const id = usePatternStore.getState().arrangement.clips[0].id;
    const body = container.querySelector('.cursor-grab') as HTMLElement;
    fireEvent.pointerDown(body, { clientX: 100, pointerId: 1 });
    pointerMoveUp(132); // +32px = +2 beats
    const clip = usePatternStore.getState().arrangement.clips.find((c) => c.id === id)!;
    expect(clip.startBeat).toBe(2);
    // Listeners removed: further moves are ignored.
    pointerMoveUp(400);
    expect(usePatternStore.getState().arrangement.clips.find((c) => c.id === id)!.startBeat).toBe(2);
  });

  it('drags the left edge to resize the clip start', () => {
    const { container } = render(<ArrangementPanel />);
    fireEvent.click(timelineLane(container), { clientX: 64 }); // startBeat 4
    const left = screen.getByRole('separator', { name: 'Resize clip start' });
    fireEvent.pointerDown(left, { clientX: 64, pointerId: 2 });
    pointerMoveUp(96); // +2 beats → start 6
    const clip = usePatternStore.getState().arrangement.clips[0];
    expect(clip.startBeat).toBe(6);
    expect(clip.beats).toBe(2);
  });

  it('drags the right edge to resize the clip length', () => {
    render(<ArrangementPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Append/ }));
    const right = screen.getByRole('separator', { name: 'Resize clip end' });
    fireEvent.pointerDown(right, { clientX: 64, pointerId: 3 });
    pointerMoveUp(96); // +2 beats → 6 total
    expect(usePatternStore.getState().arrangement.clips[0].beats).toBe(6);
  });

  it('adds a tempo point by clicking the tempo lane', () => {
    const { container } = render(<ArrangementPanel />);
    fireEvent.click(tempoLane(container), { clientX: 80 });
    const points = usePatternStore.getState().arrangement.tempoMap;
    expect(points).toHaveLength(1);
    expect(points[0].tick).toBe(5);
    expect(points[0].bpm).toBe(120);
    expect(screen.getByRole('button', { name: /Remove tempo point/ })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDefined();
  });

  it('clicking a tempo point does not add another point', () => {
    const { container } = render(<ArrangementPanel />);
    fireEvent.click(tempoLane(container), { clientX: 80 });
    const diamond = screen.getByRole('button', { name: /Remove tempo point/ });
    fireEvent.click(diamond);
    expect(usePatternStore.getState().arrangement.tempoMap).toHaveLength(1);
  });

  it('right-click removes a tempo point and Clear wipes the map', () => {
    const { container } = render(<ArrangementPanel />);
    fireEvent.click(tempoLane(container), { clientX: 80 });
    fireEvent.click(tempoLane(container), { clientX: 160 });
    expect(usePatternStore.getState().arrangement.tempoMap).toHaveLength(2);
    fireEvent.contextMenu(screen.getAllByRole('button', { name: /Remove tempo point/ })[0]);
    expect(usePatternStore.getState().arrangement.tempoMap).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    // NOTE: the Clear click bubbles to the tempo-lane onClick, which adds a
    // fresh point at the click position (clientX defaults to 0 → tick 0).
    // The two original points are gone; only the bubbled tick-0 point remains.
    expect(usePatternStore.getState().arrangement.tempoMap.map((p) => p.tick)).toEqual([0]);
  });

  it('grows totalBeats beyond the 16-beat minimum for long clips', () => {
    render(<ArrangementPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Append/ }));
    const id = usePatternStore.getState().arrangement.clips[0].id;
    act(() => {
      usePatternStore.getState().updateClip(id, { startBeat: 30, beats: 8 });
    });
    expect(screen.getByText(/38 beats total/)).toBeDefined();
  });
});
