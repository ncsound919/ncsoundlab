/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// wavesurfer.js renders into a canvas/WebAudio graph that jsdom lacks; stub the
// module so ChopEditor can mount and its controls can be asserted.
vi.mock('wavesurfer.js', () => ({
  default: {
    create: vi.fn(() => ({
      on: vi.fn(), un: vi.fn(), load: vi.fn(() => Promise.resolve()), loadBlob: vi.fn(() => Promise.resolve()), destroy: vi.fn(), play: vi.fn(() => Promise.resolve()), pause: vi.fn(),
      isPlaying: vi.fn(() => false), getDuration: vi.fn(() => 2), getCurrentTime: vi.fn(() => 0),
      setTime: vi.fn(), zoom: vi.fn(), clearRegions: vi.fn(), addRegion: vi.fn(), setVolume: vi.fn(),
    })),
  },
}));
vi.mock('wavesurfer.js/dist/plugins/timeline', () => ({ default: { create: vi.fn(() => ({})) } }));
vi.mock('wavesurfer.js/dist/plugins/spectrogram', () => ({ default: { create: vi.fn(() => ({})) } }));
vi.mock('wavesurfer.js/dist/plugins/minimap', () => ({ default: { create: vi.fn(() => ({})) } }));

import { ChopEditor } from './ChopEditor';

const makeBuffer = (): AudioBuffer => {
  const data = Float32Array.from({ length: 2048 }, (_, i) => (i % 256 === 0 ? 1 : 0));
  return {
    length: data.length,
    sampleRate: 44100,
    duration: data.length / 44100,
    numberOfChannels: 1,
    getChannelData: () => data,
    copyToChannel: vi.fn(),
    copyFromChannel: vi.fn(),
  } as unknown as AudioBuffer;
};

describe('ChopEditor', () => {
  it('mounts with a title and slice controls', () => {
    render(
      <ChopEditor
        buffer={makeBuffer()}
        fileName="break.wav"
        defaultCount={4}
        onSendToPads={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Sample Editor')).toBeDefined();
    expect(screen.getByRole('button', { name: /Equal/i })).toBeDefined();
  });

  it('shows the file metadata in the header', () => {
    render(
      <ChopEditor buffer={makeBuffer()} fileName="break.wav" defaultCount={4} onSendToPads={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText(/BREAK/i)).toBeDefined();
  });
});
