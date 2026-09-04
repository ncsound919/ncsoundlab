/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Blind A/B rating player.
 *
 * - Two large play/switch buttons; pressing B while A plays crossfades via
 *   the CompareEngine (ref=A, mix=B).
 * - Listen-time gating: choice buttons disabled until both sides have
 *   accumulated >= 60% of the loop's renderDurationMs.
 * - Post-choice micro-form: optional dimension tags, confidence 1–3, and
 *   optional 200-char note. Continue advances to the next pair.
 * - Skip button shows remaining budget (max 2 per session).
 * - BLIND guarantee: no paramHash, no variation name, no origin appears in
 *   the DOM during the active state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Square, SkipForward, ChevronRight } from 'lucide-react';
import { compareEngine } from '../audio/CompareEngine';
import {
  createListenTracker,
  hasMetListenGate,
  type Side,
} from '../lib/rating/listenTracker';
import type { Confidence, DimensionTag, DimensionTags } from '../lib/rating/types';

const ALL_TAGS: DimensionTag[] = ['knock', 'warmth', 'movement', 'character', 'usable_in_beat'];
const NOTE_MAX = 200;
const CONFIDENCE_OPTIONS: Confidence[] = [1, 2, 3];
const CONFIDENCE_LABELS: Record<Confidence, string> = { 1: 'Coin flip', 2: 'Fairly sure', 3: 'Sure' };

interface PostChoiceFormProps {
  onContinue: (data: { confidence: Confidence; dimensions: DimensionTags; note?: string }) => void;
}

function PostChoiceForm({ onContinue }: PostChoiceFormProps) {
  const [tags, setTags] = useState<DimensionTag[]>([]);
  const [confidence, setConfidence] = useState<Confidence>(2);
  const [note, setNote] = useState('');

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 mb-2">
          Dimension tags (optional)
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))}
              className={`px-3 py-1.5 rounded-full text-xs font-mono uppercase tracking-wider border transition ${
                tags.includes(t)
                  ? 'bg-emerald-500/30 border-emerald-400/60 text-emerald-200'
                  : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-700/60'
              }`}
            >
              {t.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 mb-2">
          Confidence
        </div>
        <div className="flex gap-2">
          {CONFIDENCE_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setConfidence(c)}
              className={`flex-1 px-3 py-2 rounded-md text-xs font-mono border ${
                confidence === c
                  ? 'bg-blue-500/30 border-blue-400/60 text-blue-200'
                  : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-700/60'
              }`}
            >
              {c} · {CONFIDENCE_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 mb-2">
          Note (optional, {NOTE_MAX} chars)
        </div>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
          className="w-full px-3 py-2 rounded-md bg-slate-800/60 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-blue-500/60"
          placeholder="One line of context…"
          maxLength={NOTE_MAX}
        />
      </div>

      <button
        type="button"
        onClick={() => onContinue({ confidence, dimensions: { tags, note: note || undefined } })}
        className="w-full px-4 py-3 rounded-md bg-emerald-500/30 border border-emerald-400/60 text-emerald-100 font-mono font-bold uppercase tracking-wider hover:bg-emerald-500/40 flex items-center justify-center gap-2"
      >
        Continue <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

interface RatingPairPlayerProps {
  /** Unique id for the pair — drives the buffer cache key. */
  pairId: string;
  /** The A-side AudioBuffer. */
  bufferA: AudioBuffer;
  /** The B-side AudioBuffer. */
  bufferB: AudioBuffer;
  /** Loop length in seconds. */
  loopDurationSec: number;
  /** 0-based pair index. */
  pairIndex: number;
  /** Kind label shown in the header. */
  kind: string;
  /** Called with just the winner side after the form is submitted. */
  onChoose: (choice: 'A' | 'B', meta: {
    confidence: Confidence;
    dimensions: DimensionTags;
    listenMsA: number;
    listenMsB: number;
    elapsedMs: number;
  }) => void;
  onSkip: () => void;
  skipsRemaining: number;
}

export function RatingPairPlayer({
  pairId,
  bufferA,
  bufferB,
  loopDurationSec,
  pairIndex,
  kind,
  onChoose,
  onSkip,
  skipsRemaining,
}: RatingPairPlayerProps) {
  const [activeSide, setActiveSide] = useState<Side | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pendingChoice, setPendingChoice] = useState<null | 'A' | 'B'>(null);
  const trackerRef = useRef(createListenTracker());
  const pairStartRef = useRef(Date.now());

  useEffect(() => {
    trackerRef.current.reset(performance.now());
    pairStartRef.current = Date.now();
    // Stop any lingering playback on pair change.
    compareEngine.stopReference();
    compareEngine.stopMixFile();
    setActiveSide(null);
    setIsPlaying(false);
    setPendingChoice(null);
    return () => {
      compareEngine.stopReference();
      compareEngine.stopMixFile();
    };
  }, [pairId]);

  // RAF loop: accumulate listen time.
  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      trackerRef.current.tick(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const gate = hasMetListenGate(
    trackerRef.current.msA(),
    trackerRef.current.msB(),
    loopDurationSec * 1000,
  );

  const playSide = useCallback((side: Side) => {
    if (activeSide === side && isPlaying) {
      compareEngine.pauseReference();
      compareEngine.stopMixFile();
      setIsPlaying(false);
      trackerRef.current.setActive(null);
      return;
    }
    compareEngine.setSource(side);
    if (side === 'A') {
      compareEngine.playReference(bufferA, 0);
    } else {
      compareEngine.setMixBuffer(bufferB);
      compareEngine.playMixFile(0);
    }
    setActiveSide(side);
    setIsPlaying(true);
    trackerRef.current.setActive(side);
  }, [activeSide, isPlaying, bufferA, bufferB]);

  const handleChoose = useCallback((choice: 'A' | 'B') => {
    compareEngine.pauseReference();
    compareEngine.stopMixFile();
    setIsPlaying(false);
    setPendingChoice(choice);
  }, []);

  const handleFormSubmit = useCallback((data: { confidence: Confidence; dimensions: DimensionTags; note?: string }) => {
    onChoose(pendingChoice!, {
      confidence: data.confidence,
      dimensions: data.dimensions,
      listenMsA: trackerRef.current.msA(),
      listenMsB: trackerRef.current.msB(),
      elapsedMs: Date.now() - pairStartRef.current,
    });
  }, [pendingChoice, onChoose]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '1' || e.key.toLowerCase() === 'a') { e.preventDefault(); playSide('A'); }
      if (e.key === '2' || e.key.toLowerCase() === 'b') { e.preventDefault(); playSide('B'); }
      if (e.key === ' ' && !pendingChoice) { e.preventDefault(); /* replay */ }
      if (e.key === 'Enter' && gate.ready && !pendingChoice) { e.preventDefault(); handleChoose(activeSide ?? 'A'); }
      if (e.key.toLowerCase() === 's' && !pendingChoice) { e.preventDefault(); onSkip(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playSide, gate.ready, pendingChoice, handleChoose, activeSide, onSkip]);

  if (pendingChoice) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6 rounded-2xl border border-slate-700/60 bg-[#0c0c10]/80 space-y-4">
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">
          You chose {pendingChoice}
        </div>
        <PostChoiceForm onContinue={handleFormSubmit} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">
        <div>
          Pair {pairIndex + 1} · <span className="text-slate-500">{kind}</span>
        </div>
        <button
          type="button"
          onClick={onSkip}
          disabled={skipsRemaining === 0}
          className={`px-2 py-1 rounded-md border flex items-center gap-1 transition ${
            skipsRemaining > 0
              ? 'bg-amber-500/20 border-amber-400/40 text-amber-200 hover:bg-amber-500/30'
              : 'bg-slate-800/40 border-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          <SkipForward className="w-3 h-3" /> Skip ({skipsRemaining} left)
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {(['A', 'B'] as const).map((side) => {
          const isActive = activeSide === side && isPlaying;
          const pct = side === 'A' ? gate.pctA : gate.pctB;
          return (
            <button
              key={side}
              type="button"
              data-testid={`rating-side-${side}`}
              onClick={() => playSide(side)}
              className={`relative h-48 rounded-2xl border transition flex flex-col items-center justify-center ${
                isActive
                  ? 'border-blue-400/80 bg-blue-500/20 shadow-[0_0_40px_rgba(59,130,246,0.4)]'
                  : 'border-slate-700/60 bg-slate-900/60 hover:border-slate-500/60'
              }`}
            >
              <div className="text-7xl font-mono font-black text-slate-100">{side}</div>
              <div className="absolute bottom-3 left-3 right-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1">
                  {isActive ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  {isActive ? 'Playing' : 'Click to play'}
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all ${pct >= 0.6 ? 'bg-emerald-400' : 'bg-blue-400'}`}
                    style={{ width: `${Math.min(100, pct * 100)}%` }}
                  />
                </div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mt-1">
                  {(pct * 100).toFixed(0)}% of gate ({Math.round(gate.gate)} ms)
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(['A', 'B'] as const).map((side) => (
          <button
            key={side}
            type="button"
            data-testid={`choose-${side}`}
            disabled={!gate.ready}
            onClick={() => handleChoose(side)}
            className={`px-4 py-3 rounded-md font-mono font-bold uppercase tracking-wider transition ${
              gate.ready
                ? 'bg-emerald-500/30 border border-emerald-400/60 text-emerald-100 hover:bg-emerald-500/40'
                : 'bg-slate-800/40 border border-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            Choose {side}
          </button>
        ))}
      </div>

      {!gate.ready && (
        <div className="text-center text-[10px] font-mono uppercase tracking-widest text-slate-500">
          Listen to both sides until the bars fill (60% of loop length) — then choose
        </div>
      )}
    </div>
  );
}
