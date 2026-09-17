/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Non-destructive preset audition: applying via "Audition" snapshots the layer
 * so it can be kept or reverted without touching undo history.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LayerPresetBrowser } from './LayerPresetBrowser';
import { DEFAULT_ENVELOPE, DEFAULT_FX, DEFAULT_SYNTH, type SoundLayer } from '../types';

beforeEach(() => localStorage.clear());

const makeLayer = (): SoundLayer => ({
  id: 'l1',
  name: 'Synth Layer 1',
  type: 'synth',
  enabled: true,
  gain: 0.8,
  pan: 0,
  pitch: 0,
  envelope: { ...DEFAULT_ENVELOPE },
  fx: { ...DEFAULT_FX },
  synth: { ...DEFAULT_SYNTH },
});

const renderBrowser = (selectedLayer: SoundLayer | null = makeLayer()) => {
  const onUpdateLayer = vi.fn();
  const onAddToast = vi.fn();
  render(
    <LayerPresetBrowser
      selectedLayer={selectedLayer}
      onUpdateLayer={onUpdateLayer}
      onAddLayerWithPreset={vi.fn()}
      onAddToast={onAddToast}
    />
  );
  return { onUpdateLayer, onAddToast };
};

describe('LayerPresetBrowser audition', () => {
  it('applies a preset provisionally and shows the Keep/Revert banner', () => {
    const { onUpdateLayer } = renderBrowser();
    fireEvent.click(screen.getAllByRole('button', { name: 'Audition' })[0]);
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/not committed/i)).toBeDefined();
  });

  it('reverts an audition by restoring the snapshot', () => {
    const { onUpdateLayer, onAddToast } = renderBrowser();
    fireEvent.click(screen.getAllByRole('button', { name: 'Audition' })[0]);
    const appliedPatch = onUpdateLayer.mock.calls[0][1] as Partial<SoundLayer>;

    fireEvent.click(screen.getByRole('button', { name: 'Revert' }));
    expect(onUpdateLayer).toHaveBeenCalledTimes(2);
    const revertPatch = onUpdateLayer.mock.calls[1][1] as Partial<SoundLayer>;
    // The revert patch restores exactly the keys the audition overwrote.
    expect(Object.keys(revertPatch).sort()).toEqual(Object.keys(appliedPatch).sort());
    expect(onAddToast).toHaveBeenCalledWith(expect.stringMatching(/reverted/i), 'info');
    expect(screen.queryByText(/not committed/i)).toBeNull();
  });

  it('keeps an audition by dismissing the banner', () => {
    const { onUpdateLayer, onAddToast } = renderBrowser();
    fireEvent.click(screen.getAllByRole('button', { name: 'Audition' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onUpdateLayer).toHaveBeenCalledTimes(1); // no extra revert write
    expect(onAddToast).toHaveBeenCalledWith(expect.stringMatching(/kept/i), 'success');
    expect(screen.queryByText(/not committed/i)).toBeNull();
  });

  it('applies a factory preset directly without entering audition', () => {
    const { onUpdateLayer, onAddToast } = renderBrowser();
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply' })[0]);
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    expect(onAddToast).toHaveBeenCalledWith(expect.stringMatching(/Applied factory preset/i), 'success');
    expect(screen.queryByText(/not committed/i)).toBeNull();
  });

  it('warns when no layer is selected', () => {
    const { onUpdateLayer, onAddToast } = renderBrowser(null);
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Audition' })[0]);
    expect(onUpdateLayer).not.toHaveBeenCalled();
    expect(onAddToast).toHaveBeenCalledWith(expect.stringMatching(/select a layer first/i), 'warn');
  });

  it('applies and auditions a saved user preset', () => {
    localStorage.setItem(
      'soundlab_layer_user_presets',
      JSON.stringify([
        {
          id: 'u1',
          name: 'USER PATCH',
          category: 'synth',
          description: 'custom',
          icon: '🔥',
          isUser: true,
          layerData: {
            name: 'USER PATCH',
            type: 'synth',
            enabled: true,
            gain: 0.5,
            pan: 0,
            pitch: 0,
            envelope: { ...DEFAULT_ENVELOPE },
            fx: { ...DEFAULT_FX },
          },
        },
      ])
    );
    const { onUpdateLayer, onAddToast } = renderBrowser();

    const applyButtons = screen.getAllByRole('button', { name: 'Apply' });
    fireEvent.click(applyButtons[applyButtons.length - 1]);
    expect(onAddToast).toHaveBeenCalledWith(expect.stringMatching(/Applied custom preset/i), 'success');

    const auditionButtons = screen.getAllByRole('button', { name: 'Audition' });
    fireEvent.click(auditionButtons[auditionButtons.length - 1]);
    expect(onUpdateLayer).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/not committed/i)).toBeDefined();
  });
});
