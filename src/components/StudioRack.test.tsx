/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the `StudioRack` master rack shell — empty state, add-module menu,
 * module actions, undo/redo, A/B snapshots, routing/zero-latency/fullscreen
 * toggles and the global macro faders.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StudioRack } from './StudioRack';
import { useRackStore } from '../store/rackStore';

vi.mock('./PresetBrowser', () => ({ PresetBrowser: () => <div data-testid="preset-browser" /> }));

const resetRack = () =>
  useRackStore.setState({
    modules: [],
    history: { past: [], future: [] },
    activeAbState: 'A',
    snapshotA: [],
    snapshotB: [],
    routingMode: 'serial',
    zeroLatency: false,
  });

describe('StudioRack', () => {
  beforeEach(() => {
    localStorage.clear();
    resetRack();
  });

  it('renders the empty-rack state with the toolbar', () => {
    render(<StudioRack />);
    expect(screen.getByText(/Rack is Empty/i)).toBeDefined();
    expect(screen.getByText(/Active Processing Units \(0\)/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Add Hardware Module/i })).toBeDefined();
  });

  it('opens the add menu from the empty-state button', () => {
    render(<StudioRack />);
    fireEvent.click(screen.getByRole('button', { name: /Add First Module/i }));
    expect(screen.getByText('Parametric EQ')).toBeDefined();
  });

  it('adds a module from the dropdown and updates the count', () => {
    render(<StudioRack />);
    fireEvent.click(screen.getByRole('button', { name: /Add Hardware Module/i }));
    fireEvent.click(screen.getByText('Ensemble Chorus'));
    expect(useRackStore.getState().modules).toHaveLength(1);
    expect(screen.getByText(/Active Processing Units \(1\)/i)).toBeDefined();
  });

  it('removes, duplicates and powers a module from its card', () => {
    render(<StudioRack />);
    fireEvent.click(screen.getByRole('button', { name: /Add Hardware Module/i }));
    fireEvent.click(screen.getByText('Ensemble Chorus'));

    fireEvent.click(screen.getByLabelText('Duplicate Module'));
    expect(useRackStore.getState().modules).toHaveLength(2);

    fireEvent.click(screen.getAllByLabelText('Remove Module')[0]);
    expect(useRackStore.getState().modules).toHaveLength(1);

    fireEvent.click(screen.getByLabelText('Toggle Power'));
    expect(useRackStore.getState().modules[0].enabled).toBe(false);
  });

  it('undoes and redoes module additions', () => {
    render(<StudioRack />);
    fireEvent.click(screen.getByRole('button', { name: /Add Hardware Module/i }));
    fireEvent.click(screen.getByText('Ensemble Chorus'));

    const undo = screen.getByTitle('Undo (Ctrl+Z)') as HTMLButtonElement;
    const redo = screen.getByTitle('Redo (Ctrl+Y)') as HTMLButtonElement;
    expect(undo.disabled).toBe(false);

    fireEvent.click(undo);
    expect(useRackStore.getState().modules).toHaveLength(0);
    expect(redo.disabled).toBe(false);

    fireEvent.click(redo);
    expect(useRackStore.getState().modules).toHaveLength(1);
  });

  it('switches A/B snapshots and copies between slots', () => {
    render(<StudioRack />);
    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(useRackStore.getState().activeAbState).toBe('B');
    fireEvent.click(screen.getByTitle('Copy current state to other slot'));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(useRackStore.getState().activeAbState).toBe('A');
  });

  it('toggles routing mode, zero latency, presets and fullscreen', () => {
    render(<StudioRack />);
    fireEvent.click(screen.getByText('Parallel Matrix'));
    expect(useRackStore.getState().routingMode).toBe('parallel');

    fireEvent.click(screen.getByText(/High Quality FFT/i));
    expect(useRackStore.getState().zeroLatency).toBe(true);
    expect(screen.getByText(/0-Latency Active/i)).toBeDefined();

    fireEvent.click(screen.getByText('Presets'));
    expect(screen.getByTestId('preset-browser')).toBeDefined();

    fireEvent.click(screen.getByTitle('Fullscreen Studio Rack'));
    expect(screen.getByTitle('Exit Fullscreen')).toBeDefined();
  });

  it('drives the global macro fader', () => {
    render(<StudioRack />);
    const slider = screen.getByLabelText('Macro 1: Saturation');
    fireEvent.keyDown(slider, { key: 'ArrowUp' });
    expect(screen.getByText('51%')).toBeDefined();
  });
});
