/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MasterDynamicsPanel (Phase 3.5).
 *
 * First-class controls for the master compressor/limiter plus a sidechain
 * routing list. Wired to `useMasterDynamicsStore` so audio engine calls
 * can read the live settings via `getState()`.
 */

import React, { useEffect } from 'react';
import { Knob } from './Knob';
import {
  useMasterDynamicsStore,
  DEFAULT_MASTER_DYNAMICS,
  type SidechainRoute,
} from '../store/masterDynamicsStore';
import { audioEngine } from '../lib/audioEngine';

export const MasterDynamicsPanel: React.FC = () => {
  const settings = useMasterDynamicsStore((s) => s.settings);
  const setSettings = useMasterDynamicsStore((s) => s.setSettings);
  const sidechains = useMasterDynamicsStore((s) => s.sidechains);
  const addSidechain = useMasterDynamicsStore((s) => s.addSidechain);
  const updateSidechain = useMasterDynamicsStore((s) => s.updateSidechain);
  const removeSidechain = useMasterDynamicsStore((s) => s.removeSidechain);

  // Phase 3.5 — push settings onto the live master limiter + makeup gain
  // whenever they change (and once on mount so a reloaded project applies).
  useEffect(() => {
    try {
      audioEngine.applyMasterDynamics(settings);
    } catch {
      // Audio engine may not be booted yet — the next change will re-apply.
    }
  }, [settings]);

  // Phase 3.5 — rebuild sidechain ducks when routes change.
  useEffect(() => {
    try {
      audioEngine.syncSidechains();
    } catch {
      // Best-effort wiring.
    }
  }, [sidechains]);

  const onAdd = () => {
    addSidechain({
      source: 'master',
      target: 'reverb',
      amount: 0.5,
      attackSec: 0.005,
      releaseSec: 0.15,
      enabled: true,
    });
  };

  return (
    <div className="flex flex-col gap-3 p-3 bg-black/40 border border-white/10 rounded" data-master-dynamics>
      <div className="flex items-center justify-between">
        <div className="text-xs text-white/80 font-semibold">Master Dynamics</div>
        <button
          type="button"
          onClick={() => setSettings(DEFAULT_MASTER_DYNAMICS)}
          className="px-2 py-0.5 text-[9px] font-mono font-black uppercase tracking-wider bg-[#0f172a] border border-[#1e293b] rounded text-slate-300 hover:text-white"
        >
          Reset
        </button>
      </div>

      <div className="flex items-center gap-3">
        <Knob
          label="Threshold"
          value={settings.thresholdDb}
          min={-60}
          max={0}
          step={0.5}
          unit="dB"
          color="#ef4444"
          onChange={(v) => setSettings({ thresholdDb: v })}
        />
        <Knob
          label="Ratio"
          value={settings.ratio}
          min={1}
          max={20}
          step={0.1}
          color="#f97316"
          onChange={(v) => setSettings({ ratio: v })}
        />
        <Knob
          label="Attack"
          value={settings.attackSec * 1000}
          min={0.1}
          max={300}
          step={0.1}
          unit="ms"
          color="#a78bfa"
          onChange={(v) => setSettings({ attackSec: v / 1000 })}
        />
        <Knob
          label="Release"
          value={settings.releaseSec * 1000}
          min={10}
          max={2000}
          step={1}
          unit="ms"
          color="#22d3ee"
          onChange={(v) => setSettings({ releaseSec: v / 1000 })}
        />
        <Knob
          label="Makeup"
          value={settings.makeupDb}
          min={-12}
          max={18}
          step={0.5}
          unit="dB"
          color="#10b981"
          onChange={(v) => setSettings({ makeupDb: v })}
        />
      </div>

      <div className="flex items-center justify-between text-[10px]">
        <span className="text-[10px] text-white/60 font-mono uppercase tracking-widest">Sidechain Routes</span>
        <button
          type="button"
          onClick={onAdd}
          className="px-2 py-0.5 text-[9px] font-mono font-black uppercase tracking-wider bg-cyan-500/20 hover:bg-cyan-500/40 border border-cyan-500/40 rounded text-cyan-200"
        >
          + Add Route
        </button>
      </div>

      <div className="space-y-1" data-sidechain-list>
        {sidechains.length === 0 && (
          <div className="text-[10px] text-white/30 font-mono uppercase tracking-widest">
            No routes. Add a route to duck the reverb/delay bus from a kick, master, etc.
          </div>
        )}
        {sidechains.map((route) => (
          <SidechainRow
            key={route.id}
            route={route}
            onChange={(partial) => updateSidechain(route.id, partial)}
            onRemove={() => removeSidechain(route.id)}
          />
        ))}
      </div>
    </div>
  );
};

interface SidechainRowProps {
  route: SidechainRoute;
  onChange: (partial: Partial<SidechainRoute>) => void;
  onRemove: () => void;
}

const SidechainRow: React.FC<SidechainRowProps> = ({ route, onChange, onRemove }) => (
  <div
    className={`flex items-center gap-2 px-2 py-1 rounded border ${
      route.enabled ? 'border-cyan-500/40 bg-black/40' : 'border-white/10 bg-black/20 opacity-60'
    }`}
    data-sidechain-row={route.id}
  >
    <button
      type="button"
      onClick={() => onChange({ enabled: !route.enabled })}
      className={`w-3 h-3 rounded-full border ${
        route.enabled ? 'bg-cyan-400 border-cyan-300' : 'bg-transparent border-white/30'
      }`}
      aria-label="Toggle sidechain"
      title={route.enabled ? 'On' : 'Off'}
    />
    <label className="flex items-center gap-1 text-[9px] font-mono text-slate-400 uppercase tracking-widest">
      <span>Src</span>
      <input
        type="text"
        value={route.source}
        onChange={(e) => onChange({ source: e.target.value })}
        className="w-20 bg-[#0f172a] border border-[#1e293b] rounded text-[9px] text-white px-1 py-0.5 font-mono"
      />
    </label>
    <span className="text-cyan-400">→</span>
    <label className="flex items-center gap-1 text-[9px] font-mono text-slate-400 uppercase tracking-widest">
      <span>Tgt</span>
      <input
        type="text"
        value={route.target}
        onChange={(e) => onChange({ target: e.target.value })}
        className="w-20 bg-[#0f172a] border border-[#1e293b] rounded text-[9px] text-white px-1 py-0.5 font-mono"
      />
    </label>
    <Knob
      label="Amount"
      value={route.amount}
      min={0}
      max={1}
      step={0.05}
      size={32}
      color="#22d3ee"
      onChange={(v) => onChange({ amount: v })}
    />
    <Knob
      label="Atk"
      value={route.attackSec * 1000}
      min={0.1}
      max={300}
      step={0.1}
      unit="ms"
      size={32}
      color="#a78bfa"
      onChange={(v) => onChange({ attackSec: v / 1000 })}
    />
    <Knob
      label="Rel"
      value={route.releaseSec * 1000}
      min={10}
      max={2000}
      step={1}
      unit="ms"
      size={32}
      color="#22d3ee"
      onChange={(v) => onChange({ releaseSec: v / 1000 })}
    />
    <button
      type="button"
      onClick={onRemove}
      className="px-1.5 py-0.5 text-[9px] font-mono font-black uppercase tracking-wider bg-red-950/30 hover:bg-red-900/50 border border-red-900/40 rounded text-red-300 hover:text-red-200"
      aria-label="Remove sidechain route"
    >
      ×
    </button>
  </div>
);

export default MasterDynamicsPanel;
