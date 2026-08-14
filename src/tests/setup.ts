import { vi } from 'vitest';

// Mock AudioContext
class MockAudioContext {
  createGain = vi.fn(() => ({
    connect: vi.fn(),
    gain: { value: 1 }
  }));
  createAnalyser = vi.fn(() => ({
    connect: vi.fn(),
    fftSize: 2048,
    frequencyBinCount: 1024,
    getByteFrequencyData: vi.fn(),
    getByteTimeDomainData: vi.fn()
  }));
  destination = {};
}

vi.stubGlobal('AudioContext', MockAudioContext);
vi.stubGlobal('webkitAudioContext', MockAudioContext);

// jsdom does not expose Web Audio node constructors. Stub the ones used in
// runtime instanceof checks so smoke tests can assert against them.
class MockGainNode {}
vi.stubGlobal('GainNode', MockGainNode);

// The real AudioEngine also does `source instanceof AudioBufferSourceNode` /
// `source instanceof OscillatorNode` and `ctx instanceof BaseAudioContext`
// (playLayerInstance, tape-delay bus). Without these globals jsdom throws a
// ReferenceError mid-chain, so no trigger ever completes and downstream paths
// (MPC choke registration, trackHelper return, send buses) are unreachable.
class MockAudioBufferSourceNode {}
class MockOscillatorNode {}
class MockBaseAudioContext {}
vi.stubGlobal('AudioBufferSourceNode', MockAudioBufferSourceNode);
vi.stubGlobal('OscillatorNode', MockOscillatorNode);
vi.stubGlobal('BaseAudioContext', MockBaseAudioContext);

// Mock AudioEngine
const createAudioEngineMock = () => {
  const mock = {
    playLayer: vi.fn(),
    stopLayer: vi.fn(),
    setBypassFX: vi.fn(),
    setMasterGain: vi.fn(),
    setMasterLevel: vi.fn(),
    setMasterPan: vi.fn(),
    getContext: vi.fn(() => new MockAudioContext()),
    getMasterRackInput: vi.fn(() => new MockGainNode()),
    getMasterRackOutput: vi.fn(() => new MockGainNode())
  };
  
  return new Proxy(mock, {
    get: (target, prop) => {
      if (prop in target) return (target as any)[prop];
      return vi.fn(); // Return a no-op mock for any missing property
    }
  });
};

vi.mock('../lib/audioEngine', () => ({
  audioEngine: createAudioEngineMock()
}));

vi.mock('../audio/AudioEngine', () => ({
  audioEngine: createAudioEngineMock()
}));

// Mock OfflineAudioContext
class MockOfflineAudioContext {
  sampleRate = 44100;
  destination = {};
  constructor(public numberOfChannels: number, public length: number, public rate: number) {
    this.sampleRate = rate;
  }
  createBuffer = vi.fn((channels, length, rate) => {
    // Match real Web Audio semantics: getChannelData() must return the SAME
    // stable array on every call. Allocating a fresh Float32Array per call
    // makes off-heap ArrayBuffer churn explode (e.g. the evolution-engine
    // reverb impulse loop calls getChannelData() ~176k times), which trips
    // V8 external-memory pressure and can crash the worker on Windows.
    const channelData = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels,
      length: length,
      sampleRate: rate,
      getChannelData: (ch: number) => channelData[ch] ?? channelData[0],
      copyToChannel: (src: Float32Array, ch: number) => channelData[ch]?.set(src),
      copyFromChannel: vi.fn()
    };
  });
  createBufferSource = vi.fn(() => ({
    connect: vi.fn(),
    start: vi.fn(),
    buffer: null,
    playbackRate: { value: 1.0 }
  }));
  createGain = vi.fn(() => ({
    connect: vi.fn(),
    gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }
  }));
  createBiquadFilter = vi.fn(() => ({
    connect: vi.fn(),
    type: 'lowpass',
    frequency: { value: 20000, setValueAtTime: vi.fn() },
    Q: { value: 1, setValueAtTime: vi.fn() },
    gain: { value: 0, setValueAtTime: vi.fn() }
  }));
  createDelay = vi.fn(() => ({
    connect: vi.fn(),
    delayTime: { value: 0, setValueAtTime: vi.fn() }
  }));
  createConvolver = vi.fn(() => ({
    connect: vi.fn(),
    buffer: null
  }));
  createWaveShaper = vi.fn(() => ({
    connect: vi.fn(),
    curve: null
  }));
  startRendering = vi.fn(() => {
    const channelData = Array.from({ length: this.numberOfChannels }, () => new Float32Array(this.length));
    const mockOutputBuffer = {
      numberOfChannels: this.numberOfChannels,
      length: this.length,
      sampleRate: this.sampleRate,
      duration: this.length / this.sampleRate,
      getChannelData: (ch: number) => channelData[ch] ?? channelData[0],
      copyToChannel: (src: Float32Array, ch: number) => channelData[ch]?.set(src),
      copyFromChannel: vi.fn()
    };
    return Promise.resolve(mockOutputBuffer);
  });
}

vi.stubGlobal('OfflineAudioContext', MockOfflineAudioContext);

// Mock crypto.randomUUID for JSDOM / older Node environments
if (typeof crypto === 'undefined') {
  vi.stubGlobal('crypto', {
    randomUUID: () => '1b36c2cb-5fe3-4ee5-90c9-1b36c2cb'
  });
} else if (!crypto.randomUUID) {
  Object.defineProperty(crypto, 'randomUUID', {
    value: () => '1b36c2cb-5fe3-4ee5-90c9-1b36c2cb',
    writable: true,
    configurable: true
  });
}

