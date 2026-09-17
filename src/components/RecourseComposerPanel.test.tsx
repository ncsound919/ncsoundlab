/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';

const h = vi.hoisted(() => ({
  rs: {
    recourseSongUrl: vi.fn(() => 'http://localhost:3050/api/recourse/compose/song.json'),
    fetchRecourseSong: vi.fn(),
    fetchRecourseStyles: vi.fn(async () => ['steely-dan', 'airplane']),
    chordLabelsToProgression: vi.fn(() => [{ root: 'C', type: 'm7', duration: 4 }]),
    parseChordLabel: vi.fn(),
  },
}));

vi.mock('../lib/recourseSong', () => h.rs);

import { RecourseComposerPanel } from './RecourseComposerPanel';
import { useControllerStore } from '../store/controllerStore';
import { useRecourseStore } from '../store/recourseStore';

const song = {
  mode: 'loop' as const,
  style: 'steely-dan',
  seed: 1,
  bars: 8,
  bpm: 96,
  key: 'Cm',
  keyPc: 0,
  major: false,
  chords: ['Cm7', 'Fm7'],
  events: 42,
  piece: { layers: [{ id: 'a' }, { id: 'b' }], chainBars: 8 },
};

beforeEach(() => {
  vi.clearAllMocks();
  h.rs.fetchRecourseSong.mockResolvedValue(song);
  h.rs.recourseSongUrl.mockReturnValue('http://localhost:3050/api/recourse/compose/song.json');
  h.rs.chordLabelsToProgression.mockReturnValue([{ root: 'C', type: 'm7', duration: 4 }]);
  (window as unknown as { __recourse?: unknown }).__recourse = undefined;
  useRecourseStore.getState().clearBridge();
});

afterEach(() => {
  (window as unknown as { __recourse?: unknown }).__recourse = undefined;
  useRecourseStore.getState().clearBridge();
});

describe('RecourseComposerPanel', () => {
  it('renders and generates a song', async () => {
    const { container } = render(<RecourseComposerPanel onApplyProgression={vi.fn()} />);
    expect(container.querySelector('[data-recourse-composer]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    await waitFor(() => expect(h.rs.fetchRecourseSong).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Cm7')).toBeDefined());
    expect(screen.getByText('Fm7')).toBeDefined();
  });

  it('stamps the progression into the pattern', async () => {
    const onApplyProgression = vi.fn();
    render(<RecourseComposerPanel onApplyProgression={onApplyProgression} />);
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    await waitFor(() => expect(screen.getByText('Cm7')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Chords → Pattern/i }));
    expect(h.rs.chordLabelsToProgression).toHaveBeenCalledWith(['Cm7', 'Fm7']);
    expect(onApplyProgression).toHaveBeenCalled();
  });

  it('points the chord pads at the song key', async () => {
    render(<RecourseComposerPanel onApplyProgression={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    await waitFor(() => expect(screen.getByText('Cm7')).toBeDefined());
    act(() => screen.getByRole('button', { name: /Use as Chord Pads key/i }).click());
    expect(useControllerStore.getState().chord.key).toBe('C');
    expect(useControllerStore.getState().chord.scale).toBe('minor');
  });

  it('loads the piece through the app bridge', async () => {
    const load = vi.fn(() => ({ ok: true }));
    (window as unknown as { __recourse?: unknown }).__recourse = { load };
    render(<RecourseComposerPanel onApplyProgression={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    await waitFor(() => expect(screen.getByText('Cm7')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Load into SoundLab/i }));
    expect(load).toHaveBeenCalledWith(song.piece);
    await waitFor(() => expect(screen.getByText(/Loaded "steely-dan"/i)).toBeDefined());
  });

  it('surfaces generation errors', async () => {
    h.rs.fetchRecourseSong.mockRejectedValue(new Error('Recourse offline'));
    render(<RecourseComposerPanel onApplyProgression={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    await waitFor(() => expect(screen.getByText(/Recourse offline/i)).toBeDefined());
  });

  it('notes the arrangement limit in arr mode', async () => {
    h.rs.fetchRecourseSong.mockResolvedValue({ ...song, mode: 'arr', sections: [{ name: 'A' }], piece: undefined });
    render(<RecourseComposerPanel onApplyProgression={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    await waitFor(() => expect(screen.getByText(/can't play a multi-bar chart/i)).toBeDefined());
  });

  it('registers a controller bridge that drives every composer action', async () => {
    (window as unknown as { __recourse?: unknown }).__recourse = { load: vi.fn(() => ({ ok: true })) };
    render(<RecourseComposerPanel onApplyProgression={vi.fn()} />);
    const bridge = useRecourseStore.getState().bridge;
    expect(bridge).toBeTruthy();

    act(() => {
      bridge!.styleNext();
      bridge!.stylePrev();
      bridge!.modeNext();
      bridge!.barsNext();
      bridge!.seedDown();
      bridge!.seedUp();
      bridge!.seedRandom();
      bridge!.keyDown();
      bridge!.keyUp();
      bridge!.setParam('styleIndex', 1);
      bridge!.setParam('seed', 7);
      bridge!.setParam('keyIndex', 3);
      bridge!.setParam('barsIndex', 2);
      bridge!.setParam('mode', 1);
    });

    bridge!.generate();
    await waitFor(() => expect(screen.getByText('Cm7')).toBeDefined());
    act(() => {
      bridge!.load();
      bridge!.toPattern();
      bridge!.useKey();
    });
  });

  it('clears its bridge on unmount', () => {
    const { unmount } = render(<RecourseComposerPanel onApplyProgression={vi.fn()} />);
    expect(useRecourseStore.getState().bridge).toBeTruthy();
    unmount();
    expect(useRecourseStore.getState().bridge).toBeNull();
  });

  it('auto-composes from a Recourse Music-sector handoff link', async () => {
    window.history.pushState({}, '', '/?recourseStyle=jasper-ballad&recourseSeed=9&recourseMode=arr');
    try {
      render(<RecourseComposerPanel onApplyProgression={vi.fn()} />);
      await waitFor(() => expect(h.rs.fetchRecourseSong).toHaveBeenCalled());
      expect(h.rs.recourseSongUrl).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ style: 'jasper-ballad', seed: 9, mode: 'arr' })
      );
    } finally {
      window.history.pushState({}, '', '/');
    }
  });
});
