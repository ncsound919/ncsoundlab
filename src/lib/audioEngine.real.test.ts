import { describe, it, expect, vi, beforeAll } from 'vitest';

// Drop the module-level mock of the audioEngine module so we exercise the
// real AudioEngine class instead of the Proxy returned by setup.ts.
vi.unmock('../lib/audioEngine');
vi.unmock('../audio/AudioEngine');

// The constructor of the real AudioEngine calls many create* methods on the
// AudioContext (createGain, createStereoPanner, createAnalyser, etc.) and
// chains .connect() calls between nodes. The shared MockAudioContext from
// setup.ts is intentionally minimal and only stubs createGain/createAnalyser
// for the mocked module. To run the real class against jsdom we install a
// richer fake AudioContext whose create* methods return a node stub that is
// also a GainNode (so instanceof GainNode passes) and is chainable via
// .connect(). This lets the real constructor complete and set the
// masterRackInput / masterRackOutput fields we want to verify.
//
// IMPORTANT: the audioEngine singleton is constructed at module-import time
// (`export const audioEngine = new AudioEngine()`), so we must install the
// fake AudioContext BEFORE we import the module. We use vi.resetModules()
// inside beforeAll and a dynamic import to ensure the new context is in
// place when the AudioEngine constructor runs.
const installRealEngineContext = () => {
  const ctxStub: any = {
    sampleRate: 44100,
    currentTime: 0,
    state: 'running',
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    suspend: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
  const makeNode = (): any => {
    const node: any = {
      connect: vi.fn(() => node),
      disconnect: vi.fn(() => node),
      gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      frequency: { value: 1000, setValueAtTime: vi.fn() },
      Q: { value: 1, setValueAtTime: vi.fn() },
      pan: { value: 0, setValueAtTime: vi.fn() },
      delayTime: { value: 0, setValueAtTime: vi.fn() },
      threshold: { value: 0, setValueAtTime: vi.fn() },
      ratio: { value: 1, setValueAtTime: vi.fn() },
      attack: { value: 0, setValueAtTime: vi.fn() },
      release: { value: 0, setValueAtTime: vi.fn() },
      fftSize: 256,
      frequencyBinCount: 128,
      type: 'peaking',
      oversample: 'none',
      curve: null,
      buffer: null,
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'max',
      channelInterpretation: 'speakers',
      getByteFrequencyData: vi.fn(),
      getByteTimeDomainData: vi.fn(),
    };
    // Mark as GainNode so `instanceof GainNode` holds against the global
    // GainNode stub from setup.ts.
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
  ]) {
    ctxStub[m] = vi.fn(() => makeNode());
  }
  vi.stubGlobal('AudioContext', function () { return ctxStub; });
  vi.stubGlobal('webkitAudioContext', function () { return ctxStub; });
};

let audioEngine: typeof import('./audioEngine').audioEngine;

beforeAll(async () => {
  installRealEngineContext();
  vi.resetModules();
  ({ audioEngine } = await import('./audioEngine'));
});

describe('audioEngine real class — public surface (unmocked)', () => {
  it('getContext() returns an AudioContext-shaped value', () => {
    const ctx = audioEngine.getContext();
    expect(ctx).toBeTruthy();
    expect(typeof (ctx as any).createGain).toBe('function');
  });

  it('getMasterRackInput() returns a GainNode', () => {
    const node = audioEngine.getMasterRackInput();
    expect(node).toBeInstanceOf(GainNode);
  });

  it('getMasterRackOutput() returns a GainNode', () => {
    const node = audioEngine.getMasterRackOutput();
    expect(node).toBeInstanceOf(GainNode);
  });
});
