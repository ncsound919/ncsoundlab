/** @license SPDX-License-Identifier: Apache-2.0 */
import { kindSpec } from '../studioFx/catalog';
import { CombinatorProcessor } from './CombinatorProcessor';
import type { CombinatorState } from '../../types';

export interface CombinatorHandle {
  node: AudioNode;
  /** Which implementation the graph actually got. */
  engine: 'worklet' | 'script';
  setState(state: CombinatorState | null, bpm: number): void;
  dispose(): void;
}

const WORKLET_NAME = 'nc-combinator';

/** Module registration is per AudioContext (live and offline differ). */
const workletLoads = new WeakMap<BaseAudioContext, Promise<boolean>>();

export function loadCombinatorWorklet(ctx: BaseAudioContext): Promise<boolean> {
  let load = workletLoads.get(ctx);
  if (!load) {
    load = (async () => {
      try {
        if (!('audioWorklet' in ctx) || typeof AudioWorkletNode === 'undefined') return false;
        const module = await import('./combinatorWorklet.ts?worker&url');
        await ctx.audioWorklet.addModule(module.default as unknown as string);
        return true;
      } catch (error) {
        console.warn('Combinator worklet unavailable, using ScriptProcessor:', error);
        return false;
      }
    })();
    workletLoads.set(ctx, load);
  }
  return load;
}

/**
 * True when the state would actually process audio. Unknown module ids are
 * ignored so a preset written against a future catalog cannot leave a dead
 * node sitting in the master bus.
 */
export function combinatorIsActive(state: CombinatorState | null | undefined): boolean {
  if (!state || !Array.isArray(state.slots)) return false;
  return state.slots.some((slot) => slot && slot.enabled !== false && !!kindSpec(slot.moduleId));
}

export function combinatorBpm(state: CombinatorState | null | undefined): number {
  const bpm = state?.bpm;
  return typeof bpm === 'number' && Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
}

function createScriptNode(ctx: BaseAudioContext, state: CombinatorState | null, bpm: number): CombinatorHandle {
  const node = ctx.createScriptProcessor(1024, 2, 2);
  const combinator = new CombinatorProcessor(ctx.sampleRate, bpm);
  combinator.setCombinator(state);
  const scratch = new Float32Array(2);
  node.onaudioprocess = (event: AudioProcessingEvent) => {
    const input = event.inputBuffer;
    const output = event.outputBuffer;
    const inL = input.getChannelData(0);
    const inR = input.numberOfChannels > 1 ? input.getChannelData(1) : inL;
    const outL = output.getChannelData(0);
    const outR = output.numberOfChannels > 1 ? output.getChannelData(1) : outL;
    for (let i = 0; i < outL.length; i++) {
      combinator.processSampleInto(inL[i] ?? 0, inR[i] ?? 0, scratch);
      outL[i] = scratch[0];
      outR[i] = scratch[1];
    }
  };
  return {
    node,
    engine: 'script',
    setState(next, nextBpm) {
      combinator.setTempoBpm(nextBpm);
      combinator.setCombinator(next);
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
 * Builds the Combinator node synchronously: the worklet when its module is
 * already registered on this context, otherwise a ScriptProcessor running the
 * identical DSP (the same fallback the master rack uses).
 */
export function createCombinatorNode(
  ctx: BaseAudioContext,
  state: CombinatorState | null,
  bpm = 120,
  workletReady = false,
): CombinatorHandle {
  if (workletReady && typeof AudioWorkletNode !== 'undefined' && 'audioWorklet' in ctx) {
    try {
      const node = new AudioWorkletNode(ctx, WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
      });
      node.port.postMessage({ type: 'combinator', state, bpm });
      return {
        node,
        engine: 'worklet',
        setState(next, nextBpm) {
          node.port.postMessage({ type: 'combinator', state: next, bpm: nextBpm });
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
      console.warn('Combinator worklet node failed, using ScriptProcessor:', error);
    }
  }
  return createScriptNode(ctx, state, bpm);
}
