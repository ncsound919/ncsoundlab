/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Statement-coverage tests for `src/audio/AudioEngine.ts` (SharedAudioEngine)
 * against the real class. setup.ts auto-mocks this module, so the real engine
 * is restored with `vi.unmock('./AudioEngine')` + `vi.unmock('../lib/audioEngine')`
 * (the shared engine's `base` getter returns the real lib engine, whose
 * getContext() returns our fake live context).
 *
 * Covers: getContext delegation, microphone start/stop/lock/failure branches,
 * analyser data reads, per-module analyser/gain creation + fftSize refresh,
 * master routing (rack + destination fallback), disposal, and gain-reduction
 * get/set with sanitisation + clamping.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { dbToGain, gainToDb } from '../lib/audioUtils';

vi.unmock('./AudioEngine');
vi.unmock('../lib/audioEngine');

const makeParam = () => ({
  value: 1,
  setTargetAtTime: vi.fn(),
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
});

const makeAnalyser = () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  fftSize: 2048,
  frequencyBinCount: 1024,
  getByteFrequencyData: vi.fn(),
  getByteTimeDomainData: vi.fn(),
  getFloatTimeDomainData: vi.fn(),
  smoothingTimeConstant: 0,
});

const makeGain = () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  gain: makeParam(),
});

const CREATE_METHODS = [
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
];

const makeNode = (proto: any = GainNode.prototype): any => {
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
    getFloatTimeDomainData: vi.fn(),
  };
  Object.setPrototypeOf(node, proto);
  return node;
};

const makeBuffer = (channels: number, length: number, sampleRate: number) => ({
  numberOfChannels: channels,
  length,
  sampleRate,
  duration: length / sampleRate,
  getChannelData: () => new Float32Array(length),
});

const installContext = () => {
  const ctx: any = {
    sampleRate: 44100,
    currentTime: 1,
    state: 'running',
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    suspend: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createAnalyser: vi.fn(() => makeAnalyser()),
    createGain: vi.fn(() => makeGain()),
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
  };
  for (const m of CREATE_METHODS) {
    if (!(m in ctx)) ctx[m] = vi.fn(() => makeNode());
  }
  ctx.createBufferSource = vi.fn(() => makeNode(AudioBufferSourceNode.prototype));
  ctx.createOscillator = vi.fn(() => makeNode(OscillatorNode.prototype));
  ctx.createBuffer = vi.fn((c: number, l: number, r: number) => makeBuffer(c, l, r));
  Object.setPrototypeOf(ctx, BaseAudioContext.prototype);
  vi.stubGlobal('AudioContext', function () { return ctx; });
  vi.stubGlobal('webkitAudioContext', function () { return ctx; });
  return ctx;
};

let shared: any;
let ctx: any;

beforeAll(async () => {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn() },
    configurable: true,
  });
  ctx = installContext();
  vi.resetModules();
  const mod = await import('./AudioEngine');
  shared = mod.audioEngine;
});

describe('SharedAudioEngine', () => {
  it('getContext delegates to the base engine', () => {
    expect(shared.getContext()).toBe(ctx);
  });

  it('startMicrophone acquires the stream and locks concurrent requests', async () => {
    const media = (navigator as any).mediaDevices;
    media.getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    const p1 = shared.startMicrophone();
    const p2 = shared.startMicrophone(); // lock: reuses the in-flight promise
    await Promise.all([p1, p2]);
    expect(media.getUserMedia).toHaveBeenCalledTimes(1);
    expect(shared.micStream).toBeTruthy();
    expect(shared.micAnalyser.fftSize).toBe(2048);
    expect(ctx.createMediaStreamSource).toHaveBeenCalled();
    await shared.startMicrophone(); // already running branch
  });

  it('startMicrophone resumes a suspended context', async () => {
    await shared.stopMicrophone();
    ctx.state = 'suspended';
    (navigator as any).mediaDevices.getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });
    await shared.startMicrophone();
    expect(ctx.resume).toHaveBeenCalled();
    ctx.state = 'running';
    await shared.stopMicrophone();
  });

  it('startMicrophone rejects and cleans up partial state on failure', async () => {
    await shared.stopMicrophone();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (navigator as any).mediaDevices.getUserMedia.mockRejectedValueOnce(new Error('denied'));
    await expect(shared.startMicrophone()).rejects.toThrow('denied');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
    expect(shared.micStartPromise).toBeNull();
  });

  it('stopMicrophone releases the source, tracks and analyser', async () => {
    await shared.stopMicrophone();
    const track = { stop: vi.fn() };
    (navigator as any).mediaDevices.getUserMedia.mockResolvedValue({ getTracks: () => [track] });
    await shared.startMicrophone();
    const src = shared.micSource;
    const an = shared.micAnalyser;
    shared.stopMicrophone();
    expect(src.disconnect).toHaveBeenCalled();
    expect(an.disconnect).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
    expect(shared.micStream).toBeNull();
    expect(shared.micAnalyser).toBeNull();
  });

  it('getAnalyserData returns empty when idle and frequency data when active', async () => {
    shared.stopMicrophone();
    expect(shared.getAnalyserData().length).toBe(0);
    (navigator as any).mediaDevices.getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });
    await shared.startMicrophone();
    const data = shared.getAnalyserData();
    expect(data.length).toBe(1024);
    expect(shared.micAnalyser.getByteFrequencyData).toHaveBeenCalled();
    await shared.stopMicrophone();
  });

  it('getModuleAnalyser lazily creates gain+analyser pairs and refreshes fftSize', () => {
    const a = shared.getModuleAnalyser('mod1', 512);
    expect(a.fftSize).toBe(512);
    expect(shared.moduleNodes.has('mod1')).toBe(true);
    expect(shared.getModuleAnalyser('mod1', 256).fftSize).toBe(256);
    expect(shared.getModuleAnalyser('mod1', 256).fftSize).toBe(256);
  });

  it('getModuleAnalyser returns null when the base context is missing', () => {
    const base = shared.base;
    const orig = base.getContext;
    base.getContext = () => null;
    try {
      expect(shared.getModuleAnalyser('missing-ctx')).toBeNull();
    } finally {
      base.getContext = orig;
    }
  });

  it('getModuleGainNode routes the audible path into the master rack', () => {
    shared.disposeModule('gain1');
    const g = shared.getModuleGainNode('gain1');
    expect(g).toBeTruthy();
    expect(shared.moduleNodes.get('gain1').routedToMaster).toBe(true);
  });

  it('getModuleGainNode falls back to the destination when no rack input exists', () => {
    const base = shared.base;
    const orig = base.getMasterRackInput;
    base.getMasterRackInput = () => null;
    try {
      shared.disposeModule('gain2');
      const g = shared.getModuleGainNode('gain2');
      expect(g).toBeTruthy();
      expect(shared.moduleNodes.get('gain2').routedToMaster).toBe(true);
    } finally {
      base.getMasterRackInput = orig;
    }
  });

  it('getModuleGainNode returns null when the base context is missing', () => {
    const base = shared.base;
    const orig = base.getContext;
    base.getContext = () => null;
    try {
      expect(shared.getModuleGainNode('gain3')).toBeNull();
    } finally {
      base.getContext = orig;
    }
  });

  it('disposeModule disconnects and removes entries', () => {
    shared.getModuleAnalyser('dispose1');
    const entry = shared.moduleNodes.get('dispose1');
    shared.disposeModule('dispose1');
    expect(shared.moduleNodes.has('dispose1')).toBe(false);
    expect(entry.gain.disconnect).toHaveBeenCalled();
    expect(entry.analyser.disconnect).toHaveBeenCalled();
  });

  it('getModuleGainReduction returns the default and derived values', () => {
    expect(shared.getModuleGainReduction('missing')).toBe(-2.5);
    shared.getModuleAnalyser('gr');
    shared.moduleNodes.get('gr').gain.gain.value = dbToGain(-4);
    expect(shared.getModuleGainReduction('gr')).toBeCloseTo(-4);
  });

  it('setModuleGainReduction sanitises, clamps and applies dB', () => {
    shared.setModuleGainReduction('gr2', NaN);
    shared.setModuleGainReduction('gr2', -30);
    const entry = shared.moduleNodes.get('gr2');
    expect(entry.gain.gain.setTargetAtTime).toHaveBeenCalledWith(dbToGain(-30), 1, 0.01);
    shared.setModuleGainReduction('gr2', 200); // clamped to 12 dB
    expect(entry.gain.gain.setTargetAtTime).toHaveBeenCalledWith(dbToGain(12), 1, 0.01);
    shared.setModuleGainReduction('gr2', -200); // clamped to -100 dB
    expect(entry.gain.gain.setTargetAtTime).toHaveBeenCalledWith(dbToGain(-100), 1, 0.01);
  });

  it('gain helpers round-trip', () => {
    expect(dbToGain(-6)).toBeCloseTo(0.501, 2);
    expect(gainToDb(0.5)).toBeCloseTo(-6.02, 1);
  });
});
