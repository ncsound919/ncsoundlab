/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Enhanced waveform editor backed by wavesurfer.js (BSD-3):
 *  - professional min/max peak waveform + timeline ruler
 *  - draggable/resizable crop region (selectionStart/End in 0..1)
 *  - waveform ↔ spectrogram modes
 *  - optional external playhead sync via `playbackTime` (seconds)
 */

import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin, { Region } from 'wavesurfer.js/dist/plugins/regions';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline';
import SpectrogramPlugin from 'wavesurfer.js/dist/plugins/spectrogram';
import Minimap from 'wavesurfer.js/dist/plugins/minimap';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { audioBufferToWav } from '../lib/audioUtils';

interface WaveformEditorProps {
  buffer: AudioBuffer | null;
  selectionStart: number;
  selectionEnd: number;
  onSelectionChange: (start: number, end: number) => void;
  playbackTime?: number | null;
  height?: number;
}

export function WaveformEditor({ buffer, selectionStart, selectionEnd, onSelectionChange, playbackTime = null, height = 176 }: WaveformEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionRef = useRef<Region | null>(null);
  const [mode, setMode] = useState<'waveform' | 'spectrogram'>('waveform');
  const [zoom, setZoom] = useState(1);

  // Create / destroy the wavesurfer instance on buffer, mode, or zoom change
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !buffer) return;
    container.innerHTML = '';

    let disposed = false;
    const regions = RegionsPlugin.create();
    const plugins: any[] = [
      TimelinePlugin.create({ height: 20, insertPosition: 'beforebegin' }),
      Minimap.create({ height: 44, waveColor: '#1e3a8a', progressColor: '#2563eb', interact: true }),
      regions,
    ];
    if (mode === 'spectrogram') {
      plugins.push(SpectrogramPlugin.create({ fftSamples: 1024 }));
    }
    const ws = WaveSurfer.create({ container, height, waveColor: '#2563eb', progressColor: '#facc15', cursorColor: '#facc15', cursorWidth: 2, minPxPerSec: 16 * zoom, plugins });
    wsRef.current = ws;

    const blob = audioBufferToWav(buffer);
    ws.loadBlob(blob, [buffer.getChannelData(0)], buffer.duration).catch(() => { /* ignore */ });

    ws.once('ready', () => {
      if (disposed) return;
      const dur = ws.getDuration();
      if (dur <= 0) return;
      const region = regions.addRegion({
        id: 'crop',
        start: Math.max(0, Math.min(1, selectionStart)) * dur,
        end: Math.max(0, Math.min(1, selectionEnd)) * dur,
        color: 'rgba(250, 204, 21, 0.12)',
        drag: true,
        resize: true,
        maxLength: Infinity,
      });
      regionRef.current = region;
      region.on('update', () => {
        const d = ws.getDuration();
        if (d > 0) onSelectionChange(region.start / d, region.end / d);
      });
    });

    return () => {
      disposed = true;
      regionRef.current = null;
      try { ws.destroy(); } catch { /* ignore */ }
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer, mode, zoom]);

  // Sync the region when selection changes externally (avoid loops by epsilon check)
  useEffect(() => {
    const ws = wsRef.current;
    const region = regionRef.current;
    if (!ws || !region || !buffer) return;
    const d = ws.getDuration();
    if (d <= 0) return;
    const s = Math.max(0, Math.min(1, selectionStart)) * d;
    const e = Math.max(0, Math.min(1, selectionEnd)) * d;
    if (Math.abs(region.start - s) > 0.004 || Math.abs(region.end - e) > 0.004) {
      region.setOptions({ start: s, end: e });
    }
  }, [selectionStart, selectionEnd, buffer]);

  // External playhead sync
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || playbackTime == null || !buffer) return;
    ws.setTime(Math.max(0, Math.min(playbackTime, ws.getDuration())));
  }, [playbackTime, buffer]);

  if (!buffer) {
    return (
      <div className="h-[176px] flex items-center justify-center bg-black/40 rounded-lg border border-[#1e293b] text-slate-600 text-[10px] font-mono uppercase">
        No audio buffer to display
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1">
          {(['waveform', 'spectrogram'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-all ${
                mode === m ? 'bg-blue-600/20 border border-blue-500/50 text-blue-300' : 'bg-[#121215] border border-[#1e293b] text-slate-500 hover:text-white'
              }`}
            >
              {m}
            </button>
          ))}
          <button onClick={() => setZoom((z) => Math.min(8, Math.round((z + 1) * 10) / 10))} className="p-1 rounded bg-[#121215] border border-[#1e293b] text-slate-400 hover:text-white transition-all" title="Zoom in"><ZoomIn size={12} /></button>
          <button onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 1) * 10) / 10))} className="p-1 rounded bg-[#121215] border border-[#1e293b] text-slate-400 hover:text-white transition-all" title="Zoom out"><ZoomOut size={12} /></button>
        </div>
        <span className="text-[9px] font-mono text-slate-500">drag the region to set crop · minimap to navigate · {buffer.duration.toFixed(2)}s</span>
      </div>
      <div ref={containerRef} className="w-full rounded-lg overflow-hidden bg-black/40 border border-[#1e293b]" style={{ height }} />
    </div>
  );
}
