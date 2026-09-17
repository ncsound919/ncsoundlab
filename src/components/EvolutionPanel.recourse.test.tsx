/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

const h = vi.hoisted(() => ({
  re: {
    fetchRecoursePiece: vi.fn(),
    renderRecoursePiece: vi.fn(),
    recoursePieceUrl: vi.fn(() => 'http://localhost:3050/api/recourse/compose/soundlab.json?style=x'),
    DEFAULT_RECOURSE_BASE: 'http://localhost:3050',
    RECOURSE_STYLES: ['steely-dan', 'airplane'],
  },
  evo: { generateEvolutionVariations: vi.fn(async () => []) },
}));

vi.mock('../lib/recourseEvolution', () => h.re);
vi.mock('../lib/evolutionEngine', () => h.evo);

import { EvolutionPanel } from './EvolutionPanel';

const baseProps = (over: Record<string, unknown> = {}) => ({
  variations: [],
  onAddLayer: vi.fn(),
  onSaveToKit: vi.fn(),
  onReEvolve: vi.fn(),
  isEvolving: false,
  onSetVariations: vi.fn(),
  ...over,
});

describe('EvolutionPanel Recourse source', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.re.fetchRecoursePiece.mockResolvedValue({ title: 'Test', style: 'steely-dan' });
    h.re.renderRecoursePiece.mockResolvedValue({ duration: 8 } as unknown as AudioBuffer);
  });

  it('renders the Recourse source card', () => {
    render(<EvolutionPanel {...baseProps()} />);
    expect(screen.getByText(/Recourse Source/i)).toBeDefined();
  });

  it('adds a pulled piece to the batch', async () => {
    render(<EvolutionPanel {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Add to Batch/i }));
    await waitFor(() => expect(h.re.fetchRecoursePiece).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/TEST \(RECOURSE\)/i)).toBeDefined());
  });

  it('evolves a pulled piece into variations', async () => {
    const onSetVariations = vi.fn();
    render(<EvolutionPanel {...baseProps({ onSetVariations })} />);
    fireEvent.click(screen.getByRole('button', { name: /Pull & Evolve/i }));
    await waitFor(() => expect(onSetVariations).toHaveBeenCalled());
    expect(h.evo.generateEvolutionVariations).toHaveBeenCalled();
  });

  it('surfaces pull errors', async () => {
    h.re.fetchRecoursePiece.mockRejectedValue(new Error('boom'));
    render(<EvolutionPanel {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Add to Batch/i }));
    await waitFor(() => expect(screen.getByText(/boom/)).toBeDefined());
  });
});
