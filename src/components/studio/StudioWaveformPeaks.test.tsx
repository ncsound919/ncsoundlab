/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the shared web waveform painter: it mirrors the Compose
 * `StudioWaveformPeaks` contract (interleaved lo/hi columns, trim shade,
 * slice markers) and survives a missing 2d context.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { StudioWaveformPeaks } from './StudioControls';

const calls: Record<string, number> = {};

function makeCtx() {
  return new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'canvas') return {};
        return (..._args: unknown[]) => {
          calls[prop] = (calls[prop] ?? 0) + 1;
        };
      },
      set() {
        return true;
      },
    },
  );
}

describe('StudioWaveformPeaks', () => {
  beforeEach(() => {
    for (const k of Object.keys(calls)) delete calls[k];
  });

  it('paints peaks, grid and slice markers on the shared contract', () => {
    const getContext = vi.fn(() => makeCtx());
    HTMLCanvasElement.prototype.getContext = getContext as never;
    const { container } = render(
      <StudioWaveformPeaks
        peaks={[-0.5, 0.5, -1, 1, 0, 0]}
        trimStart={0.1}
        trimEnd={0.9}
        slices={[0.25, 0.75]}
        height={96}
      />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas?.getAttribute('role')).toBe('img');
    expect(getContext).toHaveBeenCalledWith('2d');
    // Peaks are one batched stroke; the two trim shades are fillRects
    // (clearRect is separate); each slice marker strokes a line and fills
    // a dot.
    expect((calls['stroke'] ?? 0)).toBeGreaterThanOrEqual(3);
    expect(calls['clearRect']).toBe(1);
    expect(calls['fillRect']).toBe(2);
    expect((calls['fill'] ?? 0)).toBe(2);
    expect((calls['arc'] ?? 0)).toBe(2);
  });

  it('renders an empty canvas without throwing when there are no peaks', () => {
    const getContext = vi.fn(() => makeCtx());
    HTMLCanvasElement.prototype.getContext = getContext as never;
    const { container } = render(<StudioWaveformPeaks peaks={[]} />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('survives a missing 2d context', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
    const { container } = render(<StudioWaveformPeaks peaks={[-0.5, 0.5]} />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });
});
