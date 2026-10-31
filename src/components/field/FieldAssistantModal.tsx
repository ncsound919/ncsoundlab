/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Field Assistant Modal — on-device AI sound designer.
 *
 * Uses grammar-constrained rule interpretation against `genomeJsonSchema()`.
 * Validated deterministically with `applyGenomeEdits()`.
 * Renders audition preview immediately before committing edits.
 */

import React, { useEffect, useState } from 'react';
import {
  SOUND_DESIGN_PRESETS,
  applyAssistantPrompt,
  type SoundDesignPreset,
} from '../../lib/mobile/fieldAssistant';
import { renderGenome } from '../../audio/mobile/genomeRender';
import type { Genome } from '../../lib/mobile/genome';
import type { BufferAnalysis } from '../../audio/mobile/analysis';

interface FieldAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentGenome: Genome;
  workingAudio: Float32Array;
  sampleRate: number;
  analysis?: BufferAnalysis;
  onApplyGenome: (nextGenome: Genome, renderedAudio: Float32Array) => void;
  playAudio: (samples: Float32Array, sampleRate: number) => void;
}

export default function FieldAssistantModal({
  isOpen,
  onClose,
  currentGenome,
  workingAudio,
  sampleRate,
  analysis,
  onApplyGenome,
  playAudio,
}: FieldAssistantModalProps): React.ReactElement | null {
  const [prompt, setPrompt] = useState('');
  const [previewGenome, setPreviewGenome] = useState<Genome | null>(null);
  const [previewAudio, setPreviewAudio] = useState<Float32Array | null>(null);
  const [explanation, setExplanation] = useState<string>('');
  const [summary, setSummary] = useState<string>('');

  // Modal behaviour a phone expects: Escape closes, the page behind does not
  // scroll under the finger.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleGenerate = (textPrompt: string) => {
    if (!textPrompt.trim()) return;
    const result = applyAssistantPrompt(textPrompt, currentGenome, analysis);
    setPreviewGenome(result.updatedGenome);
    setExplanation(result.explanation);
    setSummary(result.summary);

    // Render audio audition
    const rendered = renderGenome(result.updatedGenome, {
      sampleRate,
      source: workingAudio,
    });
    setPreviewAudio(rendered.samples);
    // Play preview automatically
    playAudio(rendered.samples, sampleRate);
  };

  const handleSelectPreset = (preset: SoundDesignPreset) => {
    setPrompt(preset.prompt);
    handleGenerate(preset.prompt);
  };

  const handleCommit = () => {
    if (previewGenome && previewAudio) {
      onApplyGenome(previewGenome, previewAudio);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-assistant-title"
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-blue-500/30 bg-[#0a0f1e] text-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2
              id="field-assistant-title"
              className="text-sm font-bold uppercase tracking-wider text-yellow-400"
            >
              Sound Design Assistant
            </h2>
            <p className="text-[11px] text-white/50">
              Constrained genome sound design (runs offline on-device)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sound design assistant"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-white/60 hover:bg-white/5 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Quick Presets */}
          <div className="text-xs font-semibold text-blue-300">Quick Design Intents</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SOUND_DESIGN_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80 transition hover:border-yellow-400/50 hover:bg-yellow-500/10 active:bg-yellow-500/20"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom Prompt Box */}
          <div className="mt-4">
            <label className="text-xs font-semibold text-blue-300">Custom Design Instruction</label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleGenerate(prompt);
                }}
                placeholder="e.g. heavy punchy kick with 808 sub and warm drive"
                className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/30 outline-none focus:border-yellow-400"
              />
              <button
                type="button"
                onClick={() => handleGenerate(prompt)}
                disabled={!prompt.trim()}
                className="min-h-11 rounded-lg bg-yellow-500 px-3.5 text-xs font-bold text-black active:bg-yellow-400 disabled:opacity-40"
              >
                Apply
              </button>
            </div>
          </div>

          {/* Generated Result Preview */}
          {previewGenome && (
            <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3">
              <div className="text-xs font-bold text-yellow-400">Resulting Sound Architecture</div>
              <div className="mt-1 text-xs font-semibold text-white">{summary}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-white/60">{explanation}</div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => previewAudio && playAudio(previewAudio, sampleRate)}
                  className="min-h-10 flex-1 rounded bg-white/10 py-1.5 text-xs font-semibold hover:bg-white/15"
                >
                  Audition Again
                </button>
                <button
                  type="button"
                  onClick={handleCommit}
                  className="min-h-10 flex-1 rounded bg-yellow-500 py-1.5 text-xs font-bold text-black hover:bg-yellow-400"
                >
                  Accept & Use
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
