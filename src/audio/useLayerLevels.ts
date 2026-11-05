/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * One rAF loop that reports per-layer peak levels for a list of layers.
 *
 * Used by the Sound Design layer rows so each layer shows whether it is sounding
 * right now. Sharing a single loop (instead of one per row) keeps the analyser
 * reads and state updates batched while playback is active, and the loop is
 * torn down the moment playback stops.
 */

import { useEffect, useState } from 'react';
import { audioEngine as sharedAudioEngine } from './AudioEngine';
import { computeMeterLevel, makeScratchBuffer } from './metering';

export function useLayerLevels(layerIds: readonly string[], active: boolean, fftSize = 512): Record<string, number> {
  const [levels, setLevels] = useState<Record<string, number>>({});
  const idsKey = layerIds.join('|');

  useEffect(() => {
    if (!active || layerIds.length === 0) {
      setLevels({});
      return;
    }
    let raf = 0;
    let lastEmit = 0;
    let lastSent: Record<string, number> = {};
    const scratches = new Map<string, Float32Array>();

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      // Meters at ~12fps are plenty for a row LED; 60fps setState on every
      // frame janks the sequencer UI while notes are playing.
      if (t - lastEmit < 80) return;
      lastEmit = t;
      const next: Record<string, number> = {};
      let changed = false;
      for (const id of layerIds) {
        let scratch = scratches.get(id);
        if (!scratch) {
          scratch = makeScratchBuffer(fftSize);
          scratches.set(id, scratch);
        }
        const analyser = sharedAudioEngine.getModuleAnalyser(id, fftSize) as unknown as Parameters<typeof computeMeterLevel>[0];
        const peak = computeMeterLevel(analyser, scratch).peak;
        next[id] = peak;
        if (Math.abs(peak - (lastSent[id] ?? -1)) > 0.02) changed = true;
      }
      if (changed || Object.keys(lastSent).length !== Object.keys(next).length) {
        lastSent = next;
        setLevels(next);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // layerIds is captured by value via idsKey; re-running on every array
    // identity change would restart the loop unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, idsKey, fftSize]);

  return levels;
}
