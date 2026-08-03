import { TapeDelayPreset } from '../../types';
import { irCache } from './ConvolutionReverbDSP';

const MAX_HEADS = 4;
const MAX_DELAY_TIME_SEC = 5.0;
const MIN_SAFE_DELAY = 0.001;
const FEEDBACK_SOFT_CEILING = 0.96;
const PARAM_SMOOTH = 0.03;
const MOD_SMOOTH = 0.05;
const WET_DRY_MIN = 0;
const WET_DRY_MAX = 1;
const PAN_MIN = -1;
const PAN_MAX = 1;
const LEVEL_MIN = 0;
const LEVEL_MAX = 1.5;
const DRIVE_MIN = 0;
const DRIVE_MAX = 2;
const BIAS_TILT_MIN = -1;
const BIAS_TILT_MAX = 1;
const FEEDBACK_FILTER_MIN = 20;
const FEEDBACK_FILTER_MAX = 20000;
const HP_MIN = 20;
const HP_MAX = 12000;
const LP_MIN = 200;
const LP_MAX = 20000;
const MID_BUMP_MIN = -18;
const MID_BUMP_MAX = 18;
const MOD_RATE_MIN = 0.01;
const MOD_RATE_MAX = 20;
const MOD_DEPTH_MS_MIN = 0;
const MOD_DEPTH_MS_MAX = 50;
const WAVESHAPER_CURVE_SIZE = 1024;
const DEFAULT_MINI_IR_ID = 'room_short';
const DEFAULT_MINI_IR_SECONDS = 0.2;
const DEFAULT_MINI_IR_DECAY = 8.0;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function safeFeedbackGain(requested: number): number {
  const g = Math.max(0, finiteOr(requested, 0));
  if (g <= 0.8) return g;
  const excess = g - 0.8;
  const compressed = (FEEDBACK_SOFT_CEILING - 0.8) * (1 - Math.exp(-excess * 2));
  return 0.8 + compressed;
}

interface TapeHead {
  delay: DelayNode;
  gain: GainNode;
  panner: StereoPannerNode;
  wowGain: GainNode;
  flutterGain: GainNode;
  driftGain: GainNode;
  active: boolean;
}

interface SanitizedTapeDelayPreset {
  preFilter: {
    hpFreq: number;
    lpFreq: number;
    midBumpDb: number;
  };
  saturation: {
    drive: number;
    biasTilt: number;
  };
  heads: {
    count: number;
    timesMs: number[];
    levels: number[];
    pans: number[];
  };
  modulation: {
    wowRateHz: number;
    wowDepthMs: number;
    flutterRateHz: number;
    flutterDepthMs: number;
  };
  feedback: {
    amount: number;
    filterType: 'lp' | 'hp' | 'bp';
    filterFreq: number;
    extraSaturation: number;
    miniIRId: string;
  };
  mix: {
    dry: number;
    wet: number;
  };
}

export class TapeDelayDSP {
  private ctx: AudioContext;
  public inputNode: GainNode;
  public outputNode: GainNode;

  private preHpFilter: BiquadFilterNode;
  private preLpFilter: BiquadFilterNode;
  private midBumpFilter: BiquadFilterNode;

  private tapeSaturator: WaveShaperNode;
  private biasLowFilter: BiquadFilterNode;
  private biasHighFilter: BiquadFilterNode;

  private heads: TapeHead[] = [];

  private wowLfo: OscillatorNode;
  private wowLfoGain: GainNode;

  private flutterLfo: OscillatorNode;
  private flutterLfoGain: GainNode;

  private driftLfos: OscillatorNode[] = [];
  private driftGains: GainNode[] = [];

  private feedbackSumNode: GainNode;
  private feedbackGainNode: GainNode;
  private feedbackFilter: BiquadFilterNode;
  private feedbackSaturator: WaveShaperNode;
  private feedbackMiniConvolverA: ConvolverNode;
  private feedbackMiniConvolverB: ConvolverNode;
  private feedbackConvolverMixA: GainNode;
  private feedbackConvolverMixB: GainNode;
  private activeConvolverIndex: 0 | 1 = 0;
  private currentMiniIRId: string = DEFAULT_MINI_IR_ID;

  private dryGain: GainNode;
  private wetGain: GainNode;

  private disposed = false;
  private tapeCurveCache = new Map<number, Float32Array>();
  private feedbackCurveCache = new Map<number, Float32Array>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.inputNode = ctx.createGain();
    this.outputNode = ctx.createGain();

    this.preHpFilter = ctx.createBiquadFilter();
    this.preHpFilter.type = 'highpass';
    this.preHpFilter.frequency.value = 150;

    this.preLpFilter = ctx.createBiquadFilter();
    this.preLpFilter.type = 'lowpass';
    this.preLpFilter.frequency.value = 10000;

    this.midBumpFilter = ctx.createBiquadFilter();
    this.midBumpFilter.type = 'peaking';
    this.midBumpFilter.frequency.value = 1200;
    this.midBumpFilter.Q.value = 1.0;
    this.midBumpFilter.gain.value = 2.0;

    this.tapeSaturator = ctx.createWaveShaper();
    this.tapeSaturator.oversample = '2x';
    this.setTapeSaturationCurve(0.3);

    this.biasLowFilter = ctx.createBiquadFilter();
    this.biasLowFilter.type = 'lowshelf';
    this.biasLowFilter.frequency.value = 500;

    this.biasHighFilter = ctx.createBiquadFilter();
    this.biasHighFilter.type = 'highshelf';
    this.biasHighFilter.frequency.value = 3500;

    this.wowLfo = ctx.createOscillator();
    this.wowLfo.type = 'sine';
    this.wowLfo.frequency.value = 0.3;

    this.wowLfoGain = ctx.createGain();
    this.wowLfoGain.gain.value = 0.0003;

    this.flutterLfo = ctx.createOscillator();
    this.flutterLfo.type = 'triangle';
    this.flutterLfo.frequency.value = 4.5;

    this.flutterLfoGain = ctx.createGain();
    this.flutterLfoGain.gain.value = 0.0001;

    this.wowLfo.connect(this.wowLfoGain);
    this.flutterLfo.connect(this.flutterLfoGain);
    this.wowLfo.start();
    this.flutterLfo.start();

    this.feedbackSumNode = ctx.createGain();
    this.feedbackGainNode = ctx.createGain();
    this.feedbackGainNode.gain.value = 0.3;

    this.feedbackFilter = ctx.createBiquadFilter();
    this.feedbackFilter.type = 'lowpass';
    this.feedbackFilter.frequency.value = 6000;
    this.feedbackFilter.Q.value = 0.707;

    this.feedbackSaturator = ctx.createWaveShaper();
    this.feedbackSaturator.oversample = '2x';
    this.setFeedbackSaturationCurve(0.2);

    this.feedbackMiniConvolverA = ctx.createConvolver();
    this.feedbackMiniConvolverB = ctx.createConvolver();
    this.feedbackConvolverMixA = ctx.createGain();
    this.feedbackConvolverMixB = ctx.createGain();
    this.feedbackConvolverMixA.gain.value = 1;
    this.feedbackConvolverMixB.gain.value = 0;

    const defaultIR = this.getMiniIR(DEFAULT_MINI_IR_ID);
    this.feedbackMiniConvolverA.buffer = defaultIR;
    this.feedbackMiniConvolverB.buffer = defaultIR;

    this.feedbackSumNode.connect(this.feedbackFilter);
    this.feedbackFilter.connect(this.feedbackSaturator);
    this.feedbackSaturator.connect(this.feedbackMiniConvolverA);
    this.feedbackSaturator.connect(this.feedbackMiniConvolverB);
    this.feedbackMiniConvolverA.connect(this.feedbackConvolverMixA);
    this.feedbackMiniConvolverB.connect(this.feedbackConvolverMixB);
    this.feedbackConvolverMixA.connect(this.feedbackGainNode);
    this.feedbackConvolverMixB.connect(this.feedbackGainNode);

    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.dryGain.gain.value = 1;
    this.wetGain.gain.value = 0.35;

    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);

    this.inputNode.connect(this.preHpFilter);
    this.feedbackGainNode.connect(this.preHpFilter);

    this.preHpFilter.connect(this.preLpFilter);
    this.preLpFilter.connect(this.midBumpFilter);
    this.midBumpFilter.connect(this.tapeSaturator);
    this.tapeSaturator.connect(this.biasLowFilter);
    this.biasLowFilter.connect(this.biasHighFilter);

    for (let i = 0; i < MAX_HEADS; i++) {
      this.heads.push(this.createHead(i));
    }

    this.wetGain.connect(this.outputNode);
  }

  private getMiniIR(irId: string): AudioBuffer {
    return irCache.get(this.ctx, irId, DEFAULT_MINI_IR_SECONDS, DEFAULT_MINI_IR_DECAY);
  }

  private sanitizePreset(preset: TapeDelayPreset): SanitizedTapeDelayPreset {
    const rawHeadsCount = finiteOr((preset as any)?.heads?.count, 1);
    const count = clamp(Math.round(rawHeadsCount), 1, MAX_HEADS);

    const timesMs = Array.from({ length: MAX_HEADS }, (_, i) => {
      const fallback = 250 + i * 150;
      const raw = finiteOr((preset as any)?.heads?.timesMs?.[i], fallback);
      return clamp(raw, MIN_SAFE_DELAY * 1000, MAX_DELAY_TIME_SEC * 1000);
    });

    const levels = Array.from({ length: MAX_HEADS }, (_, i) => {
      const fallback = i === 0 ? 1 : 0;
      const raw = finiteOr((preset as any)?.heads?.levels?.[i], fallback);
      return clamp(raw, LEVEL_MIN, LEVEL_MAX);
    });

    const pans = Array.from({ length: MAX_HEADS }, (_, i) => {
      const raw = finiteOr((preset as any)?.heads?.pans?.[i], 0);
      return clamp(raw, PAN_MIN, PAN_MAX);
    });

    const hpFreq = clamp(
      finiteOr((preset as any)?.preFilter?.hpFreq, 150),
      HP_MIN,
      HP_MAX
    );

    const lpFreq = clamp(
      finiteOr((preset as any)?.preFilter?.lpFreq, 10000),
      Math.max(LP_MIN, hpFreq + 10),
      LP_MAX
    );

    return {
      preFilter: {
        hpFreq,
        lpFreq,
        midBumpDb: clamp(
          finiteOr((preset as any)?.preFilter?.midBumpDb, 2),
          MID_BUMP_MIN,
          MID_BUMP_MAX
        ),
      },
      saturation: {
        drive: clamp(finiteOr((preset as any)?.saturation?.drive, 0.3), DRIVE_MIN, DRIVE_MAX),
        biasTilt: clamp(
          finiteOr((preset as any)?.saturation?.biasTilt, 0),
          BIAS_TILT_MIN,
          BIAS_TILT_MAX
        ),
      },
      heads: {
        count,
        timesMs,
        levels,
        pans,
      },
      modulation: {
        wowRateHz: clamp(
          finiteOr((preset as any)?.modulation?.wowRateHz, 0.3),
          MOD_RATE_MIN,
          MOD_RATE_MAX
        ),
        wowDepthMs: clamp(
          finiteOr((preset as any)?.modulation?.wowDepthMs, 0.3),
          MOD_DEPTH_MS_MIN,
          MOD_DEPTH_MS_MAX
        ),
        flutterRateHz: clamp(
          finiteOr((preset as any)?.modulation?.flutterRateHz, 4.5),
          MOD_RATE_MIN,
          MOD_RATE_MAX
        ),
        flutterDepthMs: clamp(
          finiteOr((preset as any)?.modulation?.flutterDepthMs, 0.1),
          MOD_DEPTH_MS_MIN,
          MOD_DEPTH_MS_MAX
        ),
      },
      feedback: {
        amount: finiteOr((preset as any)?.feedback?.amount, 0.3),
        filterType: ((preset as any)?.feedback?.filterType === 'lp' ||
          (preset as any)?.feedback?.filterType === 'hp' ||
          (preset as any)?.feedback?.filterType === 'bp')
          ? (preset as any).feedback.filterType
          : 'lp',
        filterFreq: clamp(
          finiteOr((preset as any)?.feedback?.filterFreq, 6000),
          FEEDBACK_FILTER_MIN,
          FEEDBACK_FILTER_MAX
        ),
        extraSaturation: clamp(
          finiteOr((preset as any)?.feedback?.extraSaturation, 0.2),
          DRIVE_MIN,
          DRIVE_MAX
        ),
        miniIRId:
          typeof (preset as any)?.feedback?.miniIRId === 'string' &&
          (preset as any).feedback.miniIRId.length > 0
            ? (preset as any).feedback.miniIRId
            : DEFAULT_MINI_IR_ID,
      },
      mix: {
        dry: clamp(finiteOr((preset as any)?.mix?.dry, 1), WET_DRY_MIN, WET_DRY_MAX),
        wet: clamp(finiteOr((preset as any)?.mix?.wet, 0.35), WET_DRY_MIN, WET_DRY_MAX),
      },
    };
  }

  private createHead(index: number): TapeHead {
    const ctx = this.ctx;
    const delay = ctx.createDelay(MAX_DELAY_TIME_SEC);
    delay.delayTime.value = 0.2 + index * 0.15;

    const gain = ctx.createGain();
    gain.gain.value = index === 0 ? 1.0 : 0.0;

    const panner = ctx.createStereoPanner();
    panner.pan.value = 0;

    this.biasHighFilter.connect(delay);

    const wowGain = ctx.createGain();
    wowGain.gain.value = 1.0;
    this.wowLfoGain.connect(wowGain);
    wowGain.connect(delay.delayTime);

    const flutterGain = ctx.createGain();
    flutterGain.gain.value = 1.0;
    this.flutterLfoGain.connect(flutterGain);
    flutterGain.connect(delay.delayTime);

    const driftLfo = ctx.createOscillator();
    driftLfo.type = 'sine';
    const driftRate = 0.05 + ((index * 0.017) % 0.08);
    driftLfo.frequency.value = driftRate;

    const driftGain = ctx.createGain();
    driftGain.gain.value = 0.00008 + index * 0.00002;
    driftLfo.connect(driftGain);
    driftGain.connect(delay.delayTime);
    driftLfo.start(ctx.currentTime + index * 0.013);

    this.driftLfos.push(driftLfo);
    this.driftGains.push(driftGain);

    delay.connect(gain);
    gain.connect(panner);
    panner.connect(this.wetGain);
    panner.connect(this.feedbackSumNode);

    return { delay, gain, panner, wowGain, flutterGain, driftGain, active: index === 0 };
  }

  private getOrCreateTapeCurve(drive: number): Float32Array {
    const key = Math.round(clamp(drive, DRIVE_MIN, DRIVE_MAX) * 1000);
    const cached = this.tapeCurveCache.get(key);
    if (cached) return cached;

    const normalizedDrive = key / 1000;
    const k = Math.max(0.01, normalizedDrive * 25);
    const curve = new Float32Array(WAVESHAPER_CURVE_SIZE);
    for (let i = 0; i < WAVESHAPER_CURVE_SIZE; i++) {
      const x = (i * 2) / WAVESHAPER_CURVE_SIZE - 1;
      curve[i] = Math.tanh(x * (1 + k));
    }
    this.tapeCurveCache.set(key, curve);
    return curve;
  }

  private getOrCreateFeedbackCurve(drive: number): Float32Array {
    const key = Math.round(clamp(drive, DRIVE_MIN, DRIVE_MAX) * 1000);
    const cached = this.feedbackCurveCache.get(key);
    if (cached) return cached;

    const normalizedDrive = key / 1000;
    const k = Math.max(0.01, normalizedDrive * 15);
    const curve = new Float32Array(WAVESHAPER_CURVE_SIZE);
    for (let i = 0; i < WAVESHAPER_CURVE_SIZE; i++) {
      const x = (i * 2) / WAVESHAPER_CURVE_SIZE - 1;
      curve[i] = Math.sin(x * Math.PI * 0.5 * (1 + k * 0.5));
    }
    this.feedbackCurveCache.set(key, curve);
    return curve;
  }

  private setTapeSaturationCurve(drive: number) {
    this.tapeSaturator.curve = this.getOrCreateTapeCurve(drive);
  }

  private setFeedbackSaturationCurve(drive: number) {
    this.feedbackSaturator.curve = this.getOrCreateFeedbackCurve(drive);
  }

  private swapMiniIR(nextIRId: string, now: number) {
    if (nextIRId === this.currentMiniIRId) return;

    const fadeTime = 0.02;
    const nextBuffer = this.getMiniIR(nextIRId);

    if (this.activeConvolverIndex === 0) {
      this.feedbackMiniConvolverB.buffer = nextBuffer;
      this.feedbackConvolverMixB.gain.cancelScheduledValues(now);
      this.feedbackConvolverMixA.gain.cancelScheduledValues(now);
      this.feedbackConvolverMixB.gain.setValueAtTime(this.feedbackConvolverMixB.gain.value, now);
      this.feedbackConvolverMixA.gain.setValueAtTime(this.feedbackConvolverMixA.gain.value, now);
      this.feedbackConvolverMixB.gain.linearRampToValueAtTime(1, now + fadeTime);
      this.feedbackConvolverMixA.gain.linearRampToValueAtTime(0, now + fadeTime);
      this.activeConvolverIndex = 1;
    } else {
      this.feedbackMiniConvolverA.buffer = nextBuffer;
      this.feedbackConvolverMixA.gain.cancelScheduledValues(now);
      this.feedbackConvolverMixB.gain.cancelScheduledValues(now);
      this.feedbackConvolverMixA.gain.setValueAtTime(this.feedbackConvolverMixA.gain.value, now);
      this.feedbackConvolverMixB.gain.setValueAtTime(this.feedbackConvolverMixB.gain.value, now);
      this.feedbackConvolverMixA.gain.linearRampToValueAtTime(1, now + fadeTime);
      this.feedbackConvolverMixB.gain.linearRampToValueAtTime(0, now + fadeTime);
      this.activeConvolverIndex = 0;
    }

    this.currentMiniIRId = nextIRId;
  }

  public applyPreset(preset: TapeDelayPreset) {
    if (this.disposed) return;

    const safe = this.sanitizePreset(preset);
    const now = this.ctx.currentTime;

    this.preHpFilter.frequency.setTargetAtTime(safe.preFilter.hpFreq, now, PARAM_SMOOTH);
    this.preLpFilter.frequency.setTargetAtTime(safe.preFilter.lpFreq, now, PARAM_SMOOTH);
    this.midBumpFilter.gain.setTargetAtTime(safe.preFilter.midBumpDb, now, PARAM_SMOOTH);

    this.setTapeSaturationCurve(safe.saturation.drive);
    const tilt = safe.saturation.biasTilt;
    this.biasLowFilter.gain.setTargetAtTime(-tilt * 4, now, PARAM_SMOOTH);
    this.biasHighFilter.gain.setTargetAtTime(tilt * 4, now, PARAM_SMOOTH);

    for (let i = 0; i < MAX_HEADS; i++) {
      const head = this.heads[i];
      const isActive = i < safe.heads.count;
      head.active = isActive;

      if (isActive) {
        const timeSec = clamp(safe.heads.timesMs[i] / 1000, MIN_SAFE_DELAY, MAX_DELAY_TIME_SEC);
        head.delay.delayTime.setTargetAtTime(timeSec, now, PARAM_SMOOTH);
        head.gain.gain.setTargetAtTime(safe.heads.levels[i], now, PARAM_SMOOTH);
        head.panner.pan.setTargetAtTime(safe.heads.pans[i], now, PARAM_SMOOTH);
        head.wowGain.gain.setTargetAtTime(1.0, now, MOD_SMOOTH);
        head.flutterGain.gain.setTargetAtTime(1.0, now, MOD_SMOOTH);
        head.driftGain.gain.setTargetAtTime(0.00008 + i * 0.00002, now, MOD_SMOOTH);
      } else {
        head.gain.gain.setTargetAtTime(0, now, PARAM_SMOOTH);
        head.wowGain.gain.setTargetAtTime(0, now, MOD_SMOOTH);
        head.flutterGain.gain.setTargetAtTime(0, now, MOD_SMOOTH);
        head.driftGain.gain.setTargetAtTime(0, now, MOD_SMOOTH);
      }
    }

    this.wowLfo.frequency.setTargetAtTime(safe.modulation.wowRateHz, now, PARAM_SMOOTH);
    this.wowLfoGain.gain.setTargetAtTime(safe.modulation.wowDepthMs / 1000, now, PARAM_SMOOTH);
    this.flutterLfo.frequency.setTargetAtTime(safe.modulation.flutterRateHz, now, PARAM_SMOOTH);
    this.flutterLfoGain.gain.setTargetAtTime(safe.modulation.flutterDepthMs / 1000, now, PARAM_SMOOTH);

    this.feedbackGainNode.gain.setTargetAtTime(
      safeFeedbackGain(safe.feedback.amount),
      now,
      PARAM_SMOOTH
    );

    if (safe.feedback.filterType === 'lp') {
      this.feedbackFilter.type = 'lowpass';
    } else if (safe.feedback.filterType === 'hp') {
      this.feedbackFilter.type = 'highpass';
    } else {
      this.feedbackFilter.type = 'bandpass';
    }
    this.feedbackFilter.frequency.setTargetAtTime(safe.feedback.filterFreq, now, PARAM_SMOOTH);
    this.setFeedbackSaturationCurve(safe.feedback.extraSaturation);
    this.swapMiniIR(safe.feedback.miniIRId, now);

    this.dryGain.gain.setTargetAtTime(safe.mix.dry, now, PARAM_SMOOTH);
    this.wetGain.gain.setTargetAtTime(safe.mix.wet, now, PARAM_SMOOTH);
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;

    try {
      this.wowLfo.stop();
      this.flutterLfo.stop();
    } catch {}

    for (const lfo of this.driftLfos) {
      try {
        lfo.stop();
      } catch {}
    }

    const allNodes: AudioNode[] = [
      this.inputNode,
      this.outputNode,
      this.preHpFilter,
      this.preLpFilter,
      this.midBumpFilter,
      this.tapeSaturator,
      this.biasLowFilter,
      this.biasHighFilter,
      this.wowLfo,
      this.wowLfoGain,
      this.flutterLfo,
      this.flutterLfoGain,
      this.feedbackSumNode,
      this.feedbackGainNode,
      this.feedbackFilter,
      this.feedbackSaturator,
      this.feedbackMiniConvolverA,
      this.feedbackMiniConvolverB,
      this.feedbackConvolverMixA,
      this.feedbackConvolverMixB,
      this.dryGain,
      this.wetGain,
      ...this.driftLfos,
      ...this.driftGains,
    ];

    for (const head of this.heads) {
      allNodes.push(head.delay, head.gain, head.panner, head.wowGain, head.flutterGain, head.driftGain);
    }

    for (const node of allNodes) {
      try {
        node.disconnect();
      } catch {}
    }

    this.heads = [];
    this.driftLfos = [];
    this.driftGains = [];
    this.tapeCurveCache.clear();
    this.feedbackCurveCache.clear();
  }
}
