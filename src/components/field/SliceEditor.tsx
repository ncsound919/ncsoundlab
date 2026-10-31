/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Slice Editor — fine-tuning, pitch lock, sub-layer analysis, and cleanup DSP.
 */

import React, { useMemo } from 'react';
import {
  detectPitchHz,
  hzToNote,
  tuneToRoot,
} from '../../audio/mobile/pitchDetection';
import {
  suggestSubLayer,
  analyseSamples,
  type BufferAnalysis,
} from '../../audio/mobile/analysis';
import type { CleanupParams, CleanupReport } from '../../audio/mobile/dspCleanup';
import type { AudioSlice } from '../../audio/mobile/onsetSlicer';

interface SliceEditorProps {
  slice: AudioSlice | null;
  samples: Float32Array;
  sampleRate: number;
  kitRootHz: number;
  cleanup: CleanupParams;
  onUpdateCleanup: (next: CleanupParams) => void;
  onApplyCleanup: () => void;
  onApplyTuning: (tunedSamples: Float32Array, ratio: number, cents: number) => void;
  onInjectSubLayer: (hz: number, weight: number) => void;
  lastReport: CleanupReport | null;
}

export default function SliceEditor({
  slice,
  samples,
  sampleRate,
  kitRootHz,
  cleanup,
  onUpdateCleanup,
  onApplyCleanup,
  onApplyTuning,
  onInjectSubLayer,
  lastReport,
}: SliceEditorProps): React.ReactElement {
  // Pitch analysis
  const pitchInfo = useMemo(() => {
    if (samples.length === 0) return null;
    const est = detectPitchHz(samples, sampleRate, { minHz: 45, maxHz: 1200 });
    const note = est.hz > 0 ? hzToNote(est.hz) : null;
    return { ...est, note };
  }, [samples, sampleRate]);

  // Sub-layer analysis
  const subSuggestion = useMemo(() => {
    if (samples.length === 0) return null;
    const analysis: BufferAnalysis = analyseSamples(samples, sampleRate);
    return suggestSubLayer(analysis, { fundamentalHz: pitchInfo?.hz });
  }, [samples, sampleRate, pitchInfo?.hz]);

  const handleTune = () => {
    const targetHz = kitRootHz > 0 ? kitRootHz : 220;
    const result = tuneToRoot(samples, sampleRate, targetHz, {
      detectedHz: pitchInfo?.hz,
      maxCents: 200,
    });
    onApplyTuning(result.samples, result.ratio, result.cents);
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#0e1428] p-3 text-white">
      {/* Pitch & Root Lock */}
      <div className="rounded-lg bg-white/5 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-300">
            Pitch & Tonic Lock
          </span>
          <span className="text-xs text-white/50">
            Kit Root: {kitRootHz > 0 ? `${kitRootHz.toFixed(1)} Hz` : 'Not set'}
          </span>
        </div>

        <div className="mt-2 flex items-center justify-between text-xs">
          <div>
            <span className="text-white/60">Detected Pitch: </span>
            {pitchInfo && pitchInfo.hz > 0 ? (
              <span className="font-semibold text-yellow-400">
                {pitchInfo.hz.toFixed(1)} Hz ({pitchInfo.note?.name}
                {pitchInfo.note && pitchInfo.note.cents !== 0
                  ? ` ${pitchInfo.note.cents > 0 ? '+' : ''}${pitchInfo.note.cents}¢`
                  : ''}
                )
              </span>
            ) : (
              <span className="text-white/40">Percussive / Inharmonic</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleTune}
            disabled={!pitchInfo || pitchInfo.hz <= 0}
            className="min-h-9 rounded bg-yellow-500 px-2.5 py-1 text-xs font-bold text-black disabled:opacity-40"
          >
            Lock to Root
          </button>
        </div>
      </div>

      {/* Acoustic Sub Suggestion */}
      {subSuggestion && subSuggestion.suggest && (
        <div className="flex items-center justify-between rounded-lg border border-blue-500/30 bg-blue-950/40 p-2.5 text-xs">
          <div>
            <div className="font-semibold text-blue-300">Sub Reinforcement Available</div>
            <div className="text-[11px] text-white/60">{subSuggestion.reason}</div>
          </div>
          <button
            type="button"
            onClick={() => onInjectSubLayer(subSuggestion.hz, subSuggestion.weight)}
            className="min-h-9 shrink-0 rounded bg-blue-600 px-2.5 py-1.5 font-bold text-white shadow hover:bg-blue-500"
          >
            + Add {subSuggestion.hz}Hz Sub
          </button>
        </div>
      )}

      {/* DSP Cleanup Toggles & Sliders */}
      <div className="rounded-lg bg-white/5 p-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-300">
          Cleanup DSP
        </span>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <label className="flex items-center justify-between rounded bg-white/5 p-2">
            <span>DC Block</span>
            <input
              type="checkbox"
              checked={cleanup.dcBlock}
              onChange={(e) => onUpdateCleanup({ ...cleanup, dcBlock: e.target.checked })}
              className="accent-yellow-400"
            />
          </label>
          <label className="flex items-center justify-between rounded bg-white/5 p-2">
            <span>De-Click</span>
            <input
              type="checkbox"
              checked={cleanup.deClick}
              onChange={(e) => onUpdateCleanup({ ...cleanup, deClick: e.target.checked })}
              className="accent-yellow-400"
            />
          </label>
          <label className="flex items-center justify-between rounded bg-white/5 p-2">
            <span>Spectral Denoise</span>
            <input
              type="checkbox"
              checked={cleanup.denoise}
              onChange={(e) => onUpdateCleanup({ ...cleanup, denoise: e.target.checked })}
              className="accent-yellow-400"
            />
          </label>
          <label className="flex items-center justify-between rounded bg-white/5 p-2">
            <span>Noise Gate</span>
            <input
              type="checkbox"
              checked={cleanup.gate}
              onChange={(e) => onUpdateCleanup({ ...cleanup, gate: e.target.checked })}
              className="accent-yellow-400"
            />
          </label>
        </div>

        {/* Low-Cut Slider */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-white/70">
            <span>Low-Cut Filter</span>
            <span className="font-semibold text-yellow-400">{cleanup.lowCutHz} Hz</span>
          </div>
          <input
            type="range"
            aria-label="Low-cut filter frequency"
            min={0}
            max={120}
            step={5}
            value={cleanup.lowCutHz}
            onChange={(e) => onUpdateCleanup({ ...cleanup, lowCutHz: Number(e.target.value) })}
            className="w-full accent-yellow-400"
          />
        </div>

        <button
          type="button"
          onClick={onApplyCleanup}
          className="mt-3 h-11 w-full rounded bg-blue-600 text-xs font-semibold text-white shadow active:bg-blue-500"
        >
          Apply Cleanup & Audition
        </button>

        {lastReport && (
          <div className="mt-2 text-[11px] text-white/50">
            Applied: {lastReport.applied.join(', ') || 'clean signal'}
            {lastReport.clicksRemoved > 0 ? ` · ${lastReport.clicksRemoved} clicks removed` : ''}
            {lastReport.gainAppliedDb ? ` · ${lastReport.gainAppliedDb.toFixed(1)} dB peak gain` : ''}
          </div>
        )}
      </div>
    </div>
  );
}
