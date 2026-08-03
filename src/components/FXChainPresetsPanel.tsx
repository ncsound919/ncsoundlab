/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * FXChainPresetsPanel (Phase 3.6).
 *
 * Save / load / delete master-rack FX-chain presets. Reads the current
 * modules from the parent (passed via `modules` prop) and saves them to
 * localStorage with the typed `FXChainPreset` schema. Loading replaces
 * the parent's rack via the `onLoad` callback (typically wired to
 * `useRackStore.setModules`).
 */

import React, { useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import {
  addPreset,
  captureMasterRackPreset,
  loadAllPresets,
  removePreset,
  type FXChainPreset,
} from '../audio/fxPresets';
import type { RackModule } from '../types';

interface FXChainPresetsPanelProps {
  modules: RackModule[];
  onLoad: (preset: FXChainPreset) => void;
  onClearRack: () => void;
}

export const FXChainPresetsPanel: React.FC<FXChainPresetsPanelProps> = ({
  modules,
  onLoad,
  onClearRack,
}) => {
  const [presets, setPresets] = useState<FXChainPreset[]>(() => loadAllPresets());
  const [pendingName, setPendingName] = useState('');

  const handleSave = () => {
    const name = pendingName.trim() || `Preset ${presets.length + 1}`;
    const next = captureMasterRackPreset(name, modules);
    addPreset(next);
    setPresets(loadAllPresets());
    setPendingName('');
  };

  const handleDelete = (id: string) => {
    removePreset(id);
    setPresets(loadAllPresets());
  };

  const rackPresets = presets.filter((p) => p.target.kind === 'master-rack');

  return (
    <div className="flex flex-col gap-2 p-3 bg-black/40 border border-white/10 rounded" data-fx-presets>
      <div className="flex items-center justify-between">
        <div className="text-xs text-white/80 font-semibold">FX Chain Presets · {rackPresets.length}</div>
        <button
          type="button"
          onClick={onClearRack}
          className="px-2 py-0.5 text-[9px] font-mono font-black uppercase tracking-wider bg-red-950/30 hover:bg-red-900/50 border border-red-900/40 rounded text-red-300 hover:text-red-200"
        >
          Reset Rack
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={pendingName}
          onChange={(e) => setPendingName(e.target.value)}
          placeholder="Preset name"
          className="flex-1 bg-[#050508] border border-[#1e293b] focus:border-yellow-400 rounded px-2 py-1 text-[10px] text-white placeholder-slate-500 focus:outline-none font-mono"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={modules.length === 0}
          className="px-2 py-1 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:pointer-events-none text-black text-[10px] font-mono font-black uppercase tracking-wider rounded inline-flex items-center gap-1"
        >
          <Save size={10} /> Save
        </button>
      </div>

      <div className="space-y-1 max-h-44 overflow-y-auto custom-scrollbar pr-1" data-preset-list>
        {rackPresets.length === 0 && (
          <div className="text-[10px] text-white/30 font-mono uppercase tracking-widest">
            No saved presets yet. Add modules to the rack and save above.
          </div>
        )}
        {rackPresets.map((p) => (
          <PresetRow
            key={p.id}
            preset={p}
            onLoad={() => onLoad(p)}
            onDelete={() => handleDelete(p.id)}
          />
        ))}
      </div>
    </div>
  );
};

interface PresetRowProps {
  preset: FXChainPreset;
  onLoad: () => void;
  onDelete: () => void;
}

const PresetRow: React.FC<PresetRowProps> = ({ preset, onLoad, onDelete }) => (
  <div
    className="flex items-center gap-2 px-2 py-1 rounded border border-white/10 bg-black/40 hover:border-yellow-400 transition-colors"
    data-preset={preset.id}
  >
    <button
      type="button"
      onClick={onLoad}
      className="flex-1 text-left text-[10px] font-mono font-bold text-yellow-300 truncate"
      title={preset.description ?? ''}
    >
      {preset.name}
      <span className="text-[8px] text-white/40 ml-1">· {preset.modules?.length ?? 0} modules</span>
    </button>
    <button
      type="button"
      onClick={onDelete}
      className="px-1.5 py-0.5 text-[9px] font-mono font-black uppercase tracking-wider bg-red-950/30 hover:bg-red-900/50 border border-red-900/40 rounded text-red-300 hover:text-red-200 inline-flex items-center gap-1"
      aria-label={`Delete preset ${preset.name}`}
    >
      <Trash2 size={10} />
    </button>
  </div>
);

export default FXChainPresetsPanel;
