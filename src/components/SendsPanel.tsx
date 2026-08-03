/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SendsPanel (Phase 3.3).
 *
 * Renders the global FX bus returns (reverb, delay, ...) with per-bus
 * enable/gain/pan knobs. Per-layer send levels are set on each layer via
 * `layer.sends` and surfaced in `ChannelStrip`. This panel only manages the
 * return-side gains.
 */

import React from 'react';
import { Knob } from './Knob';
import { useMixerStore } from '../store/mixerStore';
import type { SerializedBusConfig } from '../lib/projectFormat';

interface SendsPanelProps {
  buses?: string[];
}

export const SendsPanel: React.FC<SendsPanelProps> = ({
  buses = ['reverb', 'delay'],
}) => {
  const busesConfig = useMixerStore((s) => s.buses);
  const setBus = useMixerStore((s) => s.setBus);

  return (
    <div className="flex flex-col gap-2 p-3 bg-black/40 border border-white/10 rounded" data-sends-panel>
      <div className="text-xs text-white/80 font-semibold">FX Bus Returns</div>
      <div className="grid grid-cols-2 gap-3">
        {buses.map((busId) => {
          const cfg: SerializedBusConfig = busesConfig[busId] ?? { enabled: true, gain: 1, pan: 0 };
          return (
            <div
              key={busId}
              className={`flex flex-col items-center gap-1 p-2 rounded border ${
                cfg.enabled ? 'border-emerald-500/30 bg-black/40' : 'border-white/10 bg-black/20 opacity-50'
              }`}
              data-bus={busId}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[10px] font-mono font-black uppercase tracking-widest text-emerald-300">
                  {busId}
                </span>
                <button
                  type="button"
                  onClick={() => setBus(busId, { enabled: !cfg.enabled })}
                  className={`px-1.5 py-0.5 text-[9px] font-mono font-black uppercase rounded border ${
                    cfg.enabled
                      ? 'border-emerald-500/60 text-emerald-300'
                      : 'border-white/15 text-white/40'
                  }`}
                  aria-label={cfg.enabled ? `Disable ${busId} bus` : `Enable ${busId} bus`}
                >
                  {cfg.enabled ? 'On' : 'Off'}
                </button>
              </div>
              <div className="flex items-end gap-3">
                <Knob
                  label="Gain"
                  value={cfg.gain}
                  min={0}
                  max={2}
                  step={0.05}
                  size={42}
                  color="#10b981"
                  onChange={(v) => setBus(busId, { gain: v })}
                />
                <Knob
                  label="Pan"
                  value={cfg.pan}
                  min={-1}
                  max={1}
                  step={0.05}
                  size={42}
                  color="#a78bfa"
                  onChange={(v) => setBus(busId, { pan: v })}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SendsPanel;
