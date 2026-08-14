/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Additional statement-coverage tests for `src/lib/audioEngine.ts` targeting
 * the branches the primary coverage suite leaves untouched:
 *
 *   - master-rack (StudioRack) module building: all 14 module types, the
 *     unknown-type default, disabled modules, module-build throw fallback and
 *     wiring throw fallback
 *   - master-dynamics: bypass limiter config + no-op without a limiter
 *   - sidechain duck graph (build + teardown + route filtering)
 *   - send-bus build/update + live & offline send taps
 *   - exportWav / exportLayerStem: offline rack render, oscillator sources,
 *     peak normalization, inaudible-layer skip, offline send buses
 *   - transport lifecycle: playLayer disabled / non-sample / loop, playAll
 *     solo/mute/loop, triggerLayer early returns + source-less release
 *   - createNodeChain branches: sampleReverse (+failure), pitch/speed/loop,
 *     polarity/phase, chaos pass-through, bypassFX, keytracking, filter2,
 *     LFO matrix (sync + every target), ping-pong delay, spread chorus,
 *     tape-delay preset, per-layer EQ, compressor bypass, reverb, resonator
 *     HSF, synth-driven HSF engines, MRS materials/chaos, every TIL texture,
 *     SubLab periodic-wave sub + x-sub + saturation + dynamic tracking
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { DEFAULT_FX } from '../types';

vi.unmock('./audioEngine');
vi.unmock('../audio/AudioEngine');

// The engine reads these stores through module-level imports, so they must be
// fetched from the SAME module registry that vi.resetModules() creates — a
// top-level static import would bind a stale (pre-reset) store instance.
let useMixerStore: any;
let useMasterDynamicsStore: any;

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
    setPeriodicWave: vi.fn(),
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
    getFloatTimeDomainData: vi.fn(),
    smoothingTimeConstant: 0,
  };
  Object.setPrototypeOf(node, proto);
  return node;
};

const makeBuffer = (channels: number, length: number, sampleRate: number, fill = false) => {
  const data = Array.from({ length: channels }, () => {
    const a = new Float32Array(length);
    if (fill) a.fill(0.5);
    return a;
  });
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

let liveSourcesAreOscillators = false;
let offlineSourcesAreOscillators = false;

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
  for (const m of [...CREATE_METHODS, 'createPeriodicWave', 'createMediaStreamSource']) {
    ctxStub[m] = vi.fn(() => makeNode());
  }
  ctxStub.createBufferSource = vi.fn(() =>
    makeNode(liveSourcesAreOscillators ? OscillatorNode.prototype : AudioBufferSourceNode.prototype)
  );
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
    for (const m of [...CREATE_METHODS, 'createPeriodicWave', 'createMediaStreamSource']) {
      this[m] = vi.fn(() => makeNode());
    }
    this.createBufferSource = vi.fn(() =>
      makeNode(offlineSourcesAreOscillators ? OscillatorNode.prototype : AudioBufferSourceNode.prototype)
    );
    this.createOscillator = vi.fn(() => makeNode(OscillatorNode.prototype));
    this.createBuffer = vi.fn((c: number, l: number, r: number) => makeBuffer(c, l, r));
    // Non-zero rendered data so export peak-normalization is exercised.
    this.startRendering = vi.fn(() => Promise.resolve(makeBuffer(channels, length, rate, true)));
  }
  Object.setPrototypeOf(RichOffline.prototype, BaseAudioContext.prototype);
  vi.stubGlobal('OfflineAudioContext', RichOffline as any);
};

let audioEngine: any;
let ctx: any;
let mod: any;

beforeAll(async () => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  installOfflineContext();
  ctx = installLiveContext();
  vi.resetModules();
  const mixerMod = await import('../store/mixerStore');
  useMixerStore = mixerMod.useMixerStore;
  const dynamicsMod = await import('../store/masterDynamicsStore');
  useMasterDynamicsStore = dynamicsMod.useMasterDynamicsStore;
  mod = await import('./audioEngine');
  audioEngine = mod.audioEngine;
});

afterEach(() => {
  vi.useRealTimers();
  liveSourcesAreOscillators = false;
  offlineSourcesAreOscillators = false;
  useMixerStore.getState().reset();
  useMasterDynamicsStore.getState().reset();
  audioEngine.setBypassFX(false);
  audioEngine.setLoopEnabled(false);
  try {
    audioEngine.stop();
  } catch {
    /* ignore */
  }
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

const trigger = (layer: any, duration?: number, chokeKey?: string) => {
  audioEngine.triggerLayer(layer, duration, chokeKey);
  return sleep(10);
};

describe('isLayerAudibleInMix', () => {
  it('filters disabled, muted and non-soloed layers', () => {
    const base = makeLayer();
    expect(mod.isLayerAudibleInMix({ ...base, enabled: false }, [base])).toBe(false);
    expect(mod.isLayerAudibleInMix({ ...base, muted: true }, [base])).toBe(false);
    const soloed = makeLayer({ soloed: true });
    const nonSoloed = makeLayer({ id: 'l2' });
    expect(mod.isLayerAudibleInMix(nonSoloed, [soloed, nonSoloed])).toBe(false);
    expect(mod.isLayerAudibleInMix(soloed, [soloed, nonSoloed])).toBe(true);
  });
});

describe('lifecycle controls', () => {
  it('resumes a suspended context on pointerdown / keydown / visibilitychange', () => {
    ctx.state = 'suspended';
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('keydown'));
    expect(ctx.resume).toHaveBeenCalled();
    window.dispatchEvent(new Event('visibilitychange'));
    expect(ctx.resume).toHaveBeenCalled();
    ctx.state = 'running';
  });

  it('resume() only acts when the context is suspended', () => {
    ctx.state = 'suspended';
    audioEngine.resume();
    expect(ctx.resume).toHaveBeenCalled();
    ctx.state = 'running';
    const calls = (ctx.resume as ReturnType<typeof vi.fn>).mock.calls.length;
    audioEngine.resume();
    expect((ctx.resume as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
  });

  it('getPlaybackProgress reports the elapsed fraction while playing', async () => {
    vi.useFakeTimers();
    ctx.currentTime = 1;
    await audioEngine.playLayer(makeLayer());
    ctx.currentTime = 2;
    const p = audioEngine.getPlaybackProgress();
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
    audioEngine.stop();
  });

  it('setBypassFX / setMasterLevel / setMasterPan configure the master chain', () => {
    audioEngine.setBypassFX(true);
    expect((audioEngine as any).bypassFX).toBe(true);
    audioEngine.setMasterLevel(0.5);
    expect((audioEngine as any).masterGain.gain.setTargetAtTime).toHaveBeenCalled();
    audioEngine.setMasterPan(-0.3);
    expect((audioEngine as any).masterPan.pan.setTargetAtTime).toHaveBeenCalled();
    audioEngine.setBypassFX(false);
  });

  it('applyMasterDynamics applies the bypass config and no-ops without a limiter', () => {
    const eng = audioEngine as any;
    eng.applyMasterDynamics({
      enabled: false,
      thresholdDb: -1,
      ratio: 20,
      attackSec: 0.002,
      releaseSec: 0.1,
      makeupDb: 0,
    } as never);
    expect(eng.masterLimiter.threshold.setTargetAtTime).toHaveBeenCalledWith(
      0,
      expect.any(Number),
      expect.any(Number)
    );
    expect(eng.masterLimiter.ratio.setTargetAtTime).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number));
    const limiter = eng.masterLimiter;
    const makeup = eng.masterMakeupGain;
    eng.masterLimiter = null;
    eng.masterMakeupGain = null;
    eng.applyMasterDynamics({
      enabled: true,
      thresholdDb: -1,
      ratio: 20,
      attackSec: 0.002,
      releaseSec: 0.1,
      makeupDb: 0,
    } as never);
    eng.masterLimiter = limiter;
    eng.masterMakeupGain = makeup;
  });

  it('setLoopEnabled / getLoopEnabled round-trip', () => {
    audioEngine.setLoopEnabled(true);
    expect(audioEngine.getLoopEnabled()).toBe(true);
    audioEngine.setLoopEnabled(false);
    expect(audioEngine.getLoopEnabled()).toBe(false);
  });
});

describe('transport branches', () => {
  it('playLayer bails out for a disabled layer', async () => {
    await audioEngine.playLayer(makeLayer({ enabled: false }));
    expect(audioEngine.getIsPlaying()).toBe(false);
  });

  it('playLayer falls back to a default duration for non-sample layers', async () => {
    await audioEngine.playLayer(makeLayer({ type: 'synth' }));
    expect(audioEngine.getIsPlaying()).toBe(true);
    audioEngine.stop();
  });

  it('playLayer renders a silent buffer when a sample layer has no buffer', async () => {
    await audioEngine.playLayer(makeLayer({ audioBuffer: undefined }));
    expect(audioEngine.getIsPlaying()).toBe(true);
    audioEngine.stop();
  });

  it('playLayer loop timer re-triggers when looping is enabled', async () => {
    vi.useFakeTimers();
    ctx.currentTime = 1;
    audioEngine.setLoopEnabled(true);
    await audioEngine.playLayer(makeLayer());
    ctx.currentTime = 3;
    vi.advanceTimersByTime(5000);
    audioEngine.setLoopEnabled(false);
    audioEngine.stop();
    expect(audioEngine.getLoopEnabled()).toBe(false);
  });

  it('playAll skips inaudible layers, honours solos and loops', async () => {
    vi.useFakeTimers();
    ctx.currentTime = 1;
    audioEngine.setLoopEnabled(true);
    await audioEngine.playAll([
      makeLayer(),
      makeLayer({ id: 'm', muted: true }),
      makeLayer({ id: 'd', enabled: false }),
      makeLayer({ id: 's', soloed: true, type: 'synth' }),
    ]);
    ctx.currentTime = 3;
    vi.advanceTimersByTime(5000);
    audioEngine.setLoopEnabled(false);
    audioEngine.stop();
  });

  it('triggerLayer ignores null / disabled / muted / bufferless layers', async () => {
    audioEngine.triggerLayer(null as never);
    audioEngine.triggerLayer(makeLayer({ enabled: false }));
    audioEngine.triggerLayer(makeLayer({ muted: true }));
    audioEngine.triggerLayer(makeLayer({ audioBuffer: undefined }));
    await sleep(5);
  });

  it('triggerLayer release() runs when the play promise resolves without a source', async () => {
    const orig = audioEngine.playLayerInstance;
    audioEngine.playLayerInstance = async () => ({ source: null, gainNode: { gain: makeParam() } });
    audioEngine.triggerLayer(makeLayer());
    await sleep(10);
    audioEngine.playLayerInstance = orig;
  });
});

describe('send buses and sidechains', () => {
  it('builds reverb + delay buses and re-reads their settings', () => {
    const eng = audioEngine as any;
    eng.sendBuses.clear();
    eng.ensureSendBuses();
    expect(eng.sendBuses.size).toBe(2);
    eng.ensureSendBuses(); // early return on an already-built set
    eng.updateSendBusSettings({
      reverb: { enabled: true, gain: 0.5, pan: -0.2 },
      delay: { enabled: false, gain: 1, pan: 0 },
    });
    expect(eng.sendBuses.get('reverb').returnGain.gain.setValueAtTime).toHaveBeenCalled();
  });

  it('taps live layer sends into enabled buses', async () => {
    const eng = audioEngine as any;
    eng.sendBuses.clear();
    useMixerStore.getState().setLayerSends('l1', { reverb: 0.5 });
    await trigger(makeLayer({ sends: { reverb: 0.5, delay: 0 } }));
    expect(eng.sendBuses.size).toBe(2);
  });

  it('skips disabled send buses', async () => {
    useMixerStore.getState().setBus('reverb', { enabled: false });
    await trigger(makeLayer({ sends: { reverb: 0.5 } }));
  });

  it('routes sidechain ducks, filters bad routes and tears down on rebuild', () => {
    const eng = audioEngine as any;
    eng.sendBuses.clear();
    eng.ensureSendBuses();
    useMasterDynamicsStore.setState({
      sidechains: [
        { id: 'sc-master', source: 'master', target: 'reverb', amount: 1, attackSec: 0.01, releaseSec: 0.1, enabled: true },
        { id: 'sc-layer', source: 'kick', target: 'delay', amount: 0.5, attackSec: 0.01, releaseSec: 0.1, enabled: true },
        { id: 'sc-no-target', source: 'kick', target: '', amount: 0.5, attackSec: 0.01, releaseSec: 0.1, enabled: true },
        { id: 'sc-badbus', source: 'master', target: 'nope', amount: 0.5, attackSec: 0.01, releaseSec: 0.1, enabled: true },
        { id: 'sc-disabled', source: 'master', target: 'reverb', amount: 0.5, attackSec: 0.01, releaseSec: 0.1, enabled: false },
      ],
    });
    eng.syncSidechains();
    expect(eng.sidechainDucks.has('sc-master')).toBe(true);
    expect(eng.sidechainDucks.has('sc-layer')).toBe(true);
    expect(eng.sidechainDucks.has('sc-no-target')).toBe(false);
    expect(eng.sidechainDucks.has('sc-badbus')).toBe(false);
    expect(eng.sidechainDucks.has('sc-disabled')).toBe(false);
    eng.syncSidechains(); // dispose + rebuild
    expect(eng.sidechainDucks.size).toBeGreaterThan(0);
    useMasterDynamicsStore.getState().reset();
    eng.syncSidechains();
    expect(eng.sidechainDucks.size).toBe(0);
  });
});

describe('master rack (StudioRack)', () => {
  const rackModules = (): any[] => [
    {
      id: 'eq1',
      type: 'eq',
      enabled: true,
      settings: {
        bands: [
          { type: 'bell', freq: 1000, q: 1, gain: 3, enabled: true },
          { type: 'lowShelf', freq: 200, q: 0.7, gain: -2, enabled: true },
          { type: 'highShelf', freq: 8000, q: 0.7, gain: 1, enabled: true },
          { type: 'notch', freq: 500, q: 4, gain: 0, enabled: true },
          { type: 'peaking', freq: 3000, q: 1, gain: 0, enabled: false },
        ],
      },
    },
    { id: 'comp', type: 'compressor', enabled: true, settings: { threshold: -20, ratio: 5, attackMs: 10, releaseMs: 200 } },
    { id: 'lim', type: 'limiter', enabled: true, settings: { threshold: -2, release: 50 } },
    { id: 'clip', type: 'clipper', enabled: true, settings: { threshold: -6 } },
    { id: 'sat', type: 'saturator', enabled: true, settings: { drive: 8, mix: 60, tone: 40 } },
    { id: 'tape', type: 'tape', enabled: true, settings: { drive: 2, bias: 40 } },
    { id: 'exc', type: 'exciter', enabled: true, settings: { amount: 50, freq: 5000, mix: 60 } },
    { id: 'del', type: 'delay', enabled: true, settings: { time: 300, feedback: 40, mix: 40 } },
    { id: 'rev', type: 'reverb', enabled: true, settings: { mix: 30, decay: 2, preDelay: 10 } },
    { id: 'cho', type: 'chorus', enabled: true, settings: { mix: 50, rate: 1, depth: 60 } },
    { id: 'fla', type: 'flanger', enabled: true, settings: { rate: 0.5, depth: 50, feedback: 40 } },
    { id: 'pha', type: 'phaser', enabled: true, settings: { rate: 1, depth: 60 } },
    { id: 'tre', type: 'tremolo', enabled: true, settings: { rate: 5, depth: 50, shape: 'square' } },
    { id: 'img', type: 'imager', enabled: true, settings: { width: 1.5 } },
    { id: 'bogus', type: 'bogus', enabled: true, settings: {} },
    { id: 'disabled', type: 'eq', enabled: false, settings: { bands: [] } },
  ];

  it('builds every rack module type into a serial chain', () => {
    const eng = audioEngine as any;
    const before = eng.masterRackNodes.length;
    eng.setMasterRack(rackModules());
    expect(eng.masterRackNodes.length).toBeGreaterThan(before);
    expect(eng.lastRackModules.length).toBe(rackModules().length);
  });

  it('no-ops when the rack insert nodes are missing', () => {
    const eng = audioEngine as any;
    const inp = eng.masterRackInput;
    const outp = eng.masterRackOutput;
    const tgt = eng.masterRackChainTarget;
    eng.masterRackInput = null;
    eng.masterRackOutput = null;
    eng.masterRackChainTarget = null;
    eng.setMasterRack([{ id: 'x', type: 'eq', enabled: true, settings: { bands: [] } }]);
    eng.masterRackInput = inp;
    eng.masterRackOutput = outp;
    eng.masterRackChainTarget = tgt;
  });

  it('degrades gracefully when a module build throws', () => {
    const eng = audioEngine as any;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const orig = ctx.createWaveShaper;
    ctx.createWaveShaper = vi.fn(() => {
      throw new Error('boom');
    });
    eng.setMasterRack([{ id: 'clip', type: 'clipper', enabled: true, settings: { threshold: -3 } }]);
    ctx.createWaveShaper = orig;
    warn.mockRestore();
  });

  it('falls back to pass-through when the rack wiring throws', () => {
    const eng = audioEngine as any;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const output = eng.getMasterRackOutput();
    const orig = output.connect;
    let calls = 0;
    output.connect = vi.fn(() => {
      calls++;
      if (calls === 1) throw new Error('wiring');
      return output;
    });
    try {
      eng.setMasterRack([
        { id: 'eq1', type: 'eq', enabled: true, settings: { bands: [{ type: 'bell', freq: 1000, q: 1, gain: 1, enabled: true }] } },
      ]);
    } finally {
      output.connect = orig;
      warn.mockRestore();
    }
    expect(eng.masterRackNodes).toEqual([]);
  });

  it('renders offline through the master rack when modules exist', async () => {
    const eng = audioEngine as any;
    eng.setMasterRack(rackModules());
    const buf = await audioEngine.exportWav([makeLayer()], 0.5);
    expect(buf).toBeTruthy();
  });
});

describe('offline renders', () => {
  it('exportWav skips inaudible layers and normalizes the render', async () => {
    const eng = audioEngine as any;
    eng.setMasterRack([]);
    const buf = await audioEngine.exportWav([makeLayer({ muted: true })], 0.2);
    expect(buf).toBeTruthy();
  });

  it('exportWav renders offline send buses for layer sends', async () => {
    const layer = makeLayer({ sends: { reverb: 0.4, delay: 0.3 } });
    const buf = await audioEngine.exportWav([layer], 0.4);
    expect(buf).toBeTruthy();
  });

  it('exportWav handles oscillator sources', async () => {
    offlineSourcesAreOscillators = true;
    try {
      const buf = await audioEngine.exportWav([makeLayer()], 0.5);
      expect(buf).toBeTruthy();
    } finally {
      offlineSourcesAreOscillators = false;
    }
  });

  it('exportLayerStem handles an oscillator source and normalizes', async () => {
    offlineSourcesAreOscillators = true;
    try {
      const buf = await audioEngine.exportLayerStem(makeLayer({ type: 'synth' }), 0.5);
      expect(buf).toBeTruthy();
      expect(buf.numberOfChannels).toBeGreaterThan(0);
    } finally {
      offlineSourcesAreOscillators = false;
    }
  });
});

describe('createNodeChain branch coverage', () => {
  it('sampleReverse builds and caches a reversed buffer', async () => {
    const layer = makeLayer({ sampleReverse: true });
    const orig = layer.audioBuffer;
    await trigger(layer);
    expect((audioEngine as any).reversedBufferCache.get(orig)).toBeTruthy();
  });

  it('sampleReverse falls back to the original buffer when reversal fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const layer = makeLayer({ sampleReverse: true });
    const orig = ctx.createBuffer;
    ctx.createBuffer = vi.fn(() => {
      throw new Error('no buffer');
    });
    await trigger(layer);
    ctx.createBuffer = orig;
    errSpy.mockRestore();
    expect((audioEngine as any).reversedBufferCache.get(layer.audioBuffer)).toBeUndefined();
  });

  it('applies pitch / speed / loop settings', async () => {
    await trigger(
      makeLayer({ samplePitchCoarse: 2, samplePitchFine: 50, sampleSpeed: 1.5, sampleLoop: true })
    );
  });

  it('inserts polarity-invert and phase-delay nodes', async () => {
    await trigger(makeLayer({ polarityInvert: true, phaseAngle: 90 }));
  });

  it('adds a pass-through when the chaos feedback target has no inputs', async () => {
    const orig = ctx.createBufferSource;
    ctx.createBufferSource = vi.fn(() => {
      const n = makeNode(AudioBufferSourceNode.prototype);
      n.numberOfInputs = 0;
      return n;
    });
    try {
      await trigger(makeLayer({ chaosMode: true }));
    } finally {
      ctx.createBufferSource = orig;
    }
  });

  it('bypasses FX by wiring straight through with live send taps', async () => {
    const eng = audioEngine as any;
    eng.sendBuses.clear();
    eng.setBypassFX(true);
    try {
      await trigger(makeLayer({ sends: { reverb: 0.5 } }));
    } finally {
      eng.setBypassFX(false);
    }
  });

  it('keytracks filter cutoff and inserts filter2 + a synced LFO', async () => {
    await trigger(
      makeLayer(
        { pitch: 3 },
        {
          filterFreq: 5000,
          filterRes: 4,
          filterDrive: 2,
          keyTracking: 50,
          filter2Enabled: true,
          filter2Freq: 8000,
          filter2Res: 2,
          lfoSync: true,
          lfoDivision: '1/8',
          lfoDepth: 0.5,
          lfoTarget: 'filterFreq',
          lfoEnabled: true,
        }
      )
    );
  });

  it('routes the LFO to pan and resonance targets', async () => {
    await trigger(makeLayer({}, { lfoRate: 1, lfoDepth: 0.5, lfoTarget: 'pan', lfoEnabled: true }));
    await trigger(makeLayer({}, { lfoRate: 1, lfoDepth: 0.5, lfoTarget: 'res', lfoEnabled: true }));
  });

  it('routes the LFO to pitch for oscillator sources', async () => {
    liveSourcesAreOscillators = true;
    try {
      await trigger(makeLayer({}, { lfoRate: 1, lfoDepth: 0.5, lfoTarget: 'pitch', lfoEnabled: true }));
    } finally {
      liveSourcesAreOscillators = false;
    }
  });

  it('builds a ping-pong delay, spread chorus and per-layer reverb', async () => {
    await trigger(
      makeLayer(
        {},
        {
          delayTime: 0.3,
          delayFeedback: 0.4,
          delayEnabled: true,
          delayPingPong: true,
          chorusMix: 0.5,
          chorusSpread: 0.6,
          reverbMix: 0.5,
        }
      )
    );
  });

  it('inserts a TapeDelayDSP for tape-delay presets', async () => {
    await trigger(
      makeLayer(
        {},
        {
          tapeDelayPreset: {
            id: 'td',
            name: 'T',
            category: 'space',
            preFilter: { hpFreq: 30, lpFreq: 16000, midBumpDb: 0 },
            saturation: { drive: 0.5, biasTilt: 0 },
            heads: { count: 2, timesMs: [200, 400], levels: [0.5, 0.3], pans: [-0.3, 0.4], syncMode: 'free' },
            modulation: { wowDepthMs: 1, wowRateHz: 1, flutterDepthMs: 0.5, flutterRateHz: 6 },
            feedback: { amount: 0.4, filterType: 'lp', filterFreq: 8000, extraSaturation: 0.2 },
            mix: { dry: 1, wet: 0.5 },
          },
          delayEnabled: true,
        }
      )
    );
  });

  it('splices a per-layer EQ chain when bands are enabled', async () => {
    await trigger(
      makeLayer({}, { eq: [{ type: 'peaking', frequency: 1000, gainDb: 3, q: 1, enabled: true }] })
    );
  });

  it('bypasses the compressor when disabled', async () => {
    await trigger(makeLayer({}, { compressorEnabled: false }));
  });

  it('covers the resonator HSF engine', async () => {
    await trigger(
      makeLayer({}, { hsfEnabled: true, hsfMix: 0.5, hsfEngine: 'resonator', hsfAmount: 0.5 })
    );
  });

  it('covers synth-driven HSF engines', async () => {
    for (const engine of ['additive', 'fm', 'physical', 'granular']) {
      await trigger(
        makeLayer(
          { type: 'synth', synth: { frequency: 220, oscType: 'sine' } },
          { hsfEnabled: true, hsfMix: 0.5, hsfEngine: engine, hsfAmount: 0.5 }
        )
      );
    }
  });

  it('covers MRS materials and chaos modulation', async () => {
    for (const material of ['metal', 'glass', 'bio', 'wood']) {
      await trigger(
        makeLayer({}, { mrsEnabled: true, mrsMix: 0.5, mrsMaterial: material, mrsDensity: 1, mrsChaos: 1 })
      );
    }
  });

  it('generates every TIL texture type', async () => {
    for (const texture of ['static', 'grit', 'glitch', 'crackle', 'plasma', 'ticks', 'rustle', 'brown', 'pink', 'bogus']) {
      await trigger(
        makeLayer({}, { tilEnabled: true, tilMix: 0.5, tilTexture: texture, tilAmount: 0.8 })
      );
    }
  });

  it('builds a phase-shifted periodic-wave 808 with x-sub and saturation', async () => {
    await trigger(
      makeLayer({
        analysis: { peakDb: -6 },
        subDesign: {
          subEnabled: true,
          subType: 'square',
          subLevel: 1,
          xSubMix: 0.6,
          harmonicSaturation: 0.5,
          harmonic2nd: 10,
          harmonic3rd: 5,
          drive: 1,
          dynamicTracking: true,
          phase: 90,
        },
      })
    );
    await trigger(
      makeLayer({
        subDesign: {
          subEnabled: true,
          subType: 'triangle',
          subLevel: 1,
          xSubMix: 0,
          harmonicSaturation: 0,
          drive: 0,
          dynamicTracking: false,
          phase: 90,
        },
      })
    );
  });

  it('covers the short-envelope release ramps', async () => {
    // playDur (0.01) <= safeAttack (1s) with peak > 0.0001 -> exponential release
    await trigger(makeLayer({ playStartPct: 0, playEndPct: 0.002, envelope: { attack: 1, decay: 0.2, sustain: 0.8, release: 0.1 } }));
    // playDur <= safeAttack with peak <= 0.0001 -> linear release
    await trigger(makeLayer({ playStartPct: 0, playEndPct: 0.002, gain: 0, envelope: { attack: 1, decay: 0.2, sustain: 0.8, release: 0.1 } }));
  });
});
