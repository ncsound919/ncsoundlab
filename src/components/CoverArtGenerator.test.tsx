/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CoverArtGenerator } from './CoverArtGenerator';
import type { CoverArtOptions } from '../types';

const options: CoverArtOptions = {
  title: 'TEST KIT',
  subtitle: 'SUB',
  producer: 'NC SOUND LAB',
  accentColor: '#f97316',
  theme: 'cyberpunk',
  era: 'golden_era',
};

describe('CoverArtGenerator', () => {
  it('renders the designer with the provided title', () => {
    render(<CoverArtGenerator options={options} onChange={vi.fn()} />);
    expect(screen.getByText(/Deterministic Hip-Hop Cover Art Designer/i)).toBeDefined();
    expect(screen.getByDisplayValue('TEST KIT')).toBeDefined();
  });

  it('reports option changes upward', () => {
    const onChange = vi.fn();
    render(<CoverArtGenerator options={options} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('TEST KIT'), { target: { value: 'NEW TITLE' } });
    expect(onChange).toHaveBeenCalled();
  });
});
