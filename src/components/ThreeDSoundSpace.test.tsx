/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThreeDSoundSpace } from './ThreeDSoundSpace';
import { DEFAULT_ENVELOPE, DEFAULT_FX, type SoundLayer } from '../types';

const layer = (id: string, name: string): SoundLayer => ({
  id,
  name,
  type: 'sample',
  enabled: true,
  gain: 0.8,
  pan: 0,
  pitch: 0,
  envelope: { ...DEFAULT_ENVELOPE },
  fx: { ...DEFAULT_FX },
});

describe('ThreeDSoundSpace', () => {
  it('renders the room and one draggable node per enabled layer', () => {
    const layers = [layer('l1', 'Kick'), layer('l2', 'Snare')];
    render(
      <ThreeDSoundSpace layers={layers} selectedLayerId="l1" onSelectLayer={vi.fn()} onUpdateLayer={vi.fn()} />
    );
    expect(screen.getByText(/PRODUCER LISTENING POSITION/i)).toBeDefined();
    expect(screen.getByLabelText(/Spatial position for layer Kick/i)).toBeDefined();
    expect(screen.getByLabelText(/Spatial position for layer Snare/i)).toBeDefined();
  });

  it('selects a layer on pointer down', () => {
    const onSelectLayer = vi.fn();
    render(
      <ThreeDSoundSpace
        layers={[layer('l1', 'Kick')]}
        selectedLayerId={null}
        onSelectLayer={onSelectLayer}
        onUpdateLayer={vi.fn()}
      />
    );
    fireEvent.mouseDown(screen.getByLabelText(/Spatial position for layer Kick/i));
    expect(onSelectLayer).toHaveBeenCalledWith('l1');
  });

  it('nudges pan with the arrow keys', () => {
    const onUpdateLayer = vi.fn();
    render(
      <ThreeDSoundSpace
        layers={[layer('l1', 'Kick')]}
        selectedLayerId="l1"
        onSelectLayer={vi.fn()}
        onUpdateLayer={onUpdateLayer}
      />
    );
    fireEvent.keyDown(screen.getByLabelText(/Spatial position for layer Kick/i), { key: 'ArrowRight' });
    expect(onUpdateLayer).toHaveBeenCalled();
  });
});
