/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SoundLayer, RackModule, DEFAULT_ENVELOPE, DEFAULT_FX, DEFAULT_SYNTH } from '../types';
import { safeAudioValue } from './audioUtils';
import { generateChaosSynthBuffer } from './chaosSynth';
import { TapeDelayDSP } from '../audio/dsp/TapeDelayDSP';

export function isLayerAudibleInMix(layer: SoundLayer, allLayers: SoundLayer[]): boolean {
  if (!layer.enabled || layer.muted === true) {
    return false;
  }
  const hasSolo = allLayers.some(l => l.soloed === true);
  if (hasSolo) {
    return layer.soloed === true;
  }
  return true;
}

export class AudioEngine {
  private context: AudioContext;
  private masterGain: GainNode;
  private masterPan: StereoPannerNode;
  private analyserNode: AnalyserNode;
  private masterLimiter: DynamicsCompressorNode;
  private masterClipper: WaveShaperNode;
  private swarmBuffers = new Map<string, AudioBuffer>();
  private reversedBufferCache = new WeakMap<AudioBuffer, AudioBuffer>();
  private isPlaying: boolean = false;
  private playbackStartTime: number = 0;
  private currentDuration: number = 2;
  private bypassFX: boolean = false;
  private loopEnabled: boolean = false;
  private loopTimer: any = null;
  private restoreTimer: any = null;
  private activeSources: any[] = [];
  // MPC choke groups: chokeKey -> set of in-flight source nodes to cut
  private chokeGroups = new Map<string, Set<AudioNode>>();
  // Last rack modules, so offline exports can render through the master rack too
  private lastRackModules: RackModule[] = [];

  // Master Rack (StudioRack) insert chain — real nodes driven by rackStore.
  private masterRackInput: GainNode | null = null;
  private masterRackOutput: GainNode | null = null;
  private masterRackChainTarget: AudioNode | null = null;
  private masterRackNodes: AudioNode[] = [];

  constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.context.createGain();
    this.masterPan = this.context.createStereoPanner();
    this.analyserNode = this.context.createAnalyser();
    this.analyserNode.fftSize = 256;
    
    this.masterGain.connect(this.masterPan);
    const chain = this.createMasterFXChain(this.context, this.masterPan, this.analyserNode);
    this.masterClipper = chain.clipper;
    this.masterLimiter = chain.limiter;

    this.analyserNode.connect(this.context.destination);

    // Enhancement 1: Seamless AudioContext Auto-Resume & Resilient Lifecycle Guard
    const resumeContext = () => {
      if (this.context && this.context.state === 'suspended') {
        this.context.resume().catch(() => {});
      }
    };
    if (typeof window !== 'undefined') {
      ['pointerdown', 'keydown', 'touchstart', 'focus'].forEach((evt) => {
        window.addEventListener(evt, resumeContext, { passive: true });
      });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) resumeContext();
      });
    }
  }

  private createMasterFXChain(ctx: BaseAudioContext, input: AudioNode, destination: AudioNode) {
    // 1. Subsonic Rumble filters (cascaded 24dB/oct high-pass at 22Hz to maximize headroom)
    const r1 = ctx.createBiquadFilter();
    r1.type = 'highpass';
    r1.frequency.value = 22;
    r1.Q.value = 0.707;
    
    const r2 = ctx.createBiquadFilter();
    r2.type = 'highpass';
    r2.frequency.value = 22;
    r2.Q.value = 0.707;

    // 2. Dynamic auto-EQ nodes (Fletcher-Munson De-Mudder & Harshness Tamer)
    const mudEQ = ctx.createBiquadFilter();
    mudEQ.type = 'peaking';
    mudEQ.frequency.value = 250;
    mudEQ.Q.value = 1.0;
    mudEQ.gain.value = 0;
    
    const harshEQ = ctx.createBiquadFilter();
    harshEQ.type = 'peaking';
    harshEQ.frequency.value = 3200;
    harshEQ.Q.value = 1.2;
    harshEQ.gain.value = 0;
    
    const mudBP = ctx.createBiquadFilter();
    mudBP.type = 'bandpass';
    mudBP.frequency.value = 250;
    mudBP.Q.value = 1.5;
    
    const harshBP = ctx.createBiquadFilter();
    harshBP.type = 'bandpass';
    harshBP.frequency.value = 3200;
    harshBP.Q.value = 1.5;
    
    const rectifier = ctx.createWaveShaper();
    const rCurve = new Float32Array(513);
    for (let i = 0; i < 513; i++) {
      rCurve[i] = Math.abs((i / 256) - 1);
    }
    rectifier.curve = rCurve;
    
    const envSmoother = ctx.createBiquadFilter();
    envSmoother.type = 'lowpass';
    envSmoother.frequency.value = 5; // 5Hz lowpass envelope
    
    const mudModGain = ctx.createGain();
    mudModGain.gain.value = -6.0; // Dynamic reduction up to 6dB under boxiness pressure
    
    const harshModGain = ctx.createGain();
    harshModGain.gain.value = -4.0; // Dynamic taming up to 4dB under piercing pressure

    // Connect sidechain dynamic EQ path
    input.connect(mudBP);
    input.connect(harshBP);
    
    mudBP.connect(rectifier);
    harshBP.connect(rectifier);
    rectifier.connect(envSmoother);
    
    envSmoother.connect(mudModGain);
    mudModGain.connect(mudEQ.gain);
    
    envSmoother.connect(harshModGain);
    harshModGain.connect(harshEQ.gain);

    // 3. Sub-Bass Mono-izer Crossover summing (All sub frequencies below 110Hz summed to mono)
    const crossoverFreq = 110;
    const lpSub = ctx.createBiquadFilter();
    lpSub.type = 'lowpass';
    lpSub.frequency.value = crossoverFreq;
    
    const hpMidsHighs = ctx.createBiquadFilter();
    hpMidsHighs.type = 'highpass';
    hpMidsHighs.frequency.value = crossoverFreq;
    
    const subSplitter = ctx.createChannelSplitter(2);
    const subSum = ctx.createGain();
    subSum.gain.value = 0.5;
    const subMerger = ctx.createChannelMerger(2);
    const stereoSumBus = ctx.createGain(); // Preserves true stereo image for mids/highs while sub is monoed
    
    lpSub.connect(subSplitter);
    subSplitter.connect(subSum, 0);
    subSplitter.connect(subSum, 1);
    subSum.connect(subMerger, 0, 0);
    subSum.connect(subMerger, 0, 1);
    subMerger.connect(stereoSumBus);
    hpMidsHighs.connect(stereoSumBus); // Direct true stereo path for high/mids!

    // 4. Stereo Spatialize MS Width Network (widen high/mids post mono sub)
    const msSplitter = ctx.createChannelSplitter(2);
    const msMerger = ctx.createChannelMerger(2);
    
    const lGain = ctx.createGain();
    const rGain = ctx.createGain();
    const lToRInverter = ctx.createGain();
    lToRInverter.gain.value = -1;
    const rToLInverter = ctx.createGain();
    rToLInverter.gain.value = -1;
    
    const diffLGain = ctx.createGain();
    diffLGain.gain.value = 0.25; // Boost side signal 25% for high-end width
    const diffRGain = ctx.createGain();
    diffRGain.gain.value = 0.25;
    
    const outL = ctx.createGain();
    const outR = ctx.createGain();
    
    msSplitter.connect(lGain, 0);
    msSplitter.connect(rGain, 1);
    
    lGain.connect(diffLGain);
    rGain.connect(rToLInverter);
    rToLInverter.connect(diffLGain);
    
    rGain.connect(diffRGain);
    lGain.connect(lToRInverter);
    lToRInverter.connect(diffRGain);
    
    lGain.connect(outL);
    diffLGain.connect(outL);
    rGain.connect(outR);
    diffRGain.connect(outR);
    
    outL.connect(msMerger, 0, 0);
    outR.connect(msMerger, 0, 1);

    // 5. Oversampled Asymmetrical Tube Saturation Clipper (Rich analog harmonics)
    const clipper = ctx.createWaveShaper();
    clipper.oversample = '4x';
    const curve = new Float32Array(4096);
    for (let i = 0; i < 4096; i++) {
      const x = (i * 2) / 4096 - 1;
      if (x > 0) {
        curve[i] = Math.tanh(x * 1.6) * 0.92;
      } else {
        curve[i] = Math.tanh(x * 1.35) * 0.95;
      }
    }
    clipper.curve = curve;

    // 6. Brickwall Peak Limiter (Maximizes headroom cleanly)
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -0.5;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;

    // Master Rack (StudioRack) insert point — rack modules run between the
    // master input and the fixed master processing (rumble → EQ → clipper → limiter).
    this.masterRackInput = ctx.createGain();
    this.masterRackOutput = ctx.createGain();
    this.masterRackInput.connect(this.masterRackOutput);
    this.masterRackChainTarget = r1;
    input.connect(this.masterRackInput);
    this.masterRackOutput.connect(r1);

    // Connect rest of the master DSP pipeline in series
    r1.connect(r2);
    r2.connect(mudEQ);
    mudEQ.connect(harshEQ);
    
    // Split to crossover
    harshEQ.connect(lpSub);
    harshEQ.connect(hpMidsHighs);
    
    // 7. Sub-Audible DC Offset Removal Filter (12Hz 2-pole High-Pass)
    const dcOffsetKiller = ctx.createBiquadFilter();
    dcOffsetKiller.type = 'highpass';
    dcOffsetKiller.frequency.value = 12;
    dcOffsetKiller.Q.value = 0.707;

    // Route from crossover output to MS Widener
    stereoSumBus.connect(msSplitter);
    msMerger.connect(clipper);
    clipper.connect(limiter);
    limiter.connect(dcOffsetKiller);
    dcOffsetKiller.connect(destination);
    
    return {
      limiter,
      clipper,
      msMerger
    };
  }

  private createSchroederReverbNode(ctx: BaseAudioContext, input: AudioNode, mix: number, startTime: number): AudioNode {
    const wetGain = ctx.createGain();
    wetGain.gain.setValueAtTime(mix, startTime);
    
    // Four parallel comb delay lines with prime ratio delay times
    const delays = [0.029, 0.037, 0.041, 0.043];
    const feedbacks = [0.82, 0.78, 0.75, 0.72];
    
    const combMix = ctx.createGain();
    combMix.gain.setValueAtTime(0.5, startTime);
    
    for (let i = 0; i < 4; i++) {
      const dNode = ctx.createDelay();
      dNode.delayTime.setValueAtTime(delays[i], startTime);
      
      const fNode = ctx.createGain();
      fNode.gain.setValueAtTime(feedbacks[i], startTime);
      
      input.connect(dNode);
      dNode.connect(fNode);
      fNode.connect(dNode); // comb feedback loop
      dNode.connect(combMix);
    }
    
    // Two high-diffusion All-Pass filters in series
    const ap1 = ctx.createBiquadFilter();
    ap1.type = 'allpass';
    ap1.frequency.setValueAtTime(500, startTime);
    ap1.Q.setValueAtTime(1.0, startTime);
    
    const ap2 = ctx.createBiquadFilter();
    ap2.type = 'allpass';
    ap2.frequency.setValueAtTime(1200, startTime);
    ap2.Q.setValueAtTime(1.2, startTime);
    
    // Absorption lowpass filter to model ambient wall dampening
    const dampFilter = ctx.createBiquadFilter();
    dampFilter.type = 'lowpass';
    dampFilter.frequency.setValueAtTime(4500, startTime);
    
    combMix.connect(ap1);
    ap1.connect(ap2);
    ap2.connect(dampFilter);
    dampFilter.connect(wetGain);
    
    return wetGain;
  }

  setBypassFX(bypass: boolean) {
    this.bypassFX = bypass;
  }

  setMasterLevel(level: number) {
    this.masterGain.gain.setTargetAtTime(safeAudioValue(level, 0.8), this.context.currentTime, 0.05);
  }

  setMasterPan(pan: number) {
    this.masterPan.pan.setTargetAtTime(safeAudioValue(pan, 0), this.context.currentTime, 0.05);
  }

  /**
   * Rebuilds the master FX rack (StudioRack) as a real serial insert chain
   * between the master input and the fixed master processing. Empty rack =
   * pass-through (identical to previous behaviour). All node creation is
   * wrapped so a bad module can never break audio — it degrades to passthrough.
   */
  setMasterRack(modules: RackModule[]): void {
    const ctx = this.context;
    const input = this.masterRackInput;
    const output = this.masterRackOutput;
    const target = this.masterRackChainTarget;
    if (!ctx || !input || !output || !target) return;
    this.lastRackModules = modules;

    try {
      // Tear down previous rack chain
      this.masterRackNodes.forEach((n) => {
        try { n.disconnect(); } catch { /* ignore */ }
      });
      this.masterRackNodes = [];
      try { input.disconnect(); } catch { /* ignore */ }
      try { output.disconnect(); } catch { /* ignore */ }

      let cursor: AudioNode = input;
      for (const mod of modules) {
        if (!mod || mod.enabled === false) continue;
        const built = this.buildMasterRackModule(ctx, mod);
        if (!built) continue;
        try { cursor.connect(built.node); } catch { continue; }
        cursor = built.node;
        this.masterRackNodes.push(...built.nodes);
      }
      cursor.connect(output);
      output.connect(target);
    } catch (err) {
      console.warn('Master rack build notice:', err);
      try { input.disconnect(); } catch { /* ignore */ }
      try { output.disconnect(); } catch { /* ignore */ }
      input.connect(output);
      output.connect(target);
      this.masterRackNodes = [];
    }
  }

  private buildMasterRackModule(ctx: BaseAudioContext, mod: RackModule): { node: AudioNode; nodes: AudioNode[] } | null {
    const s = mod.settings || {};
    const nodes: AudioNode[] = [];
    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
    const num = (v: any, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);

    const makeTanhCurve = (drive: number): Float32Array => {
      const n = 2048;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1;
        curve[i] = Math.tanh(x * drive);
      }
      return curve;
    };

    // Uniform insert: entry → [effect] → out, where wet effects sum dry + wet.
    const entry = ctx.createGain();
    const out = ctx.createGain();
    nodes.push(entry, out);

    try {
      switch (mod.type) {
        case 'eq': {
          let cursor: AudioNode = entry;
          const bands = Array.isArray(s.bands) ? (s.bands as any[]) : [];
          for (const b of bands) {
            if (!b || b.enabled === false) continue;
            const f = ctx.createBiquadFilter();
            f.type = (b.type === 'bell' ? 'peaking' : b.type === 'lowShelf' ? 'lowshelf' : b.type === 'highShelf' ? 'highshelf' : b.type) as BiquadFilterType;
            f.frequency.value = clamp(num(b.freq, 1000), 20, 20000);
            f.Q.value = clamp(num(b.q, 0.7), 0.1, 24);
            f.gain.value = clamp(num(b.gain, 0), -24, 24);
            cursor.connect(f);
            cursor = f;
            nodes.push(f);
          }
          cursor.connect(out);
          break;
        }
        case 'compressor': {
          const comp = ctx.createDynamicsCompressor();
          comp.threshold.value = clamp(num(s.threshold, -18), -60, 0);
          comp.ratio.value = clamp(num(s.ratio, 4), 1, 20);
          comp.attack.value = clamp((num(s.attackMs, 10)) / 1000, 0.0001, 1);
          comp.release.value = clamp((num(s.releaseMs, 100)) / 1000, 0.001, 2);
          entry.connect(comp);
          comp.connect(out);
          nodes.push(comp);
          break;
        }
        case 'limiter': {
          const lim = ctx.createDynamicsCompressor();
          lim.threshold.value = clamp(num(s.threshold, -1), -12, 0);
          lim.ratio.value = 20;
          lim.attack.value = 0.001;
          lim.release.value = clamp((num(s.release, 100)) / 1000, 0.001, 2);
          entry.connect(lim);
          lim.connect(out);
          nodes.push(lim);
          break;
        }
        case 'clipper': {
          const drive = clamp((-1 * (num(s.threshold, -3))) / 3, 0.25, 6);
          const ws = ctx.createWaveShaper();
          ws.oversample = '2x';
          ws.curve = makeTanhCurve(drive);
          entry.connect(ws);
          ws.connect(out);
          nodes.push(ws);
          break;
        }
        case 'saturator': {
          const drive = clamp((num(s.drive, 12)) / 10, 0, 6);
          const mix = clamp((num(s.mix, 100)) / 100, 0, 1);
          const ws = ctx.createWaveShaper();
          ws.oversample = '2x';
          ws.curve = makeTanhCurve(drive);
          const tone = ctx.createBiquadFilter();
          tone.type = 'lowpass';
          tone.frequency.value = 22050 - clamp(num(s.tone, 50), 0, 100) * 9000;
          const dry = ctx.createGain();
          dry.gain.value = 1 - mix;
          const wet = ctx.createGain();
          wet.gain.value = mix;
          entry.connect(dry);
          dry.connect(out);
          entry.connect(ws);
          ws.connect(tone);
          tone.connect(wet);
          wet.connect(out);
          nodes.push(ws, tone, dry, wet);
          break;
        }
        case 'tape': {
          const drive = clamp((num(s.drive, 3)) / 10, 0, 3);
          const bias = clamp(num(s.bias, 50), 0, 100);
          const ws = ctx.createWaveShaper();
          ws.oversample = '2x';
          ws.curve = makeTanhCurve(drive);
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 16000 - bias * 60;
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 30;
          entry.connect(ws);
          ws.connect(lp);
          lp.connect(hp);
          hp.connect(out);
          nodes.push(ws, lp, hp);
          break;
        }
        case 'exciter': {
          const amount = clamp((num(s.amount, 35)) / 100, 0, 2);
          const freq = clamp(num(s.freq, 4000), 500, 16000);
          const mix = clamp((num(s.mix, 50)) / 100, 0, 1);
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = freq;
          const ws = ctx.createWaveShaper();
          ws.oversample = '2x';
          ws.curve = makeTanhCurve(0.5 + amount * 2);
          const dry = ctx.createGain();
          dry.gain.value = 1 - mix;
          const wet = ctx.createGain();
          wet.gain.value = mix;
          entry.connect(dry);
          dry.connect(out);
          entry.connect(hp);
          hp.connect(ws);
          ws.connect(wet);
          wet.connect(out);
          nodes.push(hp, ws, dry, wet);
          break;
        }
        case 'delay': {
          const time = clamp((num(s.time, 350)) / 1000, 0.01, 2);
          const feedback = clamp((num(s.feedback, 40)) / 100, 0, 0.9);
          const mix = clamp((num(s.mix, 30)) / 100, 0, 1);
          const dl = ctx.createDelay(2);
          dl.delayTime.value = time;
          const fb = ctx.createGain();
          fb.gain.value = feedback;
          const wet = ctx.createGain();
          wet.gain.value = mix;
          const dry = ctx.createGain();
          dry.gain.value = 1 - mix;
          entry.connect(dl);
          dl.connect(fb);
          fb.connect(dl);
          dl.connect(wet);
          wet.connect(out);
          entry.connect(dry);
          dry.connect(out);
          nodes.push(dl, fb, wet, dry);
          break;
        }
        case 'reverb': {
          const mix = clamp((num(s.mix, 25)) / 100, 0, 1);
          const decay = clamp(num(s.decay, 2.5), 0.2, 10);
          const preDelaySec = clamp((num(s.preDelay, 20)) / 1000, 0, 0.2);
          const dry = ctx.createGain();
          dry.gain.value = 1 - mix;
          const wet = ctx.createGain();
          wet.gain.value = mix;
          const pre = ctx.createDelay(0.5);
          pre.delayTime.value = preDelaySec;
          const combMix = ctx.createGain();
          combMix.gain.value = 0.5;
          const combTimes = [0.029, 0.037, 0.041, 0.043];
          const fbBase = 0.5 + decay * 0.035;
          for (let i = 0; i < 4; i++) {
            const d = ctx.createDelay();
            d.delayTime.value = combTimes[i];
            const f = ctx.createGain();
            f.gain.value = fbBase - i * 0.02;
            pre.connect(d);
            d.connect(f);
            f.connect(d);
            d.connect(combMix);
            nodes.push(d, f);
          }
          const ap1 = ctx.createBiquadFilter();
          ap1.type = 'allpass';
          ap1.frequency.value = 500;
          const ap2 = ctx.createBiquadFilter();
          ap2.type = 'allpass';
          ap2.frequency.value = 1200;
          const damp = ctx.createBiquadFilter();
          damp.type = 'lowpass';
          damp.frequency.value = 4500;
          combMix.connect(ap1);
          ap1.connect(ap2);
          ap2.connect(damp);
          damp.connect(wet);
          wet.connect(out);
          entry.connect(pre);
          entry.connect(dry);
          dry.connect(out);
          nodes.push(pre, combMix, ap1, ap2, damp, wet, dry);
          break;
        }
        case 'chorus': {
          const mix = clamp((num(s.mix, 40)) / 100, 0, 1);
          const rate = clamp(num(s.rate, 1.2), 0.05, 8);
          const depthMs = clamp(num(s.depth, 50), 0, 100);
          const lfo = ctx.createOscillator();
          lfo.type = 'sine';
          lfo.frequency.value = rate;
          const lfoGain = ctx.createGain();
          lfoGain.gain.value = depthMs / 2000;
          const dl = ctx.createDelay(0.1);
          dl.delayTime.value = 0.01;
          lfo.connect(lfoGain);
          lfoGain.connect(dl.delayTime);
          lfo.start();
          const dry = ctx.createGain();
          dry.gain.value = 1 - mix;
          const wet = ctx.createGain();
          wet.gain.value = mix;
          entry.connect(dl);
          dl.connect(wet);
          wet.connect(out);
          entry.connect(dry);
          dry.connect(out);
          nodes.push(lfo, lfoGain, dl, dry, wet);
          break;
        }
        case 'flanger': {
          const rate = clamp(num(s.rate, 0.5), 0.05, 8);
          const depthMs = clamp(num(s.depth, 70), 0, 100);
          const feedback = clamp((num(s.feedback, 50)) / 100, 0, 0.9);
          const lfo = ctx.createOscillator();
          lfo.type = 'sine';
          lfo.frequency.value = rate;
          const lfoGain = ctx.createGain();
          lfoGain.gain.value = depthMs / 2000;
          const dl = ctx.createDelay(0.02);
          dl.delayTime.value = 0.003;
          const fb = ctx.createGain();
          fb.gain.value = feedback;
          lfo.connect(lfoGain);
          lfoGain.connect(dl.delayTime);
          lfo.start();
          entry.connect(dl);
          dl.connect(fb);
          fb.connect(dl);
          dl.connect(out);
          nodes.push(lfo, lfoGain, dl, fb);
          break;
        }
        case 'phaser': {
          const rate = clamp(num(s.rate, 0.8), 0.05, 8);
          const depth = clamp(num(s.depth, 80), 0, 100);
          const lfo = ctx.createOscillator();
          lfo.type = 'sine';
          lfo.frequency.value = rate;
          const lfoGain = ctx.createGain();
          lfoGain.gain.value = depth * 300;
          const base = ctx.createGain();
          base.gain.value = 500 + depth * 10;
          lfo.connect(lfoGain);
          lfo.start();
          let cursor: AudioNode = entry;
          for (let i = 0; i < 6; i++) {
            const ap = ctx.createBiquadFilter();
            ap.type = 'allpass';
            ap.frequency.value = 600;
            cursor.connect(ap);
            lfoGain.connect(ap.frequency);
            base.connect(ap.frequency);
            cursor = ap;
            nodes.push(ap);
          }
          cursor.connect(out);
          nodes.push(lfo, lfoGain, base);
          break;
        }
        case 'tremolo': {
          const rate = clamp(num(s.rate, 4), 0.1, 30);
          const depth = clamp(num(s.depth, 60), 0, 100);
          const g = ctx.createGain();
          g.gain.value = 1 - depth / 200;
          const lfo = ctx.createOscillator();
          lfo.type = (s.shape === 'triangle' ? 'triangle' : s.shape === 'square' ? 'square' : 'sine');
          lfo.frequency.value = rate;
          const lfoGain = ctx.createGain();
          lfoGain.gain.value = depth / 200;
          lfo.connect(lfoGain);
          lfoGain.connect(g.gain);
          lfo.start();
          entry.connect(g);
          g.connect(out);
          nodes.push(g, lfo, lfoGain);
          break;
        }
        case 'imager': {
          const width = clamp((num(s.width, 100)) / 100, 0.2, 3);
          const splitter = ctx.createChannelSplitter(2);
          const merger = ctx.createChannelMerger(2);
          const lAmp = ctx.createGain();
          const rAmp = ctx.createGain();
          const rInv = ctx.createGain();
          rInv.gain.value = -1;
          const mid = ctx.createGain();
          mid.gain.value = 0.5;
          const side = ctx.createGain();
          side.gain.value = 0.5 * width;
          const outL = ctx.createGain();
          const outR = ctx.createGain();
          const sumMid = ctx.createGain();
          const sumSide = ctx.createGain();
          entry.connect(splitter);
          splitter.connect(lAmp, 0);
          splitter.connect(rAmp, 1);
          lAmp.connect(mid);
          rAmp.connect(mid);
          lAmp.connect(rInv);
          rInv.connect(side);
          rAmp.connect(side);
          mid.connect(sumMid);
          side.connect(sumSide);
          sumMid.connect(outL);
          sumSide.connect(outL);
          sumMid.connect(outR);
          sumSide.connect(outR);
          outL.connect(merger, 0, 0);
          outR.connect(merger, 0, 1);
          merger.connect(out);
          nodes.push(splitter, merger, lAmp, rAmp, rInv, mid, side, outL, outR, sumMid, sumSide);
          break;
        }
        default:
          return null;
      }
    } catch (err) {
      console.warn('Master rack module build notice:', mod.type, err);
      try {
        nodes.forEach((n) => { try { n.disconnect(); } catch { /* ignore */ } });
      } catch { /* ignore */ }
      return null;
    }

    return { node: out, nodes };
  }

  setLoopEnabled(enabled: boolean) {
    this.loopEnabled = enabled;
  }

  getLoopEnabled() {
    return this.loopEnabled;
  }

  stop() {
    this.isPlaying = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    if (this.restoreTimer) {
      clearTimeout(this.restoreTimer);
      this.restoreTimer = null;
    }
    const now = this.context.currentTime;
    // Fast 8ms anti-click fade out on master gain before stopping active sources
    try {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(0, now + 0.008);
    } catch (e) {}

    const sourcesToStop = [...this.activeSources];
    this.activeSources = [];
    // Release MPC choke groups (their sources are all being stopped here)
    this.chokeGroups.clear();

    this.restoreTimer = setTimeout(() => {
      for (const source of sourcesToStop) {
        try {
          source.stop();
        } catch (e) {
          // Source might have already stopped or not started
        }
      }
      try {
        this.masterGain.gain.cancelScheduledValues(this.context.currentTime);
        this.masterGain.gain.setValueAtTime(1.0, this.context.currentTime);
      } catch (e) {}
      this.restoreTimer = null;
    }, 12);
  }

  getContext() {
    return this.context;
  }

  getAnalyser() {
    return this.analyserNode;
  }

  getIsPlaying() {
    return this.isPlaying;
  }

  getPlaybackProgress() {
    if (!this.isPlaying) return 0;
    const elapsed = this.context.currentTime - this.playbackStartTime;
    return Math.min(1, Math.max(0, elapsed / (this.currentDuration || 2)));
  }

  resume() {
    if (this.context.state === 'suspended') {
      this.context.resume().catch(() => { /* autoplay policy — ignore */ });
    }
  }

  async playLayer(layer: SoundLayer, duration?: number) {
    this.stop();
    if (!layer.enabled) return;
    this.resume();

    const now = this.context.currentTime;
    this.playbackStartTime = now;

    const env = layer.envelope;
    let playDur = duration || 2;
    if (layer.type === 'sample' && layer.audioBuffer) {
      const bufferDur = layer.audioBuffer.duration;
      const startPct = layer.playStartPct ?? 0;
      const endPct = layer.playEndPct ?? 1;
      playDur = Math.max(0.01, (endPct - startPct) * bufferDur);
    } else {
      playDur = duration || 1.5;
    }

    const layerStartTimeOffset = layer.startTimeOffset ?? 0;
    const totalDur = layerStartTimeOffset + playDur + env.release;
    this.currentDuration = totalDur;
    this.isPlaying = true;

    await this.playLayerInstance(layer, now, playDur);

    if (this.loopEnabled) {
      this.loopTimer = setTimeout(() => {
        this.playLayer(layer, duration);
      }, totalDur * 1000);
    } else {
      this.loopTimer = setTimeout(() => {
        if (this.context.currentTime >= this.playbackStartTime + this.currentDuration) {
          this.isPlaying = false;
        }
      }, (this.currentDuration + 0.1) * 1000);
    }
  }

  /**
   * Trigger a single layer one-shot WITHOUT stopping other layers.
   * Used by the sequencer / MPC pads so drums and notes can layer on the same
   * step. Unlike `playLayer`, this does not touch the transport state
   * (isPlaying/loop/stop), so many triggers can be in flight at once.
   *
   * @param chokeKey when provided, stops any in-flight triggers that share the
   *   same key first (MPC choke/mute groups, e.g. open + closed hi-hat).
   */
  triggerLayer(layer: SoundLayer, duration?: number, chokeKey?: string): void {
    if (!layer || !layer.enabled || layer.muted === true) return;
    this.resume();
    const now = this.context.currentTime;
    const env = layer.envelope || DEFAULT_ENVELOPE;
    let playDur = duration || 1.5;
    if (layer.type === 'sample' && layer.audioBuffer) {
      const bufferDur = layer.audioBuffer.duration;
      const startPct = layer.playStartPct ?? 0;
      const endPct = layer.playEndPct ?? 1;
      playDur = Math.max(0.01, (endPct - startPct) * bufferDur);
    } else if (layer.type === 'sample') {
      return; // sample layer with no buffer can't play
    }
    if (chokeKey) {
      const group = this.chokeGroups.get(chokeKey);
      if (group) {
        group.forEach((n) => {
          try {
            if (typeof (n as any).stop === 'function') (n as any).stop();
            n.disconnect();
          } catch { /* ignore */ }
        });
        group.clear();
      }
    }
    // Snapshot the source count before the chain builds: createNodeChain pushes
    // extra nodes (LFOs, aux oscillators, noise sources) into `activeSources`
    // that never self-remove, so we must release them when this trigger ends —
    // otherwise every pad hit / step leaks entries into `activeSources`.
    const preCount = this.activeSources.length;
    this.playLayerInstance(layer, now, playDur).then((source) => {
      const newNodes = this.activeSources.slice(preCount);
      const release = () => {
        for (const n of newNodes) {
          const idx = this.activeSources.indexOf(n);
          if (idx >= 0) this.activeSources.splice(idx, 1);
        }
        source?.removeEventListener('ended', release);
      };
      if (source) {
        source.addEventListener('ended', release);
        if (chokeKey) {
          let group = this.chokeGroups.get(chokeKey);
          if (!group) {
            group = new Set();
            this.chokeGroups.set(chokeKey, group);
          }
          group.add(source);
          // Use addEventListener so we don't clobber createNodeChain's own
          // onended cleanup of `activeSources`.
          const onEnded = () => {
            group?.delete(source);
            if (group && group.size === 0) this.chokeGroups.delete(chokeKey);
          };
          source.addEventListener('ended', onEnded);
        }
      } else {
        release();
      }
    }).catch(() => {
      // Ignore — never let a single trigger break sequencing.
    });
  }

  async playAll(layers: SoundLayer[]) {
    this.stop();
    this.resume();
    
    const now = this.context.currentTime;
    this.playbackStartTime = now;
    
    let maxDur = 0.5;
    const audibleLayers = layers.filter(layer => isLayerAudibleInMix(layer, layers));

    for (const layer of audibleLayers) {
      const env = layer.envelope;
      let playDur = 2;
      if (layer.type === 'sample' && layer.audioBuffer) {
        const bufferDur = layer.audioBuffer.duration;
        const startPct = layer.playStartPct ?? 0;
        const endPct = layer.playEndPct ?? 1;
        playDur = Math.max(0.01, (endPct - startPct) * bufferDur);
      } else {
        playDur = 1.5;
      }

      const layerStartTimeOffset = layer.startTimeOffset ?? 0;
      const layerDuration = layerStartTimeOffset + playDur + env.release;
      if (layerDuration > maxDur) {
        maxDur = layerDuration;
      }

      this.playLayerInstance(layer, now, playDur).catch(() => {
        // Never let a single layer's chain failure break the mix.
      });
    }

    this.currentDuration = maxDur;
    this.isPlaying = true;

    if (this.loopEnabled) {
      this.loopTimer = setTimeout(() => {
        this.playAll(layers);
      }, maxDur * 1000);
    } else {
      this.loopTimer = setTimeout(() => {
        this.isPlaying = false;
      }, (maxDur + 0.1) * 1000);
    }
  }

  private async playLayerInstance(layer: SoundLayer, baseStartTime: number, playDur: number): Promise<AudioScheduledSourceNode | null> {
    const triggerTime = baseStartTime + (layer.startTimeOffset ?? 0);
    const env = layer.envelope || DEFAULT_ENVELOPE;
    const safeRelease = Math.max(0.005, env.release ?? 0.1);
    
    const { source } = await this.createNodeChain(this.context, layer, baseStartTime, this.masterGain);

    let startOffset = 0;
    if (layer.type === 'sample' && layer.audioBuffer) {
      startOffset = (layer.playStartPct ?? 0) * layer.audioBuffer.duration;
    }

    if (source instanceof AudioBufferSourceNode) {
      // Do not pass 3rd duration arg so source plays cleanly through release phase without truncation clicks
      source.start(triggerTime, startOffset);
      source.stop(triggerTime + playDur + safeRelease + 0.005);
    } else if (source instanceof OscillatorNode) {
      source.start(triggerTime);
      source.stop(triggerTime + playDur + safeRelease + 0.005);
    }
    return source;
  }

  async exportWav(layers: SoundLayer[], duration: number = 2): Promise<AudioBuffer> {
    let maxDuration = duration;
    for (const layer of layers) {
      if (isLayerAudibleInMix(layer, layers)) {
        let playDur = 1.5;
        if (layer.type === 'sample' && layer.audioBuffer) {
          const bufferDur = layer.audioBuffer.duration;
          const startPct = layer.playStartPct ?? 0;
          const endPct = layer.playEndPct ?? 1;
          playDur = Math.max(0.01, (endPct - startPct) * bufferDur);
        }
        const layerDur = (layer.startTimeOffset ?? 0) + playDur + (layer.envelope?.release || 0.5);
        if (layerDur > maxDuration) {
          maxDuration = layerDur;
        }
      }
    }

    const offlineCtx = new OfflineAudioContext(2, Math.ceil(44100 * (maxDuration + 0.5)), 44100);
    const masterOffline = offlineCtx.createGain();
    // Render through the master rack first (same modules as the live rack) so
    // offline exports match what the user hears, then the fixed master chain.
    let rackOut: AudioNode = masterOffline;
    if (this.lastRackModules.length) {
      let cursor: AudioNode = masterOffline;
      for (const mod of this.lastRackModules) {
        if (!mod || mod.enabled === false) continue;
        const built = this.buildMasterRackModule(offlineCtx, mod);
        if (!built) continue;
        try { cursor.connect(built.node); } catch { continue; }
        cursor = built.node;
      }
      rackOut = cursor;
    }
    this.createMasterFXChain(offlineCtx, rackOut, offlineCtx.destination);

    for (const layer of layers) {
      if (!isLayerAudibleInMix(layer, layers)) continue;
      const { source } = await this.createNodeChain(offlineCtx, layer, 0, masterOffline);
      
      let playDur = 1.5;
      let startOffset = 0;
      if (layer.type === 'sample' && layer.audioBuffer) {
        const bufferDur = layer.audioBuffer.duration;
        startOffset = (layer.playStartPct ?? 0) * bufferDur;
        playDur = Math.max(0.01, ((layer.playEndPct ?? 1) - (layer.playStartPct ?? 0)) * bufferDur);
      }
      
      const triggerTime = layer.startTimeOffset ?? 0;
      const env = layer.envelope || DEFAULT_ENVELOPE;
      const safeRelease = Math.max(0.005, env.release ?? 0.1);

      if (source instanceof AudioBufferSourceNode) {
        source.start(triggerTime, startOffset);
        source.stop(triggerTime + playDur + safeRelease + 0.005);
      } else if (source instanceof OscillatorNode) {
        source.start(triggerTime);
        source.stop(triggerTime + playDur + safeRelease + 0.005);
      }
    }

    const rendered = await offlineCtx.startRendering();
    
    // Apply 5ms anti-click micro fades at the extreme ends of exported WAV
    const fadeLen = Math.floor(0.005 * rendered.sampleRate);
    for (let c = 0; c < rendered.numberOfChannels; c++) {
      const data = rendered.getChannelData(c);
      for (let i = 0; i < Math.min(fadeLen, data.length); i++) {
        data[i] *= (i / fadeLen);
      }
      for (let i = 0; i < Math.min(fadeLen, data.length); i++) {
        const idx = data.length - 1 - i;
        data[idx] *= (i / fadeLen);
      }
    }
    
    // Normalize exported buffer to -0.3dB peak
    let maxVal = 0;
    for (let c = 0; c < rendered.numberOfChannels; c++) {
      const data = rendered.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > maxVal) maxVal = abs;
      }
    }

    if (maxVal > 0) {
      const gain = 0.96 / maxVal;
      for (let c = 0; c < rendered.numberOfChannels; c++) {
        const data = rendered.getChannelData(c);
        for (let i = 0; i < data.length; i++) {
          data[i] *= gain;
        }
      }
    }

    return rendered;
  }

  private async createNodeChain(ctx: BaseAudioContext, layer: SoundLayer, startTime: number, destination: AudioNode) {
    const layerStartTime = startTime + (layer.startTimeOffset ?? 0);
    
    let playDur = 1.5;
    if (layer.type === 'sample' && layer.audioBuffer) {
      const startPct = layer.playStartPct ?? 0;
      const endPct = layer.playEndPct ?? 1;
      playDur = Math.max(0.01, (endPct - startPct) * layer.audioBuffer.duration);
    }

    let source: any;
    const gainNode = ctx.createGain();
    const panNode = ctx.createStereoPanner();
    const filter = ctx.createBiquadFilter();
    const dist = ctx.createWaveShaper();
    const compressor = ctx.createDynamicsCompressor();
    const delay = ctx.createDelay();
    const feedback = ctx.createGain();

    // Source setup
    if (layer.type === 'sample') {
      const s = ctx.createBufferSource();
      if (layer.audioBuffer) {
        if (layer.sampleReverse) {
          // Use WeakMap cache for reversed buffers to prevent O(N) memory churn and allocations
          const original = layer.audioBuffer;
          let revBuffer = this.reversedBufferCache.get(original);
          if (!revBuffer) {
            try {
              revBuffer = ctx.createBuffer(
                original.numberOfChannels,
                original.length,
                original.sampleRate
              );
              for (let c = 0; c < original.numberOfChannels; c++) {
                const oData = original.getChannelData(c);
                const rData = revBuffer.getChannelData(c);
                for (let i = 0; i < oData.length; i++) {
                  rData[i] = oData[oData.length - 1 - i];
                }
              }
              this.reversedBufferCache.set(original, revBuffer);
            } catch (e) {
              console.error('Failed to reverse buffer, using standard', e);
              revBuffer = original;
            }
          }
          s.buffer = revBuffer;
        } else {
          s.buffer = layer.audioBuffer;
        }
      } else {
        // Silent buffer if no audio sample loaded yet
        s.buffer = ctx.createBuffer(1, Math.floor(44100 * 0.1), 44100);
      }

      // Playback speed and transposition
      const basePitch = layer.pitch || 0;
      const coarsePitch = layer.samplePitchCoarse || 0;
      const finePitch = (layer.samplePitchFine || 0) / 100;
      const totalPitchShift = basePitch + coarsePitch + finePitch;
      const speedMultiplier = layer.sampleSpeed !== undefined ? layer.sampleSpeed : 1.0;
      
      s.playbackRate.value = safeAudioValue(speedMultiplier * Math.pow(2, totalPitchShift / 12), 1);
      
      // Looping
      if (layer.sampleLoop) {
        s.loop = true;
        if (s.buffer) {
          s.loopStart = (layer.playStartPct ?? 0) * s.buffer.duration;
          s.loopEnd = (layer.playEndPct ?? 1) * s.buffer.duration;
        }
      }

      // Upgrade 11: Continuous Wow & Flutter micro-LFO drift tape emulator
      const driftLfo1 = ctx.createOscillator();
      driftLfo1.type = 'sine';
      driftLfo1.frequency.setValueAtTime(0.25 + Math.random() * 0.1, layerStartTime); // Wow (slow pitch drift)
      
      const driftLfo2 = ctx.createOscillator();
      driftLfo2.type = 'triangle';
      driftLfo2.frequency.setValueAtTime(4.2 + Math.random() * 1.5, layerStartTime); // Flutter (fast tape jitter)
      
      const driftGain1 = ctx.createGain();
      driftGain1.gain.setValueAtTime(0.0012, layerStartTime); // ~1.5 cents drift
      
      const driftGain2 = ctx.createGain();
      driftGain2.gain.setValueAtTime(0.0006, layerStartTime); // ~0.7 cents jitter
      
      driftLfo1.connect(driftGain1);
      driftLfo2.connect(driftGain2);
      
      driftGain1.connect(s.playbackRate);
      driftGain2.connect(s.playbackRate);
      
      const env = layer.envelope || DEFAULT_ENVELOPE;
      const safeRelease = Math.max(0.005, env.release ?? 0.1);
      const lfoStopTime = layerStartTime + playDur + safeRelease + 0.1;

      driftLfo1.start(layerStartTime);
      driftLfo2.start(layerStartTime);
      driftLfo1.stop(lfoStopTime);
      driftLfo2.stop(lfoStopTime);
      
      if (ctx === this.context) {
        this.activeSources.push(driftLfo1);
        this.activeSources.push(driftLfo2);
      }
      
      source = s;
    } else {
      const s = ctx.createBufferSource();
      if (layer.audioBuffer) {
        s.buffer = layer.audioBuffer;
      } else {
        const settings = {
          ...DEFAULT_SYNTH,
          ...(layer.synth || {}),
          oscType: layer.synth?.oscType || 'sine',
          frequency: layer.synth?.frequency || 440,
          subLevel: layer.synth?.subLevel ?? 0,
        };
        s.buffer = generateChaosSynthBuffer(ctx, settings, playDur);
      }
      s.playbackRate.value = safeAudioValue(Math.pow(2, (layer.pitch || 0) / 12), 1);
      source = s;
    }

    if (ctx === this.context) {
      this.activeSources.push(source);
      source.onended = () => {
        const index = this.activeSources.indexOf(source);
        if (index > -1) {
          this.activeSources.splice(index, 1);
        }
      };
    }

    // Amplitude Envelope & FX/Synth fallbacks
    const env = layer.envelope || DEFAULT_ENVELOPE;
    const fx = layer.fx || DEFAULT_FX;
    const synth = layer.synth || DEFAULT_SYNTH;

    const safeAttack = Math.max(0.005, env.attack ?? 0.005);
    const safeDecay = Math.max(0.005, env.decay ?? 0.1);
    const safeRelease = Math.max(0.005, env.release ?? 0.1);
    const peakGain = Math.max(0, layer.gain);
    const sustainGain = Math.max(0, peakGain * (env.sustain ?? 0.8));

    gainNode.gain.cancelScheduledValues(layerStartTime);
    gainNode.gain.setValueAtTime(0, layerStartTime);

    const relStart = layerStartTime + playDur;
    const attackEnd = layerStartTime + safeAttack;
    const decayEnd = attackEnd + safeDecay;

    if (playDur <= safeAttack) {
      const peakVal = peakGain * (playDur / safeAttack);
      gainNode.gain.linearRampToValueAtTime(peakVal, relStart);
      gainNode.gain.linearRampToValueAtTime(0, relStart + safeRelease);
    } else if (playDur <= safeAttack + safeDecay) {
      const decayProgress = (playDur - safeAttack) / safeDecay;
      const midVal = peakGain - (peakGain - sustainGain) * decayProgress;
      gainNode.gain.linearRampToValueAtTime(peakGain, attackEnd);
      gainNode.gain.linearRampToValueAtTime(midVal, relStart);
      gainNode.gain.linearRampToValueAtTime(0, relStart + safeRelease);
    } else {
      gainNode.gain.linearRampToValueAtTime(peakGain, attackEnd);
      gainNode.gain.linearRampToValueAtTime(sustainGain, decayEnd);
      gainNode.gain.setValueAtTime(sustainGain, relStart);
      gainNode.gain.linearRampToValueAtTime(0, relStart + safeRelease);
    }

    // FX: Bitcrush & Distortion chaining
    let nodePipeline: AudioNode = source;

    if (layer.polarityInvert) {
      const polarityNode = ctx.createGain();
      polarityNode.gain.value = -1;
      nodePipeline.connect(polarityNode);
      nodePipeline = polarityNode;
    }

    // Producer Upgrade 5: Layer Phase Angle Alignment (0-360 degrees)
    if (layer.phaseAngle && layer.phaseAngle > 0) {
      const phaseDelayNode = ctx.createDelay(0.1);
      // Phase delay shift based on low-frequency wavelength (100Hz base sub period = 10ms)
      const phaseSec = (layer.phaseAngle / 360) * 0.01;
      phaseDelayNode.delayTime.value = safeAudioValue(phaseSec, 0);
      nodePipeline.connect(phaseDelayNode);
      nodePipeline = phaseDelayNode;
    }

    // Producer Upgrade 2: Transient Shaper & Attack Punch Engine
    const transientAttackPct = (layer.fx.transientAttack ?? 0) + (layer.macroPunch ?? 0) * 0.8;
    const transientSustainPct = layer.fx.transientSustain ?? 0;
    if ((transientAttackPct !== 0 || transientSustainPct !== 0) && layer.fx.transientEnabled !== false) {
      const tShaperGain = ctx.createGain();
      const attackMult = Math.max(0.1, 1 + (transientAttackPct / 100) * 1.5);
      const sustainMult = Math.max(0.1, 1 + (transientSustainPct / 100) * 0.8);

      tShaperGain.gain.setValueAtTime(attackMult, layerStartTime);
      tShaperGain.gain.exponentialRampToValueAtTime(sustainMult, layerStartTime + 0.025);
      nodePipeline.connect(tShaperGain);
      nodePipeline = tShaperGain;
    }

    // Upgrade 10: Crispy Harmonic Transient Exciter strictly on drum attack transients
    if (transientAttackPct > 0 && layer.fx.transientEnabled !== false) {
      const exciterHighpass = ctx.createBiquadFilter();
      exciterHighpass.type = 'highpass';
      exciterHighpass.frequency.setValueAtTime(3800, layerStartTime);
      
      const exciterShaper = ctx.createWaveShaper();
      exciterShaper.curve = this.makeDistortionCurve(0.45);
      
      const exciterEnv = ctx.createGain();
      // Attack transient envelope: open for 15ms, then close
      exciterEnv.gain.setValueAtTime(0, layerStartTime);
      const exciterGainVal = (transientAttackPct / 100) * 0.35; // scale factor
      exciterEnv.gain.linearRampToValueAtTime(exciterGainVal, layerStartTime + 0.003);
      exciterEnv.gain.exponentialRampToValueAtTime(0.0001, layerStartTime + 0.015);
      
      nodePipeline.connect(exciterHighpass);
      exciterHighpass.connect(exciterShaper);
      exciterShaper.connect(exciterEnv);
      
      // Re-sum the excited transient path back to the main signal pipeline
      const sumNode = ctx.createGain();
      nodePipeline.connect(sumNode);
      exciterEnv.connect(sumNode);
      nodePipeline = sumNode;
    }

    if (layer.chaosMode) {
      // BUILD A CHAOS-DRIVEN SOUND DESIGN MODE
      // intentionally breaks reality

      // 1. Unstable feedback networks
      const feedbackGain = ctx.createGain();
      const feedbackDelay = ctx.createDelay(0.5);
      feedbackDelay.delayTime.value = safeAudioValue(0.001 + Math.random() * 0.05, 0.01);
      feedbackGain.gain.value = safeAudioValue(0.5 + Math.random() * 0.45, 0.5); // Close to oscillation
      
      let feedbackTarget = nodePipeline;
      if (nodePipeline.numberOfInputs === 0) {
        const passGain = ctx.createGain();
        nodePipeline.connect(passGain);
        nodePipeline = passGain;
        feedbackTarget = passGain;
      }

      nodePipeline.connect(feedbackDelay);
      feedbackDelay.connect(feedbackGain);
      feedbackGain.connect(feedbackTarget); // Feedback loop safely connected
      
      // 2. Spectral foldback
      const spectralFold = ctx.createWaveShaper();
      spectralFold.curve = this.makeSpectralFoldCurve(2 + Math.random() * 8);
      nodePipeline.connect(spectralFold);
      nodePipeline = spectralFold;

      // 3. Aliasing boost
      const aliasing = ctx.createWaveShaper();
      aliasing.curve = this.makeAliasingCurve(0.5 + Math.random() * 0.5);
      nodePipeline.connect(aliasing);
      nodePipeline = aliasing;

      // 4. Probability-driven modulation (LFO with random rate)
      const probLFO = ctx.createOscillator();
      probLFO.type = 'sawtooth';
      probLFO.frequency.value = safeAudioValue(0.1 + Math.random() * 20, 1);
      const probGain = ctx.createGain();
      probGain.gain.value = safeAudioValue(0.1 + Math.random() * 0.5, 0.25);
      probLFO.connect(probGain);
      
      const panner = ctx.createStereoPanner();
      probGain.connect(panner.pan);
      nodePipeline.connect(panner);
      nodePipeline = panner;

      probLFO.start(layerStartTime);
      if (ctx === this.context) this.activeSources.push(probLFO);
    }

    if (this.bypassFX) {
      nodePipeline.connect(panNode);
      panNode.pan.setValueAtTime(layer.pan, layerStartTime);
      panNode.connect(gainNode);
      gainNode.connect(destination);
      return { source, gainNode };
    }

    if (layer.fx.bitcrush > 0 && layer.fx.bitcrushEnabled !== false) {
      const bitcrushNode = ctx.createWaveShaper();
      bitcrushNode.curve = this.makeBitcrushCurve(layer.fx.bitcrush);
      nodePipeline.connect(bitcrushNode);
      nodePipeline = bitcrushNode;
    }

    if (layer.fx.distortion > 0 && layer.fx.distortionEnabled !== false) {
      dist.curve = this.makeDistortionCurve(layer.fx.distortion, layer.fx.harmonic2nd || 0, layer.fx.harmonic3rd || 0, layer.fx.distortionType || 'tube');
      nodePipeline.connect(dist);
      nodePipeline = dist;
    }

    // Producer Upgrade 3: Filter Keytracking & Tube Drive (Upgraded to 24dB/oct Moog Ladder Cascade)
    if (layer.fx.filterEnabled !== false) {
      filter.type = layer.fx.filterType;
      
      // Calculate keytracking frequency offset based on pitch semitones
      let cutoff = layer.fx.filterFreq;
      const keyTrackingPct = layer.fx.keyTracking ?? 0;
      if (keyTrackingPct > 0 && layer.pitch) {
        const pitchMultiplier = Math.pow(2, (layer.pitch * (keyTrackingPct / 100)) / 12);
        cutoff = Math.min(22000, Math.max(20, cutoff * pitchMultiplier));
      }

      // Create secondary cascaded filter stage for steep 24dB/oct slope
      const filterStage2 = ctx.createBiquadFilter();
      filterStage2.type = layer.fx.filterType;
      
      filter.frequency.setValueAtTime(safeAudioValue(cutoff, 20000), layerStartTime);
      filter.Q.setValueAtTime(safeAudioValue(layer.fx.filterRes, 1), layerStartTime);
      
      filterStage2.frequency.setValueAtTime(safeAudioValue(cutoff, 20000), layerStartTime);
      filterStage2.Q.setValueAtTime(safeAudioValue(layer.fx.filterRes, 1), layerStartTime);

      nodePipeline.connect(filter);

      // Filter Drive (analog tube saturation curve) sandwiched between stages
      const driveVal = (layer.fx.filterDrive ?? 0) + (layer.macroGrit ?? 0) * 0.5;
      if (driveVal > 0) {
        const driveShaper = ctx.createWaveShaper();
        driveShaper.curve = this.makeDistortionCurve(driveVal * 0.25);
        filter.connect(driveShaper);
        driveShaper.connect(filterStage2);
        nodePipeline = filterStage2;
      } else {
        filter.connect(filterStage2);
        nodePipeline = filterStage2;
      }

      // Secondary Filter 2 (Dual Filter Cascade)
      if (layer.fx.filter2Enabled && layer.fx.filter2Freq) {
        const filter2 = ctx.createBiquadFilter();
        filter2.type = layer.fx.filter2Type || 'highpass';
        filter2.frequency.setValueAtTime(safeAudioValue(layer.fx.filter2Freq, 20000), layerStartTime);
        filter2.Q.setValueAtTime(safeAudioValue(layer.fx.filter2Res ?? 1, 1), layerStartTime);
        nodePipeline.connect(filter2);
        nodePipeline = filter2;
      }

      // Producer Upgrade 4: Advanced LFO Modulation Target Matrix Routing
      let lfoRate = layer.fx.lfoRate ?? 0;
      const lfoDepth = layer.fx.lfoDepth ?? 0;

      // Calculate tempo sync LFO rate if enabled
      if (layer.fx.lfoSync && layer.fx.lfoDivision) {
        const bpm = 120; // Default BPM baseline
        const divMap: Record<string, number> = {
          '1/4': (bpm / 60),
          '1/8': (bpm / 60) * 2,
          '1/16': (bpm / 60) * 4,
          '1/32': (bpm / 60) * 8,
          '1/8t': (bpm / 60) * 3,
          '1/16t': (bpm / 60) * 6,
        };
        lfoRate = divMap[layer.fx.lfoDivision] || lfoRate;
      }

      if (lfoRate > 0 && lfoDepth > 0 && layer.fx.lfoEnabled !== false) {
        const lfo = ctx.createOscillator();
        lfo.type = layer.fx.lfoType || 'sine';
        lfo.frequency.setValueAtTime(lfoRate, layerStartTime);

        const lfoGain = ctx.createGain();
        const target = layer.fx.lfoTarget || 'filterFreq';

        if (target === 'filterFreq') {
          lfoGain.gain.setValueAtTime(lfoDepth * Math.min(cutoff * 0.9, 12000), layerStartTime);
          lfo.connect(lfoGain);
          lfoGain.connect(filter.frequency);
        } else if (target === 'pitch' && source instanceof OscillatorNode) {
          lfoGain.gain.setValueAtTime(lfoDepth * 100, layerStartTime); // cents
          lfo.connect(lfoGain);
          lfoGain.connect((source as OscillatorNode).detune);
        } else if (target === 'pan') {
          lfoGain.gain.setValueAtTime(lfoDepth, layerStartTime);
          lfo.connect(lfoGain);
          lfoGain.connect(panNode.pan);
        } else if (target === 'res') {
          lfoGain.gain.setValueAtTime(lfoDepth * 15, layerStartTime);
          lfo.connect(lfoGain);
          lfoGain.connect(filter.Q);
        }

        if (ctx === this.context) {
          this.activeSources.push(lfo);
          lfo.onended = () => {
            const index = this.activeSources.indexOf(lfo);
            if (index > -1) {
              this.activeSources.splice(index, 1);
            }
          };
        }

        lfo.start(layerStartTime);
        lfo.stop(layerStartTime + playDur + env.release);
      }
    }

    // FX: Delay
    if (layer.fx.tapeDelayPreset && layer.fx.delayEnabled !== false && (ctx instanceof AudioContext)) {
      const tapeDsp = new TapeDelayDSP(ctx as AudioContext);
      tapeDsp.applyPreset(layer.fx.tapeDelayPreset);
      nodePipeline.connect(tapeDsp.inputNode);
      tapeDsp.outputNode.connect(panNode);
    } else if (layer.fx.delayTime > 0 && layer.fx.delayFeedback > 0 && layer.fx.delayEnabled !== false) {
      const isPingPong = layer.fx.delayPingPong ?? false;
      const stereoSpread = layer.fx.delayStereoSpread ?? 0; // 0 to 1

      if (isPingPong) {
        // Upgrade: Ping-Pong Delay
        const delayL = ctx.createDelay();
        const delayR = ctx.createDelay();
        const fbL = ctx.createGain();
        const fbR = ctx.createGain();
        const merge = ctx.createChannelMerger(2);

        delayL.delayTime.value = safeAudioValue(layer.fx.delayTime, 0.3);
        // Right delay slightly offset for ping-pong effect
        delayR.delayTime.value = safeAudioValue(layer.fx.delayTime * 1.5, 0.45);
        fbL.gain.value = safeAudioValue(layer.fx.delayFeedback, 0.5);
        fbR.gain.value = safeAudioValue(layer.fx.delayFeedback, 0.5);

        nodePipeline.connect(delayL);
        delayL.connect(fbL);
        fbL.connect(delayR); // cross feedback
        delayR.connect(fbR);
        fbR.connect(delayL); // cross feedback

        delayL.connect(merge, 0, 0);
        delayR.connect(merge, 0, 1);
        merge.connect(panNode);
      } else {
        // Standard Delay with optional Stereo Spread
        delay.delayTime.value = safeAudioValue(layer.fx.delayTime, 0.3);
        feedback.gain.value = safeAudioValue(layer.fx.delayFeedback, 0.5);
        
        nodePipeline.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);

        if (stereoSpread > 0) {
          const spreadPanner = ctx.createStereoPanner();
          // modulate pan with LFO for spread
          const spreadLFO = ctx.createOscillator();
          spreadLFO.frequency.value = 0.5; // slow drift
          const spreadGain = ctx.createGain();
          spreadGain.gain.value = stereoSpread;
          spreadLFO.connect(spreadGain);
          spreadGain.connect(spreadPanner.pan);
          spreadLFO.start(layerStartTime);
          if (ctx === this.context) this.activeSources.push(spreadLFO);
          
          delay.connect(spreadPanner);
          spreadPanner.connect(panNode);
        } else {
          delay.connect(panNode);
        }
      }
    }

    // FX: Chorus (Simple implementation)
    if (layer.fx.chorusMix > 0 && layer.fx.chorusEnabled !== false) {
      const chorusSpread = layer.fx.chorusSpread ?? 0;
      
      // Upgrade: Multi-voice Chorus with Spread
      const voices = chorusSpread > 0 ? 3 : 1;
      const chorusMerger = ctx.createChannelMerger(2);
      const wetGain = ctx.createGain();
      wetGain.gain.value = safeAudioValue(layer.fx.chorusMix / voices, 0.5);

      for(let i=0; i<voices; i++) {
        const chorusDelay = ctx.createDelay();
        chorusDelay.delayTime.value = 0.02 + (i * 0.005);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 1.5 + (i * 0.2); // slight offset
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.002 + (i * 0.0005);
        
        // Quad-phase LFO offsets
        if (i===1) lfoGain.gain.value *= -1; 
        
        lfo.connect(lfoGain);
        lfoGain.connect(chorusDelay.delayTime);

        if (ctx === this.context) {
          this.activeSources.push(lfo);
          lfo.onended = () => {
            const index = this.activeSources.indexOf(lfo);
            if (index > -1) this.activeSources.splice(index, 1);
          };
        }
        lfo.start(layerStartTime);

        nodePipeline.connect(chorusDelay);
        
        if (chorusSpread > 0) {
          const voicePan = ctx.createStereoPanner();
          voicePan.pan.value = (i === 0) ? -chorusSpread : (i === 1) ? chorusSpread : 0;
          chorusDelay.connect(voicePan);
          voicePan.connect(wetGain);
        } else {
          chorusDelay.connect(wetGain);
        }
      }

      wetGain.connect(panNode);
    }

    // Upgrade: Auto-Pan Modulator
    if (layer.fx.autoPanDepth && layer.fx.autoPanDepth > 0 && layer.fx.autoPanRate && layer.fx.autoPanRate > 0) {
      const autoPanLFO = ctx.createOscillator();
      autoPanLFO.type = 'sine';
      autoPanLFO.frequency.value = layer.fx.autoPanRate;
      const autoPanGain = ctx.createGain();
      autoPanGain.gain.value = layer.fx.autoPanDepth;
      
      autoPanLFO.connect(autoPanGain);
      autoPanGain.connect(panNode.pan);
      
      panNode.pan.setValueAtTime(layer.pan, layerStartTime);
      autoPanLFO.start(layerStartTime);
      
      if (ctx === this.context) this.activeSources.push(autoPanLFO);
    } else {
      panNode.pan.setValueAtTime(layer.pan, layerStartTime);
    }

    nodePipeline.connect(panNode);
    panNode.connect(gainNode);

    // FX: Compressor
    if (layer.fx.compressorEnabled !== false) {
      compressor.threshold.setValueAtTime(layer.fx.compressorThreshold, layerStartTime);
      compressor.ratio.setValueAtTime(layer.fx.compressorRatio, layerStartTime);
    } else {
      compressor.threshold.setValueAtTime(0, layerStartTime); // bypass compressor (threshold = 0dB)
      compressor.ratio.setValueAtTime(1, layerStartTime);     // bypass compressor (ratio = 1:1)
    }
    compressor.attack.setValueAtTime(0.003, layerStartTime);
    compressor.release.setValueAtTime(0.25, layerStartTime);
    gainNode.connect(compressor);
    compressor.connect(destination);

    // FX: Unified Reverb (Single high-fidelity spatial & layer Schroeder Moorer diffusion reverb)
    if (layer.fx.reverbMix > 0 && layer.fx.reverbEnabled !== false) {
      const reverbNode = this.createSchroederReverbNode(ctx, compressor, safeAudioValue(layer.fx.reverbMix, 0.35), layerStartTime);
      reverbNode.connect(destination);
    }

    // --- Hybrid Source Fusion (HSF) ---
    if (layer.fx.hsfEnabled && layer.fx.hsfMix > 0) {
      const hsfGain = ctx.createGain();
      hsfGain.gain.value = safeAudioValue(layer.fx.hsfMix, 0.5);
      
      let hsfSource = null;
      const hsfAmount = layer.fx.hsfAmount ?? 0.5;
      
      switch(layer.fx.hsfEngine) {
        case 'noise': {
          const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
          const noiseData = noiseBuffer.getChannelData(0);
          for (let i = 0; i < noiseData.length; i++) {
            noiseData[i] = Math.random() * 2 - 1;
          }
          const noiseSrc = ctx.createBufferSource();
          noiseSrc.buffer = noiseBuffer;
          noiseSrc.loop = true;
          
          const noiseFilter = ctx.createBiquadFilter();
          noiseFilter.type = 'bandpass';
          noiseFilter.frequency.value = 1000 + hsfAmount * 4000;
          noiseFilter.Q.value = 2;
          
          noiseSrc.connect(noiseFilter);
          hsfSource = noiseFilter;
          
          noiseSrc.start(layerStartTime);
          if (ctx === this.context) this.activeSources.push(noiseSrc);
          break;
        }
        case 'additive': {
          const additiveOsc1 = ctx.createOscillator();
          const additiveOsc2 = ctx.createOscillator();
          additiveOsc1.type = 'sine';
          additiveOsc2.type = 'sine';
          let freq = 440;
          if (layer.type === 'synth' && layer.synth) freq = layer.synth.frequency;
          additiveOsc1.frequency.value = freq * 2;
          additiveOsc2.frequency.value = freq * 3;
          
          const addGain1 = ctx.createGain();
          const addGain2 = ctx.createGain();
          addGain1.gain.value = 0.5;
          addGain2.gain.value = 0.25 + hsfAmount * 0.5;
          
          additiveOsc1.connect(addGain1);
          additiveOsc2.connect(addGain2);
          
          const addMix = ctx.createGain();
          addGain1.connect(addMix);
          addGain2.connect(addMix);
          hsfSource = addMix;
          
          additiveOsc1.start(layerStartTime);
          additiveOsc2.start(layerStartTime);
          if (ctx === this.context) {
            this.activeSources.push(additiveOsc1);
            this.activeSources.push(additiveOsc2);
          }
          break;
        }
        case 'fm': {
          const fmCarrier = ctx.createOscillator();
          const fmModulator = ctx.createOscillator();
          const fmModGain = ctx.createGain();
          
          let fmFreq = 440;
          if (layer.type === 'synth' && layer.synth) fmFreq = layer.synth.frequency;
          
          fmCarrier.frequency.value = fmFreq;
          fmModulator.frequency.value = fmFreq * (1 + hsfAmount * 3);
          fmModGain.gain.value = fmFreq * 2 * hsfAmount;
          
          fmModulator.connect(fmModGain);
          fmModGain.connect(fmCarrier.frequency);
          
          hsfSource = fmCarrier;
          fmModulator.start(layerStartTime);
          fmCarrier.start(layerStartTime);
          if (ctx === this.context) {
            this.activeSources.push(fmModulator);
            this.activeSources.push(fmCarrier);
          }
          break;
        }
        case 'resonator': {
          const resDelay = ctx.createDelay(0.1);
          const resFeedback = ctx.createGain();
          let resFreq = 440;
          if (layer.type === 'synth' && layer.synth) resFreq = layer.synth.frequency;
          resDelay.delayTime.value = 1 / (resFreq * (1 + hsfAmount));
          resFeedback.gain.value = 0.95;
          
          nodePipeline.connect(resDelay);
          resDelay.connect(resFeedback);
          resFeedback.connect(resDelay);
          
          const resFilter = ctx.createBiquadFilter();
          resFilter.type = 'bandpass';
          resFilter.frequency.value = resFreq;
          resDelay.connect(resFilter);
          
          hsfSource = resFilter;
          break;
        }
        case 'physical': {
          const stringLen = ctx.sampleRate * 2.0;
          const burstBuffer = ctx.createBuffer(1, stringLen, ctx.sampleRate);
          const bData = burstBuffer.getChannelData(0);
          for(let i=0; i< (ctx.sampleRate * 0.01); i++) {
             bData[i] = Math.random() * 2 - 1;
          }
          const burstSrc = ctx.createBufferSource();
          burstSrc.buffer = burstBuffer;
          
          const ksDelay = ctx.createDelay();
          let ksFreq = 440;
          if (layer.type === 'synth' && layer.synth) ksFreq = layer.synth.frequency;
          ksDelay.delayTime.value = 1 / ksFreq;
          
          const ksFeedback = ctx.createGain();
          ksFeedback.gain.value = 0.98 - hsfAmount * 0.1;
          
          const ksFilter = ctx.createBiquadFilter();
          ksFilter.type = 'lowpass';
          ksFilter.frequency.value = 2000 + hsfAmount * 4000;
          
          burstSrc.connect(ksDelay);
          ksDelay.connect(ksFilter);
          ksFilter.connect(ksFeedback);
          ksFeedback.connect(ksDelay);
          
          hsfSource = ksDelay;
          burstSrc.start(layerStartTime);
          if (ctx === this.context) this.activeSources.push(burstSrc);
          break;
        }
        case 'granular': {
          const granOsc = ctx.createOscillator();
          const granLfo = ctx.createOscillator();
          const granGain = ctx.createGain();
          
          granOsc.type = 'sawtooth';
          let gFreq = 220;
          if (layer.type === 'synth' && layer.synth) gFreq = layer.synth.frequency;
          granOsc.frequency.value = gFreq;
          
          granLfo.type = 'square';
          granLfo.frequency.value = 10 + hsfAmount * 40;
          
          granLfo.connect(granGain.gain);
          granOsc.connect(granGain);
          
          hsfSource = granGain;
          granOsc.start(layerStartTime);
          granLfo.start(layerStartTime);
          if (ctx === this.context) {
            this.activeSources.push(granOsc);
            this.activeSources.push(granLfo);
          }
          break;
        }
      }
      
      if (hsfSource) {
        const hsfEnvGain = ctx.createGain();
        hsfEnvGain.gain.setValueAtTime(0, layerStartTime);
        hsfEnvGain.gain.linearRampToValueAtTime(1, layerStartTime + (env.attack || 0.01));
        const decayTime = layerStartTime + (env.attack || 0.01) + (env.decay || 0.1);
        hsfEnvGain.gain.linearRampToValueAtTime(env.sustain ?? 1, decayTime);
        
        hsfSource.connect(hsfEnvGain);
        hsfEnvGain.connect(hsfGain);
        hsfGain.connect(destination);
      }
    }

    // --- Module 7: Micro-Resonator Swarm (MRS) ---
    if (layer.fx.mrsEnabled && layer.fx.mrsMix > 0) {
      const mrsGain = ctx.createGain();
      mrsGain.gain.value = safeAudioValue(layer.fx.mrsMix, 0.5);
      
      const material = layer.fx.mrsMaterial || 'metal';
      const density = layer.fx.mrsDensity || 0.5;
      const chaos = layer.fx.mrsChaos || 0.5;
      
      const cacheKey = `${material}_${Math.round(density * 10)}`;
      let swarmBuffer = this.swarmBuffers.get(cacheKey);
      
      // We will lazily create swarm buffers, but since we are in a synchronous-looking playback pipeline 
      // for batching, wait... playLayer is synchronous, but batchAudioProcessor is async.
      // We should ideally have swarm buffers pre-generated. 
      // For now, if it's missing, we skip or use a tiny delay. But wait, createSwarmBuffer is async.
      // Let's do a trick: we'll create a delay network if buffer isn't ready, but wait, playLayer doesn't await.
      // Actually, we can use a network of comb filters to simulate the swarm directly if we can't await!
      
      // Let's build a real-time Micro-Resonator Swarm using 8-16 comb filters (delay nodes with feedback)
      const numResonators = 4 + Math.floor(density * 12); // 4 to 16 real-time resonators
      const resMix = ctx.createGain();
      resMix.gain.value = 1.0 / Math.sqrt(numResonators);
      
      const baseFreqMap: Record<string, number> = { metal: 800, glass: 2500, wood: 350, digital: 1200, bio: 200 };
      const baseFreq = baseFreqMap[material] || 800;
      
      for (let i = 0; i < numResonators; i++) {
        const resDelay = ctx.createDelay(0.1);
        const resFeedback = ctx.createGain();
        const resFilter = ctx.createBiquadFilter();
        
        let freq = baseFreq * (0.5 + Math.random() * 2);
        if (material === 'bio') freq = baseFreq * Math.exp(Math.random() * 2);
        else if (material === 'glass') freq = baseFreq * (1 + Math.random() * 3);
        
        // Add chaos modulation to frequency (delay time)
        if (chaos > 0) {
          const driftLFO = ctx.createOscillator();
          driftLFO.type = 'sine';
          driftLFO.frequency.value = 0.1 + Math.random() * 5 * chaos;
          const driftGain = ctx.createGain();
          driftGain.gain.value = (0.001 * chaos) / freq; 
          driftLFO.connect(driftGain);
          driftGain.connect(resDelay.delayTime);
          driftLFO.start(layerStartTime);
          if (ctx === this.context) this.activeSources.push(driftLFO);
        }
        
        resDelay.delayTime.value = 1.0 / freq;
        resFeedback.gain.value = material === 'wood' ? 0.9 : 0.99; 
        
        resFilter.type = 'bandpass';
        resFilter.frequency.value = freq;
        resFilter.Q.value = 5 + chaos * 10;
        
        nodePipeline.connect(resFilter);
        resFilter.connect(resDelay);
        resDelay.connect(resFeedback);
        resFeedback.connect(resDelay);
        resDelay.connect(resMix);
      }
      
      resMix.connect(mrsGain);
      mrsGain.connect(destination);
    }

    // --- Module 8: Texture Injection Layer (TIL) ---
    if (layer.fx.tilEnabled && layer.fx.tilMix > 0) {
      const tilGain = ctx.createGain();
      tilGain.gain.value = safeAudioValue(layer.fx.tilMix, 0.5);
      
      const textureType = layer.fx.tilTexture || 'dust';
      const amount = layer.fx.tilAmount || 0.5;
      
      // Generate procedural texture buffer
      const texLen = ctx.sampleRate * 2.0;
      const texBuffer = ctx.createBuffer(1, texLen, ctx.sampleRate);
      const texData = texBuffer.getChannelData(0);
      
      let brownNoiseState = 0;
      let pinkNoiseState0 = 0, pinkNoiseState1 = 0, pinkNoiseState2 = 0, pinkNoiseState3 = 0, pinkNoiseState4 = 0, pinkNoiseState5 = 0;

      for (let i = 0; i < texLen; i++) {
        if (textureType === 'dust') {
          texData[i] = Math.random() > 0.99 - (amount * 0.05) ? (Math.random() * 2 - 1) : 0;
        } else if (textureType === 'static') {
          texData[i] = (Math.random() * 2 - 1) * amount;
        } else if (textureType === 'grit') {
          texData[i] = Math.random() > 0.8 ? (Math.random() * 2 - 1) * amount : 0;
        } else if (textureType === 'glitch') {
          texData[i] = (i % Math.floor(100 + Math.random() * 1000)) < 10 ? (Math.random() * 2 - 1) * amount : 0;
        } else if (textureType === 'crackle') {
          texData[i] = Math.random() > 0.995 - (amount * 0.01) ? (Math.random() * 2 - 1) : 0;
        } else if (textureType === 'plasma') {
          texData[i] = Math.tanh(Math.sin(i * 0.01) * 10 * amount * (Math.random() * 2 - 1));
        } else if (textureType === 'ticks') {
          texData[i] = Math.random() > 0.999 - (amount * 0.005) ? (Math.random() * 2 - 1) : 0;
        } else if (textureType === 'rustle') {
          texData[i] = (Math.random() * 2 - 1) * Math.sin(i * 0.005 * amount);
        } else if (textureType === 'brown') {
          const white = Math.random() * 2 - 1;
          brownNoiseState = (brownNoiseState + (0.02 * white)) / 1.02;
          texData[i] = brownNoiseState * 3.5;
        } else if (textureType === 'pink') {
          const white = Math.random() * 2 - 1;
          pinkNoiseState0 = 0.99886 * pinkNoiseState0 + white * 0.0555179;
          pinkNoiseState1 = 0.99332 * pinkNoiseState1 + white * 0.0750759;
          pinkNoiseState2 = 0.96900 * pinkNoiseState2 + white * 0.1538520;
          pinkNoiseState3 = 0.86650 * pinkNoiseState3 + white * 0.3104856;
          pinkNoiseState4 = 0.55000 * pinkNoiseState4 + white * 0.5329522;
          pinkNoiseState5 = -0.7616 * pinkNoiseState5 - white * 0.0168980;
          texData[i] = (pinkNoiseState0 + pinkNoiseState1 + pinkNoiseState2 + pinkNoiseState3 + pinkNoiseState4 + pinkNoiseState5 + white * 0.5362) * 0.11;
        } else {
          texData[i] = 0;
        }
      }
      
      const texSrc = ctx.createBufferSource();
      texSrc.buffer = texBuffer;
      texSrc.loop = true;
      
      // Envelope it using the layer's amplitude envelope so it follows the hit
      const texEnv = ctx.createGain();
      texEnv.gain.setValueAtTime(0, layerStartTime);
      texEnv.gain.linearRampToValueAtTime(1, layerStartTime + (env.attack || 0.01));
      const decayTime = layerStartTime + (env.attack || 0.01) + (env.decay || 0.1);
      texEnv.gain.linearRampToValueAtTime(env.sustain ?? 1, decayTime);
      
      texSrc.connect(texEnv);
      
      // Add a spectral tilt / filter to the texture
      const texFilter = ctx.createBiquadFilter();
      if (['dust', 'crackle', 'rustle'].includes(textureType)) {
        texFilter.type = 'lowpass';
        texFilter.frequency.value = 4000 + amount * 4000;
      } else {
        texFilter.type = 'highpass';
        texFilter.frequency.value = 1000 + amount * 2000;
      }
      
      texEnv.connect(texFilter);
      texFilter.connect(tilGain);
      tilGain.connect(destination);
      
      texSrc.start(layerStartTime);
      if (ctx === this.context) this.activeSources.push(texSrc);
    }

    // --- SubLab Style 808 Designer Module ---
    if (layer.subDesign?.subEnabled) {
      const sub = layer.subDesign;
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      const subSaturation = ctx.createWaveShaper();
      
      // Pitch tracking logic
      let subFreq = 60; // Default C1-ish
      if (sub.dynamicTracking && layer.type === 'sample' && layer.analysis?.peakDb) {
        // Simple fallback freq if we don't have true pitch detection yet
        subFreq = 55; // A1
      }
      
      const desiredPhase = sub.phase || layer.phaseAngle || 0;
      if (desiredPhase > 0) {
        // Create custom periodic wave for phase offset
        const phaseRad = (desiredPhase / 180) * Math.PI;
        // Approximation: generate 32 harmonics for the desired subType with phase shift
        const real = new Float32Array(33);
        const imag = new Float32Array(33);
        real[0] = 0; imag[0] = 0;
        
        for (let i = 1; i <= 32; i++) {
          let amp = 0;
          if (sub.subType === 'sine') {
            amp = i === 1 ? 1 : 0;
          } else if (sub.subType === 'square') {
            amp = (i % 2 === 1) ? (4 / (Math.PI * i)) : 0;
          } else if (sub.subType === 'triangle') {
            amp = (i % 2 === 1) ? (8 / Math.pow(Math.PI * i, 2)) * (i % 4 === 1 ? 1 : -1) : 0;
          }
          
          if (amp !== 0) {
            // Apply phase shift for this harmonic
            const shiftedPhase = phaseRad * i;
            real[i] = amp * Math.sin(shiftedPhase);
            imag[i] = amp * Math.cos(shiftedPhase);
          }
        }
        
        // normalize
        const pWave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
        subOsc.setPeriodicWave(pWave);
      } else {
        subOsc.type = sub.subType;
      }
      
      subOsc.frequency.setValueAtTime(subFreq, layerStartTime);
      
      // X-Sub layer (one octave below)
      if (sub.xSubMix > 0) {
        const xSub = ctx.createOscillator();
        const xSubGain = ctx.createGain();
        xSub.type = 'sine';
        xSub.frequency.setValueAtTime(subFreq / 2, layerStartTime);
        xSubGain.gain.setValueAtTime(0, layerStartTime);
        xSubGain.gain.linearRampToValueAtTime(sub.xSubMix * 0.5, layerStartTime + 0.008);
        xSub.connect(xSubGain);
        xSubGain.connect(subGain);
        xSub.start(layerStartTime);
        xSub.stop(layerStartTime + playDur + env.release);
        if (ctx === this.context) this.activeSources.push(xSub);
      }

      // Harmonic Saturation
      if (sub.harmonicSaturation > 0) {
        subSaturation.curve = this.makeDistortionCurve(sub.harmonicSaturation * 0.5, sub.harmonic2nd || 0, sub.harmonic3rd || 0);
        subGain.connect(subSaturation);
        subSaturation.connect(destination);
      } else {
        subGain.connect(destination);
      }

      // Drive / Gain with anti-click 8ms attack ramp
      const driveGain = 1.0 + (sub.drive * 2);
      const safeSubAttack = 0.008; // 8ms anti-click attack for sub 808 transients
      subGain.gain.setValueAtTime(0, layerStartTime);
      subGain.gain.linearRampToValueAtTime(sub.subLevel * driveGain, layerStartTime + safeSubAttack);
      subGain.gain.linearRampToValueAtTime(0, layerStartTime + playDur + env.release);

      subOsc.start(layerStartTime);
      subOsc.stop(layerStartTime + playDur + env.release);
      subOsc.connect(subGain);
      
      if (ctx === this.context) this.activeSources.push(subOsc);
    }

    return { source, gainNode: compressor };
  }

  private makeBitcrushCurve(amount: number) {
    const steps = Math.max(2, Math.floor(Math.pow(2, 16 * (1 - amount * 0.75))));
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = Math.round(x * steps) / steps;
    }
    return curve;
  }

  private makeSpectralFoldCurve(amount: number) {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = Math.sin(x * Math.PI * amount);
    }
    return curve;
  }

  private makeAliasingCurve(amount: number) {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      const steps = 4 + Math.floor((1 - amount) * 20);
      curve[i] = Math.floor(x * steps) / steps;
    }
    return curve;
  }

  private makeDistortionCurve(amount: number, harmonic2nd: number = 0, harmonic3rd: number = 0, type: string = 'tube') {
    const k = amount * 100;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    
    const h2 = harmonic2nd / 100;
    const h3 = harmonic3rd / 100;

    for (let i = 0; i < n_samples; ++i) {
      let x = (i * 2) / n_samples - 1;
      let out = x;

      if (type === 'clip') {
        const threshold = 1.0 - amount * 0.9;
        if (x > threshold) out = threshold;
        else if (x < -threshold) out = -threshold;
        else out = x;
        out *= (1 + amount * 3);
      } else if (type === 'tape') {
        const drive = amount * 4;
        out = Math.atan(x * Math.PI * (1 + drive)) / Math.PI;
      } else if (type === 'fuzz') {
        const fuzz = amount * 20;
        out = Math.sign(x) * (1 - Math.exp(-Math.abs(x) * fuzz));
      } else {
        // Tube (Default)
        out = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
      }
      
      if (h2 > 0) out += h2 * (x * x - 0.5);
      if (h3 > 0) out += h3 * (x * x * x);
      
      curve[i] = Math.max(-1, Math.min(1, Math.tanh(out)));
    }
    return curve;
  }
}

export const audioEngine = new AudioEngine();
