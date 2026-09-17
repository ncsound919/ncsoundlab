/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Slim always-visible transport for the top bar.
 *
 * `TransportBar` only exists inside Beat Studio, so tempo/play state were hidden
 * on every other screen. This cluster keeps play/stop, BPM (type, nudge or tap)
 * and the current key/scale reachable from anywhere.
 */

import React, { useRef } from 'react';
import { Play, Square, Gauge } from 'lucide-react';

export interface HeaderTransportProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  keyName: string;
  scaleName: string;
}

const MIN_BPM = 40;
const MAX_BPM = 240;
const clampBpm = (v: number) => Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(v)));

/** Compute BPM from tap intervals (ms). Exported for testing. */
export function bpmFromTaps(times: number[]): number | null {
  if (times.length < 2) return null;
  const avg = (times[times.length - 1] - times[0]) / (times.length - 1);
  if (!Number.isFinite(avg) || avg <= 0) return null;
  return clampBpm(60000 / avg);
}

export const HeaderTransport: React.FC<HeaderTransportProps> = ({
  isPlaying,
  onTogglePlay,
  bpm,
  onBpmChange,
  keyName,
  scaleName,
}) => {
  const taps = useRef<number[]>([]);

  const tap = () => {
    const now = performance.now();
    const last = taps.current[taps.current.length - 1];
    if (last !== undefined && now - last > 2000) taps.current = [];
    taps.current.push(now);
    if (taps.current.length > 4) taps.current.shift();
    const next = bpmFromTaps(taps.current);
    if (next != null) onBpmChange(next);
  };

  return (
    <div
      className="flex items-center gap-1 bg-black border border-[#1e293b] p-0.5 rounded-xl shrink-0"
      data-header-transport
    >
      <button
        type="button"
        onClick={onTogglePlay}
        className={`px-2 py-1.5 rounded-lg transition-colors ${isPlaying ? 'text-rose-400 hover:bg-rose-950/40' : 'text-emerald-400 hover:bg-emerald-950/40'}`}
        title={isPlaying ? 'Stop master mix' : 'Play master mix'}
        aria-label={isPlaying ? 'Stop master mix' : 'Play master mix'}
      >
        {isPlaying ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
      </button>

      <div className="flex items-center gap-0.5 px-1">
        <button
          type="button"
          onClick={() => onBpmChange(clampBpm(bpm - 1))}
          className="px-1 text-slate-400 hover:text-white text-[11px] font-mono"
          aria-label="Decrease tempo"
          title="Decrease tempo"
        >
          −
        </button>
        <input
          type="number"
          value={bpm}
          min={MIN_BPM}
          max={MAX_BPM}
          onChange={(e) => onBpmChange(clampBpm(parseInt(e.target.value, 10) || bpm))}
          aria-label="Tempo BPM"
          className="w-11 bg-transparent text-center text-[11px] font-mono font-bold text-yellow-300 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => onBpmChange(clampBpm(bpm + 1))}
          className="px-1 text-slate-400 hover:text-white text-[11px] font-mono"
          aria-label="Increase tempo"
          title="Increase tempo"
        >
          +
        </button>
      </div>

      <button
        type="button"
        onClick={tap}
        className="px-1.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider text-slate-400 hover:text-white hover:bg-white/5 border border-[#1e293b]"
        title="Tap tempo (4 taps)"
        aria-label="Tap tempo"
      >
        Tap
      </button>

      <span
        className="hidden xl:flex items-center gap-1 px-1.5 text-[9px] font-mono text-slate-400 border-l border-[#1e293b]"
        title="Current key & scale"
      >
        <Gauge size={11} className="text-cyan-400" />
        {keyName} {scaleName}
      </span>
    </div>
  );
};

export default HeaderTransport;
