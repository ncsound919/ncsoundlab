/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Gap coverage for `src/components/SongModePanel.tsx`: chain move
 * left/right (both guard directions), remove, and slot activation without
 * the optional `onPlayFromSlot` callback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { usePatternStore } from '../store/patternStore';
import { SongModePanel } from './SongModePanel';

describe('SongModePanel chain editing', () => {
  beforeEach(() => {
    usePatternStore.getState().reset();
  });

  it('activates a slot without a callback (optional-call absent branch)', () => {
    render(<SongModePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(usePatternStore.getState().activePatternId).toBe('B');
  });

  it('moves a slot left and right through the guards', () => {
    render(<SongModePanel />);
    const lefts = screen.getAllByRole('button', { name: 'Move left' });
    const rights = screen.getAllByRole('button', { name: 'Move right' });
    // idx 0: left guard false (no-op), right guard true.
    fireEvent.click(lefts[0]);
    expect(usePatternStore.getState().songChain.order).toEqual(['A', 'B', 'C', 'D']);
    fireEvent.click(rights[0]);
    expect(usePatternStore.getState().songChain.order).toEqual(['B', 'A', 'C', 'D']);
    // Last slot: right guard false (no-op).
    const last = usePatternStore.getState().songChain.order.length - 1;
    fireEvent.click(screen.getAllByRole('button', { name: 'Move right' })[last]);
    expect(usePatternStore.getState().songChain.order).toEqual(['B', 'A', 'C', 'D']);
    // Middle slot left guard true.
    fireEvent.click(screen.getAllByRole('button', { name: 'Move left' })[2]);
    expect(usePatternStore.getState().songChain.order).toEqual(['B', 'C', 'A', 'D']);
  });

  it('removes a slot', () => {
    const onPlayFromSlot = vi.fn();
    render(<SongModePanel onPlayFromSlot={onPlayFromSlot} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(usePatternStore.getState().songChain.order).toEqual(['B', 'C', 'D']);
    expect(onPlayFromSlot).not.toHaveBeenCalled();
  });
});
