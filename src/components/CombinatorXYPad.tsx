/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Hex Combinator — XY pad for screen-mode sound shifting.
 */
import React, { useRef, useEffect, useState } from 'react';

export interface XYPadProps {
  x: number; // 0..1
  y: number; // 0..1
  onChange: (x: number, y: number) => void;
  onRecordToggle?: () => void;
  recording?: boolean;
  labelX?: string;
  labelY?: string;
}

export const CombinatorXYPad: React.FC<XYPadProps> = ({ x, y, onChange, onRecordToggle, recording, labelX = 'X', labelY = 'Y' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const smoothRef = useRef({ x, y });

  useEffect(() => {
    smoothRef.current.x += (x - smoothRef.current.x) * 0.3;
    smoothRef.current.y += (y - smoothRef.current.y) * 0.3;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((w / 4) * i, 0);
      ctx.lineTo((w / 4) * i, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, (h / 4) * i);
      ctx.lineTo(w, (h / 4) * i);
      ctx.stroke();
    }
    // trail dot
    const px = smoothRef.current.x * w;
    const py = (1 - smoothRef.current.y) * h;
    ctx.fillStyle = recording ? '#f87171' : '#facc15';
    ctx.beginPath();
    ctx.arc(px, py, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(250,204,21,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 22, 0, Math.PI * 2);
    ctx.stroke();
    // labels
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '11px sans-serif';
    ctx.fillText(labelX, w - 40, h - 8);
    ctx.fillText(labelY, 8, 14);
  }, [x, y, recording, labelX, labelY]);

  const handlePointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height));
    onChange(nx, ny);
  };

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={320}
        height={320}
        className="w-full max-w-[320px] aspect-square rounded-2xl bg-[#0a0a0f] border border-[#1e293b] touch-none cursor-crosshair"
        onPointerDown={(e) => { setDragging(true); (e.target as any).setPointerCapture?.(e.pointerId); handlePointer(e); }}
        onPointerMove={(e) => { if (dragging) handlePointer(e); }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      />
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{labelX}: {x.toFixed(2)} · {labelY}: {y.toFixed(2)}</span>
        {onRecordToggle && (
          <button
            onClick={onRecordToggle}
            className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
              recording ? 'bg-red-600 text-white border-red-500' : 'bg-[#1A1A1E] text-gray-300 border-[#2A2A2E]'
            }`}
          >
            {recording ? 'Recording' : 'Record'}
          </button>
        )}
      </div>
    </div>
  );
};
