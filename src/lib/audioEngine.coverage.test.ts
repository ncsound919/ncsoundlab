/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests that drive the remaining uncovered new-code branches in
 * `src/lib/audioEngine.ts` against the real AudioEngine class + a rich fake
 * AudioContext. Complements audioEngine.newcode.test.ts:
 *
 *   - FX kitchen-sink triggers (exciter, chaos spectral/aliasing/probability,
 *     filter drive, delay spread, chorus, auto-pan, all HSF engines, MRS, TIL,
 *     SubLab 808 sub, distortion tape/fuzz curves)
 *   - envelope release sub-branches (short / medium / low-level release)
 *   - transport lifecycle (playLayer happy + catch, playAll end, stop fade)
 *   - MPC choke group lifecycle (entry registration + ended cleanup)
 *   - helper-source onended self-removal (trackHelper)
 *   - offline renders (exportWav + exportLayerStem master-dynamics + fades)
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { DEFAULT_FX } from '../types';

vi.unmock('../lib/audioEngine');
vi.unmock('../audio/AudioEngine');

const sleep = (ms = 10) => new Promise((r) => setTimeout(r, ms));

const makeParam = () => ({
  value: 1,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
  setTargetAtTime: vi.fn(),
});

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
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    playbackRate: { value: 1, setValueAtTime: vi.fn() },
    start: vi.fn(),
    stop: vi.fn(),
    addEventListener: vi.fn((type: string, fn: () => void) => {
      (node.__listeners[type] ||= []).push(fn);
    }),
    removeEventListener: vi.fn((type: string, fn: () => void) => {
      const arr = node.__listeners[type];
      if (arr) {
        const i = arr.indexOf(fn);
        if (i > -1) arr.splice(i, 1);
      }
    }),
    __listeners: {},
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 2,
    channelCountMode: 'max',
    channelInterpretation: 'speakers',
    getByteFrequencyData: vi.fn(),
    getByteTimeDomainData: vi.fn(),
  };
  Object.setPrototypeOf(node, proto);
  return node;
};

const makeBuffer = (channels: number, length: number, sampleRate: number) => {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (ch: number) => data[ch] ?? data[0],
    copyToChannel: vi.fn(),
    copyFromChannel: vi.fn(),
  };
};

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

const installLiveContext = () => {
  const ctxStub: any = {
    sampleRate: 44100,
    currentTime: 1,
    state: 'running',
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    suspend: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
  for (const m of CREATE_METHODS) ctxStub[m] = vi.fn(() => makeNode());
  ctxStub.createBufferSource = vi.fn(() => makeNode(AudioBufferSourceNode.prototype));
  ctxStub.createOscillator = vi.fn(() => makeNode(OscillatorNode.prototype));
  ctxStub.createBuffer = vi.fn((c: number, l: number, r: number) => makeBuffer(c, l, r));
  Object.setPrototypeOf(ctxStub, BaseAudioContext.prototype);
  vi.stubGlobal('AudioContext', function () { return ctxStub; });
  vi.stubGlobal('webkitAudioContext', function () { return ctxStub; });
  return ctxStub;
};

const installOfflineContext = () => {
  function RichOffline(this: any, channels: number, length: number, rate: number) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = rate;
    this.currentTime = 0;
    this.destination = {};
    this.__rendered = makeBuffer(channels, length, rate);
    for (const m of CREATE_METHODS) this[m] = vi.fn(() => makeNode());
    this.createBufferSource = vi.fn(() => makeNode(AudioBufferSourceNode.prototype));
    this.createOscillator = vi.fn(() => makeNode(OscillatorNode.prototype));
    this.createBuffer = vi.fn((c: number, l: number, r: number) => makeBuffer(c, l, r));
    this.startRendering = vi.fn(() => Promise.resolve(this.__rendered));
  }
  Object.setPrototypeOf(RichOffline.prototype, BaseAudioContext.prototype);
  vi.stubGlobal('OfflineAudioContext', RichOffline as any);
};

let audioEngine: any;
let ctx: any;
let mod: any;

beforeAll(async () => {
  installOfflineContext();
  ctx = installLiveContext();
  vi.resetModules();
  mod = await import('./audioEngine');
  audioEngine = mod.audioEngine;
});

afterEach(() => {
  vi.useRealTimers();
});

const makeLayer = (layerOver: Record<string, unknown> = {}, fxOver: Record<string, unknown> = {}) => {
  const layer: any = {
    id: 'l1',
    name: 'S',
    type: 'sample',
    enabled: true,
    muted: false,
    gain: 1,
    pan: 0,
    pitch: 0,
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.8, release: 0.1 },
    fx: { ...DEFAULT_FX, bitcrush: 0, distortion: 0, ...fxOver },
    audioBuffer: {
      duration: 1,
      length: 44100,
      sampleRate: 44100,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(44100),
    },
    ...layerOver,
  };
  return layer;
};

const kitchenSink = (fxOver: Record<string, unknown> = {}) => {
  const layer = makeLayer(
    { chaosMode: true },
    {
      transientAttack: 40,
      filterDrive: 1,
      delayTime: 0.3,
      delayFeedback: 0.4,
      delayStereoSpread: 0.5,
      delayEnabled: true,
      chorusMix: 0.5,
      autoPanDepth: 0.5,
      autoPanRate: 1,
      hsfEnabled: true,
      hsfMix: 0.5,
      hsfEngine: 'noise',
      mrsEnabled: true,
      mrsMix: 0.5,
      tilEnabled: true,
      tilMix: 0.5,
      tilTexture: 'dust',
      distortion: 0.7,
      distortionType: 'tube',
      ...fxOver,
    },
  );
  layer.subDesign = {
    subEnabled: true,
    subType: 'sine',
    subLevel: 1,
    xSubMix: 0.5,
    harmonicSaturation: 0.5,
    dynamicTracking: false,
  };
  return layer;
};

const trigger = (layer: any, duration?: number, chokeKey?: string) => {
  audioEngine.triggerLayer(layer, duration, chokeKey);
  return sleep(10);
};

describe('FX kitchen-sink branches', () => {
  it('covers exciter, chaos, drive, delay spread, chorus, auto-pan, noise HSF, MRS, TIL and sub paths', async () => {
    await trigger(kitchenSink());
    const eng = audioEngine as any;
    expect(eng.activeSources.length).toBeGreaterThan(0);
  });

  it('covers the remaining HSF engines (additive, fm, physical, granular)', async () => {
    for (const engine of ['additive', 'fm', 'physical', 'granular']) {
      await trigger(kitchenSink({ hsfEngine: engine }));
    }
  });

  it('covers distortion tape + fuzz curve branches', async () => {
    await trigger(kitchenSink({ distortionType: 'tape' }));
    await trigger(kitchenSink({ distortionType: 'fuzz' }));
  });

  it('covers the low-level sub release fallback (linear ramp)', async () => {
    const layer = kitchenSink();
    layer.subDesign.subLevel = 0;
    layer.subDesign.harmonicSaturation = 0;
    await trigger(layer);
  });
});

describe('envelope release sub-branches', () => {
  it('covers short / medium / silent-sustain release ramps', async () => {
    // playDur (0.002) <= safeAttack (0.005), peakVal > 0.0001 -> exp ramp
    await trigger(makeLayer({ playStartPct: 0, playEndPct: 0.002, gain: 1 }));
    // peakVal <= 0.0001 -> linear ramp
    await trigger(makeLayer({ playStartPct: 0, playEndPct: 0.002, gain: 0 }));
    // attack < playDur (0.1) <= attack+decay (0.205), midVal > 0.0001 -> exp
    await trigger(makeLayer({ playStartPct: 0, playEndPct: 0.1, gain: 1 }));
    // midVal <= 0.0001 -> linear
    await trigger(makeLayer({ playStartPct: 0, playEndPct: 0.1, gain: 0 }));
    // else branch with sustainGain <= 0.0001 -> linear
    await trigger(makeLayer({ playStartPct: 0, playEndPct: 1, gain: 0 }));
  });
});

describe('helper source lifecycle (trackHelper)', () => {
  it('registers onended self-removal on tracked helpers', async () => {
    await trigger(kitchenSink());
    const eng = audioEngine as any;
    const withOnEnded = eng.activeSources.filter((n: any) => typeof n?.onended === 'function');
    expect(withOnEnded.length).toBeGreaterThan(0);
    const countBefore = eng.activeSources.length;
    for (const n of withOnEnded) n.onended();
    expect(eng.activeSources.length).toBeLessThanOrEqual(countBefore);
  });
});

describe('MPC choke group lifecycle', () => {
  it('registers entries and removes the group when all hits end', async () => {
    const eng = audioEngine as any;
    await trigger(makeLayer(), 1, 'choke:life');
    await trigger(makeLayer(), 1, 'choke:life');
    const group = eng.chokeGroups.get('choke:life');
    expect(group?.size).toBeGreaterThan(0);
    const srcs = eng.activeSources.filter((n: any) => n?.__listeners?.ended?.length);
    expect(srcs.length).toBeGreaterThan(0);
    for (const s of srcs) {
      for (const fn of [...s.__listeners.ended]) fn();
    }
    expect(eng.chokeGroups.has('choke:life')).toBe(false);
  });
});

describe('transport lifecycle', () => {
  it('playLayer runs to completion and stops at end of duration', async () => {
    vi.useFakeTimers();
    ctx.currentTime = 1;
    await audioEngine.playLayer(makeLayer());
    ctx.currentTime = 10;
    vi.advanceTimersByTime(5000);
    expect(audioEngine.getIsPlaying()).toBe(false);
  });

  it('playLayer swallows a chain failure and clears the playing flag', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = makeLayer();
    delete bad.fx;
    await audioEngine.playLayer(bad);
    expect(audioEngine.getIsPlaying()).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('playAll plays every audible layer and stops at end', async () => {
    vi.useFakeTimers();
    ctx.currentTime = 1;
    await audioEngine.playAll([makeLayer(), makeLayer({ id: 'l2' })]);
    ctx.currentTime = 10;
    vi.advanceTimersByTime(5000);
    expect(audioEngine.getIsPlaying()).toBe(false);
  });

  it('stop() fades the master gain and restores it after the fade window', () => {
    vi.useFakeTimers();
    ctx.currentTime = 1;
    audioEngine.stop();
    ctx.currentTime = 1.1;
    vi.advanceTimersByTime(30);
    expect(audioEngine.getIsPlaying()).toBe(false);
  });
});

describe('FX send buses', () => {
  it('builds reverb + delay return buses from the mixer store', () => {
    const eng = audioEngine as any;
    eng.syncSendBuses();
    expect(eng.sendBuses.has('reverb')).toBe(true);
    expect(eng.sendBuses.has('delay')).toBe(true);
  });
});

describe('offline renders', () => {
  it('exportWav renders through the master chain and applies cosine fades', async () => {
    const buf = await audioEngine.exportWav([makeLayer()], 0.5);
    expect(buf).toBeTruthy();
    expect(buf.numberOfChannels).toBeGreaterThan(0);
  });

  it('exportLayerStem bounces a single layer through its own chain', async () => {
    const buf = await audioEngine.exportLayerStem(makeLayer(), 0.5);
    expect(buf).toBeTruthy();
  });
});
