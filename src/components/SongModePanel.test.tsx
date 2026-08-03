import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { usePatternStore } from '../store/patternStore';
import { SongModePanel } from './SongModePanel';

describe('SongModePanel', () => {
  beforeEach(() => {
    usePatternStore.getState().reset();
  });

  it('renders each pattern in the chain', () => {
    const { getByText } = render(<SongModePanel />);
    expect(getByText('A')).toBeTruthy();
    expect(getByText('B')).toBeTruthy();
    expect(getByText('C')).toBeTruthy();
    expect(getByText('D')).toBeTruthy();
  });

  it('clicking a pattern slot calls onPlayFromSlot with that index', () => {
    const calls: number[] = [];
    const { container } = render(<SongModePanel onPlayFromSlot={(i) => calls.push(i)} />);
    const slots = container.querySelectorAll('[data-slot]');
    const inner = slots[1].querySelector('button');
    if (!inner) throw new Error('expected an inner pattern button');
    fireEvent.click(inner);
    expect(calls).toEqual([1]);
  });

  it('clicking duplicate inserts a duplicate slot into the chain', () => {
    const { getAllByText } = render(<SongModePanel />);
    const dup = getAllByText('Duplicate')[0];
    fireEvent.click(dup);
    expect(usePatternStore.getState().songChain.order.length).toBe(5);
  });
});
