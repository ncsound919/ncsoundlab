/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AnalogVoiceParams {
  oscType: 'sawtooth' | 'square' | 'triangle' | 'sine' | 'pink_noise';
  frequency: number;
  detuneCents: number;
  pw: number; // Pulse width (0.1 to 0.9)
  vintageMacro: number; // 0 to 1
  voiceAge: 'mint' | 'studio80s' | 'dusty70s' | 'broken';
  driftAmount: number; // Pitch/cutoff drift 0 to 1
  filterCutoff: number; // Hz
  filterRes: number; // Q
  filterType: 'ladder24' | 'svf12';
  drive: number; // 0 to 1
  overSampleRatio: 1 | 2 | 4;
}

const MAX_PHASE_INC = 0.5; // PolyBLEP assumes dt well under 1 cycle; guard near-Nyquist rates

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * PolyBLEP (Band-Limited Polynomial Step) residual correction for alias-free analog oscillators.
 * `dt` must be the phase increment expressed as a fraction of one cycle (freq/sampleRate),
 * and is clamped below to keep the polynomial approximation valid near/above Nyquist.
 */
function polyBlep(t: number, dt: number): number {
  const d = clamp(dt, 1e-6, MAX_PHASE_INC);
  if (t < d) {
    t /= d;
    return t + t - t * t - 1.0;
  } else if (t > 1.0 - d) {
    t = (t - 1.0) / d;
    return t * t + t + t + 1.0;
  }
  return 0.0;
}

/**
 * One-pole "pinking" stage. Real pink noise (-3dB/octave) needs actual spectral
 * shaping, not just summed uniform randoms — this applies a cheap single-pole
 * lowpass-style integrator per call to bias the spectrum downward. It's still
 * an approximation (a proper Voss-McCartney or multi-pole pinking filter is
 * more accurate), but it's meaningfully closer to pink than raw noise summing,
 * and it's cheap enough to run per-sample.
 */
export class PinkNoiseState {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;

  next(): number {
    const white = Math.random() * 2 - 1;
    this.b0 = 0.99765 * this.b0 + white * 0.0990460;
    this.b1 = 0.96300 * this.b1 + white * 0.2965164;
    this.b2 = 0.57000 * this.b2 + white * 1.0526913;
    const pink = this.b0 + this.b1 + this.b2 + white * 0.1848;
    return pink * 0.11; // normalize back toward [-1, 1]-ish range
  }

  reset() {
    this.b0 = 0;
    this.b1 = 0;
    this.b2 = 0;
  }
}

/**
 * Generates an analog voice waveform sample using PolyBLEP anti-aliasing and nonlinear wave asymmetry.
 * Noise types are NOT passed through the final tanh saturation stage, since saturating a
 * noise signal flattens its peak distribution and pushes it further from the target spectral shape.
 */
export function generateAnalogOscSample(
  phase: number,
  phaseInc: number,
  type: string,
  pw: number = 0.5,
  asymmetry: number = 0.05,
  pinkState?: PinkNoiseState
): number {
  let sample = 0;
  const dt = clamp(phaseInc, 1e-6, MAX_PHASE_INC);
  const clampedPw = clamp(pw, 0.1, 0.9);

  switch (type) {
    case 'sawtooth': {
      sample = 2.0 * phase - 1.0;
      sample -= polyBlep(phase, dt);
      sample += asymmetry * Math.sin(phase * Math.PI);
      break;
    }
    case 'square': {
      sample = phase < clampedPw ? 1.0 : -1.0;
      sample += polyBlep(phase, dt);
      sample -= polyBlep((phase + 1.0 - clampedPw) % 1.0, dt);
      // Apply the same asymmetry treatment as saw/triangle for consistency,
      // scaled down since square is already shaped by pw.
      sample += asymmetry * 0.3 * Math.sin(phase * Math.PI);
      break;
    }
    case 'triangle': {
      // Band-limited triangle from a single PolyBLEP-corrected saw, folded
      // via absolute value. Previously a second saw (saw2) was generated
      // with its own PolyBLEP correction and then discarded entirely — pure
      // wasted computation that also hinted the shape was meant to combine
      // both edges. The fix: apply correction from both the phase and the
      // half-cycle-offset edge before folding, which band-limits both
      // discontinuities the fold introduces (a naive |saw| fold creates a
      // new corner at the fold point that a single-edge correction misses).
      const correctedSaw =
        2.0 * phase - 1.0 - polyBlep(phase, dt) + polyBlep((phase + 0.5) % 1.0, dt);
      sample = 2.0 * Math.abs(correctedSaw) - 1.0;
      sample = Math.tanh(sample * (1.0 + asymmetry));
      break;
    }
    case 'pink_noise': {
      sample = pinkState ? pinkState.next() : (Math.random() * 2 - 1) * 0.7 + (Math.random() * 2 - 1) * 0.3;
      // Return early — noise is not run through the shared tanh saturation
      // stage below, since that would flatten its distribution further away
      // from a pink spectral target.
      return clamp(sample, -1, 1);
    }
    default: {
      sample = Math.sin(2.0 * Math.PI * phase);
      break;
    }
  }

  // Tube-style subtle non-linear soft clipping (periodic waveforms only)
  return Math.tanh(sample * 1.1) / 1.05;
}

/**
 * Zero-Delay Feedback (ZDF) Moog 24dB 4-Pole Ladder Filter with non-linear transistor clipping.
 */
export class ZDFLadderFilter {
  private s: number[] = [0, 0, 0, 0];

  public process(
    input: number,
    cutoffHz: number,
    resonance: number,
    drive: number,
    sampleRate: number
  ): number {
    const safeSampleRate = sampleRate > 0 ? sampleRate : 44100;
    const fc = clamp(cutoffHz, 1, safeSampleRate * 0.45);
    const w0 = 2.0 * Math.PI * fc;
    const g = Math.tan((w0 * 0.5) / safeSampleRate);
    const k = Math.min(clamp(resonance, 0, 10) * 3.8, 3.95);
    const safeDrive = clamp(drive, 0, 1);

    // Nonlinear drive
    const drivenInput = Math.tanh(input * (1.0 + safeDrive * 2.0));

    // Zero-delay feedback loop solver
    const G = g / (1.0 + g);
    const G2 = G * G;
    const G3 = G2 * G;
    const G4 = G3 * G;

    const S0 = (this.s[0] * (1 - G) + this.s[1]) * G2 + (this.s[2] * (1 - G) + this.s[3]) * G;
    const u = (drivenInput - k * S0) / (1.0 + k * G4);

    let v0 = (u - this.s[0]) * G;
    let y0 = v0 + this.s[0];
    this.s[0] = y0 + v0;

    let v1 = (y0 - this.s[1]) * G;
    let y1 = v1 + this.s[1];
    this.s[1] = y1 + v1;

    let v2 = (y1 - this.s[2]) * G;
    let y2 = v2 + this.s[2];
    this.s[2] = y2 + v2;

    let v3 = (y2 - this.s[3]) * G;
    let y3 = v3 + this.s[3];
    this.s[3] = y3 + v3;

    return y3;
  }

  /** Clears internal filter state — call on note retrigger to avoid a
   * previous note's tail (click/DC offset) bleeding into the new attack. */
  public reset() {
    this.s[0] = 0;
    this.s[1] = 0;
    this.s[2] = 0;
    this.s[3] = 0;
  }
}

/**
 * Voice Aging & Instability Generator.
 * Returns scale factors for pitch drift, cutoff drift, noise floor, and capacitor leakage.
 */
export interface VoiceAgeParameters {
  pitchDriftCents: number;
  cutoffDriftPct: number;
  noiseFloorDb: number;
  leakage: number;
}

export function getVoiceAgeParameters(
  age: 'mint' | 'studio80s' | 'dusty70s' | 'broken'
): VoiceAgeParameters {
  switch (age) {
    case 'mint':
      return { pitchDriftCents: 1.5, cutoffDriftPct: 0.02, noiseFloorDb: -90, leakage: 0.001 };
    case 'studio80s':
      return { pitchDriftCents: 5.0, cutoffDriftPct: 0.06, noiseFloorDb: -75, leakage: 0.005 };
    case 'dusty70s':
      return { pitchDriftCents: 12.0, cutoffDriftPct: 0.15, noiseFloorDb: -60, leakage: 0.02 };
    case 'broken':
      return { pitchDriftCents: 35.0, cutoffDriftPct: 0.35, noiseFloorDb: -48, leakage: 0.08 };
    default: {
      // Exhaustiveness guard: if a new voiceAge variant is ever added to the
      // union without updating this switch, this throws at the call site
      // instead of silently returning undefined and crashing later on
      // `.pitchDriftCents` somewhere far from the actual root cause.
      const _exhaustive: never = age;
      throw new Error(`Unhandled voiceAge: ${_exhaustive}`);
    }
  }
}

/**
 * Analog Warmth Engine (Master Bus Transformer / Tape Saturation / Low Bump).
 */
export class WarmthEngineDSP {
  private hpState = 0;
  private lpState = 0;

  public processSample(sample: number, warmth: number = 0.5): number {
    const w = clamp(warmth, 0, 1);
    if (w <= 0) return sample;

    // 1. Low-frequency transformer bump
    this.hpState += (sample - this.hpState) * 0.005;
    const lowBump = (sample - this.hpState) * (0.15 * w);

    // 2. Soft tape saturation
    let saturated = Math.tanh((sample + lowBump) * (1.0 + w * 0.8));

    // 3. High frequency tape rolloff
    this.lpState += (saturated - this.lpState) * (1.0 - 0.25 * w);

    return this.lpState;
  }

  /** Clears internal filter state — call on note retrigger / voice steal to
   * avoid a previous note's tail bleeding a click or DC offset into the next. */
  public reset() {
    this.hpState = 0;
    this.lpState = 0;
  }
}
