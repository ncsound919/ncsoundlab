/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the ClipLauncher: drop-to-assign with offline tempo-match,
 * play/stop toggle, quantize toggle, and BPM re-render. The sample library
 * and audio engine are mocked; the time-stretch DSP runs for real on a tiny
 * buffer.
 */

import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { ClipLauncher } from './ClipLauncher';

vi.mock('../lib/sampleLibrary', () => ({
  fetchLibrarySample: vi.fn(async (id: string) => ({
    id,
    name: 'Funky Loop',
    fileName: 'funky-loop.wav',
  })),
  decodeLibrarySample: vi.fn(async () => ({
    numberOfChannels: 1,
    length: 2205,
    sampleRate: 44100,
    duration: 0.05,
    getChannelData: () => Float32Array.from({ length: 2205 }, (_, i) => Math.sin(i / 10) * 0.5),
  })),
}));

const sources: Array<Record<string, unknown>> = [];
vi.mock('../lib/audioEngine', () => ({
  audioEngine: {
    getContext: vi.fn(() => ({
      currentTime: 10,
      destination: {},
      createBufferSource: vi.fn(() => {
        const src = {
          buffer: null,
          loop: false,
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          disconnect: vi.fn(),
          onended: null,
        };
        sources.push(src);
        return src;
      }),
    })),
    getMasterRackInput: vi.fn(() => null),
  },
}));

const transportState = vi.hoisted(() => ({ position: 0 }));
vi.mock('../audio/transport/transport', () => ({
  initTransport: vi.fn(),
  getTransport: vi.fn(() => ({ getPosition: () => transportState.position })),
  resetTransport: vi.fn(),
}));

const dropSample = (slotIdx: number) => {
  const slots = document.querySelectorAll('[data-clip-launcher] > div.grid > div');
  fireEvent.drop(slots[slotIdx], { dataTransfer: { getData: () => 's1' } });
};

describe('ClipLauncher', () => {
  beforeEach(() => {
    sources.length = 0;
    vi.clearAllMocks();
  });

  it('assigns a dropped sample and renders it tempo-matched', async () => {
    render(<ClipLauncher bpm={120} stepLength={16} />);
    dropSample(0);
    await waitFor(() => expect(screen.getByText('Funky Loop')).toBeDefined());
    expect(screen.getByText('tempo-matched')).toBeDefined();
  });

  it('toggles play/stop on the rendered clip', async () => {
    render(<ClipLauncher bpm={120} stepLength={16} />);
    dropSample(1);
    await waitFor(() => expect(screen.getByText('Funky Loop')).toBeDefined());

    const slot = screen.getByText('Funky Loop').closest('div.rounded-lg') as HTMLElement;
    fireEvent.click(within(slot).getByTitle('Play clip'));
    expect(sources).toHaveLength(1);
    expect(sources[0].loop).toBe(true);
    expect(sources[0].start).toHaveBeenCalled();

    fireEvent.click(within(slot).getByTitle('Stop clip'));
    expect(sources[0].stop).toHaveBeenCalled();
  });

  it('toggles quantize and clears slots', async () => {
    render(<ClipLauncher bpm={120} stepLength={16} />);
    const q = screen.getByRole('button', { name: 'Quantized' });
    fireEvent.click(q);
    expect(screen.getByRole('button', { name: 'Free' })).toBeDefined();

    dropSample(2);
    await waitFor(() => expect(screen.getByText('Funky Loop')).toBeDefined());
    const slot = screen.getByText('Funky Loop').closest('div.rounded-lg') as HTMLElement;
    fireEvent.click(within(slot).getByTitle('Clear clip'));
    expect(screen.queryByText('Funky Loop')).toBeNull();
  });

  it('quantizes the launch to the next loop boundary', async () => {
    vi.useFakeTimers();
    try {
      // Transport mid-loop (1.5s into a 1s loop): launch waits 500ms.
      transportState.position = 1.5;
      render(<ClipLauncher bpm={120} stepLength={16} />);
      dropSample(0);
      // The drop handler is async — flush microtasks under fake timers.
      await act(async () => {});
      const slot = screen.getByText('Funky Loop').closest('div.rounded-lg') as HTMLElement;
      fireEvent.click(within(slot).getByTitle('Play clip'));
      expect(sources).toHaveLength(0);
      vi.advanceTimersByTime(500);
      expect(sources).toHaveLength(1);
    } finally {
      transportState.position = 0;
      vi.useRealTimers();
    }
  });
});
