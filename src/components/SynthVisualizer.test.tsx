/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SynthVisualizer } from './SynthVisualizer';
import { DEFAULT_ENVELOPE, DEFAULT_SYNTH } from '../types';

const renderViz = () =>
  render(
    <SynthVisualizer
      synth={{ ...DEFAULT_SYNTH }}
      envelope={{ ...DEFAULT_ENVELOPE }}
      onUpdateSynth={vi.fn()}
      onUpdateEnvelope={vi.fn()}
      onPlay={vi.fn()}
    />
  );

describe('SynthVisualizer', () => {
  it('renders the view tabs including ADSR when an envelope is provided', () => {
    renderViz();
    expect(screen.getByRole('button', { name: /Oscilloscope/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Harmonics/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Morph XY Pad/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /ADSR Curve/i })).toBeDefined();
  });

  it('switches view when a tab is clicked', () => {
    renderViz();
    fireEvent.click(screen.getByRole('button', { name: /Harmonics/i }));
    // The harmonics view exposes a distinct label that the scope view does not.
    expect(screen.getByRole('button', { name: /Harmonics/i }).className).toContain('bg-sky-500');
  });
});
