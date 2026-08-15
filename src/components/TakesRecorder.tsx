/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase 5.4 — Takes Recorder.
 *
 * Loop recording with multiple takes + punch-in/out + a takes browser.
 * The recorder drives the transport loop (via `audioEngine`) while the actual
 * mic capture runs through `createAudioCapture`. Each loop cycle produces one
 * take; the browser lets the user audition, keep, and send a take to the pads.
 *
 * Count-in + metronome (Phase 5.4): a configurable count-in of N beats clicks
 * before the loop starts, and a metronome tick during recording.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Square, Trash2, Check, Headphones, CircleDot } from 'lucide-react';
import { createAudioCapture } from '../audio/transport/audioCapture';
import { audioEngine } from '../lib/audioEngine';
import {
  planLoopRecording,
  commitTake,
  selectKeeper,
  type Take,
  type PunchRegion,
} from '../audio/transport/takesRecorder';
import { createMetronome } from '../audio/transport/metronome';

interface TakesRecorderProps {
  bpm: number;
  loopLengthSec: number;
  onAddLayer?: (buffer: AudioBuffer, name?: string) => string | undefined;
  onAddSlicedLayers?: (buffers: AudioBuffer[]) => void;
  onSlice?: (buffer: AudioBuffer, n: number) => void;
  onToast?: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}

const DEFAULT_PUNCH: PunchRegion = { inSec: 0, outSec: 0, enabled: false };

export const TakesRecorder: React.FC<TakesRecorderProps> = ({
  bpm,
  loopLengthSec,
  onAddLayer,
  onSlice,
  onToast,
}) => {
  const [loops, setLoops] = useState(3);
  const [countInBeats, setCountInBeats] = useState(1);
  const [metronomeOn, setMetronomeOn] = useState(true);
  const [punch, setPunch] = useState<PunchRegion>(DEFAULT_PUNCH);
  const [isRecording, setIsRecording] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [takes, setTakes] = useState<Take[]>([]);
  const [auditioningId, setAuditioningId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'countin' | 'recording'>('idle');

  const captureRef = useRef<ReturnType<typeof createAudioCapture> | null>(null);
  const metronomeRef = useRef<ReturnType<typeof createMetronome> | null>(null);
  const planRef = useRef(planLoopRecording({ loops: 3, loopLengthSec }));
  const auditionSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Mirrors `isRecording` synchronously (the state value is stale inside the
  // count-in `await`), so stop-during-count-in can actually cancel the pending
  // capture instead of the timer silently starting the mic afterwards.
  const recordingRef = useRef(false);
  const cycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep the plan in sync with controls.
  useEffect(() => {
    planRef.current = planLoopRecording({ loops, loopLengthSec, punch });
  }, [loops, loopLengthSec, punch]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
      if (captureRef.current) captureRef.current.dispose();
      metronomeRef.current?.dispose();
      if (auditionSourceRef.current) {
        try { auditionSourceRef.current.stop(); } catch {}
        try { auditionSourceRef.current.disconnect(); } catch {}
      }
    };
  }, []);

  const schedule = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
  };

  const clickAt = (sec: number) => {
    const m = metronomeRef.current;
    if (!m) return;
    // Schedule a click at absolute context time.
    const ctx = audioEngine.getContext();
    if (!ctx) return;
    const time = ctx.currentTime + Math.max(0, sec);
    const beatsPerBar = 4;
    const beatInBar = Math.round((sec % (60 / bpm * beatsPerBar)) / (60 / bpm));
    m.scheduleAtBeat(beatInBar, 0, beatsPerBar, time);
  };

  const startRecording = async () => {
    if (isRecording || recordingRef.current) return;
    const ctx = audioEngine.getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') await ctx.resume();

    // Reset take list for a fresh pass.
    setTakes([]);
    setCycle(0);
    setIsRecording(true);
    recordingRef.current = true;

    // Count-in clicks.
    const beats = Math.max(0, countInBeats);
    if (metronomeOn && !metronomeRef.current) {
      metronomeRef.current = createMetronome();
    }
    if (beats > 0) {
      setPhase('countin');
      const countInSec = (beats * 60) / bpm;
      for (let i = 0; i < beats; i++) {
        clickAt((i * 60) / bpm);
      }
      // Wait for count-in, then start the mic.
      await new Promise<void>((res) => schedule(res, Math.max(0, countInSec * 1000)));
      // The user may have pressed Stop during the count-in — don't start the
      // mic for a recording nobody wants (previously the pending timer started
      // it anyway, leaving an orphan MediaRecorder/stream running).
      if (!recordingRef.current) return;
    }

    setPhase('recording');
    if (!captureRef.current) captureRef.current = createAudioCapture();
    try {
      await captureRef.current.start();
    } catch (e) {
      recordingRef.current = false;
      onToast?.('Mic permission denied or unavailable', 'error');
      setIsRecording(false);
      setPhase('idle');
      return;
    }

    // Metronome ticks every beat during the loop.
    if (metronomeOn && metronomeRef.current) {
      const beatSec = 60 / bpm;
      for (let i = 0; i < planRef.current.loopStartsSec.length + 2; i++) {
        const t = i * beatSec;
        if (t <= planRef.current.loops * loopLengthSec) clickAt(t);
      }
    }

    // Track the current loop cycle for the UI (it never advanced before — the
    // display was permanently "cycle 1/N"). Computed from audio-clock time so
    // it tracks the actual capture position, not a JS timer.
    const captureStart = ctx.currentTime;
    cycleTimerRef.current = setInterval(() => {
      if (!recordingRef.current) {
        if (cycleTimerRef.current) { clearInterval(cycleTimerRef.current); cycleTimerRef.current = null; }
        return;
      }
      const elapsed = ctx.currentTime - captureStart;
      const c = Math.max(0, Math.min(planRef.current.loops - 1, Math.floor(elapsed / loopLengthSec)));
      setCycle(c);
    }, 250);

    // Loop the capture: for each cycle, stop+restart? MediaRecorder keeps one
    // blob per stop. Instead, we schedule cycle boundaries and split on stop.
    // For simplicity + testability we record one continuous blob and slice it
    // into cycle-aligned takes at the end.
  };

  const stopRecording = async () => {
    if (!isRecording) return;
    setIsRecording(false);
    recordingRef.current = false;
    setPhase('idle');
    if (cycleTimerRef.current) { clearInterval(cycleTimerRef.current); cycleTimerRef.current = null; }
    const ctx = audioEngine.getContext();
    if (!ctx || !captureRef.current) {
      setTakes([]);
      return;
    }
    try {
      const blob = await captureRef.current.stop();
      const buffer = await captureRef.current.decodeBlobToBuffer(blob, ctx);
      // Slice the continuous buffer into per-cycle takes.
      const plan = planRef.current;
      const sr = buffer.sampleRate;
      const totalCycles = plan.loops;
      const newTakes: Take[] = [];
      const sliceLength = Math.floor(plan.loopLengthSec * sr);
      for (let c = 0; c < totalCycles; c++) {
        const start = c * sliceLength;
        const end = Math.min(buffer.length, start + sliceLength);
        if (start >= buffer.length) break;
        const cycleBuf = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: end - start, sampleRate: sr });
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
          cycleBuf.copyToChannel(buffer.getChannelData(ch).subarray(start, end), ch);
        }
        const { take } = commitTake(plan, c, cycleBuf);
        newTakes.push(take);
      }
      setTakes(newTakes);
      onToast?.(`Captured ${newTakes.length} take${newTakes.length === 1 ? '' : 's'}`, 'success');
    } catch (e) {
      console.warn('Stop recording failed', e);
      onToast?.('Recording stop failed', 'error');
    }
  };

  const auditionTake = async (take: Take) => {
    const ctx = audioEngine.getContext();
    if (!ctx || !take.buffer) return;
    if (auditionSourceRef.current) {
      try { auditionSourceRef.current.stop(); } catch {}
      try { auditionSourceRef.current.disconnect(); } catch {}
      auditionSourceRef.current = null;
      setAuditioningId(null);
      if (auditioningId === take.id) return;
    }
    const src = ctx.createBufferSource();
    src.buffer = take.buffer;
    src.connect(ctx.destination);
    src.start(0);
    auditionSourceRef.current = src;
    setAuditioningId(take.id);
    src.onended = () => {
      if (auditionSourceRef.current === src) auditionSourceRef.current = null;
      try { src.disconnect(); } catch {}
      setAuditioningId(null);
    };
  };

  const sendTake = (take: Take) => {
    if (!take.buffer) return;
    if (onAddLayer) {
      onAddLayer(take.buffer, `Take ${takes.indexOf(take) + 1}${take.keep ? ' ★' : ''}`);
    }
  };

  const sendTakeToPads = (take: Take) => {
    if (!take.buffer) return;
    if (onSlice) onSlice(take.buffer, 16);
  };

  return (
    <div className="bg-[#0f0f12] border border-[#1e293b] rounded-xl p-3 space-y-2" data-takes-recorder>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-rose-400 flex items-center gap-1.5">
          <CircleDot size={12} /> Takes Recorder
        </span>
        <span className="text-[9px] font-mono text-slate-500">{phase === 'countin' ? 'Count-in…' : phase === 'recording' ? `Recording cycle ${cycle + 1}/${loops}` : 'Idle'}</span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 text-[10px]">
        <label className="flex items-center gap-1 text-slate-400">
          Loops
          <select value={loops} onChange={(e) => setLoops(parseInt(e.target.value))} className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white">
            {[1, 2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-slate-400">
          Count-in
          <select value={countInBeats} onChange={(e) => setCountInBeats(parseInt(e.target.value))} className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white">
            {[0, 1, 2, 4].map((n) => <option key={n} value={n}>{n} beat{n === 1 ? '' : 's'}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-slate-400">
          <input type="checkbox" checked={metronomeOn} onChange={(e) => setMetronomeOn(e.target.checked)} className="accent-rose-500" />
          Metronome
        </label>
        <label className="flex items-center gap-1 text-slate-400">
          <input type="checkbox" checked={punch.enabled} onChange={(e) => setPunch({ ...punch, enabled: e.target.checked })} className="accent-amber-500" />
          Punch in/out
        </label>
        {punch.enabled && (
          <>
            <label className="flex items-center gap-1 text-slate-400">
              In
              <input type="number" min={0} max={loopLengthSec} step={0.1} value={punch.inSec} onChange={(e) => setPunch({ ...punch, inSec: parseFloat(e.target.value) || 0 })} className="w-14 bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white" />
            </label>
            <label className="flex items-center gap-1 text-slate-400">
              Out
              <input type="number" min={0} max={loopLengthSec} step={0.1} value={punch.outSec} onChange={(e) => setPunch({ ...punch, outSec: parseFloat(e.target.value) || 0 })} className="w-14 bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white" />
            </label>
          </>
        )}
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          className={`ml-auto px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${
            isRecording ? 'bg-red-600 text-white border border-red-400 shadow-[0_0_14px_rgba(239,68,68,0.4)]' : 'bg-rose-600/20 border border-rose-500/50 text-rose-300 hover:bg-rose-600/30'
          }`}
        >
          {isRecording ? <Square size={11} fill="currentColor" /> : <CircleDot size={11} />}
          {isRecording ? 'Stop' : 'Record'}
        </button>
      </div>

      {/* Takes browser */}
      {takes.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-[#1e293b]">
          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Takes ({takes.length})</span>
          {takes.map((take, i) => (
            <div key={take.id} className={`flex items-center gap-2 px-2 py-1 rounded border ${take.keep ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-white/10 bg-black/30'}`} data-take={i}>
              <span className="text-[9px] font-mono font-bold text-slate-400 w-14">TAKE {i + 1}</span>
              <span className="text-[9px] font-mono text-slate-500">{(take.buffer?.duration ?? 0).toFixed(2)}s</span>
              {take.keep && <span className="text-[9px] text-emerald-400 font-black">★ KEEP</span>}
              <div className="flex-1" />
              <button type="button" onClick={() => auditionTake(take)} className={`p-1 rounded border transition-all ${auditioningId === take.id ? 'bg-rose-500 text-white border-rose-400' : 'border-white/15 text-slate-300 hover:text-white'}`} title="Audition">
                <Headphones size={11} />
              </button>
              <button type="button" onClick={() => setTakes(selectKeeper(takes, take.id))} className="p-1 rounded border border-white/15 text-slate-300 hover:text-emerald-300 transition-all" title="Keep">
                <Check size={11} />
              </button>
              <button type="button" onClick={() => sendTake(take)} className="px-1.5 py-0.5 rounded border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 text-[9px] font-black uppercase transition-all" title="Add take as a layer">
                Add
              </button>
              <button type="button" onClick={() => sendTakeToPads(take)} className="px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 text-[9px] font-black uppercase transition-all" title="Slice take into 16 pads">
                Slice
              </button>
              <button type="button" onClick={() => setTakes(takes.filter((t) => t.id !== take.id))} className="p-1 rounded border border-white/15 text-slate-400 hover:text-red-400 transition-all" title="Delete take">
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TakesRecorder;
