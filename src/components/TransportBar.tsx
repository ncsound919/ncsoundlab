import React from 'react';

interface TransportBarProps {
  bpm: number;
  isPlaying: boolean;
  useTransportMode: boolean;
  onBpmChange: (bpm: number) => void;
  onPlayStop: () => void;
  onUseTransportModeChange: (on: boolean) => void;
}

export function TransportBar({
  bpm,
  isPlaying,
  useTransportMode,
  onBpmChange,
  onPlayStop,
  onUseTransportModeChange,
}: TransportBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-black/40 border border-white/10 rounded">
      <button
        type="button"
        onClick={onPlayStop}
        className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
        aria-label={isPlaying ? 'Stop' : 'Play'}
      >
        {isPlaying ? 'Stop' : 'Play'}
      </button>
      <label className="flex items-center gap-2 text-sm text-white/80">
        BPM
        <input
          type="number"
          min={30}
          max={300}
          value={bpm}
          onChange={(e) => onBpmChange(Number(e.target.value))}
          className="w-20 bg-black/60 border border-white/20 rounded px-2 py-1 text-white"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          checked={useTransportMode}
          onChange={(e) => onUseTransportModeChange(e.target.checked)}
        />
        Tone Transport
      </label>
    </div>
  );
}
