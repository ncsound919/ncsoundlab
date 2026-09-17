/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Clip launcher (Tier 2, honest edition): library samples dropped onto slots
 * are rendered tempo-matched OFFLINE to the pattern loop (re-rendered when
 * the BPM changes — there is no real-time time-stretch in the browser) and
 * looped via `AudioBufferSourceNode.loop`. Launch is immediate or quantized
 * to the next loop boundary; clicking the playing clip stops it.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Play, Square, X } from 'lucide-react';
import { audioEngine } from '../lib/audioEngine';
import { fetchLibrarySample, decodeLibrarySample } from '../lib/sampleLibrary';
import { SAMPLE_DRAG_MIME } from './SampleBrowser';
import { patternLoopLengthSec } from '../audio/transport/takesRecorder';
import { stretchToDuration } from '../audio/dsp/TimeStretch';
import { planClipLaunch } from '../audio/transport/clipLauncher';
import { getTransport } from '../audio/transport/transport';

const SLOT_COUNT = 4;

interface ClipSlot {
  sampleId: string | null;
  name: string;
  source: AudioBuffer | null;
  rendered: AudioBuffer | null;
  rendering: boolean;
}

const emptySlot = (): ClipSlot => ({ sampleId: null, name: '', source: null, rendered: null, rendering: false });

interface ClipLauncherProps {
  bpm: number;
  stepLength: 16 | 32;
  onToast?: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}

export const ClipLauncher: React.FC<ClipLauncherProps> = ({ bpm, stepLength, onToast }) => {
  const [slots, setSlots] = useState<ClipSlot[]>(() => Array.from({ length: SLOT_COUNT }, emptySlot));
  const [quantize, setQuantize] = useState(true);
  /** Legato: launching a clip layers it over the playing ones instead of replacing them. */
  const [legato, setLegato] = useState(false);
  const [playing, setPlaying] = useState<number[]>([]);
  const sourcesRef = useRef<Map<number, AudioBufferSourceNode>>(new Map());
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const loopSec = patternLoopLengthSec(stepLength, bpm);

  const stopSlot = (idx: number, fromTimer = false) => {
    if (!fromTimer) {
      const timer = timersRef.current.get(idx);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(idx);
      }
    }
    const src = sourcesRef.current.get(idx);
    if (src) {
      try { src.onended = null; src.stop(); } catch { /* ignore */ }
      try { src.disconnect(); } catch { /* ignore */ }
      sourcesRef.current.delete(idx);
    }
    setPlaying((prev) => prev.filter((i) => i !== idx));
  };

  const stopAll = () => {
    for (const t of timersRef.current.values()) clearTimeout(t);
    timersRef.current.clear();
    for (const src of sourcesRef.current.values()) {
      try { src.onended = null; src.stop(); } catch { /* ignore */ }
      try { src.disconnect(); } catch { /* ignore */ }
    }
    sourcesRef.current.clear();
    setPlaying([]);
  };

  useEffect(() => stopAll, []);

  const renderSlot = (source: AudioBuffer, seconds: number): AudioBuffer | null => {
    try {
      return stretchToDuration(source, seconds).buffer;
    } catch (err) {
      console.warn('Clip tempo-match failed:', err);
      return null;
    }
  };

  // Re-render tempo-matched clips when the tempo or loop length changes.
  useEffect(() => {
    setSlots((prev) => {
      if (!prev.some((s) => s.source)) return prev;
      return prev.map((s) => (s.source ? { ...s, rendered: renderSlot(s.source, loopSec) } : s));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm, stepLength]);

  const assignSlot = async (idx: number, sampleId: string) => {
    const ctx = audioEngine.getContext();
    if (!ctx) {
      onToast?.('AudioContext unavailable.', 'error');
      return;
    }
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, rendering: true } : s)));
    try {
      const row = await fetchLibrarySample(sampleId);
      if (!row) throw new Error('sample not found');
      const source = await decodeLibrarySample(ctx, row);
      const rendered = renderSlot(source, loopSec);
      setSlots((prev) => prev.map((s, i) =>
        i === idx ? { sampleId, name: row.name, source, rendered, rendering: false } : s
      ));
    } catch (err) {
      console.warn('Clip assign failed:', err);
      onToast?.('Could not load that clip.', 'error');
      setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, rendering: false } : s)));
    }
  };

  const clearSlot = (idx: number) => {
    stopSlot(idx);
    setSlots((prev) => prev.map((s, i) => (i === idx ? emptySlot() : s)));
  };

  const startRendered = (idx: number, rendered: AudioBuffer, stopIndices: number[]) => {
    const ctx = audioEngine.getContext();
    if (!ctx) return;
    // Replace the other playing clips exactly when this one starts, so a
    // quantized launch never leaves a gap (legato mode passes no stop list).
    for (const other of stopIndices) stopSlot(other, true);
    const src = ctx.createBufferSource();
    src.buffer = rendered;
    src.loop = true;
    const master = audioEngine.getMasterRackInput?.() ?? null;
    src.connect(master ?? ctx.destination);
    src.onended = () => {
      if (sourcesRef.current.get(idx) === src) {
        sourcesRef.current.delete(idx);
        setPlaying((prev) => prev.filter((i) => i !== idx));
      }
    };
    src.start(0);
    sourcesRef.current.set(idx, src);
    setPlaying((prev) => (prev.includes(idx) ? prev : [...prev, idx]));
  };

  const toggleClip = (idx: number) => {
    if (playingRef.current.includes(idx)) {
      stopSlot(idx);
      return;
    }
    const slot = slotsRef.current[idx];
    if (!slot?.rendered) return;
    const rendered = slot.rendered;

    let positionSec = 0;
    if (quantize) {
      try {
        positionSec = getTransport().getPosition();
      } catch {
        positionSec = 0;
      }
    }
    const plan = planClipLaunch({
      target: idx,
      playing: playingRef.current,
      legato,
      quantize,
      positionSec,
      loopLengthSec: loopSec,
    });

    if (plan.startDelayMs <= 1) {
      startRendered(idx, rendered, plan.stopIndices);
      return;
    }
    // Show the slot as armed while it waits for the boundary.
    setPlaying((prev) => (prev.includes(idx) ? prev : [...prev, idx]));
    const timer = setTimeout(() => {
      timersRef.current.delete(idx);
      setPlaying((prev) => prev.filter((i) => i !== idx));
      startRendered(idx, rendered, plan.stopIndices);
    }, plan.startDelayMs);
    timersRef.current.set(idx, timer);
  };

  return (
    <div className="bg-[#0f0f12] border border-[#1e293b] rounded-xl p-3 space-y-2" data-clip-launcher>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-teal-300">
          Clip Launcher
          <span className="ml-2 font-mono text-slate-500 normal-case tracking-normal">
            tempo-matched loops · {loopSec.toFixed(2)}s
          </span>
        </span>
        <button
          type="button"
          onClick={() => setQuantize((q) => !q)}
          title={quantize ? 'Launch quantized to the next loop' : 'Launch immediately'}
          className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border transition-all ${
            quantize ? 'bg-teal-500/20 border-teal-500/50 text-teal-300' : 'bg-[#121215] border-[#1e293b] text-slate-400 hover:text-white'
          }`}
        >
          {quantize ? 'Quantized' : 'Free'}
        </button>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-mono uppercase tracking-widest text-slate-500">Launch mode</span>
        <button
          type="button"
          onClick={() => setLegato((l) => !l)}
          title={legato ? 'Legato: new clips layer over the playing ones' : 'Replace: a new clip stops the others'}
          className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border transition-all ${
            legato ? 'bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-300' : 'bg-[#121215] border-[#1e293b] text-slate-400 hover:text-white'
          }`}
        >
          {legato ? 'Legato' : 'Replace'}
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
        {slots.map((slot, idx) => {
          const isPlaying = playing.includes(idx);
          return (
            <div
              key={idx}
              data-clip-slot={idx}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(SAMPLE_DRAG_MIME)) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }
              }}
              onDrop={(e) => {
                const sampleId = e.dataTransfer.getData(SAMPLE_DRAG_MIME);
                if (sampleId) {
                  e.preventDefault();
                  void assignSlot(idx, sampleId);
                }
              }}
              className={`rounded-lg border px-2 py-1.5 flex items-center gap-1.5 transition-all ${
                isPlaying ? 'border-teal-400/70 bg-teal-500/10' : 'border-[#1a1a22] bg-black/40'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleClip(idx)}
                disabled={!slot.rendered}
                title={isPlaying ? 'Stop clip' : 'Play clip'}
                className="p-1 rounded border border-[#2A2A2E] text-slate-300 hover:text-white disabled:opacity-30 transition-all"
              >
                {isPlaying ? <Square size={11} className="fill-current" /> : <Play size={11} className="fill-current" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-white truncate" title={slot.name || `Drop a sample — clip ${idx + 1}`}>
                  {slot.rendering ? 'Rendering…' : slot.name || `Clip ${idx + 1}`}
                </div>
                <div className="text-[8px] font-mono text-slate-500 uppercase">
                  {slot.rendered ? 'tempo-matched' : 'empty'}
                </div>
              </div>
              {slot.sampleId && (
                <button
                  type="button"
                  onClick={() => clearSlot(idx)}
                  title="Clear clip"
                  className="p-1 rounded text-slate-500 hover:text-red-400 transition-colors"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[8px] font-mono text-slate-600">Drag library samples onto slots. Clips re-render to the loop when the BPM changes.</p>
    </div>
  );
};

export default ClipLauncher;
