/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Variant Grid Touch — 8-slot interactive mutation & breeding grid.
 *
 * Enhanced features:
 * - Directional Evolution Targets (Sub Bass, Snappy, Lo-Fi, Ambient, Max Diverse)
 * - Category Gene Freezes (Lock Filter, Lock Pitch, Lock Layers, Lock FX)
 * - Multi-parent Gene Pool Crossover Breeding
 * - Genetic Divergence and Generation Tracking
 * - Touch swipe gestures (swipe right = Keep, swipe left = Trash)
 * - Full-width "Shape" sheet: presets, live macros and a per-layer mixer
 */

import React, { useState } from 'react';
import {
  keptGenomes,
  meanGridDiversity,
  type VariantGrid,
  type GridSlot,
} from '../../lib/mobile/variantGrid';
import {
  MAX_LAYERS,
  SOUND_PRESETS,
  describeGenome,
  genomeByteSize,
  genomeDistance,
  type DeepPartial,
  type EvolutionTarget,
  type GeneLocks,
  type GenomeParams,
  type LayerGene,
  type LayerKind,
} from '../../lib/mobile/genome';

interface VariantGridTouchProps {
  grid: VariantGrid | null;
  slots: GridSlot[];
  renders: Record<string, Float32Array>;
  mutationStrength: number;
  onUpdateStrength: (val: number) => void;
  onAudition: (genomeId: string) => void;
  onKeep: (genomeId: string) => void;
  onTrash: (genomeId: string) => void;
  onBreed: () => void;
  onBreedPool?: () => void;
  onEvolve: () => void;
  isBusy: boolean;
  /** False until a working slice exists; evolve has nothing to render without one. */
  canEvolve?: boolean;
  onUpdateGenomeParams?: (genomeId: string, params: DeepPartial<GenomeParams>) => void;
  /** Mutate this one variant again, keeping its current shape as the start. */
  onRefineVariant?: (genomeId: string) => void;
  evolutionTarget?: EvolutionTarget;
  onSelectTarget?: (target: EvolutionTarget) => void;
  locks?: GeneLocks;
  onToggleLock?: (key: keyof GeneLocks) => void;
}

const TARGETS: { id: EvolutionTarget; label: string; icon: string }[] = [
  { id: 'balanced', label: 'Balanced', icon: '⚖️' },
  { id: 'sub-bass', label: 'Sub Bass', icon: '🔊' },
  { id: 'snappy-transient', label: 'Snappy', icon: '⚡' },
  { id: 'lofi-crunch', label: 'Lo-Fi', icon: '📻' },
  { id: 'ambient-cloud', label: 'Ambient', icon: '☁️' },
  { id: 'diverse', label: 'Diverse', icon: '🧬' },
];

type GeneratedLayerKind = Exclude<LayerKind, 'recording'>;

const LAYER_ORDER: GeneratedLayerKind[] = ['sub', 'noise', 'body', 'synth'];

const LAYER_LABELS: Record<GeneratedLayerKind, string> = {
  sub: 'Sub',
  noise: 'Noise',
  body: 'Body',
  synth: 'Synth',
};

const LAYER_PRESETS: Record<GeneratedLayerKind, LayerGene> = {
  sub: { kind: 'sub', weight: 0.3, waveform: 'sine', freqHz: 55, decayS: 0.5, phaseOffset: 0 },
  noise: { kind: 'noise', weight: 0.15, waveform: 'noise', decayS: 0.25, phaseOffset: 0 },
  body: {
    kind: 'body',
    weight: 0.25,
    waveform: 'triangle',
    freqHz: 180,
    decayS: 0.4,
    phaseOffset: 0,
  },
  synth: { kind: 'synth', weight: 0.2, waveform: 'saw', freqHz: 220, decayS: 0.5, phaseOffset: 0 },
};

interface ShapeSliderProps {
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function ShapeSlider({
  label,
  display,
  value,
  min,
  max,
  step,
  onChange,
}: ShapeSliderProps): React.ReactElement {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-white/60">{label}</span>
        <span className="font-semibold tabular-nums text-yellow-400">{display}</span>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-0.5 w-full accent-yellow-400"
      />
    </label>
  );
}

export default function VariantGridTouch({
  grid,
  slots,
  renders,
  mutationStrength,
  onUpdateStrength,
  onAudition,
  onKeep,
  onTrash,
  onBreed,
  onBreedPool,
  onEvolve,
  isBusy,
  canEvolve = true,
  onUpdateGenomeParams,
  onRefineVariant,
  evolutionTarget = 'balanced',
  onSelectTarget,
  locks = {},
  onToggleLock,
}: VariantGridTouchProps): React.ReactElement {
  const [selectedGenomeId, setSelectedGenomeId] = useState<string | null>(null);
  const [showLocksDrawer, setShowLocksDrawer] = useState(false);
  const [swipeStartX, setSwipeStartX] = useState<Record<string, number>>({});

  const handleTouchStart = (id: string, e: React.TouchEvent) => {
    setSwipeStartX((prev) => ({ ...prev, [id]: e.touches[0].clientX }));
  };

  const clearSwipe = (id: string): void => {
    setSwipeStartX((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  };

  const handleTouchEnd = (id: string, e: React.TouchEvent) => {
    const startX = swipeStartX[id];
    clearSwipe(id);
    if (startX === undefined) return;
    const endX = e.changedTouches[0].clientX;
    const delta = endX - startX;

    if (delta > 50) {
      onKeep(id);
    } else if (delta < -50) {
      onTrash(id);
    }
  };

  const diversity = grid ? Math.round(meanGridDiversity(grid) * 100) : 0;
  // Keeps persist across rounds, so gate breeding on the pool, not on the
  // current round's slot ids (which are replaced every evolve).
  const poolSize = grid ? keptGenomes(grid).length : 0;

  // The grid is the source of truth. Read the open genome from it rather than
  // keeping a snapshot, so a rendered edit is reflected by the sliders.
  const openSlot = selectedGenomeId
    ? slots.find((slot) => slot.genome.id === selectedGenomeId)
    : undefined;
  const openGenome = openSlot?.genome ?? null;

  const updateOpen = (edits: DeepPartial<GenomeParams>): void => {
    if (!openGenome || !onUpdateGenomeParams) return;
    onUpdateGenomeParams(openGenome.id, edits);
  };

  const updateLayerWeight = (index: number, weight: number): void => {
    if (!openGenome) return;
    updateOpen({
      layers: openGenome.params.layers.map((layer, i) =>
        i === index ? { ...layer, weight } : layer
      ),
    });
  };

  const addLayer = (kind: GeneratedLayerKind): void => {
    if (!openGenome || openGenome.params.layers.length >= MAX_LAYERS) return;
    updateOpen({ layers: [...openGenome.params.layers, { ...LAYER_PRESETS[kind] }] });
  };

  const removeLayer = (index: number): void => {
    if (!openGenome) return;
    const layers = openGenome.params.layers.filter((_, i) => i !== index);
    if (layers.length === 0) return;
    updateOpen({ layers });
  };

  const params = openGenome?.params ?? null;
  const crushAmount = params ? Math.min(1, Math.max(0, (16 - params.crush.bits) / 12)) : 0;
  const layerKinds = new Set(params?.layers.map((layer) => layer.kind) ?? []);

  return (
    <div className="flex flex-col gap-3">
      {/* Evolution Objective Selector */}
      {onSelectTarget && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-white/5 p-2.5">
          <div className="flex items-center justify-between text-[11px] text-white/60">
            <span className="font-semibold text-yellow-400">Evolution Objective</span>
            <span>Target Bias</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {TARGETS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTarget(t.id)}
                aria-pressed={evolutionTarget === t.id}
                className={`flex min-h-10 items-center justify-center gap-1 rounded-lg border py-1.5 text-xs font-semibold transition ${
                  evolutionTarget === t.id
                    ? 'border-yellow-400 bg-yellow-400 text-black shadow'
                    : 'border-white/10 bg-white/5 text-white/80 hover:border-white/20'
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Gene Freeze Locks Bar */}
      {onToggleLock && (
        <div className="rounded-lg bg-white/5 px-3 py-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-blue-300">Gene Freezes (Keep Safe)</span>
            <button
              type="button"
              onClick={() => setShowLocksDrawer(!showLocksDrawer)}
              aria-expanded={showLocksDrawer}
              className="min-h-11 rounded px-2 text-[10px] text-white/60 hover:bg-white/5 hover:text-white"
            >
              {showLocksDrawer ? 'Hide Freezes ▲' : 'Show Freezes ▼'}
            </button>
          </div>

          {showLocksDrawer && (
            <div className="mt-2 grid grid-cols-3 gap-1.5 pt-1">
              {[
                { key: 'filter', label: 'Filter' },
                { key: 'pitch', label: 'Pitch' },
                { key: 'layers', label: 'Layers' },
                { key: 'grain', label: 'Grain' },
                { key: 'crush', label: 'Crush' },
                { key: 'drive', label: 'Drive' },
              ].map(({ key, label }) => {
                const isLocked = locks[key as keyof GeneLocks] ?? false;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onToggleLock(key as keyof GeneLocks)}
                    aria-pressed={isLocked}
                    className={`min-h-9 rounded border px-2 py-1 text-[10px] font-bold ${
                      isLocked
                        ? 'border-blue-400 bg-blue-500/20 text-blue-300'
                        : 'border-white/10 bg-white/5 text-white/40'
                    }`}
                  >
                    {isLocked ? `🔒 ${label}` : `🔓 ${label}`}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Mutation Strength & Evolve Controls Bar */}
      <div className="flex flex-col gap-2 rounded-lg bg-white/5 p-3">
        <div className="flex items-center justify-between text-xs text-white/70">
          <div className="flex items-center gap-1.5">
            <span>Mutation Strength</span>
            <span className="font-semibold text-yellow-400">
              {Math.round(mutationStrength * 100)}%
            </span>
          </div>
          {grid && grid.slots.length > 0 && (
            <span className="text-[10px] text-white/50">
              Gen {grid.generation} · Diversity{' '}
              <span className="font-bold text-yellow-400">{diversity}%</span>
            </span>
          )}
        </div>
        <input
          type="range"
          aria-label="Mutation strength"
          min={0.05}
          max={1}
          step={0.05}
          value={mutationStrength}
          onChange={(e) => onUpdateStrength(Number(e.target.value))}
          className="w-full accent-yellow-400"
        />
        <button
          type="button"
          onClick={onEvolve}
          disabled={isBusy || !canEvolve}
          className="mt-1 h-12 w-full rounded-lg bg-yellow-500 text-sm font-bold text-black shadow active:bg-yellow-400 disabled:opacity-40"
        >
          {isBusy
            ? 'Rendering Variants…'
            : canEvolve
              ? `Evolve 8 Sound Design Variants (${evolutionTarget})`
              : 'Select a slice to evolve'}
        </button>
      </div>

      {/* 8-Slot Variant Cards */}
      {slots.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {slots.map((slot) => {
            const isKept = grid?.kept.includes(slot.genome.id) ?? false;
            const hasAudio = renders[slot.genome.id] !== undefined;
            const distFromParent = grid
              ? Math.round(genomeDistance(grid.parent, slot.genome) * 100)
              : 0;
            const isEditing = selectedGenomeId === slot.genome.id;

            return (
              <div
                key={slot.genome.id}
                onTouchStart={(e) => handleTouchStart(slot.genome.id, e)}
                onTouchEnd={(e) => handleTouchEnd(slot.genome.id, e)}
                onTouchCancel={() => clearSwipe(slot.genome.id)}
                className={`relative flex touch-pan-y flex-col justify-between rounded-xl border p-2.5 transition ${
                  isKept
                    ? 'border-yellow-500 bg-yellow-500/10'
                    : 'border-white/10 bg-[#0a0f1d] hover:border-white/20'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-1">
                    <span className="truncate text-xs font-semibold text-white">
                      {describeGenome(slot.genome)}
                    </span>
                    <span className="rounded bg-white/10 px-1 py-0.5 text-[9px] font-mono text-white/50">
                      {genomeByteSize(slot.genome)}B
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-[10px] text-white/50">
                    <div>
                      {slot.analysis ? (
                        <span>
                          {slot.analysis.centroidHz.toFixed(0)} Hz ·{' '}
                          {slot.analysis.peakDb.toFixed(1)} dB
                        </span>
                      ) : (
                        'unmeasured'
                      )}
                    </div>
                    <span className="rounded bg-yellow-400/15 px-1 text-[9px] font-semibold text-yellow-300">
                      {distFromParent}% div
                    </span>
                  </div>
                </div>

                {/* Audition & Action Buttons */}
                <div className="mt-2.5 flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => onAudition(slot.genome.id)}
                    disabled={!hasAudio}
                    className="h-11 rounded bg-blue-600/60 text-xs font-bold text-white active:bg-blue-600 disabled:opacity-40"
                  >
                    Audition
                  </button>

                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => onKeep(slot.genome.id)}
                      aria-pressed={isKept}
                      className={`h-11 rounded text-[11px] font-bold ${
                        isKept
                          ? 'bg-yellow-500 text-black'
                          : 'bg-white/10 text-white hover:bg-white/15'
                      }`}
                    >
                      {isKept ? 'Kept' : 'Keep'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onTrash(slot.genome.id)}
                      className="h-11 rounded bg-white/5 text-[11px] text-white/70 hover:bg-white/10"
                    >
                      Trash
                    </button>
                  </div>

                  {onUpdateGenomeParams && (
                    <button
                      type="button"
                      onClick={() => setSelectedGenomeId(isEditing ? null : slot.genome.id)}
                      aria-expanded={isEditing}
                      className={`min-h-9 w-full rounded text-[10px] font-semibold ${
                        isEditing
                          ? 'bg-yellow-500/15 text-yellow-300'
                          : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
                      }`}
                    >
                      {isEditing ? 'Editing…' : 'Shape sound'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <p className="col-span-2 text-center text-[10px] text-white/35">
            Swipe a card right to keep, left to trash — or use the buttons.
          </p>
        </div>
      )}

      {/* Breeding Bar: 2-Parent or Multi-Parent Pool Crossover */}
      {grid && poolSize >= 2 && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onBreed}
            disabled={isBusy}
            className="h-11 flex-1 rounded-lg border border-purple-500/40 bg-purple-950/30 text-xs font-bold text-purple-200 active:bg-purple-900/50 disabled:opacity-40"
          >
            Breed 2 Keeps
          </button>
          {onBreedPool && (
            <button
              type="button"
              onClick={onBreedPool}
              disabled={isBusy}
              className="h-11 flex-1 rounded-lg border border-fuchsia-500/50 bg-fuchsia-950/40 text-xs font-bold text-fuchsia-200 active:bg-fuchsia-900/50 disabled:opacity-40"
            >
              Pool Breed ({poolSize})
            </button>
          )}
        </div>
      )}

      {/* Full-width shape sheet — sliders need room, and a bottom sheet keeps
          the variant grid visible behind it instead of stretching one card. */}
      {openGenome && params && onUpdateGenomeParams && (
        <>
          <button
            type="button"
            aria-label="Close sound design"
            onClick={() => setSelectedGenomeId(null)}
            className="fixed inset-0 z-30 bg-black/60"
          />
          <div
            role="dialog"
            aria-label="Shape this variant"
            className="fixed inset-x-0 bottom-0 z-40 max-h-[78vh] touch-pan-y overflow-y-auto overscroll-contain rounded-t-2xl border-t border-yellow-500/40 bg-[#0b1120] px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-yellow-400">
                  Shape this variant
                </p>
                <p className="truncate text-xs font-semibold text-white">
                  {describeGenome(openGenome)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => onAudition(openGenome.id)}
                  className="h-9 rounded-full bg-blue-600 px-3 text-[11px] font-bold text-white active:bg-blue-500"
                >
                  Play
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedGenomeId(null)}
                  aria-label="Close"
                  className="h-9 w-9 rounded-full bg-white/10 text-sm text-white/70"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {SOUND_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => updateOpen(preset.edits)}
                  className="min-h-10 rounded-lg border border-white/10 bg-white/5 text-[10px] font-semibold text-white/80 active:bg-white/10"
                >
                  <span className="mr-0.5">{preset.icon}</span>
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2">
              <ShapeSlider
                label={params.filter.type === 'highpass' ? 'Cutoff' : 'Brightness'}
                display={`${((params.filter.type === 'highpass'
                  ? params.filter.lowHz
                  : params.filter.highHz) / 1000).toFixed(1)} kHz`}
                value={
                  params.filter.type === 'highpass'
                    ? params.filter.lowHz
                    : params.filter.highHz
                }
                min={params.filter.type === 'highpass' ? 60 : 800}
                max={20000}
                step={50}
                onChange={(value) =>
                  updateOpen({
                    filter:
                      params.filter.type === 'highpass'
                        ? { lowHz: value }
                        : { highHz: value },
                  })
                }
              />
              <ShapeSlider
                label="Pitch"
                display={`${params.pitch.offsetCents > 0 ? '+' : ''}${Math.round(
                  params.pitch.offsetCents
                )}¢`}
                value={params.pitch.offsetCents}
                min={-2400}
                max={2400}
                step={10}
                onChange={(value) => updateOpen({ pitch: { offsetCents: value } })}
              />
              <ShapeSlider
                label="Grit"
                display={`${Math.round(params.drive.mix * 100)}%`}
                value={params.drive.mix}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => updateOpen({ drive: { amount: value, mix: value } })}
              />
              <ShapeSlider
                label="Crush"
                display={`${params.crush.bits}-bit / ${params.crush.downsample}×`}
                value={crushAmount}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) =>
                  updateOpen({
                    crush: {
                      bits: Math.round(16 - value * 12),
                      downsample: 1 + Math.round(value * 7),
                    },
                  })
                }
              />
              <ShapeSlider
                label="Texture"
                display={`${Math.round(params.grain.scatter * 100)}%`}
                value={params.grain.scatter}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => updateOpen({ grain: { scatter: value } })}
              />
              <ShapeSlider
                label="Motion"
                display={`${Math.round(params.tremolo.depth * 100)}%`}
                value={params.tremolo.depth}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => updateOpen({ tremolo: { depth: value } })}
              />
              <ShapeSlider
                label="Level"
                display={`${params.gainDb > 0 ? '+' : ''}${params.gainDb.toFixed(1)} dB`}
                value={params.gainDb}
                min={-48}
                max={12}
                step={0.5}
                onChange={(value) => updateOpen({ gainDb: value })}
              />
            </div>

            <div className="mt-3 border-t border-white/10 pt-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-widest text-yellow-400">Layers</p>
                <span className="text-[10px] text-white/40">
                  {params.layers.length}/{MAX_LAYERS}
                </span>
              </div>
              {params.layers.map((layer, index) => (
                <div key={`${layer.kind}-${index}`} className="mt-1.5 flex items-center gap-2">
                  <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-white/50">
                    {layer.kind}
                  </span>
                  <input
                    type="range"
                    aria-label={`${layer.kind} layer level`}
                    min={0}
                    max={1}
                    step={0.01}
                    value={layer.weight}
                    onChange={(event) => updateLayerWeight(index, Number(event.target.value))}
                    className="min-w-0 flex-1 accent-yellow-400"
                  />
                  <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-white/60">
                    {Math.round(layer.weight * 100)}%
                  </span>
                  {layer.kind !== 'recording' && (
                    <button
                      type="button"
                      onClick={() => removeLayer(index)}
                      aria-label={`Remove ${layer.kind} layer`}
                      className="h-7 w-7 shrink-0 rounded-full bg-white/10 text-xs text-white/60 active:bg-white/20"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {LAYER_ORDER.filter((kind) => !layerKinds.has(kind)).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => addLayer(kind)}
                    disabled={params.layers.length >= MAX_LAYERS}
                    className="min-h-8 rounded-full border border-white/10 px-2.5 text-[10px] font-semibold text-white/60 active:bg-white/10 disabled:opacity-30"
                  >
                    + {LAYER_LABELS[kind]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 border-t border-white/10 pt-2">
              <div className="flex items-center justify-between text-[11px] text-white/60">
                <span className="font-semibold text-yellow-400">Protect attack</span>
                <input
                  type="checkbox"
                  aria-label="Protect attack transient"
                  checked={params.transientLockEnabled}
                  onChange={(event) =>
                    updateOpen({ transientLockEnabled: event.target.checked })
                  }
                  className="accent-yellow-400"
                />
              </div>
              <ShapeSlider
                label="Lock duration"
                display={`${params.transientLockMs} ms`}
                value={params.transientLockMs}
                min={5}
                max={40}
                step={1}
                onChange={(value) => updateOpen({ transientLockMs: value })}
              />
            </div>

            {onRefineVariant && (
              <button
                type="button"
                onClick={() => onRefineVariant(openGenome.id)}
                className="mt-3 h-11 w-full rounded-lg border border-fuchsia-500/40 bg-fuchsia-950/30 text-xs font-bold text-fuchsia-200 active:bg-fuchsia-900/50"
              >
                More like this
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
