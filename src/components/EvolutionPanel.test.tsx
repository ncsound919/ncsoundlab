import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EvolutionPanel } from './EvolutionPanel';
import React from 'react';

describe('EvolutionPanel', () => {
  const mockVariations = [
    {
      id: 'var-1',
      buffer: {} as any,
      chaosLevel: 0.5,
      spectralDensity: 0.5,
      temporalBehavior: 0.5,
      routingPath: ['filter']
    }
  ];

  it('renders correctly with variations', () => {
    render(
      <EvolutionPanel
        variations={mockVariations}
        onAddLayer={vi.fn()}
        onSaveToKit={vi.fn()}
        onReEvolve={vi.fn()}
        isEvolving={false}
      />
    );

    expect(screen.getByText(/Sound Evolution Engine/i)).toBeDefined();
    expect(screen.getByText(/Mutant Generation 1/i)).toBeDefined();
  });

  it('shows empty state when no variations', () => {
    render(
      <EvolutionPanel
        variations={[]}
        onAddLayer={vi.fn()}
        onSaveToKit={vi.fn()}
        onReEvolve={vi.fn()}
        isEvolving={false}
      />
    );

    expect(screen.getByText(/No variations generated yet/i)).toBeDefined();
  });
});
