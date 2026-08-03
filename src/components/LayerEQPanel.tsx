/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LayerEQPanel (Phase 3.4).
 *
 * A compact editor for a layer's per-layer parametric EQ. Renders one row
 * per band with type / frequency / gain / Q / enabled controls. Writes
 * changes directly back to the layer via the `onChange` callback so the
 * audio engine can rebuild the biquad chain on the next note.
 */

import React from 'react';
import { EQBand, EQ_BAND_TYPES, DEFAULT_EQ_BANDS, eqBandResponseDb } from '../audio/eqBands';

interface LayerEQPanelProps {
  bands: EQBand[] | undefined;
  onChange: (bands: EQBand[]) => void;
}

export const LayerEQPanel: React.FC<LayerEQPanelProps> = ({ bands, onChange }) => {
  const list = bands && bands.length > 0 ? bands : [...DEFAULT_EQ_BANDS];

  const updateBand = (index: number, partial: Partial<EQBand>) => {
    const next = list.map((b, i) => (i === index ? { ...b, ...partial } : b));
    onChange(next);
  };

  const toggleBand = (index: number) => {
    updateBand(index, { enabled: list[index].enabled === false });
  };

  // Build a rough response curve (10..20000Hz, 48 points) for the SVG overlay.
  const points: string[] = [];
  const minF = Math.log10(10);
  const maxF = Math.log10(20000);
  const w = 360;
  const h = 60;
  for (let i = 0; i < 48; i++) {
    const f = Math.pow(10, minF + ((maxF - minF) * i) / 47);
    let db = 0;
    for (const b of list) {
      db += eqBandResponseDb(b, f);
    }
    const clamped = Math.max(-18, Math.min(18, db));
    const x = (i / 47) * w;
    const y = h / 2 - (clamped / 18) * (h / 2);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  return (
    <div className="flex flex-col gap-2 p-3 bg-black/40 border border-white/10 rounded" data-layer-eq>
      <div className="flex items-center justify-between">
        <div className="text-xs text-white/80 font-semibold">Parametric EQ · {list.filter((b) => b.enabled !== false).length} bands on</div>
        <button
          type="button"
          onClick={() => onChange(list.map((b) => ({ ...b, enabled: false })))}
          className="px-2 py-0.5 text-[9px] font-mono font-black uppercase tracking-wider bg-[#0f172a] border border-[#1e293b] rounded text-slate-300 hover:text-white"
        >
          Bypass All
        </button>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16 bg-[#050608] rounded border border-[#1e293b]" preserveAspectRatio="none">
        {/* zero line */}
        <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="#1e293b" strokeWidth="0.5" />
        <polyline fill="none" stroke="#22d3ee" strokeWidth="1.5" points={points.join(' ')} />
      </svg>

      <div className="space-y-1 max-h-44 overflow-y-auto custom-scrollbar pr-1">
        {list.map((band, i) => (
          <div
            key={i}
            className={`flex items-center gap-1 px-2 py-1 rounded border ${
              band.enabled !== false ? 'border-emerald-500/40 bg-black/40' : 'border-white/10 bg-black/20 opacity-60'
            }`}
            data-eq-band={i}
          >
            <button
              type="button"
              onClick={() => toggleBand(i)}
              className={`w-3 h-3 rounded-full border ${
                band.enabled !== false ? 'bg-emerald-400 border-emerald-300' : 'bg-transparent border-white/30'
              }`}
              aria-label={`Toggle band ${i + 1}`}
              title={band.enabled !== false ? 'On' : 'Off'}
            />
            <select
              aria-label="Band type"
              value={band.type}
              onChange={(e) => updateBand(i, { type: e.target.value as EQBand['type'] })}
              className="bg-[#0f172a] border border-[#1e293b] rounded text-[9px] font-mono font-bold uppercase tracking-widest text-slate-200 px-1 py-0.5"
            >
              {EQ_BAND_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <NumberCell
              label="Hz"
              value={band.frequency}
              min={10}
              max={20000}
              onChange={(v) => updateBand(i, { frequency: v })}
            />
            <NumberCell
              label="dB"
              value={band.gainDb}
              min={-18}
              max={18}
              onChange={(v) => updateBand(i, { gainDb: v })}
            />
            <NumberCell
              label="Q"
              value={band.q}
              min={0.1}
              max={10}
              onChange={(v) => updateBand(i, { q: v })}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

interface NumberCellProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

const NumberCell: React.FC<NumberCellProps> = ({ label, value, min, max, onChange }) => (
  <label className="flex items-center gap-1 text-[8px] font-mono text-slate-400 uppercase tracking-widest">
    <span>{label}</span>
    <input
      type="number"
      value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
      min={min}
      max={max}
      step={label === 'Hz' ? 10 : 0.1}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="w-12 bg-[#0f172a] border border-[#1e293b] rounded text-[9px] text-white px-1 py-0.5 font-mono"
    />
  </label>
);

export default LayerEQPanel;
