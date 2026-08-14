import React, { useEffect, useRef, useState } from "react";
import { useCompareEngineStore } from "../store/compareEngineStore";
import { compareEngine } from "../audio/CompareEngine";
import { 
  Play, 
  Pause, 
  Square, 
  Trash2, 
  Music, 
  UploadCloud, 
  Camera, 
  RefreshCw, 
  HelpCircle,
  FolderSync
} from "lucide-react";
import { Knob } from "./Knob";

export const CompareEnginePanel = ({ isVisible = true }: { isVisible?: boolean }) => {
  const {
    referenceTracks,
    activeTrackId,
    isPlayingRef,
    isPlayingMix,
    activeSource,
    refGainDb,
    loopSync,
    loopEnabled,
    loopStart,
    loopEnd,
    levelMatchEnabled,
    snapshots,
    mixTrackName,
    mixTrackDuration,
    loadReferenceTrack,
    loadMixTrack,
    selectReferenceTrack,
    removeReferenceTrack,
    setSource,
    togglePlayRef,
    togglePlayMix,
    stopRef,
    stopMix,
    setRefGain,
    setLoop,
    setLoopSync,
    triggerLevelMatch,
    saveSnapshot,
    loadSnapshot,
    deleteSnapshot,
  } = useCompareEngineStore();

  const [snapshotName, setSnapshotName] = useState("");
  const [showShortcutsInfo, setShowShortcutsInfo] = useState(false);

  const meterAnimationFrame = useRef<number | null>(null);
  
  const [meters, setMeters] = useState({
    refPeak: -100,
    refRms: -100,
    refLufs: -100,
    refCorr: 0,
    refWidth: 0,
    mixPeak: -100,
    mixRms: -100,
    mixLufs: -100,
    mixCorr: 0,
    mixWidth: 0,
  });

  const refWaveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mixWaveformCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeTrack = referenceTracks.find((t) => t.id === activeTrackId);

  // Derived metrics
  const hasLufs = meters.mixLufs > -80 && meters.refLufs > -80;
  const loudnessDelta = hasLufs ? meters.mixLufs - meters.refLufs : null;
  const mixCrestFactor = meters.mixPeak > -80 && meters.mixRms > -80
    ? meters.mixPeak - meters.mixRms
    : null;
  const stereoCorrelation = Number.isFinite(meters.mixCorr) ? meters.mixCorr : null;

  // Hi-DPI helper
  const setupHiDPICanvas = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.max(1, Math.floor(rect.width));
    const displayHeight = Math.max(1, Math.floor(rect.height));
    const nextWidth = Math.floor(displayWidth * dpr);
    const nextHeight = Math.floor(displayHeight * dpr);

    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }

    return { w: displayWidth, h: displayHeight };
  };

  useEffect(() => {
    if (!isVisible) return;
    let lastState = 0;
    const updateMeters = (t: number) => {
      // ~20fps is plenty for meter updates; avoids 60fps re-renders of the panel
      if (t - lastState >= 50) {
        lastState = t;
        setMeters(compareEngine.getMeterData());
      }
      meterAnimationFrame.current = requestAnimationFrame(updateMeters);
    };
    meterAnimationFrame.current = requestAnimationFrame(updateMeters);

    return () => {
      if (meterAnimationFrame.current) {
        cancelAnimationFrame(meterAnimationFrame.current);
      }
    };
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "a") {
        setSource("A");
      } else if (key === "b") {
        setSource("B");
      } else if (key === "m") {
        triggerLevelMatch();
      } else if (key === "l") {
        setLoop(loopStart, loopEnd, !loopEnabled);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isVisible, loopStart, loopEnd, loopEnabled, setLoop, triggerLevelMatch, setSource]);

  useEffect(() => {
    if (!isVisible) return;
    let animId: number;
    const renderWaveforms = () => {
      if (refWaveformCanvasRef.current && activeTrack) {
        const canvas = refWaveformCanvasRef.current;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const { w, h } = setupHiDPICanvas(canvas, ctx);
          ctx.clearRect(0, 0, w, h);

          ctx.strokeStyle = "rgba(42, 42, 46, 0.4)";
          ctx.lineWidth = 1;
          for (let i = 1; i < 10; i++) {
            const gx = (w / 10) * i;
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, h);
            ctx.stroke();
          }

          const peaks = activeTrack.peakMap;
          const barWidth = w / peaks.length;
          ctx.fillStyle = "rgba(14, 165, 233, 0.6)";

          for (let i = 0; i < peaks.length; i++) {
            const peakH = peaks[i] * h * 0.85;
            const y = (h - peakH) / 2;
            ctx.fillRect(i * barWidth, y, barWidth - 1, peakH);
          }

          if (loopEnabled) {
            const lStartPct = loopStart / activeTrack.duration;
            const lEndPct = loopEnd / activeTrack.duration;
            ctx.fillStyle = "rgba(14, 165, 233, 0.12)";
            ctx.strokeStyle = "rgba(14, 165, 233, 0.6)";
            ctx.lineWidth = 1.5;
            ctx.fillRect(lStartPct * w, 0, (lEndPct - lStartPct) * w, h);
            ctx.strokeRect(lStartPct * w, 0, (lEndPct - lStartPct) * w, h);
          }

          const currentPos = compareEngine.getRefPlaybackPosition();
          const playPct = currentPos / activeTrack.duration;
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(playPct * w - 1, 0, 2, h);

          ctx.shadowColor = "rgba(255, 255, 255, 0.5)";
          ctx.shadowBlur = 4;
          ctx.fillRect(playPct * w - 1, 0, 2, h);
          ctx.shadowBlur = 0;
        }
      }

      if (mixWaveformCanvasRef.current && compareEngine.getMixTrackBuffer()) {
        const canvas = mixWaveformCanvasRef.current;
        const ctx = canvas.getContext("2d");
        const buffer = compareEngine.getMixTrackBuffer();
        if (ctx && buffer) {
          const { w, h } = setupHiDPICanvas(canvas, ctx);
          ctx.clearRect(0, 0, w, h);

          ctx.strokeStyle = "rgba(42, 42, 46, 0.4)";
          ctx.lineWidth = 1;
          for (let i = 1; i < 10; i++) {
            const gx = (w / 10) * i;
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, h);
            ctx.stroke();
          }

          const numPoints = 150;
          const channelData = buffer.getChannelData(0);
          const step = Math.floor(channelData.length / numPoints);
          ctx.fillStyle = "rgba(242, 125, 38, 0.6)";

          const barWidth = w / numPoints;
          for (let i = 0; i < numPoints; i++) {
            let maxVal = 0;
            const start = i * step;
            const end = Math.min(start + step, channelData.length);
            for (let j = start; j < end; j++) {
              const absVal = Math.abs(channelData[j]);
              if (absVal > maxVal) maxVal = absVal;
            }
            const peakH = Math.min(1.0, maxVal) * h * 0.85;
            const y = (h - peakH) / 2;
            ctx.fillRect(i * barWidth, y, barWidth - 1, peakH);
          }

          const effectiveLoopB = compareEngine.getLoopB();
          if (effectiveLoopB.enabled) {
            const lStartPct = effectiveLoopB.start / buffer.duration;
            const lEndPct = effectiveLoopB.end / buffer.duration;
            ctx.fillStyle = "rgba(242, 125, 38, 0.12)";
            ctx.strokeStyle = "rgba(242, 125, 38, 0.6)";
            ctx.lineWidth = 1.5;
            ctx.fillRect(lStartPct * w, 0, (lEndPct - lStartPct) * w, h);
            ctx.strokeRect(lStartPct * w, 0, (lEndPct - lStartPct) * w, h);
          }

          const currentPos = compareEngine.getMixPlaybackPosition();
          const playPct = currentPos / buffer.duration;
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(playPct * w - 1, 0, 2, h);
        }
      }

      animId = requestAnimationFrame(renderWaveforms);
    };

    renderWaveforms();
    return () => cancelAnimationFrame(animId);
  }, [isVisible, activeTrack, loopEnabled, loopStart, loopEnd, mixTrackDuration]);

  const handleRefDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      loadReferenceTrack(file);
    }
  };

  const handleRefFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadReferenceTrack(file);
    }
  };

  const handleMixFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadMixTrack(file);
    }
  };

  const handleRefCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeTrack || !refWaveformCanvasRef.current) return;
    const rect = refWaveformCanvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = clickX / rect.width;
    const targetSeconds = pct * activeTrack.duration;
    
    if (isPlayingRef) {
      compareEngine.playReference(activeTrack.buffer, targetSeconds);
    } else {
      compareEngine.playReference(activeTrack.buffer, targetSeconds);
      compareEngine.pauseReference();
    }
  };

  const handleMixCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const buffer = compareEngine.getMixTrackBuffer();
    if (!buffer || !mixWaveformCanvasRef.current) return;
    const rect = mixWaveformCanvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = clickX / rect.width;
    const targetSeconds = pct * buffer.duration;

    if (isPlayingMix) {
      compareEngine.playMixFile(targetSeconds);
    } else {
      compareEngine.playMixFile(targetSeconds);
      compareEngine.pauseMixFile();
    }
  };

  const handleSaveSnapshot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!snapshotName.trim()) return;
    saveSnapshot(snapshotName.trim());
    setSnapshotName("");
  };

  const getMeterHeightPercent = (db: number) => {
    const minDb = -60;
    const maxDb = 6;
    const pct = ((db - minDb) / (maxDb - minDb)) * 100;
    return Math.max(0, Math.min(100, pct));
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="w-full flex flex-col gap-6 select-none max-w-7xl mx-auto p-2 animate-fade-in text-[#E2E8F0]">
      {showShortcutsInfo && (
        <div className="bg-sky-500/10 border border-sky-500/20 p-4 rounded-xl flex flex-col gap-2 text-xs text-sky-300">
          <p className="font-bold uppercase tracking-wide">Keyboard shortcuts for speed comparison:</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-1 font-mono">
            <div><span className="bg-[#1A1A1E] px-1.5 py-0.5 rounded border border-sky-500/30 font-bold text-white">A</span> - Dry Original Sound (A)</div>
            <div><span className="bg-[#1A1A1E] px-1.5 py-0.5 rounded border border-sky-500/30 font-bold text-white">B</span> - Effected Rack Out (B)</div>
            <div><span className="bg-[#1A1A1E] px-1.5 py-0.5 rounded border border-sky-500/30 font-bold text-white">M</span> - Level Match Loudness</div>
            <div><span className="bg-[#1A1A1E] px-1.5 py-0.5 rounded border border-sky-500/30 font-bold text-white">L</span> - Loop Toggle</div>
          </div>
        </div>
      )}

      {/* Effected vs Original Analysis Differential Card */}
      <div className="bg-[#121215] border border-orange-500/30 rounded-2xl p-4 shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-3 border-b border-[#2A2A2E] pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-white">
              EFFECTED (WET) VS ORIGINAL (DRY) DIFFERENTIAL ANALYSIS
            </h3>
          </div>
          <button
            onClick={() => setShowShortcutsInfo(!showShortcutsInfo)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider bg-[#1E1E21] border border-[#2A2A2E] text-gray-400 hover:text-white"
          >
            <HelpCircle className="w-3 h-3" />
            <span>Shortcuts</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
          <div className="bg-[#0a0a0c] border border-[#2A2A2E] rounded-xl p-3">
            <div className="text-[9px] text-gray-400 uppercase font-sans font-bold">Loudness Delta (Δ LUFS)</div>
            <div className={`text-base font-bold mt-1 ${loudnessDelta !== null && loudnessDelta >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {loudnessDelta !== null
                ? `${loudnessDelta >= 0 ? '+' : ''}${loudnessDelta.toFixed(1)} dB`
                : '—'}
            </div>
            <div className="text-[8px] text-gray-500 mt-0.5">RMS Level Shift</div>
          </div>

          <div className="bg-[#0a0a0c] border border-[#2A2A2E] rounded-xl p-3">
            <div className="text-[9px] text-gray-400 uppercase font-sans font-bold">Harmonic Saturation</div>
            <div className="text-base font-bold text-orange-400 mt-1">Pending engine metric</div>
            <div className="text-[8px] text-gray-500 mt-0.5">Analog Magnetics & Drive</div>
          </div>

          <div className="bg-[#0a0a0c] border border-[#2A2A2E] rounded-xl p-3">
            <div className="text-[9px] text-gray-400 uppercase font-sans font-bold">Dynamic Crest Factor</div>
            <div className="text-base font-bold text-sky-400 mt-1">
              {mixCrestFactor !== null ? `${mixCrestFactor.toFixed(1)} dB` : '—'}
            </div>
            <div className="text-[8px] text-gray-500 mt-0.5">Punch / Transient Retention</div>
          </div>

          <div className="bg-[#0a0a0c] border border-[#2A2A2E] rounded-xl p-3">
            <div className="text-[9px] text-gray-400 uppercase font-sans font-bold">Stereo Correlation</div>
            <div className="text-base font-bold text-purple-400 mt-1">
              {stereoCorrelation !== null ? `${stereoCorrelation >= 0 ? '+' : ''}${stereoCorrelation.toFixed(2)}` : '—'}
            </div>
            <div className="text-[8px] text-gray-500 mt-0.5">Mono Compatibility Safe</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-5 bg-[#121215] border border-[#2A2A2E] rounded-xl p-5 flex flex-col justify-between shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-500 via-purple-500 to-orange-500 opacity-60"></div>
          
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">Monitor Source Switcher</span>
            <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest">Zero-Latency</span>
          </div>

          <div className="grid grid-cols-2 gap-4 flex-1 items-center py-2">
            <button
              onClick={() => setSource("A")}
              className={`h-24 rounded-xl flex flex-col items-center justify-center border transition-all ${
                activeSource === "A"
                  ? "bg-sky-500/15 border-sky-400 text-sky-300 shadow-[0_0_24px_rgba(14,165,233,0.25)]"
                  : "bg-[#1A1A1E] border-[#2A2A2E] text-gray-500 hover:border-gray-500 hover:text-gray-300"
              }`}
            >
              <span className="text-3xl font-black tracking-tighter">A</span>
              <span className="text-[9px] font-bold uppercase tracking-widest mt-1">Original (Dry Sound)</span>
              <span className="text-[8px] font-mono opacity-40 mt-1">[Press A]</span>
            </button>

            <button
              onClick={() => setSource("B")}
              className={`h-24 rounded-xl flex flex-col items-center justify-center border transition-all ${
                activeSource === "B"
                  ? "bg-orange-500/15 border-orange-400 text-orange-300 shadow-[0_0_24px_rgba(242,125,38,0.25)]"
                  : "bg-[#1A1A1E] border-[#2A2A2E] text-gray-500 hover:border-gray-500 hover:text-gray-300"
              }`}
            >
              <span className="text-3xl font-black tracking-tighter">B</span>
              <span className="text-[9px] font-bold uppercase tracking-widest mt-1">Effected (Wet Rack Out)</span>
              <span className="text-[8px] font-mono opacity-40 mt-1">[Press B]</span>
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-[#2A2A2E]/50 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Knob
                label="Gain"
                value={refGainDb}
                min={-18}
                max={18}
                onChange={(val) => setRefGain(val)}
                size={44}
              />
              <div className="flex flex-col">
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Ref Gain offset</span>
                <span className="text-xs font-mono font-bold text-sky-400">
                  {refGainDb >= 0 ? "+" : ""}{refGainDb.toFixed(1)} dB
                </span>
              </div>
            </div>

            <button
              onClick={triggerLevelMatch}
              className={`flex items-center space-x-1.5 px-4 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all ${
                levelMatchEnabled
                  ? "bg-sky-500 text-black border-sky-400 shadow-[0_0_12px_rgba(14,165,233,0.3)]"
                  : "bg-[#1E1E21] text-sky-400 border-sky-500/30 hover:border-sky-500 hover:bg-sky-500 hover:text-black"
              }`}
              title="Automatically match loudness of reference track to the active mix based on RMS"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPlayingRef && "animate-spin"}`} />
              <span>Level Match</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-7 bg-[#121215] border border-[#2A2A2E] rounded-xl p-5 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299]">Precision Loudness Metering</span>
            <div className="flex items-center gap-3 text-[9px] font-mono font-bold text-gray-500">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span> A (REF)</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span> B (MIX)</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6 flex-1 py-1">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase tracking-widest text-center text-gray-500 mb-2">LUFS Approx</span>
              <div className="flex-1 bg-[#0A0A0C] border border-[#2A2A2E] rounded-lg p-2.5 flex justify-around items-end h-32 relative">
                <div className="absolute inset-y-0 left-0 right-0 flex flex-col justify-between pointer-events-none text-[8px] font-mono text-gray-700 p-1">
                  <div>+6</div>
                  <div>0</div>
                  <div>-14</div>
                  <div>-24</div>
                  <div>-60</div>
                </div>

                <div className="w-4 bg-sky-950/40 rounded-sm h-full relative overflow-hidden flex flex-col justify-end">
                  <div 
                    className="w-full bg-gradient-to-t from-sky-600 via-sky-400 to-emerald-400 transition-all duration-75 rounded-sm"
                    style={{ height: `${getMeterHeightPercent(meters.refLufs)}%` }}
                  ></div>
                </div>

                <div className="w-4 bg-orange-950/40 rounded-sm h-full relative overflow-hidden flex flex-col justify-end">
                  <div 
                    className="w-full bg-gradient-to-t from-orange-600 via-orange-400 to-amber-400 transition-all duration-75 rounded-sm"
                    style={{ height: `${getMeterHeightPercent(meters.mixLufs)}%` }}
                  ></div>
                </div>
              </div>
              <div className="flex justify-around mt-2 text-[10px] font-mono font-bold">
                <span className="text-sky-400">{meters.refLufs > -80 ? meters.refLufs.toFixed(1) : "-∞"}</span>
                <span className="text-orange-400">{meters.mixLufs > -80 ? meters.mixLufs.toFixed(1) : "-∞"}</span>
              </div>
            </div>

            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase tracking-widest text-center text-gray-500 mb-2">RMS Energy</span>
              <div className="flex-1 bg-[#0A0A0C] border border-[#2A2A2E] rounded-lg p-2.5 flex justify-around items-end h-32 relative">
                <div className="absolute inset-y-0 left-0 right-0 flex flex-col justify-between pointer-events-none text-[8px] font-mono text-gray-700 p-1">
                  <div>+6</div>
                  <div>0</div>
                  <div>-12</div>
                  <div>-24</div>
                  <div>-60</div>
                </div>

                <div className="w-4 bg-sky-950/40 rounded-sm h-full relative overflow-hidden flex flex-col justify-end">
                  <div 
                    className="w-full bg-gradient-to-t from-sky-600 via-sky-400 to-emerald-400 transition-all duration-75 rounded-sm"
                    style={{ height: `${getMeterHeightPercent(meters.refRms)}%` }}
                  ></div>
                </div>

                <div className="w-4 bg-orange-950/40 rounded-sm h-full relative overflow-hidden flex flex-col justify-end">
                  <div 
                    className="w-full bg-gradient-to-t from-orange-600 via-orange-400 to-amber-400 transition-all duration-75 rounded-sm"
                    style={{ height: `${getMeterHeightPercent(meters.mixRms)}%` }}
                  ></div>
                </div>
              </div>
              <div className="flex justify-around mt-2 text-[10px] font-mono font-bold">
                <span className="text-sky-400">{meters.refRms > -80 ? meters.refRms.toFixed(1) : "-∞"}</span>
                <span className="text-orange-400">{meters.mixRms > -80 ? meters.mixRms.toFixed(1) : "-∞"}</span>
              </div>
            </div>

            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase tracking-widest text-center text-gray-500 mb-2">True Peak</span>
              <div className="flex-1 bg-[#0A0A0C] border border-[#2A2A2E] rounded-lg p-2.5 flex justify-around items-end h-32 relative">
                <div className="absolute inset-y-0 left-0 right-0 flex flex-col justify-between pointer-events-none text-[8px] font-mono text-gray-700 p-1">
                  <div>+6</div>
                  <div>0</div>
                  <div>-6</div>
                  <div>-18</div>
                  <div>-60</div>
                </div>

                <div className="w-4 bg-sky-950/40 rounded-sm h-full relative overflow-hidden flex flex-col justify-end">
                  <div 
                    className="w-full bg-gradient-to-t from-sky-600 via-sky-400 to-emerald-400 transition-all duration-75 rounded-sm"
                    style={{ height: `${getMeterHeightPercent(meters.refPeak)}%` }}
                  ></div>
                </div>

                <div className="w-4 bg-orange-950/40 rounded-sm h-full relative overflow-hidden flex flex-col justify-end">
                  <div 
                    className="w-full bg-gradient-to-t from-orange-600 via-orange-400 to-amber-400 transition-all duration-75 rounded-sm"
                    style={{ height: `${getMeterHeightPercent(meters.mixPeak)}%` }}
                  ></div>
                </div>
              </div>
              <div className="flex justify-around mt-2 text-[10px] font-mono font-bold">
                <span className="text-sky-400">{meters.refPeak > -80 ? meters.refPeak.toFixed(1) : "-∞"}</span>
                <span className="text-orange-400">{meters.mixPeak > -80 ? meters.mixPeak.toFixed(1) : "-∞"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-[#121215] border border-[#2A2A2E] rounded-xl p-5 shadow-lg flex flex-col">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#8E9299] mb-3">Reference Library</h3>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleRefDrop}
              className="border border-dashed border-[#2A2A2E] hover:border-sky-500/50 bg-[#161619] rounded-xl p-4 flex flex-col items-center justify-center text-center group cursor-pointer transition-colors relative"
            >
              <input
                type="file"
                accept="audio/*"
                onChange={handleRefFileSelect}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <UploadCloud className="w-8 h-8 text-gray-500 group-hover:text-sky-400 transition-colors mb-2" />
              <span className="text-xs font-bold text-gray-300">Drop reference audio</span>
              <span className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">WAV, MP3, FLAC, AIFF</span>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto max-h-40 space-y-1.5 pr-1">
              {referenceTracks.length === 0 ? (
                <div className="h-16 flex items-center justify-center text-[11px] text-gray-500 italic">
                  No reference tracks loaded.
                </div>
              ) : (
                referenceTracks.map((track) => (
                  <div
                    key={track.id}
                    onClick={() => selectReferenceTrack(track.id)}
                    className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all ${
                      track.id === activeTrackId
                        ? "bg-sky-500/5 border-sky-400/40 text-sky-300"
                        : "bg-[#1A1A1E] border-[#2A2A2E] hover:border-gray-600 text-gray-400"
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Music className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-xs font-bold truncate pr-2">{track.name}</span>
                        <span className="text-[9px] font-mono opacity-50">
                          {formatTime(track.duration)} | {track.channels === 1 ? "Mono" : "Stereo"}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeReferenceTrack(track.id);
                      }}
                      className="p-1 rounded text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remove Reference"
                      aria-label="Remove reference track"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-[#121215] border border-[#2A2A2E] rounded-xl p-5 shadow-lg">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#8E9299] mb-3">Snapshots Compare</h3>
            
            <form onSubmit={handleSaveSnapshot} className="flex gap-2">
              <input
                type="text"
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                placeholder="Name snapshot (e.g., Chorus)"
                className="flex-1 bg-[#1A1A1E] border border-[#2A2A2E] rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={!activeTrackId}
                className="px-3.5 py-1.5 rounded-lg bg-sky-500 text-black font-bold text-xs hover:bg-sky-400 disabled:opacity-40 flex items-center gap-1 shrink-0"
              >
                <Camera className="w-3.5 h-3.5" />
                Snap
              </button>
            </form>

            <div className="mt-4 overflow-y-auto max-h-36 space-y-1.5 pr-1">
              {snapshots.length === 0 ? (
                <div className="h-16 flex items-center justify-center text-[11px] text-gray-500 italic text-center">
                  Save snapshot states to quickly toggle configurations.
                </div>
              ) : (
                snapshots.map((snap) => {
                  const track = referenceTracks.find(t => t.id === snap.refTrackId);
                  const trackName = track?.name || "Unknown Track";
                  return (
                    <div
                      key={snap.id}
                      onClick={() => loadSnapshot(snap.id)}
                      className="flex items-center justify-between p-2 rounded-lg bg-[#161619] border border-[#2A2A2E] hover:border-sky-500/40 cursor-pointer transition-colors"
                    >
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-xs font-bold text-gray-300 truncate">{snap.name}</span>
                        <span className="text-[9px] font-mono text-gray-500 truncate">
                          {trackName} | {snap.refGainOffset >= 0 ? "+" : ""}{snap.refGainOffset.toFixed(1)}dB
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSnapshot(snap.id);
                        }}
                        className="p-1 rounded text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete Snapshot"
                        aria-label="Delete snapshot"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="bg-[#121215] border border-[#2A2A2E] rounded-xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse"></span>
                <span className="text-xs font-bold uppercase tracking-wider text-white">Reference Waveform (A)</span>
              </div>
              <span className="text-[10px] font-mono text-sky-400 truncate max-w-[200px] font-bold">
                {activeTrack ? activeTrack.name : "No track loaded"}
              </span>
            </div>

            <div className="w-full h-24 bg-[#0A0A0C] border border-[#2A2A2E] rounded-lg relative overflow-hidden mb-4">
              {activeTrack ? (
                <canvas
                  ref={refWaveformCanvasRef}
                  width={700}
                  height={96}
                  onClick={handleRefCanvasClick}
                  className="w-full h-full cursor-pointer opacity-85 hover:opacity-100 transition-opacity"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-gray-500 italic">
                  Upload a reference track to display waveform.
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlayRef}
                  disabled={!activeTrack}
                  className={`p-2.5 rounded-lg border transition-all ${
                    isPlayingRef
                      ? "bg-sky-500 text-black border-sky-400"
                      : "bg-[#1E1E21] border-[#2A2A2E] text-sky-400 hover:border-sky-500"
                  } disabled:opacity-40`}
                  aria-label={isPlayingRef ? "Pause reference track" : "Play reference track"}
                  title={isPlayingRef ? "Pause reference" : "Play reference"}
                >
                  {isPlayingRef ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                </button>

                <button
                  onClick={stopRef}
                  disabled={!activeTrack}
                  className="p-2.5 rounded-lg border bg-[#1E1E21] border-[#2A2A2E] text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-40"
                  aria-label="Stop reference track"
                  title="Stop reference"
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>

                {activeTrack && (
                  <span className="text-[10px] font-mono font-bold text-gray-400 bg-[#0A0A0C] px-2.5 py-1.5 rounded-lg border border-[#2A2A2E]">
                    {formatTime(compareEngine.getRefPlaybackPosition())} / {formatTime(activeTrack.duration)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center space-x-1 bg-[#0A0A0C] p-1 rounded-lg border border-[#2A2A2E]">
                  <button
                    onClick={() => setLoop(loopStart, loopEnd, !loopEnabled)}
                    disabled={!activeTrack}
                    className={`px-3 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition-colors ${
                      loopEnabled && activeTrack
                        ? "bg-sky-500 text-black"
                        : "text-gray-500 hover:text-white"
                    } disabled:opacity-40`}
                  >
                    Loop
                  </button>
                  
                  <button
                    onClick={() => setLoopSync(!loopSync)}
                    className={`px-3 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition-colors ${
                      loopSync
                        ? "bg-[#1E1E21] text-sky-400 border border-sky-500/20"
                        : "text-gray-500 hover:text-white"
                    }`}
                    title="Sync loops lengths between A & B"
                  >
                    <FolderSync className="w-3.5 h-3.5 inline mr-1" />
                    Sync
                  </button>
                </div>

                {activeTrack && (
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <input
                      type="number"
                      value={Number.isNaN(loopStart) ? "0.0" : loopStart.toFixed(1)}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val)) {
                          setLoop(Math.max(0, val), loopEnd, loopEnabled);
                        }
                      }}
                      className="w-14 bg-[#0A0A0C] border border-[#2A2A2E] p-1 rounded text-center text-sky-300"
                      step="0.5"
                      min="0"
                      aria-label="Loop start time in seconds"
                    />
                    <span className="text-gray-600">&rarr;</span>
                    <input
                      type="number"
                      value={Number.isNaN(loopEnd) ? "10.0" : loopEnd.toFixed(1)}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val)) {
                          setLoop(loopStart, Math.min(activeTrack.duration, val), loopEnabled);
                        }
                      }}
                      className="w-14 bg-[#0A0A0C] border border-[#2A2A2E] p-1 rounded text-center text-sky-300"
                      step="0.5"
                      aria-label="Loop end time in seconds"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-[#121215] border border-[#2A2A2E] rounded-xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-400 animate-pulse"></span>
                <span className="text-xs font-bold uppercase tracking-wider text-white">Your Source Mix (B)</span>
              </div>
              
              <span className="text-[10px] font-mono text-orange-400 truncate max-w-[200px] font-bold">
                {mixTrackName ? mixTrackName : "No source track loaded (Default to microphone)"}
              </span>
            </div>

            <div className="w-full h-24 bg-[#0A0A0C] border border-[#2A2A2E] rounded-lg relative overflow-hidden mb-4">
              {compareEngine.getMixTrackBuffer() ? (
                <canvas
                  ref={mixWaveformCanvasRef}
                  width={700}
                  height={96}
                  onClick={handleMixCanvasClick}
                  className="w-full h-full cursor-pointer opacity-85 hover:opacity-100 transition-opacity"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-xs text-gray-500 relative p-4 group cursor-pointer border border-dashed border-[#2A2A2E]/60 hover:bg-[#1A1A1E] rounded-lg">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleMixFileSelect}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <UploadCloud className="w-7 h-7 text-gray-500 group-hover:text-orange-400 mb-2 transition-colors" />
                  <span className="text-xs font-bold text-gray-400">Load unmastered mix file to process and preview</span>
                  <span className="text-[9px] text-gray-600 uppercase tracking-widest mt-1">Or keep Mic active for real-time live input</span>
                </div>
              )}
            </div>

            {compareEngine.getMixTrackBuffer() && (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={togglePlayMix}
                    className={`p-2.5 rounded-lg border transition-all ${
                      isPlayingMix
                        ? "bg-orange-500 text-black border-orange-400"
                        : "bg-[#1E1E21] border-[#2A2A2E] text-orange-400 hover:border-orange-500"
                    }`}
                    aria-label={isPlayingMix ? "Pause source mix" : "Play source mix"}
                    title={isPlayingMix ? "Pause mix" : "Play mix"}
                  >
                    {isPlayingMix ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                  </button>

                  <button
                    onClick={stopMix}
                    className="p-2.5 rounded-lg border bg-[#1E1E21] border-[#2A2A2E] text-gray-400 hover:text-white hover:border-gray-500"
                    aria-label="Stop source mix"
                    title="Stop mix"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </button>

                  <span className="text-[10px] font-mono font-bold text-gray-400 bg-[#0A0A0C] px-2.5 py-1.5 rounded-lg border border-[#2A2A2E]">
                    {formatTime(compareEngine.getMixPlaybackPosition())} / {formatTime(mixTrackDuration)}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-bold text-orange-500/70 uppercase tracking-widest font-mono">
                    PROCESSED BY STUDIO RACK ACTIVE FX
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
