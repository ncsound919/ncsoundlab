/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MasterDynamicsPanel } from './MasterDynamicsPanel';
import { useMasterDynamicsStore, DEFAULT_MASTER_DYNAMICS } from '../store/masterDynamicsStore';

beforeEach(() => {
  useMasterDynamicsStore.getState().setSettings({ thresholdDb: -12 });
});

describe('MasterDynamicsPanel', () => {
  it('renders the master dynamics controls', () => {
    render(<MasterDynamicsPanel />);
    expect(screen.getByText('Master Dynamics')).toBeDefined();
    expect(screen.getByText('Threshold')).toBeDefined();
  });

  it('resets settings back to the default', () => {
    render(<MasterDynamicsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Reset/i }));
    expect(useMasterDynamicsStore.getState().settings.thresholdDb).toBe(DEFAULT_MASTER_DYNAMICS.thresholdDb);
  });
});
