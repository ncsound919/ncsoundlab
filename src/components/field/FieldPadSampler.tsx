/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Field Pad Sampler — Live MPC-style 8/16-pad performance unit for the field app.
 *
 * Features:
 * - Touch velocity simulation: tap height on pad modulates volume
 * - Live round-robin cycling: consecutive hits alternate through sibling variants
 * - Choke group mode for tight acoustic muting (hi-hats, percussive chops)
 * - Visual touch trigger glow animations
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FieldKit, KitSliceEntry } from '../../lib/mobile/fieldKit';

interface FieldPadSamplerProps {
  kit: FieldKit;
  renders: Record<string, Float32Array>;
  sampleRate: number;
  /** `choke` true stops the previous voice — false lets pad hits ring out. */
  playAudio: (samples: Float32Array, sampleRate: number, gain?: number, choke?: boolean) => void;
  activeGroupNames?: string[];
}

export default function FieldPadSampler({
  kit,
  renders,
  sampleRate,
  playAudio,
}: FieldPadSamplerProps): React.ReactElement {
  const [padCount, setPadCount] = useState<8 | 16>(8);
  const [activePad, setActivePad] = useState<number | null>(null);
  const [chokeMode, setChokeMode] = useState(false);
  const [roundRobinIndex, setRoundRobinIndex] = useState<Record<number, number>>({});
  const timeoutRef = useRef<number>(0);

  const pads = useMemo(
    () =>
      Array.from({ length: padCount }, (_, i) => {
        const slice: KitSliceEntry | undefined = kit.slices[i];
        return {
          index: i,
          name: slice ? slice.name : `Pad ${i + 1}`,
          slice,
          hasAudio: slice ? renders[slice.genomeId] !== undefined : false,
        };
      }),
    [kit.slices, padCount, renders]
  );

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  const triggerPad = useCallback(
    (padIndex: number, clientY: number, targetRect: DOMRect) => {
      const pad = pads[padIndex];
      if (!pad || !pad.slice) return;

      // Vertical velocity estimation: bottom of pad = 1.0 (hard), top = 0.5 (soft)
      const relY = Math.max(0, Math.min(1, (clientY - targetRect.top) / targetRect.height));
      const velocityGain = 0.5 + relY * 0.5;

      // Round-robin lookup: check if slice belongs to a group
      const sliceId = pad.slice.id;
      const group = kit.groups.find((g) => g.memberIds.includes(sliceId));

      let targetGenomeId = pad.slice.genomeId;
      if (group && group.memberIds.length > 1) {
        const curIdx = roundRobinIndex[padIndex] ?? 0;
        const nextIdx = (curIdx + 1) % group.memberIds.length;
        setRoundRobinIndex((prev) => ({ ...prev, [padIndex]: nextIdx }));

        const memberSliceId = group.memberIds[curIdx];
        const memberSlice = kit.slices.find((s) => s.id === memberSliceId);
        if (memberSlice && renders[memberSlice.genomeId]) {
          targetGenomeId = memberSlice.genomeId;
        }
      }

      const audio = renders[targetGenomeId];
      if (audio) {
        // Choke on = monophonic (a hit cuts the previous tail); off = the
        // default for a pad bank, where hits layer.
        playAudio(audio, sampleRate, velocityGain, chokeMode);
      }

      // Visual flash animation
      setActivePad(padIndex);
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setActivePad(null), 120);
    },
    [chokeMode, kit.groups, kit.slices, pads, playAudio, renders, roundRobinIndex, sampleRate]
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-[#0c1224] p-3 text-white">
      {/* Header & Modes */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-yellow-400">
            Sampler Pads
          </span>
          <span className="text-[10px] text-white/50">Touch lower for hard hit</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setChokeMode(!chokeMode)}
            aria-pressed={chokeMode}
            title={chokeMode ? 'Each hit stops the previous one' : 'Hits ring out together'}
            className={`min-h-8 rounded px-2 text-[10px] font-bold ${
              chokeMode ? 'bg-yellow-500 text-black' : 'bg-white/10 text-white/70'
            }`}
          >
            Choke
          </button>
          <button
            type="button"
            onClick={() => setPadCount(padCount === 8 ? 16 : 8)}
            className="min-h-8 rounded bg-white/10 px-2 text-[10px] font-bold text-white/80"
          >
            {padCount} Pads
          </button>
        </div>
      </div>

      {/* Pads Grid */}
      <div className="grid grid-cols-4 gap-2">
        {pads.map((pad) => {
          const isTriggered = activePad === pad.index;
          const isAssigned = pad.hasAudio;

          return (
            <button
              key={pad.index}
              type="button"
              onPointerDown={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                triggerPad(pad.index, e.clientY, rect);
              }}
              disabled={!isAssigned}
              className={`relative flex h-20 touch-manipulation flex-col justify-between rounded-xl border p-2 text-left transition select-none active:scale-[0.97] ${
                isTriggered
                  ? 'border-yellow-400 bg-yellow-400 text-black shadow-lg shadow-yellow-500/50'
                  : isAssigned
                    ? 'border-blue-500/40 bg-gradient-to-br from-blue-950/60 to-blue-900/40 text-white hover:border-yellow-400/50'
                    : 'border-white/5 bg-white/5 text-white/30 disabled:opacity-40'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span
                  className={`text-[10px] font-bold font-mono ${
                    isTriggered ? 'text-black' : 'text-blue-300'
                  }`}
                >
                  P{pad.index + 1}
                </span>
                {kit.groups.some((g) => g.memberIds.includes(pad.slice?.id ?? '')) && (
                  <span
                    className={`rounded px-1 text-[8px] font-bold ${
                      isTriggered ? 'bg-black text-yellow-400' : 'bg-purple-500/30 text-purple-300'
                    }`}
                  >
                    RR
                  </span>
                )}
              </div>

              <div
                className={`truncate text-xs font-semibold ${
                  isTriggered ? 'text-black' : 'text-white/90'
                }`}
              >
                {pad.slice ? pad.slice.name : 'Empty'}
              </div>

              {/* Velocity indicator bar at bottom */}
              <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full ${
                    isTriggered ? 'bg-black' : 'bg-yellow-400'
                  }`}
                  style={{ width: isAssigned ? '100%' : '0%' }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
