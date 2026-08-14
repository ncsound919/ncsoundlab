/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `PresetBrowser` — factory/user rack preset management:
 * search + filter, apply, save, delete, favorites, and cloud sync merge.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { PresetBrowser } from './PresetBrowser';
import { useRackStore } from '../store/rackStore';

vi.mock('../lib/db', () => ({
  saveProject: vi.fn(async () => {}),
  fetchUserProjects: vi.fn(async () => []),
}));

import { saveProject, fetchUserProjects } from '../lib/db';

const factoryName = 'Vocal Polish Chain';

describe('PresetBrowser', () => {
  beforeEach(() => {
    vi.mocked(saveProject).mockClear();
    vi.mocked(fetchUserProjects).mockClear().mockResolvedValue([]);
    localStorage.clear();
    useRackStore.setState({ modules: [] } as never);
  });

  it('renders factory presets, the user column and the count header', () => {
    render(<PresetBrowser />);
    expect(screen.getByText(/Rack Preset Manager/i)).toBeDefined();
    expect(screen.getByText('Factory Presets')).toBeDefined();
    expect(screen.getByText('Saved User Presets')).toBeDefined();
    expect(screen.getByText(/Presets Listed/i)).toBeDefined();
    expect(screen.getByText(factoryName)).toBeDefined();
  });

  it('filters factory presets by search text', () => {
    render(<PresetBrowser />);
    fireEvent.change(screen.getByPlaceholderText(/Search rack presets/i), {
      target: { value: 'zzzz-no-match' },
    });
    expect(screen.getByText(/No matching factory presets/)).toBeDefined();
    fireEvent.change(screen.getByPlaceholderText(/Search rack presets/i), {
      target: { value: 'Vocal' },
    });
    expect(screen.getByText(factoryName)).toBeDefined();
  });

  it('switches the filter to user-only and factory-only', () => {
    render(<PresetBrowser />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'user' } });
    expect(screen.queryByText('Factory Presets')).toBeNull();
    fireEvent.change(select, { target: { value: 'factory' } });
    expect(screen.queryByText('Saved User Presets')).toBeNull();
    fireEvent.change(select, { target: { value: 'all' } });
    expect(screen.getByText('Factory Presets')).toBeDefined();
  });

  it('applies a factory preset into the rack store', () => {
    render(<PresetBrowser />);
    fireEvent.click(screen.getByText(factoryName));
    expect(useRackStore.getState().modules.length).toBeGreaterThan(0);
  });

  it('saves the current rack as a user preset', async () => {
    useRackStore.setState({
      modules: [{ id: 'm1', type: 'eq', enabled: true, settings: {} }],
    } as never);
    render(<PresetBrowser />);
    fireEvent.change(screen.getByPlaceholderText(/Save current FX chain/i), {
      target: { value: 'My Chain' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() => expect(screen.getByText('My Chain')).toBeDefined());
    expect(saveProject).toHaveBeenCalledWith('My Chain', 'My Chain', expect.any(Array));
    expect(JSON.parse(localStorage.getItem('studio_rack_user_presets') || '{}')).toHaveProperty('My Chain');
  });

  it('does not save an empty-name or empty-chain preset', () => {
    render(<PresetBrowser />);
    const btn = screen.getByRole('button', { name: /Save/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(saveProject).not.toHaveBeenCalled();
  });

  it('applies and deletes a user preset', async () => {
    useRackStore.setState({
      modules: [{ id: 'm1', type: 'eq', enabled: true, settings: {} }],
    } as never);
    render(<PresetBrowser />);
    fireEvent.change(screen.getByPlaceholderText(/Save current FX chain/i), {
      target: { value: 'Delete Me' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() => expect(screen.getByText('Delete Me')).toBeDefined());

    fireEvent.click(screen.getByText('Delete Me'));
    expect(useRackStore.getState().modules.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTitle('Delete Preset'));
    expect(screen.queryByText('Delete Me')).toBeNull();
  });

  it('toggles favorites and filters to starred presets', () => {
    render(<PresetBrowser />);
    fireEvent.click(screen.getAllByTitle('Star preset')[0]);
    expect(screen.getAllByTitle('Unstar preset').length).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.getItem('studio_rack_favorite_presets') || '[]')).toContain(factoryName);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'favorites' } });
    expect(screen.getByText(factoryName)).toBeDefined();
  });

  it('merges cloud rack presets into user presets on mount', async () => {
    vi.mocked(fetchUserProjects).mockResolvedValue([
      {
        id: 'p1',
        title: 'Cloud Rack A',
        layers: [{ id: 'm1', type: 'eq', enabled: true }],
      },
      {
        id: 'p2',
        title: 'Not A Rack (audio layer)',
        layers: [{ id: 'l1', gain: 1, envelope: {} }],
      },
    ] as never);
    render(<PresetBrowser />);
    await waitFor(() => expect(screen.getByText('Cloud Rack A')).toBeDefined());
    expect(screen.queryByText('Not A Rack (audio layer)')).toBeNull();
  });

  it('boots from pre-seeded localStorage presets and favorites', () => {
    localStorage.setItem(
      'studio_rack_user_presets',
      JSON.stringify({ 'Booted Preset': [{ id: 'm1', type: 'eq', enabled: true, settings: {} }] }),
    );
    localStorage.setItem('studio_rack_favorite_presets', JSON.stringify(['Vocal Polish Chain']));
    render(<PresetBrowser />);
    expect(screen.getByText('Booted Preset')).toBeDefined();
    expect(screen.getByTitle('Unstar preset')).toBeDefined();
  });

  it('tolerates corrupt localStorage', () => {
    localStorage.setItem('studio_rack_user_presets', 'not-json{{{');
    localStorage.setItem('studio_rack_favorite_presets', 'not-json{{{');
    render(<PresetBrowser />);
    expect(screen.getByText(/No user presets saved yet/i)).toBeDefined();
  });
});
