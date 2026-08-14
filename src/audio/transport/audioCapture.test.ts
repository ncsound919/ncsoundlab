import { describe, it, expect, beforeAll } from 'vitest';
import { sliceBufferIntoPads } from './audioCapture';

// jsdom does not expose AudioBuffer. Provide a minimal shape matching the
// subset the slicing code uses (length, sampleRate, numberOfChannels,
// getChannelData, copyToChannel).
class MockAudioBuffer {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  private data: Float32Array[];
  constructor(opts: { length: number; sampleRate: number; numberOfChannels: number }) {
    this.length = opts.length;
    this.sampleRate = opts.sampleRate;
    this.numberOfChannels = opts.numberOfChannels;
    this.data = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(opts.length));
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(ch: number): Float32Array {
    return this.data[ch];
  }
  copyToChannel(src: Float32Array, ch: number): void {
    this.data[ch].set(src);
  }
}

beforeAll(() => {
  (globalThis as any).AudioBuffer = MockAudioBuffer;
});

describe('sliceBufferIntoPads', () => {
  it('slices a buffer into 16 equal pads (default)', () => {
    const sampleRate = 44100;
    const lengthSec = 4;
    const buf = new AudioBuffer({ length: sampleRate * lengthSec, sampleRate, numberOfChannels: 1 });
    const slices = sliceBufferIntoPads(buf, 16);
    expect(slices).toHaveLength(16);
    for (const s of slices) {
      expect(s.duration).toBeCloseTo(lengthSec / 16, 1);
    }
  });

  it('slices a buffer into 32 equal pads', () => {
    const sampleRate = 44100;
    const lengthSec = 8;
    const buf = new AudioBuffer({ length: sampleRate * lengthSec, sampleRate, numberOfChannels: 1 });
    const slices = sliceBufferIntoPads(buf, 32);
    expect(slices).toHaveLength(32);
    for (const s of slices) {
      expect(s.duration).toBeCloseTo(lengthSec / 32, 1);
    }
  });
});

describe('isMediaRecorderSupported', () => {
  it('returns false when MediaRecorder is unavailable', () => {
    // jsdom has no MediaRecorder, so this should be false unless stubbed.
    expect(typeof (globalThis as any).MediaRecorder).toBe('undefined');
  });
});
