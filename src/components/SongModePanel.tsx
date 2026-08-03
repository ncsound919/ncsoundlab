import React from 'react';
import { usePatternStore, type PatternId } from '../store/patternStore';

interface SongModePanelProps {
  onPlayFromSlot?: (slotIdx: number) => void;
}

export function SongModePanel({ onPlayFromSlot }: SongModePanelProps) {
  const order = usePatternStore((s) => s.songChain.order);
  const move = usePatternStore((s) => s.moveInChain);
  const dup = usePatternStore((s) => s.duplicateInChain);
  const remove = usePatternStore((s) => s.removeFromChain);
  const activeId = usePatternStore((s) => s.activePatternId);
  const setActive = usePatternStore((s) => s.setActivePattern);

  return (
    <div className="flex flex-col gap-2 p-3 bg-black/40 border border-white/10 rounded">
      <div className="text-sm text-white/80 font-semibold">Song Chain</div>
      <div className="flex flex-wrap gap-2">
        {order.map((pid, idx) => (
          <div
            key={`${pid}-${idx}`}
            data-slot={idx}
            className={`px-3 py-2 rounded border ${
              pid === activeId ? 'border-emerald-400 bg-emerald-700/40' : 'border-white/20 bg-black/40'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setActive(pid as PatternId);
                onPlayFromSlot?.(idx);
              }}
              className="text-white font-bold"
            >
              {pid}
            </button>
            <div className="flex gap-1 mt-1 text-xs">
              <button
                type="button"
                onClick={() => idx > 0 && move(idx, idx - 1)}
                className="px-1 bg-white/10 rounded"
                aria-label="Move left"
              >
                &#9664;
              </button>
              <button
                type="button"
                onClick={() => idx < order.length - 1 && move(idx, idx + 1)}
                className="px-1 bg-white/10 rounded"
                aria-label="Move right"
              >
                &#9654;
              </button>
              <button
                type="button"
                onClick={() => dup(idx)}
                className="px-1 bg-white/10 rounded"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="px-1 bg-red-700/50 rounded"
                aria-label="Remove"
              >
                &#10005;
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
