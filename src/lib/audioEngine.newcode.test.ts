/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the new-code paths in `src/lib/audioEngine.ts`: the WaveShaper
 * curve cache (`cachedCurve`), the FX-chain curve builders reached through
 * `triggerLayer`, MPC choke groups, and `applyMasterDynamics`. Uses the real
 * AudioEngine class against a rich fake AudioContext (same approach as
 * `audioEngine.real.test.ts`).
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { DEFAULT_FX } from '../types';

vi.unmock('../lib/audioEngine');
vi.unmock('../audio/AudioEngine');

const installRealEngineContext = () => {
  const ctxStub: any = {
    sampleRate: 44100,
    currentTime: 1,
    state: 'running',
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    suspend: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
  const makeParam = () => ({
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
  });
  const makeNode = (): any => {
    const node: any = {
      connect: vi.fn(() => node),
      disconnect: vi.fn(() => node),
      gain: makeParam(),
      frequency: makeParam(),
      Q: makeParam(),
      pan: makeParam(),
      delayTime: makeParam(),
      detune: makeParam(),
      threshold: makeParam(),
      ratio: makeParam(),
      attack: makeParam(),
      release: makeParam(),
      fftSize: 256,
      frequencyBinCount: 128,
      type: 'peaking',
      oversample: 'none',
      curve: null,
      buffer: null,
      playbackRate: { value: 1, setValueAtTime: vi.fn() },
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'max',
      channelInterpretation: 'speakers',
      getByteFrequencyData: vi.fn(),
      getByteTimeDomainData: vi.fn(),
    };
    Object.setPrototypeOf(node, GainNode.prototype);
    return node;
  };
  for (const m of [
    'createGain',
    'createStereoPanner',
    'createAnalyser',
    'createBiquadFilter',
    'createWaveShaper',
    'createChannelSplitter',
    'createChannelMerger',
    'createDelay',
    'createDynamicsCompressor',
    'createConvolver',
    'createBufferSource',
    'createOscillator',
    'createBuffer',
    'createConstantSource',
  ]) {
    ctxStub[m] = vi.fn(() => makeNode());
  }
  vi.stubGlobal('AudioContext', function () { return ctxStub; });
  vi.stubGlobal('webkitAudioContext', function () { return ctxStub; });
  return ctxStub;
};

let audioEngine: typeof import('./audioEngine').audioEngine;
let cachedCurve: typeof import('./audioEngine').cachedCurve;

beforeAll(async () => {
  installRealEngineContext();
  vi.resetModules();
  const mod = await import('./audioEngine');
  audioEngine = mod.audioEngine;
  cachedCurve = mod.cachedCurve;
});

const makeSampleLayer = (fxOverrides: Record<string, unknown> = {}): any => {
  return {
    id: 'l1',
    name: 'S',
    type: 'sample',
    enabled: true,
    gain: 1,
    pan: 0,
    pitch: 0,
    envelope: { attack: 0.001, decay: 0.2, sustain: 0.8, release: 0.1 },
    fx: { ...DEFAULT_FX, bitcrush: 0, distortion: 0, ...fxOverrides },
    audioBuffer: { duration: 1, length: 44100, sampleRate: 44100, numberOfChannels: 1, getChannelData: () => new Float32Array(44100) },
  };
};

describe('cachedCurve', () => {
  it('reuses the cached curve for an identical key', () => {
    const cache = new Map<string, Float32Array>();
    const build = vi.fn(() => new Float32Array([1, 2, 3]));
    const a = cachedCurve(cache, 'k', build);
    const b = cachedCurve(cache, 'k', build);
    expect(a).toBe(b);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('evicts the oldest entry when the cache is full', () => {
    const cache = new Map<string, Float32Array>();
    let n = 0;
    // Fill past the 64-entry cap.
    for (let i = 0; i < 70; i++) {
      cachedCurve(cache, `key-${i}`, () => new Float32Array([n++]));
    }
    expect(cache.size).toBeLessThanOrEqual(64);
    expect(cache.has('key-0')).toBe(false); // oldest evicted
    expect(cache.has('key-69')).toBe(true); // newest kept
  });
});

describe('triggerLayer new-code paths', () => {
  it('returns early for a sample layer with no buffer', () => {
    const layer = makeSampleLayer();
    layer.audioBuffer = undefined;
    expect(() => audioEngine.triggerLayer(layer)).not.toThrow();
  });

  it('chokes a previous hit in the same choke group', async () => {
    const layer = makeSampleLayer();
    audioEngine.triggerLayer(layer, 0.5, 'choke:hats');
    await new Promise((r) => setTimeout(r, 0)); // let the internal .then register the choke entry
    audioEngine.triggerLayer(layer, 0.5, 'choke:hats');
    await new Promise((r) => setTimeout(r, 0));
    // Second trigger chokes the first — no throw, fade scheduled on the gain node.
    expect(() => audioEngine.triggerLayer(layer, 0.5, 'choke:hats')).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('builds the FX chain with bitcrush + distortion curves', async () => {
    const layer = makeSampleLayer({ bitcrush: 0.5, distortion: 0.7, distortionType: 'tube' });
    expect(() => audioEngine.triggerLayer(layer)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    const layer2 = makeSampleLayer({ distortion: 0.9, harmonic2nd: 30, harmonic3rd: 20, distortionType: 'clip' });
    expect(() => audioEngine.triggerLayer(layer2)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});

describe('applyMasterDynamics', () => {
  it('applies limiter + makeup settings without throwing', () => {
    expect(() =>
      audioEngine.applyMasterDynamics({
        enabled: true,
        limiterThreshold: -1,
        limiterRelease: 0.1,
        makeupGain: 2,
      } as never),
    ).not.toThrow();
  });
});
