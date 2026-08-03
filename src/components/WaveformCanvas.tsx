/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { audioEngine } from '../lib/audioEngine';

interface WaveformCanvasProps {
  buffer: AudioBuffer | null;
  className?: string;
  isPlaying?: boolean;
  selectionStart?: number;
  selectionEnd?: number;
  onSelectionChange?: (start: number, end: number) => void;
}

const CANVAS_HEIGHT = 200;
const GRID_SPACING = 40;

export function WaveformCanvas({ 
  buffer, 
  className, 
  isPlaying,
  selectionStart = 0,
  selectionEnd = 1,
  onSelectionChange
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartPctRef = useRef<number>(0);

  // ─── Core draw routine — single min-max pass, DPR-aware with real-time dynamics ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = containerRef.current;
    if (!container) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = container.clientWidth;
    const cssHeight = CANVAS_HEIGHT;

    if (canvas.width !== Math.floor(cssWidth * dpr) || canvas.height !== Math.floor(cssHeight * dpr)) {
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Dark background
    ctx.fillStyle = '#050507';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // Draw Grid
    ctx.strokeStyle = '#161619';
    ctx.lineWidth = 1;
    for (let x = 0; x < cssWidth; x += GRID_SPACING) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cssHeight);
      ctx.stroke();
    }
    for (let y = 0; y < cssHeight; y += GRID_SPACING) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cssWidth, y);
      ctx.stroke();
    }

    const amp = cssHeight / 2;

    // Read real-time frequency data if playing
    let activeFreqData: Uint8Array | null = null;
    let avgEnergy = 0;
    const playingNow = isPlaying || audioEngine.getIsPlaying();

    if (playingNow) {
      try {
        const analyser = audioEngine.getAnalyser();
        if (analyser) {
          activeFreqData = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(activeFreqData);
          let sum = 0;
          for (let i = 0; i < activeFreqData.length; i++) {
            sum += activeFreqData[i];
          }
          avgEnergy = sum / activeFreqData.length / 255;
        }
      } catch (e) {
        // ignore
      }
    }

    // No buffer → flat line or dynamic idle pulse
    if (!buffer) {
      ctx.strokeStyle = playingNow ? '#f97316' : '#27272a';
      ctx.lineWidth = playingNow ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(0, amp);
      ctx.lineTo(cssWidth, amp);
      ctx.stroke();

      if (playingNow && activeFreqData) {
        // Draw real-time spectrum bars across bottom
        const barWidth = cssWidth / activeFreqData.length;
        ctx.fillStyle = 'rgba(249, 115, 22, 0.4)';
        for (let i = 0; i < activeFreqData.length; i++) {
          const barH = (activeFreqData[i] / 255) * (cssHeight * 0.4);
          ctx.fillRect(i * barWidth, cssHeight - barH, barWidth - 1, barH);
        }
      }
      ctx.restore();
      return;
    }

    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.ceil(data.length / cssWidth));
    const cols = Math.min(cssWidth, Math.ceil(data.length / step));

    const peaks: Float32Array = new Float32Array(cols * 2);

    for (let i = 0; i < cols; i++) {
      let min = 1.0;
      let max = -1.0;
      const offset = i * step;
      const end = Math.min(offset + step, data.length);
      for (let j = offset; j < end; j++) {
        const datum = data[j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      peaks[i * 2] = min;
      peaks[i * 2 + 1] = max;
    }

    // Glow pass (reacts to real-time energy when playing)
    const glowScale = playingNow ? 1 + avgEnergy * 0.8 : 1;
    ctx.fillStyle = playingNow ? 'rgba(249, 115, 22, 0.35)' : 'rgba(59, 130, 246, 0.18)';
    const glowPadding = 2 * glowScale;
    for (let i = 0; i < cols; i++) {
      const min = peaks[i * 2] * glowScale;
      const max = peaks[i * 2 + 1] * glowScale;
      const yMin = Math.max(0, (1 + min) * amp - glowPadding);
      const yMax = Math.min(cssHeight, (1 + max) * amp + glowPadding);
      ctx.fillRect(i, yMin, 1, Math.max(1, yMax - yMin));
    }

    // Main trace
    ctx.fillStyle = playingNow ? '#fb923c' : '#60a5fa';
    for (let i = 0; i < cols; i++) {
      const min = peaks[i * 2];
      const max = peaks[i * 2 + 1];
      const yMin = (1 + min) * amp;
      const yMax = (1 + max) * amp;
      ctx.fillRect(i, yMin, 1, Math.max(1, yMax - yMin));
    }

    // Draw active selection region overlay
    if (selectionStart < selectionEnd) {
      const selXStart = selectionStart * cssWidth;
      const selXEnd = selectionEnd * cssWidth;

      // Semi-transparent overlay
      ctx.fillStyle = 'rgba(249, 115, 22, 0.15)';
      ctx.fillRect(selXStart, 0, selXEnd - selXStart, cssHeight);

      // Boundaries lines
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(selXStart, 0);
      ctx.lineTo(selXStart, cssHeight);
      ctx.moveTo(selXEnd, 0);
      ctx.lineTo(selXEnd, cssHeight);
      ctx.stroke();

      // Boundary label tags
      ctx.fillStyle = 'rgba(249, 115, 22, 0.8)';
      ctx.font = '9px monospace';
      ctx.fillText(`${Math.round(selectionStart * 100)}%`, selXStart + 4, 12);
      ctx.fillText(`${Math.round(selectionEnd * 100)}%`, selXEnd - 30, 12);
    }

    // Real-time FFT spectrum background overlay when audio plays
    if (playingNow && activeFreqData) {
      const numBins = activeFreqData.length;
      const barW = cssWidth / numBins;
      ctx.fillStyle = 'rgba(249, 115, 22, 0.15)';
      for (let b = 0; b < numBins; b++) {
        const val = activeFreqData[b] / 255;
        const bHeight = val * cssHeight * 0.7;
        ctx.fillRect(b * barW, cssHeight - bHeight, barW - 1, bHeight);
      }
    }

    // Real-time Sweep Playhead Cursor
    if (playingNow) {
      const progress = audioEngine.getPlaybackProgress();
      const playheadX = progress * cssWidth;

      // Glow beam
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(Math.max(0, playheadX - 6), 0, 12, cssHeight);

      // Core white playhead line
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(playheadX - 1, 0, 2, cssHeight);

      // Playhead top cap indicator
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(playheadX, 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }, [buffer, isPlaying, selectionStart, selectionEnd]);

  // Handle Drag-to-Select interaction (unified pointer events: mouse + touch)
  const getPctFromEvent = (e: { clientX: number }): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.max(0, Math.min(1, x / rect.width));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!buffer || !onSelectionChange) return;
    isDraggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pct = getPctFromEvent(e);
    dragStartPctRef.current = pct;
    onSelectionChange(pct, pct);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || !onSelectionChange) return;
    const pct = getPctFromEvent(e);
    const start = Math.min(dragStartPctRef.current, pct);
    const end = Math.max(dragStartPctRef.current, pct);
    onSelectionChange(start, end);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    isDraggingRef.current = false;
  };

  // Real-time animation loop
  useEffect(() => {
    let animId: number;

    const renderLoop = () => {
      draw();
      animId = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      draw();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [draw]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: 'none' }}
        className={`block w-full bg-black/40 rounded-lg border border-white/10 cursor-col-resize ${className ?? ''}`}
      />
    </div>
  );
}