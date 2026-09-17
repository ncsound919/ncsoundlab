/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extra coverage for `FXChainPresetsPanel`: empty state, saving with a
 * typed/fallback name, loading and deleting rows, the master-rack target
 * filter (non-rack presets hidden) and the Reset Rack callback.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FXChainPresetsPanel } from './FXChainPresetsPanel';
import { PRESETS_LOCALSTORAGE_KEY, type FXChainPreset } from '../audio/fxPresets';
import type { RackModule } from '../types';

beforeEach(() => {
  localStorage.clear();
});

const mod = (id = 'm1'): RackModule => ({ id, type: 'eq', enabled: true, settings: {} });

const storedPresets = (): FXChainPreset[] =>
  JSON.parse(localStorage.getItem(PRESETS_LOCALSTORAGE_KEY) ?? '[]');

const renderPanel = (modules: RackModule[] = [mod()]) => {
  const onLoad = vi.fn();
  const onClearRack = vi.fn();
  render(
    <FXChainPresetsPanel modules={modules} onLoad={onLoad} onClearRack={onClearRack} />
  );
  return { onLoad, onClearRack };
};

describe('FXChainPresetsPanel coverage', () => {
  it('renders the empty state with no saved presets', () => {
    renderPanel();
    expect(screen.getByText('FX Chain Presets · 0')).toBeDefined();
    expect(screen.getByText(/No saved presets yet/i)).toBeDefined();
  });

  it('saves a named preset and increments the heading count', () => {
    renderPanel();
    fireEvent.change(screen.getByPlaceholderText('Preset name'), {
      target: { value: 'My Chain' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    expect(screen.getByText('FX Chain Presets · 1')).toBeDefined();
    expect(storedPresets()).toHaveLength(1);
    expect(storedPresets()[0].name).toBe('My Chain');
  });

  it('falls back to a generated name when no name is typed', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    expect(screen.getByText('FX Chain Presets · 1')).toBeDefined();
    expect(screen.getByText(/Preset 1/)).toBeDefined();
  });

  it('loads and deletes a preset row', () => {
    const { onLoad } = renderPanel();
    fireEvent.change(screen.getByPlaceholderText('Preset name'), {
      target: { value: 'Load Me' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    fireEvent.click(screen.getByText('Load Me'));
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad.mock.calls[0][0].name).toBe('Load Me');
    expect(onLoad.mock.calls[0][0].target).toEqual({ kind: 'master-rack' });

    fireEvent.click(screen.getByLabelText('Delete preset Load Me'));
    expect(screen.getByText('FX Chain Presets · 0')).toBeDefined();
    expect(screen.getByText(/No saved presets yet/i)).toBeDefined();
  });

  it('filters out layer-fx presets and keeps master-rack presets', () => {
    const now = new Date().toISOString();
    localStorage.setItem(
      PRESETS_LOCALSTORAGE_KEY,
      JSON.stringify([
        {
          id: 'layer-1',
          name: 'Layer FX Preset',
          target: { kind: 'layer-fx', layerId: 'l1' },
          fxSettings: {},
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'rack-1',
          name: 'Rack Preset',
          target: { kind: 'master-rack' },
          modules: [],
          createdAt: now,
          updatedAt: now,
        },
      ])
    );

    renderPanel();
    expect(screen.getByText('FX Chain Presets · 1')).toBeDefined();
    expect(screen.getByText(/Rack Preset/)).toBeDefined();
    expect(screen.queryByText(/Layer FX Preset/)).toBeNull();
  });

  it('renders a preset with no modules array as zero modules', () => {
    const now = new Date().toISOString();
    localStorage.setItem(
      PRESETS_LOCALSTORAGE_KEY,
      JSON.stringify([
        {
          id: 'rack-empty',
          name: 'Bare Rack',
          target: { kind: 'master-rack' },
          createdAt: now,
          updatedAt: now,
        },
      ])
    );

    renderPanel();
    expect(screen.getByText('FX Chain Presets · 1')).toBeDefined();
    expect(screen.getByText(/Bare Rack/)).toBeDefined();
    expect(screen.getByText(/0 modules/)).toBeDefined();
  });

  it('resets the rack through the parent callback', () => {
    const { onClearRack } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Reset Rack/i }));
    expect(onClearRack).toHaveBeenCalledTimes(1);
  });
});
