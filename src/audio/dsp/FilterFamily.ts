/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase 6.6 — Juno-style filter families.
 *
 * Multi-character analog filter models, ported in spirit from the Session
 * Musician Juno module's `filterFamily` concept. Each family is a
 * per-sample DSP model with a distinct slope, resonance character, drive, and
 * self-oscillation behavior:
 *
 *  - moog_ladder:           24 dB/oct 4-pole transistor ladder, soft nonlinear
 *  - sem_state_variable:    12 dB/oct SVF (simultaneous LP/BP/HP taps)
 *  - ms20_highpass_lowpass: MS-20 HP→LP cascade with aggressive Korg-style drive
 *  - juno_roland:           24 dB/oct, slightly soft "round" character
 *  - prophet_curtis:        Curtis-style with gentle self-osc + drive
 *  - oberheim_multimode:    SEM-style multimode with HP/LP blend
 *
 * All models share the same `process(input, cutoffHz, resonance, drive, sampleRate)`
 * interface so the buffer synth can swap families behind one call. Filters keep
 * internal state and must be `reset()` on note retrigger.
 */

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Guard every model output against NaN/Infinity so one bad sample can't poison a buffer. */
function sanitize(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

export type FilterFamily =
  | 'moog_ladder'
  | 'sem_state_variable'
  | 'ms20_highpass_lowpass'
  | 'juno_roland'
  | 'prophet_curtis'
  | 'oberheim_multimode';

export interface FilterFamilyLike {
  process(input: number, cutoffHz: number, resonance: number, drive: number, sampleRate: number): number;
  reset(): void;
}

/** 4-pole transistor ladder (Moog / Juno / Prophet share this topology, tuned differently). */
class LadderFilter implements FilterFamilyLike {
  private s: number[] = [0, 0, 0, 0];
  private family: 'moog' | 'juno' | 'prophet';

  constructor(family: 'moog' | 'juno' | 'prophet') {
    this.family = family;
  }

  process(input: number, cutoffHz: number, resonance: number, drive: number, sampleRate: number): number {
    const sr = sampleRate > 0 ? sampleRate : 44100;
    const fc = clamp(cutoffHz, 1, sr * 0.45);
    const w0 = 2.0 * Math.PI * fc;
    // Pre-warped ZDF g, capped at a stable ceiling. The 4-pole ZDF recursion is
    // only numerically stable for g ≲ 1 (fc ≲ sr/8); beyond that the internal
    // state accumulates without decaying and diverges. A real ladder is just
    // "wide open" there, so we clamp g to 0.95 — above that cutoff the filter
    // passes audio at near-unity regardless.
    const g = Math.min(Math.tan((w0 * 0.5) / sr), 0.95);
    const G = g / (1.0 + g);
    const G2 = G * G;
    const G3 = G2 * G;
    const G4 = G3 * G;

    // Family-specific resonance/drive character.
    let k: number;
    let driven: number;
    switch (this.family) {
      case 'moog':
        k = Math.min(clamp(resonance, 0, 10) * 3.8, 3.95);
        driven = Math.tanh(input * (1.0 + clamp(drive, 0, 1) * 2.0));
        break;
      case 'juno':
        // "Round" Roland character: gentler resonance curve, slightly soft drive.
        k = Math.min(clamp(resonance, 0, 10) * 3.4, 3.9);
        driven = Math.tanh(input * (1.0 + clamp(drive, 0, 1) * 1.2));
        break;
      case 'prophet':
        // Curtis: higher resonance ceiling with mild self-osc at full Q.
        k = Math.min(clamp(resonance, 0, 10) * 4.2, 3.99);
        driven = Math.tanh(input * (1.0 + clamp(drive, 0, 1) * 1.6));
        break;
    }

    const S0 = (this.s[0] * (1 - G) + this.s[1]) * G2 + (this.s[2] * (1 - G) + this.s[3]) * G;
    const u = (driven - k * S0) / (1.0 + k * G4);

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

    return sanitize(y3);
  }

  reset() {
    this.s = [0, 0, 0, 0];
  }
}

/** 12 dB/oct State-Variable Filter (SEM / Oberheim family) — LP+BP+HP taps. */
class StateVariableFilter implements FilterFamilyLike {
  private lp = 0;
  private bp = 0;
  private mode: 'sem' | 'oberheim';

  constructor(mode: 'sem' | 'oberheim') {
    this.mode = mode;
  }

  process(input: number, cutoffHz: number, resonance: number, drive: number, sampleRate: number): number {
    const sr = sampleRate > 0 ? sampleRate : 44100;
    const fc = clamp(cutoffHz, 1, sr * 0.45);
    // Chamberlin normalized frequency (sin-based). Clamped to a stable ceiling:
    // the LP/BP recursion diverges above ~1.5, and tan() bilinear diverges near
    // Nyquist — capping f keeps high cutoffs stable while still passing audio.
    const f = Math.min(1.1, 2.0 * Math.sin(Math.PI * clamp(fc / sr, 0, 0.45)));
    // SEM/OB Q (higher than many, smooth 12 dB character).
    const q = clamp(resonance, 0, 10);
    const driven = Math.tanh(input * (1.0 + clamp(drive, 0, 1)));

    this.lp += f * this.bp;
    const high = driven - this.lp - q * this.bp;
    this.bp += f * high;

    // SEM = lowpass dominant; Oberheim = blend of lowpass + a touch of band.
    if (this.mode === 'sem') return sanitize(this.lp);
    return sanitize(this.lp + this.bp * 0.35);
  }

  reset() {
    this.lp = 0;
    this.bp = 0;
  }
}

/** MS-20 style: HP→LP cascade with aggressive Korg transistor drive. */
class Ms20Filter implements FilterFamilyLike {
  // Stage 1 (highpass): state-variable filter whose `high` tap is taken.
  private hp1 = 0;
  private bp1 = 0;
  // Stage 2 (lowpass): classic MS-20 LP fed from the HP tap.
  private lp2 = 0;
  private bp2 = 0;

  process(input: number, cutoffHz: number, resonance: number, drive: number, sampleRate: number): number {
    const sr = sampleRate > 0 ? sampleRate : 44100;
    const fc = clamp(cutoffHz, 1, sr * 0.45);
    const f = Math.min(1.1, 2.0 * Math.sin(Math.PI * clamp(fc / sr, 0, 0.45)));
    const q = clamp(resonance, 0, 10) * 0.9;

    // Korg MS-20 character: aggressive transistor drive + hard feedback.
    const driven = Math.tanh(input * (1.0 + clamp(drive, 0, 1) * 2.5));

    // Stage 1 — SVF producing the highpass tap.
    this.hp1 += f * this.bp1;
    const high = driven - this.hp1 - q * this.bp1;
    this.bp1 += f * high;

    // Stage 2 — LP over the highpassed signal (the MS-20 HP→LP cascade).
    this.lp2 += f * this.bp2;
    const lpIn = high - this.lp2 - q * this.bp2;
    this.bp2 += f * lpIn;

    return sanitize(this.lp2);
  }

  reset() {
    this.hp1 = 0;
    this.bp1 = 0;
    this.lp2 = 0;
    this.bp2 = 0;
  }
}

/**
 * Build a filter-family processor. Returns the model instance (call `reset()`
 * on retrigger). The `custom`/`zdf` families fall back to the original
 * single-ladder behavior — callers keep using ZDFLadderFilter for those.
 */
export function createFilterFamily(family: FilterFamily): FilterFamilyLike {
  switch (family) {
    case 'moog_ladder':
      return new LadderFilter('moog');
    case 'juno_roland':
      return new LadderFilter('juno');
    case 'prophet_curtis':
      return new LadderFilter('prophet');
    case 'sem_state_variable':
      return new StateVariableFilter('sem');
    case 'oberheim_multimode':
      return new StateVariableFilter('oberheim');
    case 'ms20_highpass_lowpass':
      return new Ms20Filter();
  }
}
