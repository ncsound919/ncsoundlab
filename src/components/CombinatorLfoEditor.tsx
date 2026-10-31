/**
 * @license SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef, useState } from 'react';

export interface LfoEditorProps {
  points: { t: number; v: number }[];
  onChange: (pts: { t: number; v: number }[]) => void;
  snap?: boolean;
}

export const CombinatorLfoEditor: React.FC<LfoEditorProps> = ({ points, onChange, snap = true }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo((w / 4) * i, 0);
      ctx.lineTo((w / 4) * i, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, (h / 4) * i);
      ctx.lineTo(w, (h / 4) * i);
      ctx.stroke();
    }
    // curve
    const sorted = [...points].sort((a, b) => a.t - b.t);
    if (sorted.length > 0) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.beginPath();
      sorted.forEach((p, i) => {
        const x = p.t * w;
        const y = (1 - (p.v + 1) / 2) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    // points
    sorted.forEach((p) => {
      const x = p.t * w;
      const y = (1 - (p.v + 1) / 2) * h;
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  React.useEffect(() => { draw(); }, [points]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const v = Math.min(1, Math.max(-1, 1 - 2 * ((e.clientY - rect.top) / rect.height)));
    // find nearest point
    let idx = -1;
    let best = 1e9;
    points.forEach((p, i) => {
      const d = Math.hypot(p.t - t, p.v - v);
      if (d < best) { best = d; idx = i; }
    });
    if (best < 0.08) {
      setDragging(idx);
    } else {
      const nt = snap ? Math.round(t * 16) / 16 : t;
      const nv = snap ? Math.round(v * 20) / 20 : v;
      onChange([...points, { t: nt, v: nv }]);
      setDragging(points.length);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragging === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    let t = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    let v = Math.min(1, Math.max(-1, 1 - 2 * ((e.clientY - rect.top) / rect.height)));
    if (snap) {
      t = Math.round(t * 16) / 16;
      v = Math.round(v * 20) / 20;
    }
    const next = [...points];
    if (next[dragging]) {
      next[dragging] = { t, v };
      onChange(next);
    }
  };

  const handlePointerUp = () => setDragging(null);

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const t = (e.clientX - rect.left) / rect.width;
    // remove nearest
    let idx = -1;
    let best = 0.08;
    points.forEach((p, i) => {
      const d = Math.hypot(p.t - t, 0);
      if (d < best) { best = d; idx = i; }
    });
    if (idx >= 0) {
      const next = points.filter((_, i) => i !== idx);
      onChange(next);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={160}
      className="w-full max-w-[320px] h-40 rounded-xl bg-[#0a0a0f] border border-[#1e293b] cursor-crosshair touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    />
  );
};
