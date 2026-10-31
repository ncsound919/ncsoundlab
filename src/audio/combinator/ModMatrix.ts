/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Hex Combinator — modulation matrix (sources x destinations).
 */
import { f } from '../studioFx/primitives';

export interface ModRouteLike {
  src: string;
  dst: string; // "slotId.paramKey"
  amount: number;
  polarity: boolean;
  curve: 'linear' | 'exp' | 'log';
}

export class ModMatrix {
  constructor(private routes: ModRouteLike[] = []) {}

  setRoutes(routes: ModRouteLike[]): void {
    this.routes = [...routes];
  }

  /** Apply modulation. sourceValues: map src id -> 0..1 (or -1..1). paramsBySlot: slotId -> params object (mutated). */
  apply(sourceValues: Record<string, number>, paramsBySlot: Record<string, Record<string, number>>): void {
    for (const r of this.routes) {
      const srcVal = sourceValues[r.src];
      if (srcVal === undefined) continue;
      const [slotId, paramKey] = r.dst.split('.');
      const params = paramsBySlot[slotId];
      if (!params || params[paramKey] === undefined) continue;
      const signed = r.polarity ? -srcVal : srcVal;
      let shaped = signed;
      if (r.curve === 'exp') shaped = signed * Math.abs(signed);
      else if (r.curve === 'log') shaped = Math.sign(signed) * Math.sqrt(Math.abs(signed));
      const base = params[paramKey];
      params[paramKey] = f(base + shaped * r.amount);
    }
  }
}
