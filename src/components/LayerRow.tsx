/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * One row in the Sound Design layer stack.
 *
 * Extracted from App so it can carry the identity upgrades the layer list
 * needed: a stable colour, a waveform thumbnail for samples, and a live peak
 * meter while the stack is playing. All existing controls keep their labels.
 */

import React, { useMemo } from 'react';
import { Play, Layers, Trash2 } from 'lucide-react';
import { SoundLayer } from '../types';
import { computePeaks, peaksToPath, type PeakSource } from '../lib/waveformPeaks';
import { layerColorFor } from '../lib/layerColors';

export interface LayerRowProps {
  layer: SoundLayer;
  index: number;
  isSelected: boolean;
  /** Live peak 0..1 from the shared level loop (0 when stopped). */
  level?: number;
  onSelect: () => void;
  onRename: (name: string) => void;
  onToggleEnabled: () => void;
  onPlay: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export const LayerRow: React.FC<LayerRowProps> = ({
  layer,
  index,
  isSelected,
  level = 0,
  onSelect,
  onRename,
  onToggleEnabled,
  onPlay,
  onDuplicate,
  onDelete,
}) => {
  const color = layerColorFor(layer, index);
  const isSample = layer.type === 'sample' && !!layer.audioBuffer;

  const peaks = useMemo(
    () => (isSample ? computePeaks(layer.audioBuffer as unknown as PeakSource, 48) : []),
    [isSample, layer.audioBuffer]
  );
  const path = useMemo(() => peaksToPath(peaks, 56, 18), [peaks]);

  return (
    <div
      onClick={onSelect}
      data-layer-row={layer.id}
      data-layer-color={color}
      className={`relative flex items-center gap-2.5 pl-3 pr-3 py-2 rounded-lg border transition-all cursor-pointer group overflow-hidden ${
        isSelected
          ? 'bg-[#0f172a]/30 border-yellow-400/70 shadow-[0_0_10px_rgba(250,204,21,0.08)]'
          : 'bg-[#0b0b0d] border-[#1e293b] hover:border-slate-500 hover:bg-[#121215]'
      }`}
    >
      {/* Identity colour bar */}
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: color }} aria-hidden="true" />

      <span
        className="text-[10px] font-mono font-bold w-5 h-5 rounded flex items-center justify-center shrink-0 border"
        style={{ color, borderColor: `${color}66`, backgroundColor: `${color}1a` }}
      >
        {(index + 1).toString().padStart(2, '0')}
      </span>

      {/* Waveform thumbnail (samples) or a compact live meter (all layers) */}
      <span className="relative hidden sm:flex w-14 h-6 items-center justify-center shrink-0" aria-hidden="true">
        {isSample ? (
          <svg viewBox="0 0 56 18" width="56" height="18" preserveAspectRatio="none" className="opacity-80">
            <path d={path} fill={color} fillOpacity={0.35} stroke={color} strokeWidth="0.6" />
          </svg>
        ) : (
          <svg viewBox="0 0 56 18" width="56" height="18" className="opacity-60">
            <path d="M2 9 L10 9 L14 3 L18 15 L22 6 L26 12 L30 9 L54 9" fill="none" stroke={color} strokeWidth="1.2" />
          </svg>
        )}
      </span>

      <input
        type="text"
        value={layer.name}
        aria-label={`Layer ${layer.id} name`}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onRename(e.target.value)}
        className="bg-transparent text-[11px] font-black text-white uppercase tracking-wider border-b border-transparent hover:border-slate-700 focus:border-yellow-400 focus:outline-none py-0.5 max-w-[140px] min-w-0 flex-1"
      />

      <span
        className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest font-mono shrink-0 ${
          layer.type === 'synth'
            ? 'bg-teal-950/50 text-teal-300 border border-teal-500/30'
            : 'bg-orange-950/50 text-orange-300 border border-orange-500/30'
        }`}
      >
        {layer.type}
      </span>

      {/* Live peak meter */}
      <span className="hidden md:block w-16 h-1.5 rounded-full bg-black border border-[#1e293b] overflow-hidden shrink-0" aria-hidden="true">
        <span
          data-layer-level={Math.round(Math.max(0, Math.min(1, level)) * 100)}
          className="block h-full rounded-full transition-[width] duration-75"
          style={{ width: `${Math.round(Math.max(0, Math.min(1, level)) * 100)}%`, backgroundColor: color }}
        />
      </span>

      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onToggleEnabled}
          className={`px-2 py-1 text-[9px] font-extrabold rounded border transition-all ${
            layer.enabled
              ? 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/20'
              : 'bg-black border-[#1e293b] text-slate-500 hover:text-slate-300'
          }`}
          aria-label={layer.enabled ? 'Mute Layer' : 'Unmute Layer'}
          title={layer.enabled ? 'Mute Layer' : 'Unmute Layer'}
        >
          {layer.enabled ? 'ON' : 'OFF'}
        </button>
        <button
          onClick={onPlay}
          className="p-1.5 rounded hover:bg-[#1a1a24] text-slate-400 hover:text-yellow-400 transition-colors"
          aria-label="Play Layer"
          title="Play Layer"
        >
          <Play size={12} fill="currentColor" />
        </button>
        <button
          onClick={onDuplicate}
          className="p-1.5 rounded hover:bg-[#1a1a24] text-slate-400 hover:text-white transition-colors"
          aria-label="Duplicate Layer"
          title="Duplicate Layer"
        >
          <Layers size={13} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded hover:bg-red-950/40 text-slate-500 hover:text-red-400 transition-colors"
          aria-label="Delete Layer"
          title="Delete Layer"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
};

export default LayerRow;
