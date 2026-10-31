/** @license SPDX-License-Identifier: Apache-2.0 */
import type { FxSlot } from './catalog';

/**
 * One insert module. Mirrors `RackModule` in the shared Kotlin core: modules are
 * built once per chain shape and reconfigured in place when a value moves, so
 * filter and compressor state survives edits and never clicks.
 */
export interface StudioModule {
  readonly kind: string;
  enabled: boolean;
  configure(slot: FxSlot): void;
  processSampleInto(inL: number, inR: number, out: Float32Array): void;
  reset(): void;
  setKey(l: number, r: number): void;
  setTempoBpm(bpm: number): void;
  readonly gainReductionDb: number;
  readonly latencySamples: number;
  readonly inputPeakLevel: number;
  readonly outputPeakLevel: number;
}
