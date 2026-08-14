import { ConvolutionPreset } from '../../types';

// Global Caches for Generated and Processed Impulse Responses
const baseIrCache = new Map<string, AudioBuffer>();
const processedIrCache = new Map<string, AudioBuffer>();

class ImpulseResponseCache {
  private cache = new Map<string, AudioBuffer>();
  private maxEntries = 40;

  private key(irId: string, durationSec: number, decayRate: number): string {
    return `${irId}|${durationSec.toFixed(3)}|${decayRate.toFixed(3)}`;
  }

  get(ctx: AudioContext, irId: string, durationSec: number, decayRate: number): AudioBuffer {
    const k = this.key(irId, durationSec, decayRate);
    const hit = this.cache.get(k);
    if (hit) {
      // Refresh LRU order
      this.cache.delete(k);
      this.cache.set(k, hit);
      return hit;
    }
    const buffer = generateImpulseResponse(ctx, irId, durationSec, decayRate);
    this.cache.set(k, buffer);
    if (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return buffer;
  }

  clear() {
    this.cache.clear();
  }
}

export const irCache = new ImpulseResponseCache();

/**
 * Creates procedural Impulse Response AudioBuffer for specified irId
 */
export function generateImpulseResponse(
  ctx: AudioContext,
  irId: string,
  durationSec: number = 2.0,
  decayRate: number = 3.0
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const cacheKey = `${irId}_${durationSec}_${decayRate}_${sampleRate}`;

  if (baseIrCache.has(cacheKey)) {
    return baseIrCache.get(cacheKey)!;
  }

  const length = Math.floor(sampleRate * Math.max(0.1, durationSec));
  const buffer = ctx.createBuffer(2, length, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  const isMetallic = irId.includes('metal') || irId.includes('chamber');
  const isGhost = irId.includes('ghost') || irId.includes('swell');
  const isShimmer = irId.includes('shimmer') || irId.includes('ether');
  const isPlate = irId.includes('plate');
  const isRoom = irId.includes('room');

  for (let i = 0; i < length; i++) {
    const t = i / length;
    // Envelope shape
    let env = Math.exp(-t * decayRate);
    if (isGhost) {
      // Swell envelope
      env = Math.sin(t * Math.PI) * Math.exp(-t * 1.5);
    } else if (isShimmer) {
      env = Math.exp(-t * (decayRate * 0.7)) * (1 + 0.3 * Math.sin(t * 40));
    }

    // Noise base
    let nL = (Math.random() * 2 - 1);
    let nR = (Math.random() * 2 - 1);

    // Timbre mods
    if (isMetallic) {
      // Comb resonance ring
      const metallicRing = Math.sin(i * 0.1) * 0.4 + Math.sin(i * 0.23) * 0.3;
      nL += metallicRing;
      nR += metallicRing;
    } else if (isPlate) {
      // High density diffusion
      nL = Math.sign(nL) * Math.pow(Math.abs(nL), 0.8);
      nR = Math.sign(nR) * Math.pow(Math.abs(nR), 0.8);
    } else if (isRoom) {
      // Early reflections density spikes
      if (i < sampleRate * 0.08 && i % 120 === 0) {
        nL *= 2.5;
        nR *= 2.5;
      }
    }

    left[i] = nL * env;
    right[i] = nR * env;
  }

  baseIrCache.set(cacheKey, buffer);
  return buffer;
}

/**
 * RBJ 2-Pole Biquad Filter for accurate Float32 audio sample spectral shelving.
 */
function applyBiquadShelfFilter(
  data: Float32Array,
  type: 'lowshelf' | 'highshelf',
  cutoffHz: number,
  gainDb: number,
  sampleRate: number
) {
  if (Math.abs(gainDb) < 0.01) return;

  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
  const alpha = (Math.sin(w0) / 2) * Math.sqrt(2);
  const cosw0 = Math.cos(w0);

  let b0 = 0, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

  if (type === 'lowshelf') {
    b0 = A * ((A + 1) - (A - 1) * cosw0 + 2 * Math.sqrt(A) * alpha);
    b1 = 2 * A * ((A - 1) - (A + 1) * cosw0);
    b2 = A * ((A + 1) - (A - 1) * cosw0 - 2 * Math.sqrt(A) * alpha);
    a0 = (A + 1) + (A - 1) * cosw0 + 2 * Math.sqrt(A) * alpha;
    a1 = -2 * ((A - 1) + (A + 1) * cosw0);
    a2 = (A + 1) + (A - 1) * cosw0 - 2 * Math.sqrt(A) * alpha;
  } else {
    b0 = A * ((A + 1) + (A - 1) * cosw0 + 2 * Math.sqrt(A) * alpha);
    b1 = -2 * A * ((A - 1) + (A + 1) * cosw0);
    b2 = A * ((A + 1) - (A - 1) * cosw0 - 2 * Math.sqrt(A) * alpha);
    a0 = (A + 1) - (A - 1) * cosw0 + 2 * Math.sqrt(A) * alpha;
    a1 = 2 * ((A - 1) - (A + 1) * cosw0);
    a2 = (A + 1) - (A - 1) * cosw0 - 2 * Math.sqrt(A) * alpha;
  }

  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = nb0 * x + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    data[i] = y;
  }
}

/**
 * Process Impulse Response AudioBuffer with Time Warp (resampling),
 * Reverse, and RBJ Biquad Spectral Shelves.
 */
export function processImpulseResponseBuffer(
  ctx: AudioContext,
  sourceBuffer: AudioBuffer,
  options: {
    stretchFactor: number; // 0.5 to 2.0
    reverse: boolean;
    irLowShelfDb: number;
    irHighShelfDb: number;
  },
  cacheKeyExtra?: string
): AudioBuffer {
  const { stretchFactor, reverse, irLowShelfDb, irHighShelfDb } = options;
  const sampleRate = ctx.sampleRate;
  
  const cacheKey = cacheKeyExtra
    ? `${cacheKeyExtra}_${stretchFactor}_${reverse}_${irLowShelfDb}_${irHighShelfDb}_${sampleRate}`
    : null;

  if (cacheKey && processedIrCache.has(cacheKey)) {
    return processedIrCache.get(cacheKey)!;
  }

  // 1. Resample / Stretch
  const targetLength = Math.max(128, Math.floor(sourceBuffer.length * Math.max(0.2, Math.min(3.0, stretchFactor))));
  const processedBuffer = ctx.createBuffer(sourceBuffer.numberOfChannels, targetLength, sampleRate);

  for (let ch = 0; ch < sourceBuffer.numberOfChannels; ch++) {
    const src = sourceBuffer.getChannelData(ch);
    const dest = processedBuffer.getChannelData(ch);
    const ratio = (sourceBuffer.length - 1) / (targetLength - 1);

    for (let i = 0; i < targetLength; i++) {
      const srcIdx = i * ratio;
      const idx0 = Math.floor(srcIdx);
      const idx1 = Math.min(src.length - 1, idx0 + 1);
      const frac = srcIdx - idx0;
      let sample = src[idx0] * (1 - frac) + src[idx1] * frac;

      if (reverse) {
        dest[targetLength - 1 - i] = sample;
      } else {
        dest[i] = sample;
      }
    }
  }

  // 2. RBJ Biquad Spectral Shelf EQ on IR Buffer Float32 samples
  if (irLowShelfDb !== 0) {
    for (let ch = 0; ch < processedBuffer.numberOfChannels; ch++) {
      applyBiquadShelfFilter(processedBuffer.getChannelData(ch), 'lowshelf', 400, irLowShelfDb, sampleRate);
    }
  }
  if (irHighShelfDb !== 0) {
    for (let ch = 0; ch < processedBuffer.numberOfChannels; ch++) {
      applyBiquadShelfFilter(processedBuffer.getChannelData(ch), 'highshelf', 3000, irHighShelfDb, sampleRate);
    }
  }

  if (cacheKey) {
    processedIrCache.set(cacheKey, processedBuffer);
  }

  return processedBuffer;
}

export class ConvolutionReverbDSP {
  private ctx: AudioContext;
  public inputNode: GainNode;
  public outputNode: GainNode;

  // Pre-EQ
  private hpFilter: BiquadFilterNode;
  private tiltLow: BiquadFilterNode;
  private tiltHigh: BiquadFilterNode;

  // Convolver / Multiband Splitter
  private mainConvolver: ConvolverNode;

  // Multiband Crossover Nodes
  private lowCrossover: BiquadFilterNode;
  private midCrossoverHp: BiquadFilterNode;
  private midCrossoverLp: BiquadFilterNode;
  private highCrossover: BiquadFilterNode;

  private lowConvolver: ConvolverNode;
  private midConvolver: ConvolverNode;
  private highConvolver: ConvolverNode;

  // Post-EQ
  private dampingFilter: BiquadFilterNode;
  private presenceFilter: BiquadFilterNode;
  private airFilter: BiquadFilterNode;

  // Nonlinear Tail
  private tailSaturator: WaveShaperNode;
  private tailDelay: DelayNode;
  private tailLfo: OscillatorNode;
  private tailLfoGain: GainNode;

  // Dry / Wet Mix
  private dryGain: GainNode;
  private wetGain: GainNode;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.inputNode = ctx.createGain();
    this.outputNode = ctx.createGain();

    // 1. Pre-EQ
    this.hpFilter = ctx.createBiquadFilter();
    this.hpFilter.type = 'highpass';
    this.hpFilter.frequency.value = 100;

    this.tiltLow = ctx.createBiquadFilter();
    this.tiltLow.type = 'lowshelf';
    this.tiltLow.frequency.value = 400;

    this.tiltHigh = ctx.createBiquadFilter();
    this.tiltHigh.type = 'highshelf';
    this.tiltHigh.frequency.value = 3000;

    // 2. Convolvers
    this.mainConvolver = ctx.createConvolver();

    // Multiband crossover
    this.lowCrossover = ctx.createBiquadFilter();
    this.lowCrossover.type = 'lowpass';
    this.lowCrossover.frequency.value = 300;

    this.midCrossoverHp = ctx.createBiquadFilter();
    this.midCrossoverHp.type = 'highpass';
    this.midCrossoverHp.frequency.value = 300;

    this.midCrossoverLp = ctx.createBiquadFilter();
    this.midCrossoverLp.type = 'lowpass';
    this.midCrossoverLp.frequency.value = 3200;

    this.highCrossover = ctx.createBiquadFilter();
    this.highCrossover.type = 'highpass';
    this.highCrossover.frequency.value = 3200;

    this.lowConvolver = ctx.createConvolver();
    this.midConvolver = ctx.createConvolver();
    this.highConvolver = ctx.createConvolver();

    // 3. Post-EQ
    this.dampingFilter = ctx.createBiquadFilter();
    this.dampingFilter.type = 'lowpass';
    this.dampingFilter.frequency.value = 8000;

    this.presenceFilter = ctx.createBiquadFilter();
    this.presenceFilter.type = 'peaking';
    this.presenceFilter.frequency.value = 2500;
    this.presenceFilter.Q.value = 1.0;

    this.airFilter = ctx.createBiquadFilter();
    this.airFilter.type = 'highshelf';
    this.airFilter.frequency.value = 10000;

    // 4. Nonlinear Tail (Saturation + Modulation)
    this.tailSaturator = ctx.createWaveShaper();
    this.setSaturationCurve(0.1);

    // Guaranteed minimum baseline delay to prevent zipper noise / zero-delay clipping
    this.tailDelay = ctx.createDelay();
    this.tailDelay.delayTime.value = 0.025; // 25ms baseline delay

    this.tailLfo = ctx.createOscillator();
    this.tailLfo.type = 'sine';
    this.tailLfo.frequency.value = 0.5;

    this.tailLfoGain = ctx.createGain();
    this.tailLfoGain.gain.value = 0.002; // 2ms pitch depth (safe range within [17ms, 33ms])

    this.tailLfo.connect(this.tailLfoGain);
    this.tailLfoGain.connect(this.tailDelay.delayTime);
    this.tailLfo.start();

    // Dry / Wet Gains
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    // Standard Fullband Signal Routing
    // Input -> Dry -> Output
    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);

    // Input -> Pre-EQ -> Convolver -> Post-EQ -> Tail -> Wet -> Output
    this.inputNode.connect(this.hpFilter);
    this.hpFilter.connect(this.tiltLow);
    this.tiltLow.connect(this.tiltHigh);

    // Default Fullband Connection
    this.connectFullbandMode();

    this.dampingFilter.connect(this.presenceFilter);
    this.presenceFilter.connect(this.airFilter);
    this.airFilter.connect(this.tailSaturator);
    this.tailSaturator.connect(this.tailDelay);
    this.tailDelay.connect(this.wetGain);
    this.wetGain.connect(this.outputNode);

    // Initial default IR
    this.loadDefaultIR();
  }

  private disconnectAllConvolvers() {
    try {
      this.tiltHigh.disconnect();
      this.lowCrossover.disconnect();
      this.midCrossoverHp.disconnect();
      this.midCrossoverLp.disconnect();
      this.highCrossover.disconnect();
      this.lowConvolver.disconnect();
      this.midConvolver.disconnect();
      this.highConvolver.disconnect();
      this.mainConvolver.disconnect();
    } catch (e) {
      // Ignore disconnect errors on init
    }
  }

  private connectFullbandMode() {
    this.disconnectAllConvolvers();

    this.tiltHigh.connect(this.mainConvolver);
    this.mainConvolver.connect(this.dampingFilter);
  }

  private connectMultibandMode() {
    this.disconnectAllConvolvers();

    // Split into 3 bands
    this.tiltHigh.connect(this.lowCrossover);
    this.tiltHigh.connect(this.midCrossoverHp);
    this.midCrossoverHp.connect(this.midCrossoverLp);
    this.tiltHigh.connect(this.highCrossover);

    // Convolve each band
    this.lowCrossover.connect(this.lowConvolver);
    this.midCrossoverLp.connect(this.midConvolver);
    this.highCrossover.connect(this.highConvolver);

    // Recombine to Post-EQ
    this.lowConvolver.connect(this.dampingFilter);
    this.midConvolver.connect(this.dampingFilter);
    this.highConvolver.connect(this.dampingFilter);
  }

  private setSaturationCurve(amount: number) {
    const k = Math.max(0.01, amount * 20);
    const n = 1024;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    this.tailSaturator.curve = curve;
  }

  private loadDefaultIR() {
    const defaultIR = generateImpulseResponse(this.ctx, 'room_short', 1.8, 3.5);
    this.mainConvolver.buffer = defaultIR;
    this.lowConvolver.buffer = generateImpulseResponse(this.ctx, 'room_sub', 1.5, 4.0);
    this.midConvolver.buffer = defaultIR;
    this.highConvolver.buffer = generateImpulseResponse(this.ctx, 'room_air', 1.2, 5.0);
  }

  public applyPreset(preset: ConvolutionPreset, customIRBuffer?: AudioBuffer) {
    const now = this.ctx.currentTime;

    // 1. Pre-EQ
    this.hpFilter.frequency.setTargetAtTime(preset.preEq.hpFreq, now, 0.03);
    const tilt = preset.preEq.tiltAmount; // -1 to +1
    this.tiltLow.gain.setTargetAtTime(-tilt * 6, now, 0.03);
    this.tiltHigh.gain.setTargetAtTime(tilt * 6, now, 0.03);

    // 2. IR Processing with Caching
    const baseBuffer = customIRBuffer || generateImpulseResponse(this.ctx, preset.irId, 2.2, 2.8);
    const processedIR = processImpulseResponseBuffer(
      this.ctx,
      baseBuffer,
      {
        stretchFactor: preset.irProcessing.stretchFactor,
        reverse: preset.irProcessing.reverse,
        irLowShelfDb: preset.irProcessing.irLowShelfDb,
        irHighShelfDb: preset.irProcessing.irHighShelfDb,
      },
      customIRBuffer ? undefined : preset.irId
    );

    if (preset.irProcessing.mode === 'multiband') {
      this.connectMultibandMode();
      const lowIrId = preset.irProcessing.multibandIRs?.low || preset.irId;
      const highIrId = preset.irProcessing.multibandIRs?.high || preset.irId;

      if (customIRBuffer) {
        this.lowConvolver.buffer = processImpulseResponseBuffer(this.ctx, customIRBuffer, { stretchFactor: preset.irProcessing.stretchFactor, reverse: preset.irProcessing.reverse, irLowShelfDb: 3, irHighShelfDb: -4 });
        this.midConvolver.buffer = processedIR;
        this.highConvolver.buffer = processImpulseResponseBuffer(this.ctx, customIRBuffer, { stretchFactor: preset.irProcessing.stretchFactor, reverse: preset.irProcessing.reverse, irLowShelfDb: -4, irHighShelfDb: 4 });
      } else {
        this.lowConvolver.buffer = processImpulseResponseBuffer(
          this.ctx,
          generateImpulseResponse(this.ctx, lowIrId, 2.5, 2.0),
          { stretchFactor: preset.irProcessing.stretchFactor, reverse: preset.irProcessing.reverse, irLowShelfDb: 3, irHighShelfDb: -4 },
          `mb_low_${lowIrId}`
        );
        this.midConvolver.buffer = processedIR;
        this.highConvolver.buffer = processImpulseResponseBuffer(
          this.ctx,
          generateImpulseResponse(this.ctx, highIrId, 1.8, 4.0),
          { stretchFactor: preset.irProcessing.stretchFactor, reverse: preset.irProcessing.reverse, irLowShelfDb: -4, irHighShelfDb: 4 },
          `mb_high_${highIrId}`
        );
      }
    } else {
      this.connectFullbandMode();
      this.mainConvolver.buffer = processedIR;
    }

    // 3. Post-EQ
    this.dampingFilter.frequency.setTargetAtTime(preset.postEq.dampingFreq, now, 0.03);
    this.presenceFilter.gain.setTargetAtTime(preset.postEq.presenceDb, now, 0.03);
    this.airFilter.gain.setTargetAtTime(preset.postEq.airDb, now, 0.03);

    // 4. Nonlinear Tail
    this.setSaturationCurve(preset.nonlinearTail.saturationAmount);
    this.tailLfo.frequency.setTargetAtTime(preset.nonlinearTail.tailModRate, now, 0.03);
    // Limit pitch modulation depth to safe range (max 5ms)
    const safeModDepth = Math.min(0.005, preset.nonlinearTail.tailModDepth * 0.004);
    this.tailLfoGain.gain.setTargetAtTime(safeModDepth, now, 0.03);

    // 5. Mix
    this.dryGain.gain.setTargetAtTime(preset.mix.dry, now, 0.03);
    this.wetGain.gain.setTargetAtTime(preset.mix.wet, now, 0.03);
  }
}
