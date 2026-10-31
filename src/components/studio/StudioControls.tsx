/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Desktop mirror of NC Studio's shared Compose controls
 * (`shared/studio-ui/src/main/kotlin/com/overlay/studio/ui/StudioControls.kt`).
 *
 * Geometry, palette and interaction rules come from
 * `shared/studio-ui/spec/studio-ui.v1.json`; the existing desktop behaviours
 * worth keeping — keyboard stepping, typed values, modifier drags — are
 * layered on top instead of being replaced.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  STUDIO,
  STUDIO_BUTTON,
  STUDIO_FADER,
  STUDIO_KNOB,
  STUDIO_METER,
  dbToFraction,
  formatStudioValue,
  meterColorForDb,
} from './tokens';

const KNOB_ARC_WIDTH = 4.5;
const KNOB_GLOW_WIDTH = 8;

export interface StudioKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  size?: number;
  color?: string;
  defaultValue?: number;
  onChange: (value: number) => void;
  className?: string;
}

/**
 * Knob: 270-degree LED ring, milled cap, fixed min/centre/max ticks and an
 * OLED readout. Drag is full-range over 240 px like the phone apps; Shift is
 * fine, Ctrl/Cmd coarse, Alt snaps to integers. Double-click resets and the
 * readout accepts a typed value.
 */
export function StudioKnob({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit,
  size = 48,
  color = STUDIO.accent,
  defaultValue,
  onChange,
  className = '',
}: StudioKnobProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const knobRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startValue = useRef(0);

  const clampedValue = Math.min(max, Math.max(min, value));
  const span = max - min || 1;
  const percentage = (clampedValue - min) / span;
  const rotation = percentage * STUDIO_KNOB.sweepDeg - STUDIO_KNOB.sweepDeg / 2;
  const resetValue = defaultValue ?? min;

  const snapToStep = useCallback(
    (val: number) => {
      const clamped = Math.min(max, Math.max(min, val));
      const stepped = min + Math.round((clamped - min) / step) * step;
      return parseFloat(Math.min(max, Math.max(min, stepped)).toFixed(6));
    },
    [min, max, step],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startY.current = e.clientY;
      startValue.current = clampedValue;
      knobRef.current?.setPointerCapture(e.pointerId);
    },
    [clampedValue],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      const deltaY = startY.current - e.clientY;
      const perPx = (max - min) / STUDIO_KNOB.fullRangeDragPx;
      // Shift = fine (0.1x), Ctrl/Cmd = coarse (4x); Alt rounds to integers.
      let sensitivity = 1;
      if (e.shiftKey) sensitivity = 0.1;
      else if (e.ctrlKey || e.metaKey) sensitivity = 4;

      let rawVal = startValue.current + deltaY * perPx * sensitivity;
      if (e.altKey) rawVal = Math.round(rawVal);
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
  }, [isDragging, max, min, onChange, snapToStep]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault();
        onChange(snapToStep(clampedValue + (e.shiftKey ? step * 0.1 : step)));
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault();
        onChange(snapToStep(clampedValue - (e.shiftKey ? step * 0.1 : step)));
      } else if (e.key === 'Home') {
        e.preventDefault();
        onChange(min);
      } else if (e.key === 'End') {
        e.preventDefault();
        onChange(max);
      }
    },
    [clampedValue, max, min, step, onChange, snapToStep],
  );

  const handleDoubleClick = useCallback(() => {
    setIsDragging(false);
    onChange(resetValue);
  }, [resetValue, onChange]);

  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const startEditing = useCallback(() => {
    setIsEditing(true);
    setInputValue(String(clampedValue));
  }, [clampedValue]);

  const commitEdit = useCallback(() => {
    setIsEditing(false);
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) onChange(snapToStep(parsed));
  }, [inputValue, onChange, snapToStep]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitEdit();
    else if (e.key === 'Escape') setIsEditing(false);
  };

  const centre = size / 2;
  const arcRadius = Math.max(6, centre - 5);
  const circumference = 2 * Math.PI * arcRadius;
  const arcLength = (circumference * STUDIO_KNOB.sweepDeg) / 360;
  const valueLength = arcLength * percentage;
  const capDiameter = (centre - 4) * STUDIO_KNOB.capRadiusRatio * 2;

  return (
    <div className={`flex flex-col items-center gap-1.5 select-none ${className}`}>
      <div
        className="text-[9px] font-mono font-bold uppercase tracking-widest text-center truncate max-w-[95px]"
        style={{ color: isDragging ? color : STUDIO.textSecondary }}
      >
        {label}
      </div>

      <div
        ref={knobRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clampedValue}
        aria-valuetext={`${formatStudioValue(clampedValue)}${unit ? ` ${unit}` : ''}`}
        aria-label={label}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        onDoubleClick={handleDoubleClick}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ width: size, height: size, touchAction: 'none' }}
        className="relative flex items-center justify-center cursor-ns-resize outline-none group"
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="absolute inset-0"
          aria-hidden="true"
          style={{ overflow: 'visible' }}
        >
          {/* Fixed min / centre / max ticks. */}
          {STUDIO_KNOB.tickAnglesDeg.map((deg) => {
            const rad = (deg * Math.PI) / 180;
            return (
              <line
                key={deg}
                x1={centre + (arcRadius + 2) * Math.cos(rad)}
                y1={centre + (arcRadius + 2) * Math.sin(rad)}
                x2={centre + (arcRadius + 6) * Math.cos(rad)}
                y2={centre + (arcRadius + 6) * Math.sin(rad)}
                stroke={STUDIO.textMuted}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            );
          })}

          {/* Unlit 270-degree track. */}
          <circle
            cx={centre}
            cy={centre}
            r={arcRadius}
            fill="none"
            stroke={STUDIO.raised}
            strokeWidth={KNOB_ARC_WIDTH}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
            transform={`rotate(${STUDIO_KNOB.startAngleDeg} ${centre} ${centre})`}
          />

          {/* Illuminated value arc plus glow. */}
          {valueLength > 0.5 && (
            <>
              <circle
                cx={centre}
                cy={centre}
                r={arcRadius}
                fill="none"
                stroke={color}
                strokeOpacity={0.32}
                strokeWidth={KNOB_GLOW_WIDTH}
                strokeLinecap="round"
                strokeDasharray={`${valueLength} ${circumference}`}
                transform={`rotate(${STUDIO_KNOB.startAngleDeg} ${centre} ${centre})`}
              />
              <circle
                cx={centre}
                cy={centre}
                r={arcRadius}
                fill="none"
                stroke={color}
                strokeWidth={KNOB_ARC_WIDTH}
                strokeLinecap="round"
                strokeDasharray={`${valueLength} ${circumference}`}
                transform={`rotate(${STUDIO_KNOB.startAngleDeg} ${centre} ${centre})`}
              />
            </>
          )}
        </svg>

        {/* Milled cap with the accent notch. */}
        <div
          className="relative flex items-center justify-center rounded-full"
          style={{
            width: capDiameter,
            height: capDiameter,
            background: `radial-gradient(circle at 50% 38%, ${STUDIO.border} 0%, ${STUDIO.card} 58%, ${STUDIO.surface} 100%)`,
            border: `1.5px solid ${STUDIO.raised}`,
            transform: `rotate(${rotation}deg)`,
            boxShadow: isDragging ? `0 0 14px ${color}88` : '0 4px 10px rgba(0,0,0,0.55)',
            transition: isDragging ? 'none' : 'box-shadow 120ms ease',
          }}
        >
          <div
            className="absolute rounded-full"
            style={{
              top: '12%',
              width: 2.5,
              height: '34%',
              background: '#FFFFFF',
              boxShadow: `0 0 6px ${color}`,
            }}
          />
        </div>

        {focused && !isDragging && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ boxShadow: `0 0 0 2px ${STUDIO.textPrimary}55` }}
          />
        )}
      </div>

      {isEditing ? (
        <input
          autoFocus
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleInputKeyDown}
          className="w-14 text-center text-[10px] font-mono font-bold bg-[#070A0F] px-1 py-0.5 rounded border outline-none"
          style={{ color, borderColor: `${color}66` }}
        />
      ) : (
        <div
          onClick={startEditing}
          className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border flex items-center gap-0.5 cursor-text"
          style={{
            color,
            background: STUDIO.inset,
            borderColor: STUDIO.raised,
          }}
          title="Click to enter value"
        >
          <span>{formatStudioValue(clampedValue)}</span>
          {unit && <span className="text-[8px] font-sans opacity-80">{unit}</span>}
        </div>
      )}
    </div>
  );
}

export interface StudioFaderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  className?: string;
  step?: number;
  unit?: string;
  color?: string;
  defaultValue?: number;
  size?: number;
}

/**
 * Console fader: absolute positioning (tap lands on the value under the
 * finger), metal cap, accent rule and OLED readout. Double-click resets.
 */
export function StudioFader({
  label,
  value,
  min,
  max,
  onChange,
  className = '',
  step = 0.01,
  unit,
  color = STUDIO.accent,
  defaultValue,
  size = STUDIO_FADER.trackHeightDp,
}: StudioFaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [focused, setFocused] = useState(false);

  const clampedValue = Math.min(max, Math.max(min, value));
  const resetValue = defaultValue ?? min;
  const range = max - min;
  const percentage = range === 0 ? 0 : (clampedValue - min) / range;
  const trackPadding = 10;
  const handleHeight = STUDIO_FADER.capHeightDp;
  const trackInnerHeight = size - 2 * trackPadding;
  const handleBottom = percentage * trackInnerHeight + trackPadding - handleHeight / 2;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setIsDragging(true);
      trackRef.current?.setPointerCapture(e.pointerId);
    },
    [],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const topY = rect.top + trackPadding;
      const bottomY = rect.bottom - trackPadding;
      const currentY = Math.max(topY, Math.min(bottomY, e.clientY));
      const frac = (bottomY - currentY) / (bottomY - topY);
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault();
        onChange(parseFloat(Math.min(max, clampedValue + (e.shiftKey ? step * 0.1 : step)).toFixed(6)));
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault();
        onChange(parseFloat(Math.max(min, clampedValue - (e.shiftKey ? step * 0.1 : step)).toFixed(6)));
      } else if (e.key === 'Home') {
        e.preventDefault();
        onChange(min);
      } else if (e.key === 'End') {
        e.preventDefault();
        onChange(max);
      }
    },
    [clampedValue, max, min, step, onChange],
  );

  const handleDoubleClick = useCallback(() => {
    onChange(resetValue);
  }, [resetValue, onChange]);

  return (
    <div className={`flex flex-col items-center gap-1 select-none ${className}`}>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clampedValue}
        aria-valuetext={`${formatStudioValue(clampedValue)}${unit ? ` ${unit}` : ''}`}
        aria-label={label}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        onDoubleClick={handleDoubleClick}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          height: size,
          width: 48,
          touchAction: 'none',
          borderRadius: 8,
          background: STUDIO.inset,
          border: `1px solid ${STUDIO.border}`,
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.8)',
          outline: 'none',
        }}
        className="relative cursor-ns-resize"
      >
        {/* Scale ticks, matching the shared 7-line ladder. */}
        <div className="absolute inset-y-0 right-1 pointer-events-none" style={{ opacity: 0.5 }}>
          {Array.from({ length: STUDIO_FADER.tickDivisions + 1 }).map((_, i) => (
            <div
              key={i}
              className="absolute right-0 h-px"
              style={{
                width: i === 0 || i === STUDIO_FADER.tickDivisions ? 7 : 4,
                top: `${(i / STUDIO_FADER.tickDivisions) * 100}%`,
                background: STUDIO.border,
              }}
            />
          ))}
        </div>

        {/* Slot. */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full"
          style={{
            top: trackPadding,
            bottom: trackPadding,
            width: 7,
            background: '#04060A',
            border: `1px solid ${STUDIO.border}`,
          }}
        />

        {/* Illuminated fill from the bottom. */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full"
          style={{
            top: trackPadding,
            bottom: trackPadding,
            width: 7,
            clipPath: `inset(${(1 - percentage) * 100}% 0 0 0)`,
            background: color,
            opacity: 0.75,
          }}
        />

        {/* Metal cap with accent rule. */}
        <div
          className="absolute left-0.5 right-0.5 rounded pointer-events-none z-10 flex items-center justify-center"
          style={{
            height: handleHeight,
            bottom: Math.max(0, handleBottom),
            background: 'linear-gradient(180deg, #4A4A5A 0%, #2A2A36 48%, #20202A 100%)',
            border: `1px solid ${isDragging ? color : STUDIO.border}`,
            boxShadow: '0 4px 10px rgba(0,0,0,0.7)',
            transition: 'border-color 80ms ease',
          }}
        >
          <div className="w-5 h-[2px] rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
        </div>

        {focused && !isDragging && (
          <div
            className="absolute inset-0 rounded-lg pointer-events-none"
            style={{ boxShadow: `0 0 0 2px ${STUDIO.textPrimary}55` }}
          />
        )}
      </div>

      <div
        className="text-[8px] font-mono font-bold uppercase tracking-wider text-center truncate max-w-[80px]"
        style={{ color: STUDIO.textMuted }}
      >
        {label}
      </div>
      <div
        className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border flex items-center gap-0.5"
        style={{ color, background: STUDIO.inset, borderColor: STUDIO.border }}
      >
        <span>{formatStudioValue(clampedValue)}</span>
        {unit && <span className="text-[8px] font-sans opacity-80">{unit}</span>}
      </div>
    </div>
  );
}

export interface StudioMeterBarProps {
  peakDb: number;
  holdDb?: number;
  accent?: string;
  height?: number;
  className?: string;
  label?: string;
}

/**
 * Peak-hold meter bar on the shared -60..0 dB scale, with the fixed -20 dB
 * reference and green / amber / red zones used by Pro Tools and both phone
 * apps.
 */
export function StudioMeterBar({
  peakDb,
  holdDb,
  accent = STUDIO.lime,
  height = 96,
  className = '',
  label = 'Level',
}: StudioMeterBarProps) {
  const db = Math.min(STUDIO_METER.maxDb, Math.max(STUDIO_METER.minDb, peakDb));
  const hold = holdDb === undefined ? db : Math.min(STUDIO_METER.maxDb, Math.max(STUDIO_METER.minDb, holdDb));
  const colour = meterColorForDb(db, accent);
  const referenceBottom = dbToFraction(STUDIO_METER.referenceDb) * 100;
  const showHold = holdDb !== undefined && hold > STUDIO_METER.minDb;

  return (
    <div
      className={`relative w-4 rounded border overflow-hidden ${className}`}
      style={{ height, background: STUDIO.inset, borderColor: STUDIO.border }}
      role="meter"
      aria-label={label}
      aria-valuemin={STUDIO_METER.minDb}
      aria-valuemax={STUDIO_METER.maxDb}
      aria-valuenow={Number(db.toFixed(1))}
    >
      <div
        className="absolute left-0 right-0 border-t"
        style={{
          bottom: `${referenceBottom}%`,
          borderColor: `${STUDIO.textMuted}77`,
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 transition-all duration-75"
        style={{ height: `${dbToFraction(db) * 100}%`, background: colour, opacity: 0.9 }}
      />
      {showHold && (
        <div
          className="absolute left-0 right-0 z-10"
          style={{
            bottom: `${dbToFraction(hold) * 100}%`,
            height: 2,
            background: STUDIO.textPrimary,
            boxShadow: `0 0 6px ${STUDIO.textPrimary}`,
            transition: 'bottom 75ms linear',
          }}
        />
      )}
    </div>
  );
}

export type StudioButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface StudioButtonProps {
  label: string;
  variant?: StudioButtonVariant;
  selected?: boolean;
  accent?: string;
  leading?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/** One button style for the desktop app, matching the shared Compose button. */
export function StudioButton({
  label,
  variant = 'secondary',
  selected = false,
  accent = STUDIO.accent,
  leading,
  className = '',
  disabled,
  title,
  type = 'button',
  onClick,
}: StudioButtonProps) {
  const background = disabled
    ? STUDIO.card
    : selected
      ? `${accent}38`
      : variant === 'primary'
        ? accent
        : variant === 'danger'
          ? `${STUDIO.danger}2E`
          : variant === 'ghost'
            ? 'transparent'
            : STUDIO.card;
  const foreground = disabled
    ? STUDIO.textMuted
    : variant === 'primary' && !selected
      ? STUDIO.onAccent
      : selected
        ? accent
        : variant === 'danger'
          ? STUDIO.danger
          : STUDIO.textPrimary;
  const border =
    disabled
      ? STUDIO.border
      : selected || variant === 'primary'
        ? accent
        : variant === 'danger'
          ? STUDIO.danger
          : STUDIO.border;

  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected || undefined}
      className={`inline-flex items-center justify-center gap-1.5 px-3 font-mono font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed ${className}`}
      style={{
        minHeight: 36,
        borderRadius: STUDIO_BUTTON.cornerRadiusDp,
        fontSize: STUDIO_BUTTON.labelSizeSp,
        background,
        color: foreground,
        border: `1px solid ${border}`,
      }}
    >
      {leading}
      {label}
      {selected && <span aria-hidden="true">✓</span>}
    </button>
  );
}
