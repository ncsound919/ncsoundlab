/** @license SPDX-License-Identifier: Apache-2.0 */
/**
 * AudioWorklet host for the Hex Combinator.
 *
 * Bundled by Vite (imported with `?worker&url`) and registered as
 * `nc-combinator`. The DSP itself is the shared TypeScript port, so the
 * worklet, the ScriptProcessor fallback and the offline renderer all render
 * the same samples — the same contract `studioFxWorklet` keeps.
 */
import { CombinatorProcessor } from './CombinatorProcessor';
import type { CombinatorState } from '../../types';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

class CombinatorWorkletProcessor extends AudioWorkletProcessor {
  private readonly combinator = new CombinatorProcessor(sampleRate, 120);
  private readonly scratch = new Float32Array(2);

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; state?: CombinatorState | null; bpm?: number } | null;
      if (!data) return;
      try {
        if (typeof data.bpm === 'number') this.combinator.setTempoBpm(data.bpm);
        if (data.state !== undefined) this.combinator.setCombinator(data.state);
      } catch (error) {
        this.port.postMessage({ type: 'error', message: String(error) });
      }
    };
    this.port.postMessage({ type: 'ready' });
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const left = output[0];
    const right = output.length > 1 ? output[1] : output[0];
    const input = inputs[0];
    const inL = input?.[0];
    const inR = input?.[1] ?? input?.[0];
    const frames = left.length;
    for (let i = 0; i < frames; i++) {
      this.combinator.processSampleInto(inL?.[i] ?? 0, inR?.[i] ?? 0, this.scratch);
      left[i] = this.scratch[0];
      right[i] = this.scratch[1];
    }
    return true;
  }
}

registerProcessor('nc-combinator', CombinatorWorkletProcessor);
