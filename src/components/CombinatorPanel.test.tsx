import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CombinatorPanel } from './CombinatorPanel';
import { useCombinatorStore } from '../store/combinatorStore';

describe('CombinatorPanel', () => {
  beforeEach(() => {
    useCombinatorStore.getState().reset();
  });

  it('renders empty state', () => {
    render(<CombinatorPanel isOpen={true} onClose={() => {}} />);
    expect(screen.getByText(/No slots/i)).toBeTruthy();
  });

  it('adds a slot', () => {
    render(<CombinatorPanel isOpen={true} onClose={() => {}} />);
    fireEvent.click(screen.getByText('+ Add slot'));
    expect(useCombinatorStore.getState().slots.length).toBe(1);
  });

  it('closes', () => {
    const onClose = vi.fn();
    render(<CombinatorPanel isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
