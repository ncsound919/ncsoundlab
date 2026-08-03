/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MPC-style Sample Editor (extreme mode).
 *  - wavesurfer waveform + spectrogram + zoom + timeline
 *  - slice markers (draggable, pad-numbered) with precise nudge (±ms) editing
 *  - tap-to-chop: play the sample and tap the inline pads to drop slice
 *    boundaries exactly where you hear them (like MPC software)
 *  - per-slice audition, gain, tune, root key
 *  - equal / smart (silence) / tap / clear slicing
 *  - sends slices to pads with gain/tune applied
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline';
import SpectrogramPlugin from 'wavesurfer.js/dist/plugins/spectrogram';
import Minimap from 'wavesurfer.js/dist/plugins/minimap';
import { Play, Square, X, Wand2, Scissors, ZoomIn, ZoomOut, Drum, MapPin } from 'lucide-react';
import { audioBufferToWav } from '../lib/audioUtils';
import { audioEngine } from '../lib/audioEngine';
import { SoundLayer, DEFAULT_ENVELOPE, DEFAULT_FX } from '../types';

export interface ChopSound {
  name: string;
  buffer: AudioBuffer;
  start: number;
  end: number;
  gain?: number;
  tune?: number;
}

interface ChopEditorProps {
  buffer: AudioBuffer;
  fileName: string;
  defaultCount: number;
  onSendToPads: (sounds: ChopSound[]) => void;
  onClose: () => void;
}

const ROOT_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface SliceMeta {
  gain: number; // 0..1.5
  tune: number; // semitones -24..24
  key: string;
}

const defaultMeta = (): SliceMeta => ({ gain: 1, tune: 0, key: 'C' });

/** Boundary markers (0..1) → slices between them (with 0 and 1). */
function slicesFromMarkers(markers: number[]): { start: number; end: number }[] {
  const pts = [0, ...[...markers].sort((a, b) => a - b), 1];
  const out: { start: number; end: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i + 1] - pts[i] >= 0.001) out.push({ start: pts[i], end: pts[i + 1] });
  }
  return out;
}

/** Smart silence-based auto slicing. */
function autoMarkers(buffer: AudioBuffer, maxChops: number): number[] {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const win = Math.max(256, Math.floor(sr * 0.01));
  const rms: number[] = [];
  let peak = 0;
  for (let i = 0; i + win <= data.length; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += data[j] * data[j];
    const r = Math.sqrt(sum / win);
    if (r > peak) peak = r;
    rms.push(r);
  }
  if (peak <= 1e-5) return [];
  const threshold = peak * 0.04;
  const minLoud = Math.floor((sr * 0.03) / win);
  const minSilent = Math.floor((sr * 0.02) / win);
  const markers: number[] = [];
  let loud = 0;
  let silent = 0;
  let last = -1;
  for (let i = 0; i < rms.length; i++) {
    if (rms[i] >= threshold) {
      loud++;
      silent = 0;
      if (loud === minLoud && i / rms.length - last > 0.02) {
        markers.push(i / rms.length);
        last = i / rms.length;
      }
    } else {
      silent++;
      if (loud >= minLoud && silent === minSilent && i / rms.length - last > 0.02) {
        markers.push(i / rms.length);
        last = i / rms.length;
      }
      loud = 0;
    }
  }
  return markers.slice(0, Math.max(0, maxChops - 1));
}

export function ChopEditor({ buffer, fileName, defaultCount, onSendToPads, onClose }: ChopEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const dragMarkerRef = useRef<number | null>(null);
  const currentTimeRef = useRef(0);
  const [mode, setMode] = useState<'waveform' | 'spectrogram'>('waveform');
  const [markers, setMarkers] = useState<number[]>([]);
  const [meta, setMeta] = useState<Record<string, SliceMeta>>({}); // keyed by slice start pct
  const [selectedMarker, setSelectedMarker] = useState<number | null>(null);
  const [selectedSlice, setSelectedSlice] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [tapMode, setTapMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [baseName] = useState(() => fileName.replace(/\.[^.]+$/, '').toUpperCase());

  const slicesList = slicesFromMarkers(markers);
  const duration = buffer.duration;

  // wavesurfer lifecycle
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    let disposed = false;
    const plugins: any[] = [TimelinePlugin.create({ height: 20, insertPosition: 'beforebegin' }), Minimap.create({ height: 44, waveColor: '#1e3a8a', progressColor: '#2563eb', interact: true })];
    if (mode === 'spectrogram') plugins.push(SpectrogramPlugin.create({ fftSamples: 1024 }));
    const ws = WaveSurfer.create({
      container,
      height: 200,
      waveColor: '#2563eb',
      progressColor: '#facc15',
      cursorColor: '#facc15',
      cursorWidth: 2,
      minPxPerSec: 20 * zoom,
      plugins,
    });
    wsRef.current = ws;
    ws.loadBlob(audioBufferToWav(buffer), [buffer.getChannelData(0)], buffer.duration).catch(() => {});
    ws.on('timeupdate', (t) => { currentTimeRef.current = t; if (!disposed) setCurrentTime(t); });
    ws.on('play', () => { if (!disposed) setIsPlaying(true); });
    ws.on('pause', () => { if (!disposed) setIsPlaying(false); });
    ws.on('interaction', () => { currentTimeRef.current = ws.getCurrentTime(); if (!disposed) setCurrentTime(ws.getCurrentTime()); });
    return () => {
      disposed = true;
      try { ws.destroy(); } catch { /* ignore */ }
      wsRef.current = null;
    };
  }, [buffer, mode, zoom]);

  const playToggle = () => {
    const ws = wsRef.current;
    if (!ws) return;
    if (ws.isPlaying()) ws.pause();
    else ws.play();
  };

  // Add a boundary marker at the given time (tap-to-chop)
  const addMarkerAt = (time: number) => {
    const pct = Math.max(0.005, Math.min(0.995, time / duration));
    setMarkers((prev) => {
      const next = [...prev.filter((m) => Math.abs(m - pct) > 0.004), pct].sort((a, b) => a - b);
      return next.slice(0, 15); // 15 markers => up to 16 slices
    });
  };

  const tapPad = (n: number) => {
    if (!tapMode) return;
    const t = wsRef.current ? wsRef.current.getCurrentTime() : currentTimeRef.current;
    addMarkerAt(t);
    setCurrentTime(t);
  };

  const removeMarker = (idx: number) => {
    setMarkers((prev) => prev.filter((_, i) => i !== idx));
    setSelectedMarker(null);
  };

  const clearMarkers = () => { setMarkers([]); setSelectedMarker(null); setSelectedSlice(null); };

  // marker drag handlers
  const startDrag = (idx: number, e: React.PointerEvent) => {
    e.preventDefault();
    dragMarkerRef.current = idx;
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedMarker(idx);
  };
  const dragMove = (idx: number, e: React.PointerEvent) => {
    if (dragMarkerRef.current !== idx) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.max(0.002, Math.min(0.998, (e.clientX - rect.left) / rect.width));
    // No re-sort here: keep the marker's index stable while dragging.
    setMarkers((prev) => prev.map((m, i) => (i === idx ? pct : m)));
  };
  const endDrag = () => { dragMarkerRef.current = null; };

  // precise nudge
  const nudgeSelected = (deltaSec: number) => {
    if (selectedMarker === null) return;
    setMarkers((prev) => {
      const cur = prev[selectedMarker];
      if (cur === undefined) return prev;
      const next = [...prev];
      next[selectedMarker] = Math.max(0.002, Math.min(0.998, cur + deltaSec / duration));
      return next;
    });
  };

  const updateMeta = (key: string, patch: Partial<SliceMeta>) => {
    setMeta((prev) => ({ ...prev, [key]: { ...(prev[key] || defaultMeta()), ...patch } }));
  };

  const send = () => {
    const named: ChopSound[] = slicesList.map((s, i) => {
      const m = meta[s.start.toFixed(4)] || defaultMeta();
      return {
        name: `${baseName}_CHOP_${String(i + 1).padStart(2, '0')}`,
        buffer,
        start: s.start,
        end: s.end,
        gain: m.gain,
        tune: m.tune,
      };
    });
    onSendToPads(named);
  };

  const padColor = (i: number) => `from-blue-600/40 to-blue-900/40 border-blue-500/50`;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Sample editor">
      <div className="bg-[#0c0c11] border border-[#242432] rounded-2xl w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden text-white">
        {/* Header */}
        <div className="bg-[#12121b] border-b border-[#222230] px-5 py-3.5 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-black uppercase tracking-wider text-white">Sample Editor</h3>
            <p className="text-[10px] font-mono text-slate-400 mt-0.5">{baseName} · {duration.toFixed(2)}s · {Math.round(buffer.sampleRate / 1000)}kHz · {slicesList.length} slices</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="p-2 rounded-lg bg-[#0f172a] text-slate-400 hover:text-white hover:bg-slate-800 transition-all" title="Close"><X size={18} /></button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-[#1d1d26] bg-[#0a0a0c]">
          <button onClick={playToggle} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${isPlaying ? 'bg-amber-500/20 border border-amber-500/50 text-amber-400' : 'bg-emerald-600/20 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-600/30'}`}>
            {isPlaying ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />} {isPlaying ? 'Stop' : 'Play Sample'}
          </button>
          <button
            onClick={() => setTapMode((t) => !t)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${tapMode ? 'bg-rose-600/25 border border-rose-500/60 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)]' : 'bg-[#121215] border border-[#1e293b] text-slate-400 hover:text-white'}`}
          >
            <MapPin size={12} /> {tapMode ? 'Tapping — play + hit pads' : 'Tap to Chop'}
          </button>
          <button onClick={() => { clearMarkers(); setMarkers(autoMarkers(buffer, Math.max(2, Math.min(16, defaultCount)))); }} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-fuchsia-400 hover:text-white transition-all flex items-center gap-1.5"><Wand2 size={12} /> Smart</button>
          <button onClick={() => { const m = Array.from({ length: Math.max(1, Math.min(15, defaultCount - 1)) }, (_, i) => (i + 1) / defaultCount); setMarkers(m); }} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-sky-400 hover:text-white transition-all flex items-center gap-1.5"><Scissors size={12} /> Equal ×{defaultCount}</button>
          <button onClick={clearMarkers} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-[#121215] border border-[#1e293b] text-slate-400 hover:text-white transition-all">Clear</button>
          <span className="mx-1 h-5 w-px bg-[#1e293b]" />
          {(['waveform', 'spectrogram'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${mode === m ? 'bg-blue-600/20 border border-blue-500/50 text-blue-300' : 'bg-[#121215] border border-[#1e293b] text-slate-500 hover:text-white'}`}>{m}</button>
          ))}
          <button onClick={() => setZoom((z) => Math.min(8, Math.round((z + 1) * 10) / 10))} className="p-1.5 rounded-lg bg-[#121215] border border-[#1e293b] text-slate-400 hover:text-white transition-all" title="Zoom in"><ZoomIn size={13} /></button>
          <button onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 1) * 10) / 10))} className="p-1.5 rounded-lg bg-[#121215] border border-[#1e293b] text-slate-400 hover:text-white transition-all" title="Zoom out"><ZoomOut size={13} /></button>
          <button onClick={send} className="ml-auto px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider bg-fuchsia-600/20 border border-fuchsia-500/50 hover:bg-fuchsia-600/30 text-fuchsia-300 transition-all flex items-center gap-1.5"><Drum size={13} /> Send Slices → Pads</button>
        </div>

        {/* Waveform with markers */}
        <div className="px-5 pt-3">
          <div className="relative w-full">
            <div ref={containerRef} className="w-full rounded-lg overflow-hidden bg-black/40 border border-[#1e293b]" style={{ height: 200 }} />
            <div className="absolute inset-0 pointer-events-none">
              {markers.map((m, i) => (
                <div
                  key={i}
                  onPointerDown={(e) => startDrag(i, e)}
                  onPointerMove={(e) => dragMove(i, e)}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onDoubleClick={() => removeMarker(i)}
                  className={`absolute top-0 bottom-0 w-[3px] -translate-x-1/2 cursor-ew-resize pointer-events-auto flex flex-col items-center ${selectedMarker === i ? 'bg-white' : 'bg-amber-400'}`}
                  style={{ left: `${m * 100}%` }}
                  title={`Slice marker ${i + 1} · ${(m * duration).toFixed(3)}s · double-click to remove`}
                >
                  <span className="mt-1 text-[8px] font-mono font-black text-black px-1 rounded bg-amber-400">{i + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tap pads + transport readout */}
        <div className="px-5 py-3 border-b border-[#1d1d26] bg-[#0a0a0c]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">{tapMode ? 'Tap pads while playing to drop slice markers' : `Tap to Chop off · time ${currentTime.toFixed(2)}s / ${duration.toFixed(2)}s`}</span>
            <span className="text-[9px] font-mono text-slate-600">markers: {markers.length}</span>
          </div>
          <div className="grid grid-cols-8 gap-1.5">
            {Array.from({ length: 16 }, (_, i) => (
              <button
                key={i}
                onPointerDown={(e) => { e.preventDefault(); tapPad(i); }}
                className={`aspect-square rounded-md bg-gradient-to-br ${padColor(i)} border border-blue-500/40 flex items-center justify-center text-[9px] font-mono font-black text-white/80 hover:brightness-125 active:scale-90 transition-all touch-none ${tapMode ? 'cursor-pointer' : 'opacity-50'}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Precise editing + slice list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
          {/* Precision bar for selected marker */}
          {selectedMarker !== null && markers[selectedMarker] !== undefined && (
            <div className="bg-[#0f0f12] border border-amber-500/30 rounded-xl p-3 flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">Marker {selectedMarker + 1}</span>
              <span className="text-[11px] font-mono text-white">{((markers[selectedMarker] ?? 0) * duration).toFixed(3)}s</span>
              {[0.001, 0.01, 0.1].map((d) => (
                <button key={`-${d}`} onClick={() => nudgeSelected(-d)} className="px-2 py-1 rounded bg-[#121215] border border-[#1e293b] text-slate-300 hover:text-white text-[10px] font-mono">-{d * 1000}ms</button>
              ))}
              {[0.001, 0.01, 0.1].map((d) => (
                <button key={`+${d}`} onClick={() => nudgeSelected(d)} className="px-2 py-1 rounded bg-[#121215] border border-[#1e293b] text-slate-300 hover:text-white text-[10px] font-mono">+{d * 1000}ms</button>
              ))}
              <input
                type="range" min="0.5" max="99.5" step="0.1"
                value={Math.round((markers[selectedMarker] ?? 0) * 1000) / 10}
                onChange={(e) => setMarkers((prev) => prev.map((m, i) => (i === selectedMarker ? parseFloat(e.target.value) / 100 : m)))}
                className="flex-1 min-w-[120px] accent-amber-400 h-1 rounded-lg cursor-pointer"
                aria-label="Marker position %"
              />
              <span className="text-[10px] font-mono text-slate-400">{Math.round((markers[selectedMarker] ?? 0) * 100)}%</span>
              <button onClick={() => removeMarker(selectedMarker)} className="px-2 py-1 rounded bg-[#121215] border border-red-500/40 text-red-400 hover:text-white text-[10px] font-black uppercase">Remove</button>
            </div>
          )}

          {/* Slice list */}
          {slicesList.map((s, i) => {
            const m = meta[s.start.toFixed(4)] || defaultMeta();
            const isSel = selectedSlice === i;
            return (
              <div key={i} className={`bg-[#0f0f12] border rounded-xl p-2.5 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-2 items-center ${isSel ? 'border-amber-500/60' : 'border-[#1e293b]'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-slate-500 w-8">PAD {String(i + 1).padStart(2, '0')}</span>
                  <button
                    onClick={() => {
                      setSelectedSlice(i);
                      const layer: SoundLayer = { id: `aud-${i}`, name: `${baseName}_${i + 1}`, type: 'sample', enabled: true, gain: m.gain, pan: 0, pitch: m.tune, envelope: { ...DEFAULT_ENVELOPE }, fx: { ...DEFAULT_FX }, audioBuffer: buffer, playStartPct: s.start, playEndPct: s.end };
                      audioEngine.triggerLayer(layer);
                    }}
                    className="p-1.5 rounded-lg bg-[#121215] border border-[#1e293b] text-slate-300 hover:text-white transition-all"
                    title="Audition slice"
                  >
                    <Play size={11} fill="currentColor" />
                  </button>
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] font-mono text-slate-400">{(s.start * duration).toFixed(3)}s → {(s.end * duration).toFixed(3)}s</span>
                    <select value={m.key} onChange={(e) => updateMeta(s.start.toFixed(4), { key: e.target.value })} className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1.5 py-0.5 text-[9px] font-mono text-white focus:outline-none cursor-pointer" aria-label="Root key">
                      {ROOT_KEYS.map((k) => <option key={k} value={k} className="text-white">{k}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 text-[8px] font-mono text-slate-500">
                    <span>Gain</span>
                    <input type="range" min="0" max="1.5" step="0.05" value={m.gain} onChange={(e) => updateMeta(s.start.toFixed(4), { gain: parseFloat(e.target.value) })} className="flex-1 accent-emerald-400 h-1 rounded-lg cursor-pointer" aria-label={`Slice ${i + 1} gain`} />
                    <span>{Math.round(m.gain * 100)}%</span>
                    <span className="ml-2">Tune</span>
                    <input type="range" min="-24" max="24" step="1" value={m.tune} onChange={(e) => updateMeta(s.start.toFixed(4), { tune: parseInt(e.target.value) })} className="flex-1 accent-sky-400 h-1 rounded-lg cursor-pointer" aria-label={`Slice ${i + 1} tune`} />
                    <span>{m.tune >= 0 ? '+' : ''}{m.tune}st</span>
                  </div>
                </div>
                <button onClick={() => { setSelectedSlice(i); setSelectedMarker(i < markers.length ? i : null); }} className="p-1.5 rounded text-slate-500 hover:text-amber-400 transition-colors" title="Select slice boundary"><MapPin size={13} /></button>
              </div>
            );
          })}
          {slicesList.length === 0 && (
            <p className="text-[11px] text-slate-500 font-mono text-center py-6">No slices — tap pads in Tap mode, or use Smart / Equal.</p>
          )}
        </div>
      </div>
    </div>
  );
}
