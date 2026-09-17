/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Recourse composer panel.
 *
 * Generates a chord progression / song with the Recourse composer (read-only
 * endpoint) and applies it inside SoundLab:
 *  - preview the chord progression (real Recourse output, not a guess)
 *  - "Chords → Pattern": stamp the voiced progression into the active row
 *  - "Use as Chord Pads key": point the controller chord pads at the song key
 *  - "Load into SoundLab" (loop mode): hydrate Layers + Pattern + Song chain
 *
 * Honest limit: SoundLab's sequencer chains short patterns, so only Recourse's
 * 1-bar loop maps to playback; arrangement mode returns chords/sections only.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, RefreshCw, Loader2, Music, Wand2, Keyboard } from 'lucide-react';
import {
  chordLabelsToProgression,
  fetchRecourseSong,
  fetchRecourseStyles,
  recourseSongUrl,
  type RecourseSong,
} from '../lib/recourseSong';
import { DEFAULT_RECOURSE_BASE, RECOURSE_STYLES } from '../lib/recourseEvolution';
import { useControllerStore } from '../store/controllerStore';
import { useRecourseStore, type RecourseBridge, type RecourseParam } from '../store/recourseStore';
import type { TheoryChord } from '../lib/theory/progression';

interface RecourseComposerPanelProps {
  /** Stamp a progression into the active pattern row (voiced by SoundLab). */
  onApplyProgression: (chords: TheoryChord[]) => void;
}

const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const RecourseComposerPanel: React.FC<RecourseComposerPanelProps> = ({ onApplyProgression }) => {
  const [base, setBase] = useState(DEFAULT_RECOURSE_BASE);
  const [styles, setStyles] = useState<string[]>([...RECOURSE_STYLES]);
  const [style, setStyle] = useState<string>(RECOURSE_STYLES[0]);
  const [seed, setSeed] = useState(1);
  const [bars, setBars] = useState(8);
  const [mode, setMode] = useState<'loop' | 'arr'>('loop');
  const [keyPc, setKeyPc] = useState<number>(-1); // -1 = let Recourse choose
  const [song, setSong] = useState<RecourseSong | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchRecourseStyles(base).then((list) => {
      if (alive && list.length) setStyles(list);
    });
    return () => { alive = false; };
  }, [base]);

  // Deep link from Recourse's Music sector:
  //   /?recourseStyle=…&recourseSeed=…&recourseMode=…
  // Pre-fills the controls and composes immediately so the handoff is one click.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const linkedStyle = params.get('recourseStyle');
    if (!linkedStyle) return;
    const linkedSeed = parseInt(params.get('recourseSeed') || '1', 10) || 1;
    const linkedMode: 'loop' | 'arr' = params.get('recourseMode') === 'arr' ? 'arr' : 'loop';
    setStyle(linkedStyle);
    setSeed(linkedSeed);
    setMode(linkedMode);
    void (async () => {
      setIsGenerating(true);
      try {
        setSong(await fetchRecourseSong(recourseSongUrl(base, { style: linkedStyle, seed: linkedSeed, bars, mode: linkedMode })));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsGenerating(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = async () => {
    setIsGenerating(true);
    setError(null);
    setStatus(null);
    try {
      const url = recourseSongUrl(base, {
        style,
        seed,
        bars,
        mode,
        ...(keyPc >= 0 ? { key: keyPc } : {}),
      });
      setSong(await fetchRecourseSong(url));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const applyToPattern = () => {
    if (!song) return;
    onApplyProgression(chordLabelsToProgression(song.chords));
    setStatus(`Stamped ${song.chords.length} chords into the active pattern row.`);
  };

  const useAsChordKey = () => {
    if (!song) return;
    const root = song.key.replace(/m$/, '');
    useControllerStore.getState().setChord({ key: root, scale: song.major ? 'major' : 'minor' });
    setStatus(`Chord pads key → ${root} ${song.major ? 'major' : 'minor'}.`);
  };

  const loadIntoApp = () => {
    if (!song?.piece) return;
    const bridge = (window as unknown as { __recourse?: { load?: (p: unknown) => { ok?: boolean; error?: string } } }).__recourse;
    if (!bridge?.load) {
      setError('Recourse bridge unavailable — reload the app.');
      return;
    }
    const res = bridge.load(song.piece);
    setStatus(res?.ok
      ? `Loaded "${song.style}" into Layers + Pattern (${song.piece.layers.length} layers).`
      : `Load failed: ${res?.error ?? 'unknown'}`);
  };

  const BARS = [4, 8, 16];
  const cycleStyle = (dir: number) => {
    const i = Math.max(0, styles.indexOf(style));
    setStyle(styles[(((i + dir) % styles.length) + styles.length) % styles.length]);
  };

  // Imperative surface the MIDI controller drives. Kept in a ref so the
  // registered bridge always calls the latest closures.
  const apiRef = useRef<RecourseBridge>({} as RecourseBridge);
  apiRef.current = {
    generate: () => { void generate(); },
    load: loadIntoApp,
    toPattern: applyToPattern,
    useKey: useAsChordKey,
    stylePrev: () => cycleStyle(-1),
    styleNext: () => cycleStyle(1),
    modeNext: () => setMode((m) => (m === 'loop' ? 'arr' : 'loop')),
    barsNext: () => setBars((b) => BARS[(BARS.indexOf(b) + 1) % BARS.length]),
    seedDown: () => setSeed((s) => Math.max(1, s - 1)),
    seedUp: () => setSeed((s) => Math.min(200, s + 1)),
    seedRandom: () => setSeed(1 + Math.floor(Math.random() * 200)),
    keyDown: () => setKeyPc((k) => (k <= 0 ? 11 : k - 1)),
    keyUp: () => setKeyPc((k) => (k < 0 || k >= 11 ? 0 : k + 1)),
    setParam: (param: RecourseParam, value: number) => {
      if (param === 'styleIndex') {
        const i = Math.max(0, Math.min(styles.length - 1, Math.round(value)));
        if (styles[i]) setStyle(styles[i]);
      } else if (param === 'seed') setSeed(Math.max(1, Math.min(200, Math.round(value))));
      else if (param === 'keyIndex') setKeyPc(Math.max(0, Math.min(11, Math.round(value))));
      else if (param === 'barsIndex') setBars(BARS[Math.max(0, Math.min(2, Math.round(value)))]);
      else if (param === 'mode') setMode(value >= 0.5 ? 'arr' : 'loop');
    },
  };

  useEffect(() => {
    const bridge: RecourseBridge = {
      generate: () => apiRef.current.generate(),
      load: () => apiRef.current.load(),
      toPattern: () => apiRef.current.toPattern(),
      useKey: () => apiRef.current.useKey(),
      stylePrev: () => apiRef.current.stylePrev(),
      styleNext: () => apiRef.current.styleNext(),
      modeNext: () => apiRef.current.modeNext(),
      barsNext: () => apiRef.current.barsNext(),
      seedDown: () => apiRef.current.seedDown(),
      seedUp: () => apiRef.current.seedUp(),
      seedRandom: () => apiRef.current.seedRandom(),
      keyDown: () => apiRef.current.keyDown(),
      keyUp: () => apiRef.current.keyUp(),
      setParam: (param, value) => apiRef.current.setParam(param, value),
    };
    useRecourseStore.getState().setBridge(bridge);
    return () => {
      const state = useRecourseStore.getState();
      if (state.bridge === bridge) state.clearBridge();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-[#0f0f12] border border-[#1e293b] rounded-xl p-3 space-y-3" data-recourse-composer>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-fuchsia-400 flex items-center gap-1.5">
          <Sparkles size={12} /> Recourse Composer
        </span>
        <button
          type="button"
          onClick={generate}
          disabled={isGenerating}
          className="px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-200 hover:bg-fuchsia-500/30 disabled:opacity-50 flex items-center gap-1"
        >
          {isGenerating ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} Generate
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[9px]">
        <label className="flex items-center gap-1 text-slate-400">
          Style
          <select value={style} onChange={(e) => setStyle(e.target.value)} aria-label="Recourse style" className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white max-w-[150px]">
            {styles.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-slate-400">
          Key
          <select value={keyPc} onChange={(e) => setKeyPc(parseInt(e.target.value))} aria-label="Recourse key" className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white">
            <option value={-1}>Auto</option>
            {KEY_NAMES.map((k, i) => <option key={k} value={i}>{k}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-slate-400">
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value as 'loop' | 'arr')} aria-label="Recourse mode" className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white">
            <option value="loop">Loop</option>
            <option value="arr">Arrangement</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-slate-400">
          Bars
          <select value={bars} onChange={(e) => setBars(parseInt(e.target.value))} aria-label="Recourse bars" className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white">
            {[4, 8, 16].map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 text-slate-400">
          Seed
          <input type="number" value={seed} onChange={(e) => setSeed(parseInt(e.target.value) || 0)} aria-label="Recourse seed" className="w-14 bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white" />
        </label>
        <label className="flex items-center gap-1 text-slate-400">
          URL
          <input value={base} onChange={(e) => setBase(e.target.value)} aria-label="Recourse base URL" className="w-40 bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white" />
        </label>
      </div>

      {error && <p className="text-[10px] font-mono text-rose-400">{error}</p>}

      {song && (
        <div className="space-y-2 pt-1 border-t border-[#1e293b]">
          <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
            <span>{song.style} · {song.key} · {song.bpm} BPM · {song.bars} bars · seed {song.seed}</span>
            <span>{song.events} events</span>
          </div>
          <div className="flex flex-wrap gap-1" data-recourse-chords>
            {song.chords.map((c, i) => (
              <span key={`${c}-${i}`} className="px-2 py-1 rounded border border-white/10 bg-black/30 text-[10px] font-mono font-bold text-slate-200">
                {c}
              </span>
            ))}
          </div>
          {song.mode === 'arr' && (
            <p className="text-[9px] font-mono text-amber-300/80">
              Arrangement: {(song.sections ?? []).length} section(s) — SoundLab can't play a multi-bar chart, so use the chords.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={applyToPattern} className="px-2 py-1 rounded border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 text-[9px] font-black uppercase flex items-center gap-1">
              <Wand2 size={10} /> Chords → Pattern
            </button>
            <button type="button" onClick={useAsChordKey} className="px-2 py-1 rounded border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 text-[9px] font-black uppercase flex items-center gap-1">
              <Keyboard size={10} /> Use as Chord Pads key
            </button>
            {song.mode === 'loop' && song.piece && (
              <button type="button" onClick={loadIntoApp} className="px-2 py-1 rounded border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 text-[9px] font-black uppercase flex items-center gap-1">
                <Music size={10} /> Load into SoundLab
              </button>
            )}
          </div>
          {status && <p className="text-[9px] font-mono text-emerald-300">{status}</p>}
        </div>
      )}

      {!song && !error && (
        <p className="text-[10px] text-slate-500 font-mono">
          Pick a style and hit Generate — chords come straight from the Recourse composer.
        </p>
      )}
    </div>
  );
};

export default RecourseComposerPanel;
