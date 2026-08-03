/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ArrangementPanel (Phase 2.1).
 *
 * Horizontal clip-timeline editor. Clips are draggable on the timeline,
 * draggable to resize their length, mute-toggleable, duplicate-able and
 * splittable at the playhead. The legacy `SongModePanel` keeps its linear
 * list view for backwards compatibility — this panel is additive and lives
 * next to it.
 *
 * Click on an empty area of the timeline to add a clip at the beat you
 * clicked on, defaulting to the active pattern.
 */

import React, { useMemo, useRef } from 'react';
import { Plus, Copy, Split, Trash2 } from 'lucide-react';
import { usePatternStore, PATTERN_IDS, type PatternId } from '../store/patternStore';

const PIXELS_PER_BEAT = 16;
const PATTERN_COLORS: Record<string, string> = {
  A: '#22d3ee',
  B: '#a78bfa',
  C: '#f472b6',
  D: '#facc15',
};
const TEMPO_COLOR = '#34d399';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

interface DragState {
  clipId: string;
  kind: 'move' | 'resize-left' | 'resize-right';
  startX: number;
  origStart: number;
  origBeats: number;
}

interface ArrangementPanelProps {
  onSelectClipPattern?: (patternId: PatternId) => void;
}

export const ArrangementPanel: React.FC<ArrangementPanelProps> = ({ onSelectClipPattern }) => {
  const arrangement = usePatternStore((s) => s.arrangement);
  const patterns = usePatternStore((s) => s.patterns);
  const activePatternId = usePatternStore((s) => s.activePatternId);
  const addClip = usePatternStore((s) => s.addClip);
  const updateClip = usePatternStore((s) => s.updateClip);
  const removeClip = usePatternStore((s) => s.removeClip);
  const duplicateClip = usePatternStore((s) => s.duplicateClip);
  const splitClipAtBeat = usePatternStore((s) => s.splitClipAtBeat);
  const setActivePattern = usePatternStore((s) => s.setActivePattern);
  const addTempoPoint = usePatternStore((s) => s.addTempoPoint);
  const removeTempoPoint = usePatternStore((s) => s.removeTempoPoint);
  const clearTempoMap = usePatternStore((s) => s.clearTempoMap);

  const dragRef = useRef<DragState | null>(null);

  const totalBeats = useMemo(
    () => Math.max(16, arrangement.totalBeats, ...arrangement.clips.map((c) => c.startBeat + c.beats)),
    [arrangement]
  );

  const sortedClips = useMemo(
    () => [...arrangement.clips].sort((a, b) => a.startBeat - b.startBeat),
    [arrangement.clips]
  );

  const onTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only fire when clicking the empty timeline (not a clip).
    const target = e.target as HTMLElement;
    if (target.dataset.clipId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const beat = clamp((e.clientX - rect.left + e.currentTarget.scrollLeft) / PIXELS_PER_BEAT, 0, totalBeats);
    addClip({
      patternId: activePatternId,
      startBeat: Math.round(beat),
      beats: patterns[activePatternId].stepLength / 4,
      loops: 1,
      muted: false,
      color: PATTERN_COLORS[activePatternId],
    });
  };

  const startDrag = (clipId: string, kind: DragState['kind'], e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const clip = arrangement.clips.find((c) => c.id === clipId);
    if (!clip) return;
    dragRef.current = {
      clipId,
      kind,
      startX: e.clientX,
      origStart: clip.startBeat,
      origBeats: clip.beats,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const ds = dragRef.current;
      if (!ds) return;
      const dx = ev.clientX - ds.startX;
      const dBeats = dx / PIXELS_PER_BEAT;
      if (ds.kind === 'move') {
        updateClip(ds.clipId, { startBeat: Math.max(0, Math.round(ds.origStart + dBeats)) });
      } else if (ds.kind === 'resize-left') {
        const newStart = clamp(Math.round(ds.origStart + dBeats), 0, ds.origStart + ds.origBeats - 1);
        const newBeats = ds.origBeats - (newStart - ds.origStart);
        updateClip(ds.clipId, { startBeat: newStart, beats: Math.max(1, Math.round(newBeats)) });
      } else if (ds.kind === 'resize-right') {
        const newBeats = Math.max(1, Math.round(ds.origBeats + dBeats));
        updateClip(ds.clipId, { beats: newBeats });
      }
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="flex flex-col gap-2 p-3 bg-black/40 border border-white/10 rounded">
      <div className="flex items-center justify-between gap-2 text-[10px] text-white/60 font-mono">
        <span className="uppercase tracking-widest font-bold text-emerald-400">Arrangement Timeline</span>
        <span>
          {sortedClips.length} clip{sortedClips.length === 1 ? '' : 's'} · {totalBeats} beats total
        </span>
      </div>

      {/* Beat ruler */}
      <div className="overflow-x-auto custom-scrollbar">
        <div className="relative" style={{ width: Math.max(totalBeats * PIXELS_PER_BEAT, 600), minHeight: 110 }}>
          {/* Beat ticks */}
          <div
            className="absolute top-0 left-0 right-0 h-4 border-b border-white/10 pointer-events-none"
            aria-hidden="true"
          >
            {Array.from({ length: totalBeats + 1 }, (_, i) => (
              <div
                key={i}
                className={`absolute top-0 ${i % 4 === 0 ? 'h-3' : 'h-1'} border-l border-white/15`}
                style={{ left: i * PIXELS_PER_BEAT }}
              />
            ))}
            {Array.from({ length: Math.floor(totalBeats / 4) + 1 }, (_, i) => (
              <div
                key={`l${i}`}
                className="absolute top-0 text-[8px] font-mono text-white/40"
                style={{ left: i * 4 * PIXELS_PER_BEAT + 2 }}
              >
                {i + 1}
              </div>
            ))}
          </div>

          {/* Phase 2.2 — tempo lane: a thin strip showing tempoMap points.
              Each point is a draggable handle; clicking the lane adds a
              point at the beat using the active pattern's BPM. */}
          <div
            className="absolute top-4 left-0 right-0 h-4 bg-black/30 border-b border-white/10"
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.dataset.tempoPoint) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const beat = clamp((e.clientX - rect.left + e.currentTarget.scrollLeft) / PIXELS_PER_BEAT, 0, totalBeats);
              addTempoPoint({ tick: Math.round(beat), bpm: patterns[activePatternId].bpm });
            }}
            role="presentation"
          >
            {arrangement.tempoMap.map((point) => (
              <div
                key={point.tick}
                data-tempo-point={point.tick}
                title={`${point.bpm.toFixed(1)} BPM at beat ${point.tick}`}
                className="absolute top-0 bottom-0 flex items-center"
                style={{ left: point.tick * PIXELS_PER_BEAT - 6 }}
              >
                <div
                  className="w-3 h-3 rotate-45 border border-white/80 cursor-pointer hover:scale-110 transition-transform"
                  style={{ background: TEMPO_COLOR }}
                  onClick={(e) => e.stopPropagation()}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    removeTempoPoint(point.tick);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove tempo point ${point.bpm} BPM at beat ${point.tick}`}
                />
              </div>
            ))}
            {arrangement.tempoMap.length > 0 && (
              <button
                type="button"
                onClick={() => clearTempoMap()}
                className="absolute top-0 right-1 text-[8px] font-mono font-bold uppercase text-white/60 hover:text-white"
                title="Clear all tempo points"
              >
                Clear
              </button>
            )}
          </div>

          {/* Empty timeline + clip area */}
          <div
            className="absolute top-8 left-0 right-0 bottom-0"
            onClick={onTimelineClick}
            role="presentation"
          >
            {sortedClips.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/30 font-mono uppercase tracking-widest pointer-events-none">
                Click to add a clip at the active pattern
              </div>
            )}

            {sortedClips.map((clip) => {
              const left = clip.startBeat * PIXELS_PER_BEAT;
              const width = Math.max(PIXELS_PER_BEAT, clip.beats * PIXELS_PER_BEAT);
              const color = clip.color ?? PATTERN_COLORS[clip.patternId] ?? '#64748b';
              const pattern = patterns[clip.patternId as PatternId];
              return (
                <div
                  key={clip.id}
                  data-clip-id={clip.id}
                  className={`absolute top-1 bottom-1 rounded border ${
                    clip.muted ? 'border-white/10 opacity-50' : 'border-white/30'
                  } shadow-md flex items-stretch overflow-hidden text-[9px] font-mono font-bold uppercase tracking-wider`}
                  style={{ left, width, background: color }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePattern(clip.patternId as PatternId);
                    onSelectClipPattern?.(clip.patternId as PatternId);
                  }}
                >
                  {/* resize-left handle */}
                  <div
                    className="w-1.5 cursor-ew-resize bg-black/40 hover:bg-black/70"
                    onPointerDown={(e) => startDrag(clip.id, 'resize-left', e)}
                    aria-label="Resize clip start"
                    role="separator"
                  />
                  {/* main draggable body */}
                  <div
                    className="flex-1 px-1.5 py-1 flex flex-col justify-between cursor-grab active:cursor-grabbing"
                    onPointerDown={(e) => startDrag(clip.id, 'move', e)}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-black/80" title={pattern?.name ?? clip.patternId}>
                        {clip.patternId}{clip.loops > 1 ? ` ×${clip.loops}` : ''}
                      </span>
                      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => updateClip(clip.id, { muted: !clip.muted })}
                          className="px-1 rounded bg-black/40 text-white hover:bg-black/60"
                          title={clip.muted ? 'Unmute' : 'Mute'}
                          aria-label={clip.muted ? 'Unmute clip' : 'Mute clip'}
                        >
                          {clip.muted ? 'M' : '·'}
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicateClip(clip.id)}
                          className="p-0.5 rounded bg-black/40 text-white hover:bg-black/60"
                          title="Duplicate clip"
                          aria-label="Duplicate clip"
                        >
                          <Copy size={10} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const beat = clip.startBeat + clip.beats / 2;
                            splitClipAtBeat(clip.id, beat);
                          }}
                          className="p-0.5 rounded bg-black/40 text-white hover:bg-black/60"
                          title="Split clip at midpoint"
                          aria-label="Split clip"
                        >
                          <Split size={10} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeClip(clip.id)}
                          className="p-0.5 rounded bg-red-700/70 text-white hover:bg-red-700"
                          title="Remove clip"
                          aria-label="Remove clip"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                    <div className="text-black/60 text-[8px]">
                      beat {clip.startBeat} · {clip.beats}b · {clip.loops}×
                    </div>
                  </div>
                  {/* resize-right handle */}
                  <div
                    className="w-1.5 cursor-ew-resize bg-black/40 hover:bg-black/70"
                    onPointerDown={(e) => startDrag(clip.id, 'resize-right', e)}
                    aria-label="Resize clip end"
                    role="separator"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px] text-white/50 font-mono">
        <span>Click empty timeline to add a clip · drag to move · edges to resize</span>
        <div className="flex gap-1">
          {PATTERN_IDS.map((pid) => (
            <button
              key={pid}
              type="button"
              onClick={() => setActivePattern(pid)}
              className={`px-2 py-0.5 rounded border ${
                pid === activePatternId
                  ? 'border-white text-white bg-white/10'
                  : 'border-white/15 text-white/50 hover:border-white/40'
              }`}
              style={{ borderLeftColor: PATTERN_COLORS[pid], borderLeftWidth: 4 }}
            >
              {pid}
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              addClip({
                patternId: activePatternId,
                startBeat: arrangement.totalBeats,
                beats: patterns[activePatternId].stepLength / 4,
                loops: 1,
                muted: false,
                color: PATTERN_COLORS[activePatternId],
              })
            }
            className="px-2 py-0.5 rounded border border-emerald-500/40 text-emerald-300 hover:border-emerald-400 inline-flex items-center gap-1"
          >
            <Plus size={10} /> Append
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArrangementPanel;
