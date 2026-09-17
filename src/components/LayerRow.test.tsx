/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LayerRow, type LayerRowProps } from './LayerRow';
import { DEFAULT_ENVELOPE, DEFAULT_FX, type SoundLayer } from '../types';
import { LAYER_PALETTE } from '../lib/layerColors';

const makeLayer = (over: Partial<SoundLayer> = {}): SoundLayer => ({
  id: 'l1',
  name: 'Kick',
  type: 'sample',
  enabled: true,
  gain: 0.8,
  pan: 0,
  pitch: 0,
  envelope: { ...DEFAULT_ENVELOPE },
  fx: { ...DEFAULT_FX },
  ...over,
});

const makeProps = (over: Partial<LayerRowProps> = {}): LayerRowProps => ({
  layer: makeLayer(),
  index: 0,
  isSelected: false,
  level: 0,
  onSelect: vi.fn(),
  onRename: vi.fn(),
  onToggleEnabled: vi.fn(),
  onPlay: vi.fn(),
  onDuplicate: vi.fn(),
  onDelete: vi.fn(),
  ...over,
});

describe('LayerRow', () => {
  it('renders the name, index and identity colour', () => {
    const { container } = render(<LayerRow {...makeProps()} />);
    expect(screen.getByDisplayValue('Kick')).toBeDefined();
    expect(screen.getByText('01')).toBeDefined();
    expect((container.querySelector('[data-layer-row]') as HTMLElement).dataset.layerColor).toBe(LAYER_PALETTE[0]);
  });

  it('uses an explicit colour when present', () => {
    const { container } = render(<LayerRow {...makeProps({ layer: makeLayer({ color: '#123456' }) })} />);
    expect((container.querySelector('[data-layer-row]') as HTMLElement).dataset.layerColor).toBe('#123456');
  });

  it('reports selection and rename', () => {
    const props = makeProps();
    const { container } = render(<LayerRow {...props} />);
    // The row selects on click; the name field stops propagation by design.
    fireEvent.click(container.querySelector('[data-layer-row]') as HTMLElement);
    expect(props.onSelect).toHaveBeenCalled();
    fireEvent.change(screen.getByDisplayValue('Kick'), { target: { value: 'Snare' } });
    expect(props.onRename).toHaveBeenCalledWith('Snare');
  });

  it('toggles enable and exposes the level meter', () => {
    const props = makeProps({ level: 0.5, layer: makeLayer({ enabled: false }) });
    const { container } = render(<LayerRow {...props} />);
    expect(screen.getByTitle('Unmute Layer')).toBeDefined();
    fireEvent.click(screen.getByTitle('Unmute Layer'));
    expect(props.onToggleEnabled).toHaveBeenCalled();
    expect((container.querySelector('[data-layer-level]') as HTMLElement).dataset.layerLevel).toBe('50');
  });

  it('fires play, duplicate and delete', () => {
    const props = makeProps();
    render(<LayerRow {...props} />);
    fireEvent.click(screen.getByTitle('Play Layer'));
    fireEvent.click(screen.getByTitle('Duplicate Layer'));
    fireEvent.click(screen.getByTitle('Delete Layer'));
    expect(props.onPlay).toHaveBeenCalled();
    expect(props.onDuplicate).toHaveBeenCalled();
    expect(props.onDelete).toHaveBeenCalled();
  });

  it('draws a waveform thumbnail for sample layers with a buffer', () => {
    const buffer = {
      length: 4,
      getChannelData: () => Float32Array.from([0, 1, 0, -1]),
    } as unknown as AudioBuffer;
    const { container } = render(<LayerRow {...makeProps({ layer: makeLayer({ audioBuffer: buffer }) })} />);
    expect(container.querySelector('path')).not.toBeNull();
  });
});
