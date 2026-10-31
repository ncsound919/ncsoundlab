/** @license SPDX-License-Identifier: Apache-2.0 */
import type { FxSlot } from './catalog';
import { StudioFxChainProcessor } from './chain';

export interface StudioFxHandle {
  node: AudioNode;
  setChain(slots: FxSlot[], bpm: number): void;
  dispose(): void;
  /** Which implementation the graph actually got; surfaced in the UI. */
  engine: 'worklet' | 'script';
}

const WORKLET_NAME = 'nc-studio-fx';
let workletLoad: Promise<boolean> | null = null;

/**
 * Loads the worklet module once per app. Called when the audio context is
 * created; failure (Safari, an old WebView) is not fatal because the graph
 * falls back to a ScriptProcessor with the identical DSP.
 */
export function loadStudioFxWorklet(ctx: BaseAudioContext): Promise<boolean> {
  if (workletLoad) return workletLoad;
  workletLoad = (async () => {
    try {
      if (!('audioWorklet' in ctx) || typeof AudioWorkletNode === 'undefined') return false;
      const module = await import('./studioFxWorklet.ts?worker&url');
      await ctx.audioWorklet.addModule(module.default as unknown as string);
      return true;
    } catch (error) {
      console.warn('Studio FX worklet unavailable, using ScriptProcessor:', error);
      return false;
    }
  })();
  return workletLoad;
}

function createScriptNode(
  ctx: BaseAudioContext,
  slots: FxSlot[],
  bpm: number,
): StudioFxHandle {
  const node = ctx.createScriptProcessor(1024, 2, 2);
  const rack = new StudioFxChainProcessor(ctx.sampleRate, bpm);
  rack.setChain(slots);
  node.onaudioprocess = (event: AudioProcessingEvent) => {
    const input = event.inputBuffer;
    const output = event.outputBuffer;
    const inL = input.getChannelData(0);
    const inR = input.numberOfChannels > 1 ? input.getChannelData(1) : inL;
    const outL = output.getChannelData(0);
    const outR = output.numberOfChannels > 1 ? output.getChannelData(1) : outL;
    const scratch = new Float32Array(2);
    for (let i = 0; i < outL.length; i++) {
      rack.processInto(inL[i] ?? 0, inR[i] ?? 0, scratch);
      outL[i] = scratch[0];
      outR[i] = scratch[1];
    }
  };
  return {
    node,
    engine: 'script',
    setChain(next, nextBpm) {
      rack.setTempoBpm(nextBpm);
      rack.setChain(next);
    },
    dispose() {
      node.onaudioprocess = null;
      try {
        node.disconnect();
      } catch {
        /* already disconnected */
      }
    },
  };
}

/**
 * Builds the chain node synchronously. The worklet path is used when the
 * module is already registered (the engine preloads it); otherwise the
 * ScriptProcessor keeps the rack working on every browser without dropping a
 * parameter change.
 */
export function createStudioFxNode(
  ctx: BaseAudioContext,
  slots: FxSlot[],
  bpm = 120,
  workletReady = false,
): StudioFxHandle {
  if (workletReady && typeof AudioWorkletNode !== 'undefined' && 'audioWorklet' in ctx) {
    try {
      const node = new AudioWorkletNode(ctx, WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
      });
      node.port.postMessage({ type: 'chain', chain: slots, bpm });
      return {
        node,
        engine: 'worklet',
        setChain(next, nextBpm) {
          node.port.postMessage({ type: 'chain', chain: next, bpm: nextBpm });
        },
        dispose() {
          try {
            node.port.postMessage({ type: 'dispose' });
            node.disconnect();
          } catch {
            /* already disconnected */
          }
        },
      };
    } catch (error) {
      console.warn('Studio FX worklet node failed, using ScriptProcessor:', error);
    }
  }
  return createScriptNode(ctx, slots, bpm);
}
