/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extra coverage for `MasterDynamicsPanel`: the sidechain route list
 * (empty state, add/edit/toggle/remove), the master knob callbacks
 * (threshold/ratio/attack/release/makeup) and the per-route inline knobs.
 * The parent store is reset before each test.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MasterDynamicsPanel } from './MasterDynamicsPanel';
import {
  useMasterDynamicsStore,
  DEFAULT_MASTER_DYNAMICS,
} from '../store/masterDynamicsStore';

beforeEach(() => {
  useMasterDynamicsStore.getState().reset();
});

const driveUp = (name: string) => {
  const slider = screen.getByRole('slider', { name });
  fireEvent.focus(slider);
  fireEvent.keyDown(slider, { key: 'ArrowUp' });
};

describe('MasterDynamicsPanel coverage', () => {
  it('renders the empty sidechain state and resets settings to defaults', () => {
    useMasterDynamicsStore.getState().setSettings({ thresholdDb: -33, ratio: 3 });
    const { container } = render(<MasterDynamicsPanel />);

    expect(container.querySelectorAll('[data-sidechain-row]')).toHaveLength(0);
    expect(screen.getByText(/No routes/i)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Reset/i }));
    expect(useMasterDynamicsStore.getState().settings).toEqual(DEFAULT_MASTER_DYNAMICS);
  });

  it('adds two routes, toggles one, edits source/target and removes one', () => {
    const { container } = render(<MasterDynamicsPanel />);
    const addRoute = screen.getByRole('button', { name: /\+ Add Route/i });
    fireEvent.click(addRoute);
    fireEvent.click(addRoute);

    let rows = container.querySelectorAll('[data-sidechain-row]');
    expect(rows).toHaveLength(2);

    const toggles = screen.getAllByLabelText('Toggle sidechain');
    expect(toggles).toHaveLength(2);
    fireEvent.click(toggles[0]);
    expect(useMasterDynamicsStore.getState().sidechains[0].enabled).toBe(false);

    const firstRow = container.querySelector('[data-sidechain-row]') as HTMLElement;
    const inputs = firstRow.querySelectorAll('input[type="text"]');
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[0], { target: { value: 'kick' } });
    fireEvent.change(inputs[1], { target: { value: 'delay' } });
    expect(useMasterDynamicsStore.getState().sidechains[0].source).toBe('kick');
    expect(useMasterDynamicsStore.getState().sidechains[0].target).toBe('delay');

    const removeButtons = screen.getAllByLabelText('Remove sidechain route');
    fireEvent.click(removeButtons[0]);
    rows = container.querySelectorAll('[data-sidechain-row]');
    expect(rows).toHaveLength(1);
    expect(useMasterDynamicsStore.getState().sidechains).toHaveLength(1);
  });

  it('updates the master settings from the five knobs', () => {
    render(<MasterDynamicsPanel />);

    driveUp('Threshold');
    expect(useMasterDynamicsStore.getState().settings.thresholdDb).toBe(0);

    const ratio = screen.getByRole('slider', { name: 'Ratio' });
    fireEvent.focus(ratio);
    fireEvent.keyDown(ratio, { key: 'ArrowDown' });
    expect(useMasterDynamicsStore.getState().settings.ratio).toBeCloseTo(19.9, 5);

    driveUp('Attack');
    expect(useMasterDynamicsStore.getState().settings.attackSec).toBeCloseTo(0.0021, 6);

    driveUp('Release');
    expect(useMasterDynamicsStore.getState().settings.releaseSec).toBeCloseTo(0.101, 6);

    driveUp('Makeup');
    expect(useMasterDynamicsStore.getState().settings.makeupDb).toBeCloseTo(0.5, 5);
  });

  it('updates a sidechain route from its inline knobs', () => {
    render(<MasterDynamicsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Route/i }));

    driveUp('Amount');
    driveUp('Atk');
    driveUp('Rel');

    const route = useMasterDynamicsStore.getState().sidechains[0];
    expect(route.amount).toBeCloseTo(0.55, 5);
    expect(route.attackSec).toBeCloseTo(0.0051, 6);
    expect(route.releaseSec).toBeCloseTo(0.151, 6);
  });
});
