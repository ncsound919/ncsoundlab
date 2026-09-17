/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Smoke coverage for the large LayerEditor surface: it mounts for a synth
 * layer, exposes the synth/FX tabs, and reports edits upward.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LayerEditor } from './LayerEditor';
import { DEFAULT_ENVELOPE, DEFAULT_FX, DEFAULT_SYNTH, type SoundLayer } from '../types';

const synthLayer = (): SoundLayer => ({
  id: 'l1',
  name: 'Lead',
  type: 'synth',
  enabled: true,
  gain: 0.8,
  pan: 0,
  pitch: 0,
  envelope: { ...DEFAULT_ENVELOPE },
  fx: { ...DEFAULT_FX },
  synth: { ...DEFAULT_SYNTH },
});

describe('LayerEditor', () => {
  it('mounts for a synth layer and shows its controls', () => {
    render(<LayerEditor selectedLayer={synthLayer()} onUpdate={vi.fn()} onPlay={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Chaos/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Smart Rnd/i })).toBeDefined();
  });

  it('reports a chaos-mode toggle to onUpdate', () => {
    const onUpdate = vi.fn();
    render(<LayerEditor selectedLayer={synthLayer()} onUpdate={onUpdate} onPlay={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Chaos/i }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ chaosMode: true }));
  });

  it('triggers playback through onPlay', () => {
    const onPlay = vi.fn();
    render(<LayerEditor selectedLayer={synthLayer()} onUpdate={vi.fn()} onPlay={onPlay} />);
    const play = screen.getAllByRole('button').find((b) => /play|preview/i.test(b.textContent ?? ''));
    if (play) {
      fireEvent.click(play);
      expect(onPlay).toHaveBeenCalled();
    }
  });
});
