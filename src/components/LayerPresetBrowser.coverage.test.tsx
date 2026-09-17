/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extra coverage for `LayerPresetBrowser`: favorite toggling + persistence,
 * the tab/category/search filters (including the empty state), the save form
 * (named, empty-name, no-layer), user-preset delete, "New Layer" dispatch,
 * and the user-preset branches of `presetUpdatesFor`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LayerPresetBrowser } from './LayerPresetBrowser';
import {
  DEFAULT_ENVELOPE,
  DEFAULT_FX,
  DEFAULT_SYNTH,
  type SoundLayer,
} from '../types';

beforeEach(() => {
  localStorage.clear();
});

const makeLayer = (name = 'Synth Layer 1'): SoundLayer => ({
  id: 'l1',
  name,
  type: 'synth',
  enabled: true,
  gain: 0.8,
  pan: 0,
  pitch: 0,
  envelope: { ...DEFAULT_ENVELOPE },
  fx: { ...DEFAULT_FX },
  synth: { ...DEFAULT_SYNTH },
});

const makeUserPreset = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  name: 'USER PATCH',
  category: 'synth',
  description: 'custom user patch',
  icon: '🔥',
  isUser: true,
  layerData: {
    name: 'USER PATCH',
    type: 'synth',
    enabled: true,
    gain: 0.6,
    pan: 0.1,
    pitch: 2,
    envelope: { ...DEFAULT_ENVELOPE },
    fx: { ...DEFAULT_FX },
    synth: { ...DEFAULT_SYNTH },
    macroPunch: 0.3,
  },
  ...over,
});

const seedUserPresets = (presets: unknown[]) => {
  localStorage.setItem('soundlab_layer_user_presets', JSON.stringify(presets));
};

const renderBrowser = (selectedLayer: SoundLayer | null = makeLayer()) => {
  const onUpdateLayer = vi.fn();
  const onAddLayerWithPreset = vi.fn();
  const onAddToast = vi.fn();
  render(
    <LayerPresetBrowser
      selectedLayer={selectedLayer}
      onUpdateLayer={onUpdateLayer}
      onAddLayerWithPreset={onAddLayerWithPreset}
      onAddToast={onAddToast}
    />
  );
  return { onUpdateLayer, onAddLayerWithPreset, onAddToast };
};

describe('LayerPresetBrowser coverage', () => {
  it('toggles a favorite, persists it, and filters to favorites', async () => {
    renderBrowser();
    fireEvent.click(screen.getAllByTitle('Star preset')[0]);

    await waitFor(() => {
      const stored = JSON.parse(
        localStorage.getItem('soundlab_layer_preset_favorites') ?? '[]'
      );
      expect(stored).toContain('sub-808-kick');
    });

    const [filterSelect] = screen.getAllByRole('combobox');
    fireEvent.change(filterSelect, { target: { value: 'favorites' } });
    expect(screen.getByText('808 Sub Kick')).toBeDefined();
    expect(screen.queryByText('Crisp Snare')).toBeNull();

    // Unstar it -> favorites filter now yields nothing.
    fireEvent.click(screen.getByTitle('Star preset'));
    expect(screen.getByText('No presets found')).toBeDefined();
  });

  it('filters by tab, category and search, including the empty state', () => {
    renderBrowser();
    const [filterSelect, categorySelect] = screen.getAllByRole('combobox');

    fireEvent.change(filterSelect, { target: { value: 'factory' } });
    expect(screen.getByText('808 Sub Kick')).toBeDefined();

    fireEvent.change(filterSelect, { target: { value: 'user' } });
    expect(screen.getByText('No presets found')).toBeDefined();

    fireEvent.change(filterSelect, { target: { value: 'all' } });
    fireEvent.change(categorySelect, { target: { value: 'kick' } });
    expect(screen.getByText('808 Sub Kick')).toBeDefined();
    expect(screen.queryByText('Crisp Snare')).toBeNull();

    fireEvent.change(categorySelect, { target: { value: 'custom' } });
    expect(screen.getByText('No presets found')).toBeDefined();

    fireEvent.change(categorySelect, { target: { value: 'all' } });
    const search = screen.getByPlaceholderText('Search sound design presets...');
    fireEvent.change(search, { target: { value: 'snare' } });
    expect(screen.getByText('Crisp Snare')).toBeDefined();

    fireEvent.change(search, { target: { value: 'zzzzz' } });
    expect(screen.getByText('No presets found')).toBeDefined();
  });

  it('filters seeded user presets by the user tab and custom category', () => {
    seedUserPresets([makeUserPreset()]);
    renderBrowser();
    const [filterSelect, categorySelect] = screen.getAllByRole('combobox');

    fireEvent.change(filterSelect, { target: { value: 'user' } });
    expect(screen.getByText('USER PATCH')).toBeDefined();
    expect(screen.queryByText('808 Sub Kick')).toBeNull();

    fireEvent.change(filterSelect, { target: { value: 'all' } });
    fireEvent.change(categorySelect, { target: { value: 'custom' } });
    expect(screen.getByText('USER PATCH')).toBeDefined();
    expect(screen.queryByText('808 Sub Kick')).toBeNull();
  });

  it('saves a named preset from the current layer', () => {
    const { onAddToast } = renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: /Save Current Layer Settings/i }));
    expect(screen.getByText(/Save Current Layer Settings/)).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText(/Heavy Sub Bass/i), {
      target: { value: 'My Patch' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Describe your synth/i), {
      target: { value: 'a description' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Sound Preset/i }));

    expect(onAddToast).toHaveBeenCalledWith(
      expect.stringMatching(/Saved preset "My Patch"/i),
      'success'
    );
    expect(screen.getByText('My Patch')).toBeDefined();
    expect(screen.getByTitle('Delete Preset')).toBeDefined();
  });

  it('warns when saving a preset with an empty name', () => {
    const { onAddToast } = renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: /Save Current Layer Settings/i }));

    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    expect(onAddToast).toHaveBeenCalledWith('Preset name cannot be empty!', 'warn');
  });

  it('shows the no-layer message in the save form and warns on submit', () => {
    const { onAddToast } = renderBrowser(null);
    fireEvent.click(screen.getByRole('button', { name: /Save Current Layer Settings/i }));
    expect(screen.getByText(/Select a Sound Layer first/i)).toBeDefined();

    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    expect(onAddToast).toHaveBeenCalledWith(
      'Select a layer to save its settings!',
      'warn'
    );
  });

  it('deletes a user preset', () => {
    seedUserPresets([makeUserPreset()]);
    const { onAddToast } = renderBrowser();

    fireEvent.click(screen.getByTitle('Delete Preset'));
    expect(onAddToast).toHaveBeenCalledWith('Deleted custom preset', 'info');
    expect(screen.queryByText('USER PATCH')).toBeNull();
  });

  it('dispatches New Layer with the clicked preset', () => {
    const { onAddLayerWithPreset } = renderBrowser();
    fireEvent.click(screen.getAllByRole('button', { name: /New Layer/i })[0]);
    expect(onAddLayerWithPreset).toHaveBeenCalledTimes(1);
    expect(onAddLayerWithPreset.mock.calls[0][0].name).toBe('808 Sub Kick');
  });

  it('applies a user preset with layer data (including synth)', () => {
    seedUserPresets([makeUserPreset()]);
    const { onUpdateLayer, onAddToast } = renderBrowser();

    const applyButtons = screen.getAllByRole('button', { name: 'Apply' });
    fireEvent.click(applyButtons[applyButtons.length - 1]);

    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const patch = onUpdateLayer.mock.calls[0][1] as Partial<SoundLayer>;
    expect(patch.synth).toBeDefined();
    expect(patch.macroPunch).toBe(0.3);
    expect(onAddToast).toHaveBeenCalledWith(
      expect.stringMatching(/Applied custom preset/i),
      'success'
    );
  });

  it('no-ops when a user preset has no layerData', () => {
    seedUserPresets([makeUserPreset({ id: 'u-bad', name: 'BROKEN', layerData: undefined })]);
    const { onUpdateLayer, onAddToast } = renderBrowser();

    const applyButtons = screen.getAllByRole('button', { name: 'Apply' });
    fireEvent.click(applyButtons[applyButtons.length - 1]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Audition' }).at(-1) as HTMLElement);

    expect(onUpdateLayer).not.toHaveBeenCalled();
    expect(onAddToast).not.toHaveBeenCalled();
  });

  it('applies a factory preset when the card body is clicked', () => {
    const { onUpdateLayer, onAddToast } = renderBrowser();
    fireEvent.click(screen.getByText('808 Sub Kick'));
    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    expect(onAddToast).toHaveBeenCalledWith(
      expect.stringMatching(/Applied factory preset/i),
      'success'
    );
  });

  it('saves via the form selects and falls back to a default description', () => {
    const { onAddToast } = renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: /Save Current Layer Settings/i }));
    fireEvent.change(screen.getByPlaceholderText(/Heavy Sub Bass/i), {
      target: { value: 'Selects Patch' },
    });

    const combos = screen.getAllByRole('combobox');
    fireEvent.change(combos[2], { target: { value: 'pad' } });
    fireEvent.change(combos[3], { target: { value: '💥' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Sound Preset/i }));

    expect(onAddToast).toHaveBeenCalledWith(
      expect.stringMatching(/Saved preset "Selects Patch"/i),
      'success'
    );
    const stored = JSON.parse(
      localStorage.getItem('soundlab_layer_user_presets') ?? '[]'
    );
    expect(stored[0].description).toBe('Custom user sound design patch');
    expect(stored[0].category).toBe('pad');
  });

  it('removes a deleted user preset from favorites', async () => {
    seedUserPresets([makeUserPreset()]);
    const { onAddToast } = renderBrowser();

    const stars = screen.getAllByTitle('Star preset');
    fireEvent.click(stars[stars.length - 1]);
    await waitFor(() => {
      const favs = JSON.parse(
        localStorage.getItem('soundlab_layer_preset_favorites') ?? '[]'
      );
      expect(favs).toContain('u1');
    });

    fireEvent.click(screen.getByTitle('Delete Preset'));
    const favs = JSON.parse(
      localStorage.getItem('soundlab_layer_preset_favorites') ?? '[]'
    );
    expect(favs).not.toContain('u1');
    expect(onAddToast).toHaveBeenCalledWith('Deleted custom preset', 'info');
  });

  it('applies a user preset whose layerData omits optional fields', () => {
    seedUserPresets([makeUserPreset({ id: 'u-min', name: 'MINIMAL', layerData: {} })]);
    const { onUpdateLayer } = renderBrowser();

    const applyButtons = screen.getAllByRole('button', { name: 'Apply' });
    fireEvent.click(applyButtons[applyButtons.length - 1]);

    expect(onUpdateLayer).toHaveBeenCalledTimes(1);
    const patch = onUpdateLayer.mock.calls[0][1] as Partial<SoundLayer>;
    expect(patch.envelope).toBeDefined();
    expect(patch.fx).toBeDefined();
    expect(patch.synth).toBeUndefined();
  });

  it('warns on audition when no layer is selected', () => {
    const { onAddToast } = renderBrowser(null);
    fireEvent.click(screen.getAllByRole('button', { name: 'Audition' })[0]);
    expect(onAddToast).toHaveBeenCalledWith(
      expect.stringMatching(/select a layer first to audition/i),
      'warn'
    );
  });
});
