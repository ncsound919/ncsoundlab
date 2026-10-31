/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Offline render of a combinator state to an AudioBuffer.
 */
import { CombinatorProcessor } from '../audio/combinator/CombinatorProcessor';
import type { CombinatorState } from '../types';

export async function renderCombinator(
  ctx: BaseAudioContext,
  input: AudioBuffer,
  state: CombinatorState,
): Promise<AudioBuffer> {
  const sampleRate = ctx.sampleRate;
  const channels = input.numberOfChannels;
  const frames = input.length;
  const offline = new OfflineAudioContext(channels, frames, sampleRate);
  const proc = new CombinatorProcessor(sampleRate, state.bpm || 120);
  proc.setCombinator(state);

  const outBuffer = offline.createBuffer(channels, frames, sampleRate);
  const scratch = new Float32Array(2);
  for (let i = 0; i < frames; i++) {
    const inL = input.getChannelData(0)[i];
    const inR = channels > 1 ? input.getChannelData(1)[i] : inL;
    proc.processSampleInto(inL, inR, scratch);
    outBuffer.getChannelData(0)[i] = scratch[0];
    if (channels > 1) outBuffer.getChannelData(1)[i] = scratch[1];
  }
  return outBuffer;
}
