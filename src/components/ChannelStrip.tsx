/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ChannelStrip (Phase 3.2).
 *
 * A reusable per-layer mixer channel — channel number, name, type, mute/solo,
 * trigger-delay knob, crop-boundary read-out, pan knob, peak meter (real
 * audio via the parent), vertical fader, and quick actions (duplicate, copy
 * FX, paste FX, randomize). Extracted from LayerMixer so it can also be
 * reused by the dedicated mixer view.
 */

import React from 'react';
import { SoundLayer } from '../types';
import { Fader } from './Fader';
import { Knob } from './Knob';
import {
  ArrowRight,
  Scissors,
} from 'lucide-react';

export interface ChannelStripProps {
  layer: SoundLayer;
  index: number;
  isSelected: boolean;
  peak: number;
  onSelectLayer: (id: string) => void;
  onUpdateLayer: (id: string, updates: Partial<SoundLayer>) => void;
  onDuplicateLayer?: (id: string) => void;
  onCopyFX?: (id: string) => void;
  onPasteFX?: (id: string) => void;
  onRandomizePitchPan?: (id: string) => void;
  onReorderLayer?: (id: string, direction: 'up' | 'down') => void;
  /** Optional VU send level (Phase 3.3 — FX sends). 0..1. */
  sendLevel?: number;
  /** Optional EQ bands config for the strip's EQ section (Phase 3.4). */
  eqBands?: number;
  /** Optional mute toggle from a parent bypass all switch. */
  bypassed?: boolean;
}

export const ChannelStrip: React.FC<ChannelStripProps> = ({
  layer,
  index,
  isSelected,
  peak,
  onSelectLayer,
  onUpdateLayer,
  onDuplicateLayer,
  onCopyFX,
  onPasteFX,
  onRandomizePitchPan,
  onReorderLayer,
  sendLevel,
  eqBands,
  bypassed,
}) => {
  const displayNum = (index + 1).toString().padStart(2, '0');

  return (
    <div
      onClick={() => onSelectLayer(layer.id)}
      className={`w-44 flex-shrink-0 flex flex-col justify-between bg-black border rounded-2xl p-3 transition-all cursor-pointer group select-none relative ${
        isSelected
          ? 'border-blue-500 bg-[#000000] shadow-[0_0_20px_rgba(37,99,235,0.45)]'
          : 'border-[#1e293b] hover:border-blue-900'
      } ${!layer.enabled ? 'opacity-40 hover:opacity-75' : ''}`}
      data-channel-strip
      data-layer-id={layer.id}
      data-bypassed={bypassed ? 'true' : undefined}
    >
      {/* Channel Strip Top Details */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono font-black text-yellow-400">CH {displayNum}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onReorderLayer?.(layer.id, 'up'); }}
              disabled={index === 0}
              className="text-gray-600 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed ml-1"
              title="Move Layer Up"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onReorderLayer?.(layer.id, 'down'); }}
              disabled={index === 0 /* parent passes `layers.length - 1` via disable logic if needed */}
              className="text-gray-600 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move Layer Down"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </button>
          </div>

          {/* Channel Power / LED Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpdateLayer(layer.id, { enabled: !layer.enabled });
            }}
            aria-label={layer.enabled ? 'Bypass Track' : 'Activate Track'}
            className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all ${
              layer.enabled
                ? 'bg-yellow-400/30 border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.6)]'
                : 'bg-[#0f172a] border-[#3f3f46]'
            }`}
            title={layer.enabled ? 'Bypass Track' : 'Activate Track'}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${layer.enabled ? 'bg-yellow-400' : 'bg-slate-600'}`} />
          </button>
        </div>

        <div className="flex flex-col truncate">
          <span className="text-[11px] font-black font-urban text-white uppercase truncate tracking-wide" title={layer.name}>
            {layer.name}
          </span>
          <span className="text-[9px] text-purple-300 uppercase tracking-widest font-mono font-bold">
            {layer.type === 'sample' ? '💿 SAMPLE' : '🎹 SYNTH'}
          </span>
        </div>
      </div>

      {/* Mute and Solo Rack Buttons */}
      <div className="grid grid-cols-3 gap-1 mb-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUpdateLayer(layer.id, { muted: !layer.muted });
          }}
          className={`py-1 rounded text-[9px] font-mono font-extrabold flex items-center justify-center border transition-all ${
            layer.muted
              ? 'bg-red-950/40 border-red-500/60 text-red-400 shadow-[0_0_6px_rgba(239,68,68,0.2)]'
              : 'bg-[#161619] border-[#222] text-gray-500 hover:text-gray-300'
          }`}
          title="Mute Channel"
        >
          MUTE
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUpdateLayer(layer.id, { soloed: !layer.soloed });
          }}
          className={`py-1 rounded text-[9px] font-mono font-extrabold flex items-center justify-center border transition-all ${
            layer.soloed
              ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.2)]'
              : 'bg-[#161619] border-[#222] text-gray-500 hover:text-gray-300'
          }`}
          title="Solo Channel"
        >
          SOLO
        </button>
      </div>

      {/* Alignment Control: Trigger Delay Knob */}
      <div className="bg-[#0c0c0e] border border-[#1b1b1e] rounded-xl p-3 mb-3.5 flex flex-col items-center justify-center relative">
        <div className="flex justify-center mb-1">
          <Knob
            label="Trigger Delay"
            value={layer.startTimeOffset ?? 0}
            min={0.0}
            max={3.0}
            step={0.05}
            unit="s"
            color="#f97316"
            onChange={(v) => onUpdateLayer(layer.id, { startTimeOffset: v })}
            size={48}
          />
        </div>
      </div>

      {/* Crop Boundaries Monitor */}
      <div className="bg-[#0c0c0e] border border-[#1b1b1e] rounded-xl p-2 mb-3.5 space-y-1 relative">
        <div className="flex items-center justify-between text-[9px] font-bold text-[#888]">
          <span className="flex items-center gap-0.5"><Scissors size={9} /> CROP RANGE</span>
        </div>
        <div className="flex items-center justify-between text-[9px] font-mono text-gray-400 pt-0.5">
          <div className="bg-[#151518] px-1 py-0.5 rounded border border-[#222] text-[#888]">
            {Math.round((layer.playStartPct ?? 0) * 100)}%
          </div>
          <ArrowRight size={8} className="text-[#444]" />
          <div className="bg-[#151518] px-1 py-0.5 rounded border border-[#222] text-[#888]">
            {Math.round((layer.playEndPct ?? 1) * 100)}%
          </div>
        </div>
      </div>

      {/* Channel Pan */}
      <div className="flex items-center justify-center pb-3">
        <Knob
          label="PAN"
          value={layer.pan}
          min={-1}
          max={1}
          step={0.05}
          onChange={(v) => onUpdateLayer(layer.id, { pan: v })}
          className="scale-90"
        />
      </div>

      {/* Send level indicator (Phase 3.3 — FX sends) */}
      {typeof sendLevel === 'number' && (
        <div className="bg-[#0c0c0e] border border-[#1b1b1e] rounded-xl p-1 mb-3 flex items-center gap-1" title={`FX send level ${(sendLevel * 100).toFixed(0)}%`}>
          <span className="text-[8px] font-mono font-bold text-cyan-400 uppercase tracking-widest px-1">SND</span>
          <div className="flex-1 h-1 bg-black/60 rounded overflow-hidden">
            <div className="h-full bg-cyan-400" style={{ width: `${Math.min(100, sendLevel * 100)}%` }} />
          </div>
        </div>
      )}

      {/* Per-bus send levels (Phase 3.3) */}
      {layer.sends && Object.keys(layer.sends).length > 0 && (
        <div className="bg-[#0c0c0e] border border-[#1b1b1e] rounded-xl p-2 mb-3 space-y-1" data-sends-row>
          {Object.entries(layer.sends).map(([busId, level]) => {
            const v = typeof level === 'number' ? level : 0;
            return (
            <div key={busId} className="flex items-center gap-1" data-send={busId}>
              <span className="text-[8px] font-mono font-bold text-cyan-300 uppercase tracking-widest w-10 truncate">
                {busId}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={v}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  onUpdateLayer(layer.id, {
                    sends: { ...(layer.sends ?? {}), [busId]: next },
                  });
                }}
                className="flex-1 h-1 accent-cyan-400 cursor-pointer"
                aria-label={`${busId} send level`}
              />
              <span className="text-[8px] font-mono text-cyan-300 w-8 text-right">
                {Math.round(v * 100)}%
              </span>
            </div>
            );
          })}
        </div>
      )}

      {/* EQ badge (Phase 3.4 — per-layer parametric EQ) */}
      {(typeof eqBands === 'number' && eqBands > 0) ||
      (layer.fx?.eq && layer.fx.eq.some((b) => b.enabled !== false)) ? (
        <div className="bg-[#0c0c0e] border border-[#1b1b1e] rounded-xl p-1 mb-3 text-center" title="Parametric EQ on this channel">
          <span className="text-[8px] font-mono font-bold text-emerald-400 uppercase tracking-widest">
            EQ · {(layer.fx?.eq ?? []).filter((b) => b.enabled !== false).length || eqBands || 0} BAND
          </span>
        </div>
      ) : null}

      {/* Vertical Fader Section with VU Peak Indicator */}
      <div className="flex items-stretch justify-center h-44 gap-3 bg-[#0a0a0c] p-2 rounded-xl border border-[#1b1b1e]">
        {/* Visual LED Level Meter */}
        <div className="w-1.5 flex flex-col justify-end bg-black/60 rounded-full h-full p-0.5 overflow-hidden">
          <div
            className="w-full rounded-full transition-all duration-75"
            style={{
              height: `${Math.min(100, peak * 100)}%`,
              background:
                peak > 0.85
                  ? 'linear-gradient(to top, #10B981, #F59E0B, #EF4444)'
                  : peak > 0.65
                  ? 'linear-gradient(to top, #10B981, #F59E0B)'
                  : '#10B981',
            }}
          />
        </div>

        {/* Tactile Channel Volume Fader */}
        <Fader
          label="GAIN"
          value={layer.gain}
          min={0.0}
          max={1.5}
          step={0.02}
          size={144}
          color={isSelected ? '#F97316' : '#3B82F6'}
          onChange={(v) => onUpdateLayer(layer.id, { gain: v })}
        />
      </div>

      {/* Channel Quick Actions Bar */}
      <div className="pt-2 mt-2 border-t border-[#1a1a20] grid grid-cols-4 gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDuplicateLayer?.(layer.id);
          }}
          className="p-1 bg-[#16161c] hover:bg-[#202028] text-gray-400 hover:text-amber-400 border border-[#23232c] rounded text-[9px] font-mono font-bold uppercase transition-colors"
          title="Duplicate Layer"
        >
          Dup
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCopyFX?.(layer.id);
          }}
          className="p-1 bg-[#16161c] hover:bg-[#202028] text-gray-400 hover:text-sky-400 border border-[#23232c] rounded text-[9px] font-mono font-bold uppercase transition-colors"
          title="Copy FX Settings"
        >
          Copy
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPasteFX?.(layer.id);
          }}
          className="p-1 bg-[#16161c] hover:bg-[#202028] text-gray-400 hover:text-emerald-400 border border-[#23232c] rounded text-[9px] font-mono font-bold uppercase transition-colors"
          title="Paste FX Settings"
        >
          Pst
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRandomizePitchPan?.(layer.id);
          }}
          className="p-1 bg-[#16161c] hover:bg-[#202028] text-gray-400 hover:text-purple-400 border border-[#23232c] rounded text-[9px] font-mono font-bold uppercase transition-colors"
          title="Randomize Pitch & Pan"
        >
          Rnd
        </button>
      </div>
    </div>
  );
};

export default ChannelStrip;
