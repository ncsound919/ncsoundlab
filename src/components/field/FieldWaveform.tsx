/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Field Waveform Pro — retina-sharp touch waveform with pinch-to-zoom,
 * draggable slice boundary handles, snap to zero-crossing, and scrubbing.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioSlice } from '../../audio/mobile/onsetSlicer';

interface FieldWaveformProps {
  samples: Float32Array;
  sampleRate: number;
  slices?: AudioSlice[];
  selectedSliceId?: string | null;
  onSelectSlice?: (slice: AudioSlice) => void;
  onUpdateSliceBounds?: (slice: AudioSlice, newStartSample: number, newEndSample: number) => void;
  onScrub?: (sampleIndex: number) => void;
  playheadSec?: number | null;
  height?: number;
  showPreRoll?: boolean;
}

type DragTarget = 'none' | 'start-handle' | 'end-handle' | 'scrub' | 'pan';

export default function FieldWaveform({
  samples,
  sampleRate,
  slices = [],
  selectedSliceId,
  onSelectSlice,
  onUpdateSliceBounds,
  onScrub,
  playheadSec = null,
  height = 110,
  showPreRoll = true,
}: FieldWaveformProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  // Zoom and pan state
  const [zoom, setZoom] = useState(1.0); // 1.0 = full take, up to 16.0
  const [panRatio, setPanRatio] = useState(0.0); // 0.0 to 1.0 (start offset)
  const [dragTarget, setDragTarget] = useState<DragTarget>('none');
  const [dragStartX, setDragStartX] = useState(0);
  const [initialTouchDist, setInitialTouchDist] = useState<number | null>(null);
  const [initialZoom, setInitialZoom] = useState(1.0);

  const selectedSlice = slices.find((s) => `${s.startSample}-${s.endSample}` === selectedSliceId) ?? null;

  // Find nearest zero crossing within a small radius
  const snapToZeroCrossing = useCallback(
    (sampleIdx: number, radius = 120): number => {
      const start = Math.max(0, sampleIdx - radius);
      const end = Math.min(samples.length - 2, sampleIdx + radius);
      let bestIdx = sampleIdx;
      let minAbs = Math.abs(samples[sampleIdx] || 0);

      for (let i = start; i <= end; i++) {
        // Zero crossing detection: sign change
        if (samples[i] * samples[i + 1] <= 0) {
          const abs = Math.abs(samples[i]);
          if (abs < minAbs) {
            minAbs = abs;
            bestIdx = i;
          }
        }
      }
      return bestIdx;
    },
    [samples]
  );

  // Auto-zoom to fit selected slice
  const handleZoomToSlice = useCallback(() => {
    if (!selectedSlice || samples.length === 0) return;
    const sliceLen = selectedSlice.endSample - selectedSlice.startSample;
    const newZoom = Math.max(1.0, Math.min(16.0, samples.length / (sliceLen * 1.4)));
    const centerRatio = (selectedSlice.startSample + sliceLen / 2) / samples.length;
    const viewWidthRatio = 1 / newZoom;
    const newPan = Math.max(0, Math.min(1 - viewWidthRatio, centerRatio - viewWidthRatio / 2));
    setZoom(newZoom);
    setPanRatio(newPan);
  }, [samples.length, selectedSlice]);

  const handleResetZoom = useCallback(() => {
    setZoom(1.0);
    setPanRatio(0.0);
  }, []);

  // Redraw canvas with Retina Hi-DPI scaling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || samples.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cssWidth = rect.width || 600;
    const cssHeight = height;

    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    ctx.scale(dpr, dpr);

    const w = cssWidth;
    const h = cssHeight;

    ctx.clearRect(0, 0, w, h);

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#090e1c');
    bg.addColorStop(1, '#040710');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Center baseline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Visible sample window
    const viewWidthRatio = 1 / zoom;
    const startSample = Math.floor(panRatio * samples.length);
    const visibleSamplesCount = Math.floor(viewWidthRatio * samples.length);
    const endSample = Math.min(samples.length, startSample + visibleSamplesCount);

    const sampleToX = (s: number): number => {
      return ((s - startSample) / visibleSamplesCount) * w;
    };

    // Draw Slices
    slices.forEach((slice, idx) => {
      const isSelected = selectedSlice && slice.startSample === selectedSlice.startSample;
      const x1 = sampleToX(slice.startSample);
      const x2 = sampleToX(slice.endSample);
      const sliceWidth = Math.max(2, x2 - x1);

      // Skip offscreen slices
      if (x2 < 0 || x1 > w) return;

      // Slice background
      if (isSelected) {
        ctx.fillStyle = 'rgba(234, 179, 8, 0.22)';
        ctx.fillRect(x1, 0, sliceWidth, h);
      } else {
        ctx.fillStyle = idx % 2 === 0 ? 'rgba(59, 130, 246, 0.06)' : 'rgba(59, 130, 246, 0.12)';
        ctx.fillRect(x1, 0, sliceWidth, h);
      }

      // Left boundary line
      ctx.strokeStyle = isSelected ? '#eab308' : 'rgba(59, 130, 246, 0.4)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, h);
      ctx.stroke();

      // Right boundary line
      if (isSelected) {
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x2, 0);
        ctx.lineTo(x2, h);
        ctx.stroke();
      }

      // Pre-roll region marker (first ~15ms)
      if (showPreRoll) {
        const preRollFrames = Math.round(0.015 * sampleRate);
        const preRollX = Math.min(x2, sampleToX(slice.startSample + preRollFrames));
        ctx.fillStyle = isSelected ? '#facc15' : 'rgba(147, 197, 253, 0.4)';
        ctx.fillRect(x1, 0, Math.max(2, preRollX - x1), 3);
      }

      // Slice badge
      ctx.fillStyle = isSelected ? '#facc15' : 'rgba(255, 255, 255, 0.5)';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`#${idx + 1}`, x1 + 4, 12);

      // Handle Flags for selected slice
      if (isSelected) {
        // Start handle flag (green/yellow triangle)
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.moveTo(x1, 0);
        ctx.lineTo(x1 + 10, 0);
        ctx.lineTo(x1, 12);
        ctx.closePath();
        ctx.fill();

        // End handle flag
        ctx.beginPath();
        ctx.moveTo(x2, 0);
        ctx.lineTo(x2 - 10, 0);
        ctx.lineTo(x2, 12);
        ctx.closePath();
        ctx.fill();
      }
    });

    // Draw Waveform samples
    const step = Math.max(1, Math.floor(visibleSamplesCount / w));
    const ampScale = (h / 2) * 0.88;
    ctx.fillStyle = '#60a5fa';

    for (let x = 0; x < w; x++) {
      const idx = startSample + x * step;
      let min = 1.0;
      let max = -1.0;

      for (let j = 0; j < step && idx + j < endSample; j++) {
        const val = samples[idx + j];
        if (val < min) min = val;
        if (val > max) max = val;
      }
      if (min > max) {
        min = 0;
        max = 0;
      }

      const yTop = h / 2 - max * ampScale;
      const yBottom = h / 2 - min * ampScale;
      ctx.fillRect(x, yTop, 1, Math.max(1.5, yBottom - yTop));
    }

    // Playhead marker
    if (playheadSec !== null && playheadSec >= 0) {
      const playheadSample = Math.round(playheadSec * sampleRate);
      const playheadX = sampleToX(playheadSample);
      if (playheadX >= 0 && playheadX <= w) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, h);
        ctx.stroke();

        // Playhead top head
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(playheadX, 4, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [
    samples,
    sampleRate,
    slices,
    selectedSlice,
    playheadSec,
    height,
    showPreRoll,
    zoom,
    panRatio,
  ]);

  // Pointer event handlers: tap, handle drag, pan, scrub
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    // Second finger of a pinch belongs to the zoom gesture, not to editing.
    if (!canvas || samples.length === 0 || !e.isPrimary) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;

    // Keep receiving moves when the finger leaves the canvas. Without capture a
    // drag past the edge stops updating and leaves dragTarget stuck, so the
    // next tap keeps dragging.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
      pointerIdRef.current = e.pointerId;
    } catch {
      // Pointer capture is unavailable — dragging still works inside the canvas.
    }

    const visibleSamplesCount = (1 / zoom) * samples.length;
    const startSample = Math.floor(panRatio * samples.length);
    const clickSample = Math.floor(startSample + (x / w) * visibleSamplesCount);

    // Check if clicked near start/end handles of selected slice (within 14px)
    if (selectedSlice && onUpdateSliceBounds) {
      const startX = ((selectedSlice.startSample - startSample) / visibleSamplesCount) * w;
      const endX = ((selectedSlice.endSample - startSample) / visibleSamplesCount) * w;

      if (Math.abs(x - startX) <= 14) {
        setDragTarget('start-handle');
        setDragStartX(x);
        return;
      }
      if (Math.abs(x - endX) <= 14) {
        setDragTarget('end-handle');
        setDragStartX(x);
        return;
      }
    }

    // Otherwise find slice under tap. Tapping a slice only selects it: the
    // select handler already auditions the slice, and starting a scrub here as
    // well played a ~50 ms grain over that audition instead of the slice.
    const found = slices.find((s) => clickSample >= s.startSample && clickSample <= s.endSample);
    if (found) {
      onSelectSlice?.(found);
      setDragTarget('none');
      return;
    }

    if (onScrub) {
      onScrub(clickSample);
      setDragTarget('scrub');
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragTarget === 'none') return;
    const canvas = canvasRef.current;
    if (!canvas || samples.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const w = rect.width;

    const visibleSamplesCount = (1 / zoom) * samples.length;
    const startSample = Math.floor(panRatio * samples.length);
    const currentSample = Math.floor(startSample + (x / w) * visibleSamplesCount);

    if (dragTarget === 'start-handle' && selectedSlice && onUpdateSliceBounds) {
      const snapped = snapToZeroCrossing(currentSample);
      if (snapped < selectedSlice.endSample - 100) {
        onUpdateSliceBounds(selectedSlice, Math.max(0, snapped), selectedSlice.endSample);
      }
    } else if (dragTarget === 'end-handle' && selectedSlice && onUpdateSliceBounds) {
      const snapped = snapToZeroCrossing(currentSample);
      if (snapped > selectedSlice.startSample + 100) {
        onUpdateSliceBounds(selectedSlice, selectedSlice.startSample, Math.min(samples.length, snapped));
      }
    } else if (dragTarget === 'scrub' && onScrub) {
      onScrub(currentSample);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (
      pointerIdRef.current !== null &&
      e.currentTarget.hasPointerCapture?.(pointerIdRef.current)
    ) {
      e.currentTarget.releasePointerCapture(pointerIdRef.current);
    }
    pointerIdRef.current = null;
    setDragTarget('none');
  };

  // Pinch-to-zoom multi-touch handling
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setInitialTouchDist(dist);
      setInitialZoom(zoom);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialTouchDist !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / initialTouchDist;
      const nextZoom = Math.max(1.0, Math.min(16.0, initialZoom * factor));
      setZoom(nextZoom);
    }
  };

  const handleTouchEnd = () => {
    setInitialTouchDist(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col gap-1.5 overflow-hidden rounded-xl border border-white/10 bg-[#070b16] p-2"
    >
      {/* Zoom / Navigation Toolbar */}
      <div className="flex items-center justify-between text-[11px] text-white/60">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-white/80">Zoom: {zoom.toFixed(1)}x</span>
          <button
            type="button"
            onClick={handleResetZoom}
            className={`min-h-8 rounded px-2 text-[10px] ${zoom === 1.0 ? 'bg-white/10 text-white/40' : 'bg-blue-600 font-bold text-white'}`}
          >
            Fit All
          </button>
          {selectedSlice && (
            <button
              type="button"
              onClick={handleZoomToSlice}
              className="min-h-8 rounded bg-yellow-500/20 px-2 text-[10px] font-bold text-yellow-400 hover:bg-yellow-500/30"
            >
              Zoom Slice
            </button>
          )}
        </div>

        {zoom > 1.0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px]">Pan:</span>
            <input
              type="range"
              min={0}
              max={1 - 1 / zoom}
              step={0.01}
              value={panRatio}
              onChange={(e) => setPanRatio(Number(e.target.value))}
              className="w-24 accent-yellow-400"
            />
          </div>
        )}

        <span className="text-[10px] text-white/40">
          {(samples.length / sampleRate).toFixed(2)}s · {slices.length}{' '}
          {slices.length === 1 ? 'slice' : 'slices'}
        </span>
      </div>

      {/* Retina Canvas */}
      <div className="relative w-full">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="h-28 w-full touch-pan-y cursor-crosshair rounded-lg"
          aria-label="Interactive field waveform canvas"
        />

        {selectedSlice && (
          <div className="pointer-events-none absolute bottom-1.5 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-mono text-yellow-400 backdrop-blur">
            Drag flags to adjust slice bounds (zero-crossing locked)
          </div>
        )}
      </div>
    </div>
  );
}
