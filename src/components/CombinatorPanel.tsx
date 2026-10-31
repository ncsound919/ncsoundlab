/**
 * @license SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { X, Sliders } from 'lucide-react';
import { useCombinatorStore } from '../store/combinatorStore';

interface CombinatorPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CombinatorPanel: React.FC<CombinatorPanelProps> = ({ isOpen, onClose }) => {
  const slots = useCombinatorStore((s) => s.slots);
  const addSlot = useCombinatorStore((s) => s.addSlot);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl p-4 flex flex-col gap-4 text-[#E2E8F0]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-yellow-400" />
          <h2 className="text-lg font-semibold">Hex Combinator</h2>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="flex flex-col gap-2">
          {slots.map((s) => (
            <div key={s.id} className="bg-[#111] border border-[#1e293b] rounded-xl p-3">
              <div className="text-sm font-medium">{s.id}</div>
              <div className="text-xs text-gray-400">{s.moduleId} · {s.motion}</div>
            </div>
          ))}
          {slots.length === 0 && (
            <div className="text-sm text-gray-500 text-center py-8">No slots. Add one to begin.</div>
          )}
        </div>
      </div>
      <button
        onClick={() => addSlot()}
        className="self-start px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium"
      >
        + Add slot
      </button>
    </div>
  );
};
