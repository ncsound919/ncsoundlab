import React from 'react';

interface TransportBarProps {
  bpm: number;
  isPlaying: boolean;
  useTransportMode: boolean;
  timeSignature: [number, number];
  stepLength: 16 | 32;
  songModeActive: boolean;
  isRecordingAudio: boolean;
  onBpmChange: (bpm: number) => void;
  onPlayStop: () => void;
  onUseTransportModeChange: (on: boolean) => void;
  onTimeSignatureChange: (b: 3 | 4 | 6, n: 4 | 8) => void;
  onStepLengthChange: (len: 16 | 32) => void;
  onSongModeToggle: () => void;
  onRecordAudio: () => void;
}

export function TransportBar({
  bpm,
  isPlaying,
  useTransportMode,
  timeSignature,
  stepLength,
  songModeActive,
  isRecordingAudio,
  onBpmChange,
  onPlayStop,
  onUseTransportModeChange,
  onTimeSignatureChange,
  onStepLengthChange,
  onSongModeToggle,
  onRecordAudio,
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
      <label className="flex items-center gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          checked={songModeActive}
          onChange={onSongModeToggle}
        />
        Song Mode
      </label>
      <button
        type="button"
        onClick={onRecordAudio}
        className={`px-3 py-1 rounded text-white text-sm ${
          isRecordingAudio ? 'bg-red-700 animate-pulse' : 'bg-rose-600 hover:bg-rose-500'
        }`}
        aria-label={isRecordingAudio ? 'Stop recording' : 'Record audio'}
      >
        {isRecordingAudio ? 'Stop Audio' : 'Record Audio'}
      </button>
      <label className="flex items-center gap-2 text-sm text-white/80">
        Time Sig
        <select
          value={`${timeSignature[0]}/${timeSignature[1]}`}
          onChange={(e) => {
            const [b, n] = e.target.value.split('/').map(Number);
            onTimeSignatureChange(b as 3 | 4 | 6, n as 4 | 8);
          }}
          className="bg-black/60 border border-white/20 rounded px-2 py-1 text-white"
        >
          <option value="4/4">4/4</option>
          <option value="3/4">3/4</option>
          <option value="6/8">6/8</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-white/80">
        Steps
        <select
          value={stepLength}
          onChange={(e) => onStepLengthChange(Number(e.target.value) as 16 | 32)}
          className="bg-black/60 border border-white/20 rounded px-2 py-1 text-white"
        >
          <option value={16}>16</option>
          <option value={32}>32</option>
        </select>
      </label>
    </div>
  );
}
