/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Knob } from '../../components/Knob';

export interface TremoloSettings {
  rate: number;
  depth: number;
  shape?: 'sine' | 'square' | 'triangle';
}

export const DEFAULT_TREMOLO_SETTINGS: TremoloSettings = {
  rate: 4,
  depth: 60,
  shape: 'sine',
};

interface AdvancedTremoloEditorProps {
  moduleId: string;
  settings: TremoloSettings;
  onChange: (next: TremoloSettings) => void;
}

export const AdvancedTremoloEditor: React.FC<AdvancedTremoloEditorProps> = ({
  settings,
  onChange,
}) => {
  return (
    <div className="flex flex-col space-y-4 bg-black rounded-xl border-2 border-[#1e293b] p-4 mt-3 shadow-2xl">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-bold text-yellow-400 uppercase tracking-widest font-urban">
          TREMOLO LFO ENGINE
        </span>
        <div className="flex items-center space-x-1">
          {(['sine', 'square', 'triangle'] as const).map((shape) => (
            <button
              key={shape}
              onClick={() => onChange({ ...settings, shape })}
              className={`px-2 py-0.5 rounded text-[9px] font-mono border transition-colors ${
                (settings.shape || 'sine') === shape
                  ? 'bg-yellow-400 text-black font-extrabold border-yellow-300 shadow-[0_0_8px_rgba(250,204,21,0.4)]'
                  : 'bg-[#0f172a] text-slate-300 border-[#1e293b] hover:text-white'
              }`}
            >
              {shape.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Knob
          label="Rate"
          value={settings.rate ?? 4}
          min={0.1}
          max={20}
          step={0.1}
          unit="Hz"
          onChange={(rate) => onChange({ ...settings, rate })}
        />
        <Knob
          label="Depth"
          value={settings.depth ?? 60}
          min={0}
          max={100}
          step={1}
          unit="%"
          onChange={(depth) => onChange({ ...settings, depth })}
        />
      </div>
    </div>
  );
};
