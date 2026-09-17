/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../audio/CompareEngine', () => ({
  compareEngine: {
    getMeterData: vi.fn(() => ({ refRms: -20, mixRms: -14 })),
    getRefPlaybackPosition: vi.fn(() => 0),
    getMixPlaybackPosition: vi.fn(() => 0),
    getLoopB: vi.fn(() => 0),
    getMixTrackBuffer: vi.fn(() => null),
    loadTrackFromFile: vi.fn(),
    setMixBuffer: vi.fn(),
    playReference: vi.fn(),
    pauseReference: vi.fn(),
    stopReference: vi.fn(),
    playMixFile: vi.fn(),
    pauseMixFile: vi.fn(),
    stopMixFile: vi.fn(),
  },
}));

import { CompareEnginePanel } from './CompareEnginePanel';
import { useCompareEngineStore } from '../store/compareEngineStore';

describe('CompareEnginePanel', () => {
  it('renders the reference library section', () => {
    useCompareEngineStore.setState({ referenceTracks: [] });
    render(<CompareEnginePanel isVisible />);
    expect(screen.getByText(/Reference Library/i)).toBeDefined();
  });

  it('lists a loaded reference track', () => {
    useCompareEngineStore.setState({
      referenceTracks: [
        { id: 't1', name: 'REF SONG', buffer: {} as AudioBuffer, duration: 12, channels: 2, peakMap: [] },
      ],
      activeTrackId: 't1',
    });
    render(<CompareEnginePanel isVisible />);
    expect(screen.getAllByText('REF SONG').length).toBeGreaterThan(0);
  });
});
