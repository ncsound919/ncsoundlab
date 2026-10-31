/** @license SPDX-License-Identifier: Apache-2.0 */
/**
 * AudioWorklet host for the studio suite.
 *
 * Vite bundles this module (imported with `?worker&url`) into a standalone
 * script that is loaded with `audioWorklet.addModule`. All DSP lives in the
 * shared TypeScript port so the worklet, the ScriptProcessor fallback and the
 * offline renderer produce the same samples.
 */
import { StudioFxChainProcessor } from './chain';
import type { FxSlot } from './catalog';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

class StudioFxWorkletProcessor extends AudioWorkletProcessor {
  private readonly rack = new StudioFxChainProcessor(sampleRate, 120);
  private readonly scratch = new Float32Array(2);

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; chain?: FxSlot[]; bpm?: number } | null;
      if (!data) return;
      try {
        if (typeof data.bpm === 'number') this.rack.setTempoBpm(data.bpm);
        if (Array.isArray(data.chain)) this.rack.setChain(data.chain as FxSlot[]);
      } catch (error) {
        this.port.postMessage({ type: 'error', message: String(error) });
      }
    };
    this.port.postMessage({ type: 'ready' });
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const left = output[0];
    const right = output.length > 1 ? output[1] : output[0];
    const inL = input?.[0];
    const inR = input?.[1] ?? input?.[0];
    const frames = left.length;
    for (let i = 0; i < frames; i++) {
      this.rack.processInto(inL?.[i] ?? 0, inR?.[i] ?? 0, this.scratch);
      left[i] = this.scratch[0];
      right[i] = this.scratch[1];
    }
    return true;
  }
}

registerProcessor('nc-studio-fx', StudioFxWorkletProcessor);
