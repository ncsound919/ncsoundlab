/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';

export interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  size?: number;
  color?: string;
  defaultValue?: number;          // reset on double-click, defaults to min if not provided
  onChange: (value: number) => void;
  className?: string;
}

export function Knob({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit,
  size = 48,
  color = '#F43F5E',
  defaultValue,
  onChange,
  className = '',
}: KnobProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const knobRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startValue = useRef(0);

  // Clamp value
  const clampedValue = Math.min(max, Math.max(min, value));
  const percentage = (clampedValue - min) / (max - min) || 0; // avoid NaN for 0 range
  const rotation = percentage * 270 - 135; // -135deg to 135deg

  const resetValue = defaultValue ?? min;

  const snapToStep = useCallback((val: number) => {
    const clamped = Math.min(max, Math.max(min, val));
    const stepped = min + Math.round((clamped - min) / step) * step;
    return parseFloat(Math.min(max, Math.max(min, stepped)).toFixed(6));
  }, [min, max, step]);

  // --- Pointer handling (unified mouse/touch) ---
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Prevent default to avoid text selection and scrolling on touch
    e.preventDefault();
    setIsDragging(true);
    startY.current = e.clientY;
    startValue.current = clampedValue;

    // Capture pointer so we get moves even outside the element
    knobRef.current?.setPointerCapture(e.pointerId);
  }, [clampedValue]);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      const deltaY = startY.current - e.clientY;
      const range = max - min;
      // Enhancement 9: Precision Keyboard & Mouse Modifiers (Shift = Ultra-fine 0.001x, Ctrl/Cmd = Coarse 0.015x)
      let sensitivity = 0.005;
      if (e.shiftKey) sensitivity = 0.0008;
      else if (e.ctrlKey || e.metaKey) sensitivity = 0.02;

      let rawVal = startValue.current + deltaY * range * sensitivity;
      if (e.altKey) {
        // Alt key snaps to nearest integer
        rawVal = Math.round(rawVal);
      }
      onChange(snapToStep(rawVal));
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
  }, [isDragging, max, min, step, onChange, snapToStep]);

  // --- Keyboard interaction ---
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      const delta = e.shiftKey ? step * 0.1 : step;
      onChange(snapToStep(clampedValue + delta));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const delta = e.shiftKey ? step * 0.1 : step;
      onChange(snapToStep(clampedValue - delta));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(max);
    }
  }, [clampedValue, max, min, step, onChange, snapToStep]);

  // Double‑click reset
  const handleDoubleClick = useCallback(() => {
    setIsDragging(false);
    onChange(resetValue);
  }, [resetValue, onChange]);

  // Numeric input editing
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const startEditing = useCallback(() => {
    setIsEditing(true);
    setInputValue(clampedValue.toString());
  }, [clampedValue]);

  const commitEdit = useCallback(() => {
    setIsEditing(false);
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      onChange(snapToStep(parsed));
    }
  }, [inputValue, onChange, snapToStep]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitEdit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };
  const formatDisplay = (val: number) => {
    if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(1)}k`;
    // Show 1 decimal for non‑integer, integers for whole numbers
    const rounded = Math.round(val * 10) / 10;
    return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
  };

  const arcRadius = size / 2 - 4;
  const circumference = 2 * Math.PI * arcRadius;
  const arcOffset = circumference * (1 - percentage);

  return (
    <div className={`flex flex-col items-center gap-2 select-none ${className}`}>
      <div className="text-[11px] text-white font-black uppercase tracking-widest text-center truncate max-w-[95px]">
        {label}
      </div>

      <div
        ref={knobRef}
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
        style={{ width: size, height: size, touchAction: 'none' }}
        className="relative flex items-center justify-center cursor-ns-resize group outline-none"
      >
        {/* SVG arc track, filled portion & detailed radial tick marks */}
        <svg className="absolute inset-0 w-full h-full -rotate-90" aria-hidden="true" style={{ overflow: 'visible' }}>
          {/* Detailed ticks around the outer perimeter */}
          {[...Array(9)].map((_, i) => {
            const angle = -135 + i * (270 / 8); // -135 to 135 degrees
            const rad = ((angle + 90) * Math.PI) / 180; // offset by 90 to match our rotation mapping
            const r1 = size / 2 + 1; // start slightly outside the arc
            const r2 = size / 2 + 4.5; // end further out
            const x1 = size / 2 + r1 * Math.cos(rad);
            const y1 = size / 2 + r1 * Math.sin(rad);
            const x2 = size / 2 + r2 * Math.cos(rad);
            const y2 = size / 2 + r2 * Math.sin(rad);
            const tickPercent = i / 8;
            const isLit = percentage >= tickPercent - 0.01;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isLit ? color : '#27272a'}
                strokeWidth={isLit ? '2' : '1.2'}
                strokeLinecap="round"
                style={{
                  transition: 'stroke 0.1s ease',
                  filter: isLit ? `drop-shadow(0 0 1.5px ${color})` : 'none',
                }}
              />
            );
          })}

          <circle
            cx={size / 2}
            cy={size / 2}
            r={arcRadius}
            fill="none"
            stroke="#18181b"
            strokeWidth="3.5"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={arcRadius}
            fill="none"
            stroke={color}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={arcOffset}
          />
        </svg>

        {/* Knob face */}
        <div
          className="relative rounded-full bg-gradient-to-br from-[#3f3f46] via-[#18181b] to-[#09090b] shadow-2xl flex items-center justify-center border border-[#52525b]"
          style={{
            width: size - 14,
            height: size - 14,
            transform: `rotate(${rotation}deg)`,
          }}
        >
          <div
            className="absolute top-1.5 w-1.5 h-2.5 rounded-full shadow-md"
            style={{ backgroundColor: color }}
          />
        </div>

        {/* Active / focus rings */}
        {isDragging && (
          <div
            className="absolute inset-0 rounded-full animate-pulse"
            style={{ boxShadow: `0 0 14px ${color}88` }}
          />
        )}
        {focused && !isDragging && (
          <div className="absolute inset-0 rounded-full ring-2 ring-white/30 ring-offset-1 ring-offset-transparent" />
        )}
      </div>

      {isEditing ? (
        <input
          autoFocus
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleInputKeyDown}
          className="w-14 text-center text-[10.5px] font-mono font-bold text-white bg-[#121214] px-1 py-0.5 rounded-md border border-orange-500/50 outline-none"
        />
      ) : (
        <div 
          onClick={startEditing}
          className="text-[10.5px] font-mono font-black text-white bg-[#000000] px-2 py-0.5 rounded-md border border-[#27272a] flex items-center gap-0.5 cursor-text hover:border-blue-500 transition-colors shadow-inner"
          title="Click to enter value"
        >
          <span>{formatDisplay(clampedValue)}</span>
          {unit && <span className="text-[8.5px] text-yellow-400 font-sans">{unit}</span>}
        </div>
      )}
    </div>
  );
}
