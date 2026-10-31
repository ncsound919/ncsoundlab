/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Hex Combinator — LFO with drawable shape table.
 */
import { f } from '../studioFx/primitives';

export type LfoShape = 'sine' | 'tri' | 'sawUp' | 'sawDown' | 'square' | 'pulse' | 'randomSH' | 'randomSmooth' | 'exp' | 'log';

export interface LfoPoint { t: number; v: number; }

export class Lfo {
  private table: Float32Array;
  private phase = 0;
  private phaseOffset = 0;
  private readonly size: number;

  constructor(size = 256) {
    this.size = size;
    this.table = new Float32Array(size);
    this.setShape('sine');
  }

  setShape(shape: LfoShape): void {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      let v = 0;
      switch (shape) {
        case 'sine': v = Math.sin(t * 2 * Math.PI); break;
        case 'tri': v = 1 - 4 * Math.abs(t - 0.5); break;
        case 'sawUp': v = t * 2 - 1; break;
        case 'sawDown': v = 1 - t * 2; break;
        case 'square': v = t < 0.5 ? 1 : -1; break;
        case 'pulse': v = t < 0.25 ? 1 : -1; break;
        case 'randomSH': v = Math.random() * 2 - 1; break;
        case 'randomSmooth': v = Math.sin(t * 2 * Math.PI) * (0.5 + 0.5 * Math.random()); break;
        case 'exp': v = Math.exp(t * 3) / Math.exp(3) * 2 - 1; break;
        case 'log': v = Math.log(1 + t * 9) / Math.log(10) * 2 - 1; break;
      }
      this.table[i] = f(v);
    }
    // (tri already set in switch)
  }

  setCustomPoints(points: LfoPoint[], interp: 'linear' | 'smooth' | 'step' | 'spline' = 'linear'): void {
    const n = this.size;
    // sort by t
    const pts = [...points].sort((a, b) => a.t - b.t);
    if (pts.length === 0) { this.setShape('sine'); return; }
    for (let i = 0; i < n; i++) {
      const t = i / n;
      this.table[i] = f(this.samplePoints(pts, t, interp));
    }
  }

  private samplePoints(pts: LfoPoint[], t: number, interp: string): number {
    // wrap
    const pp = pts.map((p) => ({ t: p.t, v: p.v }));
    if (pp[0].t > 0) pp.unshift({ t: pp[0].t - 1, v: pp[pp.length - 1].v });
    if (pp[pp.length - 1].t < 1) pp.push({ t: pp[pp.length - 1].t + 1, v: pp[0].v });
    // find segment
    let idx = 0;
    for (let i = 0; i < pp.length - 1; i++) {
      if (t >= pp[i].t && t <= pp[i + 1].t) { idx = i; break; }
    }
    const a = pp[idx];
    const b = pp[idx + 1];
    const span = Math.max(1e-9, b.t - a.t);
    const u = (t - a.t) / span;
    if (interp === 'step') return a.v;
    if (interp === 'linear') return a.v + (b.v - a.v) * u;
    if (interp === 'smooth') {
      const s = u * u * (3 - 2 * u);
      return a.v + (b.v - a.v) * s;
    }
    // spline (catmull-rom-ish): smoothstep cubed
    const s = u * u * u * (u * (u * 6 - 15) + 10);
    return a.v + (b.v - a.v) * s;
  }

  /** Advance phase by normalized increment (0..1 per sample-ish). Returns current value. */
  tick(phaseInc: number): number {
    this.phase = (this.phase + phaseInc) % 1;
    if (this.phase < 0) this.phase += 1;
    const pos = ((this.phase + this.phaseOffset) % 1) * this.size;
    const i0 = Math.floor(pos) % this.size;
    const i1 = (i0 + 1) % this.size;
    const frac = pos - Math.floor(pos);
    return f(this.table[i0] + (this.table[i1] - this.table[i0]) * frac);
  }

  reset(): void {
    this.phase = 0;
  }

  setPhase(p: number): void {
    this.phase = ((p % 1) + 1) % 1;
  }

  setPhaseOffset(offset: number): void {
    this.phaseOffset = ((offset % 1) + 1) % 1;
  }

  value(): number {
    const pos = ((this.phase + this.phaseOffset) % 1) * this.size;
    const i0 = Math.floor(pos) % this.size;
    const i1 = (i0 + 1) % this.size;
    const frac = pos - Math.floor(pos);
    return f(this.table[i0] + (this.table[i1] - this.table[i0]) * frac);
  }
}
