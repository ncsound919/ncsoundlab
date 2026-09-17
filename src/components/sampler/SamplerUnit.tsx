/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sampler unit — the sample editor presented inside an MPD226-style chassis,
 * and the bridge the MIDI controller drives when "Sampler" mode is active.
 *
 * The screen spans the full width of the unit (where the MPD226's small LCD
 * would be) and hosts the waveform / spectrogram editor with precision zoom.
 * The pads / knobs / faders below are the unit's control surface, drawn to
 * match the hardware.
 */

import React, { useEffect, useRef, useState } from 'react';
import { WaveformEditor } from '../WaveformEditor';
import { audioEngine } from '../../lib/audioEngine';
import { useSamplerStore, type SamplerBridge, type SamplerParam } from '../../store/samplerStore';

interface SamplerUnitProps {
  buffer: AudioBuffer | null;
  selectionStart: number;
  selectionEnd: number;
  onSelectionChange: (start: number, end: number) => void;
  playbackTime?: number | null;
  /** Name shown in the screen's title strip. */
  layerName?: string;
  /** Run a destructive DSP edit on the current selection (reverse, crop, …). */
  onApplyEffect?: (type: string) => void;
}

const PAD_TINTS = [
  'border-blue-500/60 bg-blue-500/10', 'border-cyan-500/60 bg-cyan-500/10',
  'border-emerald-500/60 bg-emerald-500/10', 'border-lime-500/60 bg-lime-500/10',
  'border-yellow-500/60 bg-yellow-500/10', 'border-amber-500/60 bg-amber-500/10',
  'border-orange-500/60 bg-orange-500/10', 'border-red-500/60 bg-red-500/10',
  'border-rose-500/60 bg-rose-500/10', 'border-fuchsia-500/60 bg-fuchsia-500/10',
  'border-purple-500/60 bg-purple-500/10', 'border-violet-500/60 bg-violet-500/10',
  'border-indigo-500/60 bg-indigo-500/10', 'border-sky-500/60 bg-sky-500/10',
  'border-teal-500/60 bg-teal-500/10', 'border-pink-500/60 bg-pink-500/10',
];

/** Decorative control surface (non-interactive: it mirrors the hardware). */
const ControlStrip: React.FC = () => (
  <div className="mt-3 flex items-end justify-between gap-4 flex-wrap" aria-hidden="true">
    <div className="grid grid-cols-4 gap-[3px]">
      {PAD_TINTS.map((tint, i) => (
        <div key={i} className={`w-6 h-[18px] rounded-[3px] border ${tint} shadow-inner`} />
      ))}
    </div>
    <div className="flex items-end gap-5">
      <div className="flex items-end gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="w-6 h-6 rounded-full border border-[#33333c] bg-gradient-to-br from-[#2a2a30] to-[#141418] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]">
            <div className="w-px h-2 bg-slate-500 mx-auto mt-1" />
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="w-2.5 h-12 rounded-full bg-black border border-[#2a2a33] relative">
            <div className="absolute left-1/2 -translate-x-1/2 w-4 h-2.5 rounded-[3px] bg-gradient-to-b from-[#3a3a44] to-[#1c1c22] border border-[#44444f]" style={{ bottom: `${20 + i * 12}%` }} />
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="w-5 h-4 rounded-[3px] border border-[#33333c] bg-gradient-to-b from-[#26262c] to-[#141418]" />
        ))}
      </div>
    </div>
  </div>
);

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const SamplerUnit: React.FC<SamplerUnitProps> = ({
  buffer,
  selectionStart,
  selectionEnd,
  onSelectionChange,
  playbackTime = null,
  layerName,
  onApplyEffect,
}) => {
  const [zoom, setZoom] = useState(1);
  const [amp, setAmp] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [gain, setGain] = useState(0.8);

  // Latest values/callbacks for the long-lived bridge closure.
  const liveRef = useRef({ buffer, selectionStart, selectionEnd, pitch, gain, onApplyEffect, onSelectionChange });
  liveRef.current = { buffer, selectionStart, selectionEnd, pitch, gain, onApplyEffect, onSelectionChange };

  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Play the buffer, optionally transposed, and remember the source so `stop`
  // can cut it. Wrapped defensively: no audio context just means silent.
  const play = (semis: number, velocity01: number) => {
    const live = liveRef.current;
    if (!live.buffer) return;
    try {
      const ctx = audioEngine.getContext();
      if (!ctx) return;
      const src = ctx.createBufferSource();
      src.buffer = live.buffer;
      src.playbackRate.value = Math.pow(2, semis / 12);
      const g = ctx.createGain();
      g.gain.value = Math.max(0.02, velocity01) * live.gain;
      src.connect(g);
      // Route through the app's master chain (master gain / limiter) when it is
      // available so previews respect the master level; fall back to the raw
      // destination otherwise.
      const master = audioEngine.getMasterRackInput?.() ?? null;
      g.connect(master ?? ctx.destination);
      try { sourceRef.current?.stop(); } catch { /* ignore */ }
      src.start();
      sourceRef.current = src;
    } catch {
      /* audio unavailable (tests / suspended context) — no-op */
    }
  };

  const stop = () => {
    try { sourceRef.current?.stop(); } catch { /* ignore */ }
    sourceRef.current = null;
  };

  const setSelection = (s: number, e: number) => {
    const start = clamp01(Math.min(s, e));
    const end = clamp01(Math.max(s, e));
    liveRef.current.onSelectionChange(start, end);
  };

  // Register the bridge while the sampler is mounted so the controller's
  // sample:* actions reach this editor.
  useEffect(() => {
    const bridge: SamplerBridge = {
      reverse: () => liveRef.current.onApplyEffect?.('reverse'),
      normalize: () => liveRef.current.onApplyEffect?.('normalize'),
      invert: () => liveRef.current.onApplyEffect?.('invert'),
      crop: () => liveRef.current.onApplyEffect?.('crop'),
      fadeIn: () => liveRef.current.onApplyEffect?.('fadein'),
      fadeOut: () => liveRef.current.onApplyEffect?.('fadeout'),
      glitch: () => liveRef.current.onApplyEffect?.('glitch'),
      preview: () => play(0, 1),
      stop,
      setParam: (param: SamplerParam, value: number) => {
        const live = liveRef.current;
        switch (param) {
          case 'zoom': setZoom(Math.max(0.5, Math.min(64, value))); break;
          case 'amp': setAmp(Math.max(1, Math.min(4, value))); break;
          case 'pitch': setPitch(Math.max(-12, Math.min(12, value))); break;
          case 'gain': setGain(clamp01(value)); break;
          case 'selStart': setSelection(value, Math.max(value + 0.01, live.selectionEnd)); break;
          case 'selEnd': setSelection(Math.min(live.selectionStart, value - 0.01), value); break;
          case 'selLength': setSelection(live.selectionStart, live.selectionStart + value); break;
          case 'selCenter': {
            const half = Math.max(0.005, (live.selectionEnd - live.selectionStart) / 2);
            const start = value - half;
            setSelection(start, start + half * 2);
            break;
          }
          default: break;
        }
      },
      pad: (index: number, velocity01: number) => play(index - 8 + liveRef.current.pitch, velocity01),
    };
    useSamplerStore.getState().setBridge(bridge, layerName ?? 'Sample');
    return () => {
      stop();
      const state = useSamplerStore.getState();
      // Only clear our own bridge (guard against a stale unmount).
      if (state.bridge === bridge) state.clearBridge();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer, layerName]);

  return (
    <div
      data-sampler-unit
      className="rounded-3xl border border-[#2a2a33] bg-gradient-to-b from-[#1b1b20] to-[#0b0b0e] p-3 sm:p-4 shadow-[0_20px_60px_rgba(0,0,0,0.65)]"
    >
      {/* Top bezel */}
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-fastblaze tracking-widest text-white">AKAI</span>
          <span className="text-[9px] font-mono uppercase tracking-[0.3em] text-slate-500">MPD226</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_7px_rgba(52,211,153,0.9)]" />
          <span className="text-[8px] font-mono uppercase tracking-widest text-slate-500">Power</span>
        </div>
      </div>

      {/* Screen — full width of the unit */}
      <div
        data-sampler-screen
        className="rounded-xl border border-[#05060a] bg-[#04060b] p-2 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.15),inset_0_2px_14px_rgba(0,0,0,0.9)]"
      >
        <div className="flex items-center justify-between px-1 pb-1.5">
          <span className="text-[8px] font-mono uppercase tracking-[0.25em] text-cyan-400/80">
            Sample Editor{layerName ? ` · ${layerName}` : ''}
          </span>
          <span className="text-[8px] font-mono uppercase tracking-[0.25em] text-slate-600">Screen</span>
        </div>
        <WaveformEditor
          buffer={buffer}
          selectionStart={selectionStart}
          selectionEnd={selectionEnd}
          onSelectionChange={onSelectionChange}
          playbackTime={playbackTime}
          height={210}
          zoom={zoom}
          onZoomChange={setZoom}
          ampZoom={amp}
          onAmpZoomChange={setAmp}
        />
      </div>

      <ControlStrip />
    </div>
  );
};

export default SamplerUnit;
