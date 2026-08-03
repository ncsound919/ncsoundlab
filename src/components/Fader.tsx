/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';

interface FaderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  className?: string;
  step?: number;            // default 0.01
  unit?: string;
  color?: string;           // accent color for handle and fill
  defaultValue?: number;    // reset on double-click, defaults to min if not set
  size?: number;            // height of track in px (default 128)
}

export function Fader({
  label,
  value,
  min,
  max,
  onChange,
  className,
  step = 0.01,
  unit,
  color = '#3B82F6', // tailwind blue-500
  defaultValue,
  size = 128, // track height
}: FaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const startY = useRef(0);
  const startValue = useRef(0);

  const clampedValue = Math.min(max, Math.max(min, value));
  const resetValue = defaultValue ?? min;
  const range = max - min;
  // percentage of track from bottom (0% = min, 100% = max)
  const percentage = range === 0 ? 0 : (clampedValue - min) / range;
  // handle position from bottom (track padding top/bottom: 16px each)
  const trackPadding = 16;
  const handleHeight = 16; // matches the visual handle height
  const trackInnerHeight = size - 2 * trackPadding;
  const handleBottom = percentage * trackInnerHeight + trackPadding - handleHeight / 2;

  // --- Pointer handling ---
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startY.current = e.clientY;
    startValue.current = clampedValue;
    trackRef.current?.setPointerCapture(e.pointerId);
  }, [clampedValue]);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      // Calculate normalized position (0 = top, 1 = bottom)
      const topY = rect.top + trackPadding;
      const bottomY = rect.bottom - trackPadding;
      const currentY = Math.max(topY, Math.min(bottomY, e.clientY));
      const frac = (bottomY - currentY) / (bottomY - topY); // 0 at bottom (min) -> 1 at top (max)
      const rawVal = min + frac * range;
      const stepped = Math.round(rawVal / step) * step;
      onChange(parseFloat(stepped.toFixed(6)));
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, min, max, step, onChange, range]);

  // --- Keyboard interaction ---
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      const delta = e.shiftKey ? step * 0.1 : step;
      onChange(parseFloat(Math.min(max, clampedValue + delta).toFixed(6)));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const delta = e.shiftKey ? step * 0.1 : step;
      onChange(parseFloat(Math.max(min, clampedValue - delta).toFixed(6)));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(max);
    }
  }, [clampedValue, max, min, step, onChange]);

  // Double‑click reset
  const handleDoubleClick = useCallback(() => {
    onChange(resetValue);
  }, [resetValue, onChange]);

  // Formatting (matching Knob style)
  const formatDisplay = (val: number) => {
    if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(1)}k`;
    const rounded = Math.round(val * 10) / 10;
    return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
  };

  return (
    <div className={`flex flex-col items-center gap-1.5 select-none ${className}`}>
      {/* Label */}
      <div className="text-[9px] text-white font-extrabold uppercase tracking-wider text-center truncate max-w-[80px]">
        {label}
      </div>

      {/* Track & handle */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clampedValue}
        aria-label={label}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        onDoubleClick={handleDoubleClick}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ height: size, touchAction: 'none' }}
        className="relative w-9 bg-black rounded-lg border-2 border-[#1e293b] outline-none cursor-ns-resize group shadow-lg"
      >
        {/* Scale marks (visual only) */}
        <div className="absolute inset-x-0 top-3 bottom-3 flex flex-col justify-between px-1 pointer-events-none opacity-40">
          {[...Array(8)].map((_, i) => (
            <div key={i} className={`h-px w-full ${i === 0 || i === 7 ? 'bg-yellow-400 font-bold' : 'bg-slate-500'}`} />
          ))}
        </div>

        {/* Track line - High Contrast Meter Channel */}
        <div className="absolute left-1/2 -translate-x-1/2 top-3 bottom-3 w-1.5 bg-[#0f172a] rounded-full border border-blue-900" />

        {/* Illuminated active fill LED track */}
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-3 w-1.5 rounded-full shadow-[0_0_8px_rgba(250,204,21,0.6)]"
          style={{
            height: `${percentage * 100}%`,
            maxHeight: `calc(100% - ${2 * trackPadding}px)`,
            background: color || '#2563eb',
            opacity: 0.9,
          }}
        />

        {/* Brighter, High-Contrast Metallic Fader Cap */}
        <div
          className="absolute left-0.5 right-0.5 w-8 h-5 bg-gradient-to-b from-slate-200 via-slate-100 to-slate-400 border-2 border-white rounded-md shadow-[0_4px_12px_rgba(0,0,0,0.9)] flex flex-col items-center justify-center transition-all duration-75 pointer-events-none z-10"
          style={{
            bottom: `${handleBottom}px`,
            borderColor: isDragging ? '#facc15' : focused ? '#3b82f6' : '#ffffff',
          }}
        >
          {/* Illuminated Fader Notch Line */}
          <div className="w-5 h-1 bg-yellow-400 rounded-full shadow-[0_0_6px_#facc15]" />
        </div>

        {/* Focus ring */}
        {focused && !isDragging && (
          <div className="absolute inset-0 rounded-lg ring-2 ring-yellow-400/80 ring-offset-1 ring-offset-black pointer-events-none" />
        )}
      </div>

      {/* Value display */}
      <div className="text-[9px] font-mono font-black text-white bg-[#000000] px-1.5 py-0.5 rounded border border-[#2A2A2E] flex items-center gap-0.5">
        <span>{formatDisplay(clampedValue)}</span>
        {unit && <span className="text-[8px] text-yellow-400 font-sans">{unit}</span>}
      </div>
    </div>
  );
}
