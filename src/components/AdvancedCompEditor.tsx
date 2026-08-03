import React, {
  memo,
  useCallback,
  useState,
  useRef,
  useEffect,
} from "react";
import {
  AdvancedCompressorSettings,
  CompressorMode,
  COMPRESSOR_PRESETS,
  applyCompressorPreset,
} from "../audio/dsp/AdvancedCompressor";
import { Knob } from "./Knob";
import { audioEngine } from "../audio/AudioEngine";

const HISTORY_LENGTH = 150;
const MAX_GR_DB = 20;

interface AdvancedCompEditorProps {
  moduleId: string;
  settings: AdvancedCompressorSettings;
  onChange: (next: AdvancedCompressorSettings) => void;
}

export const AdvancedCompEditor: React.FC<AdvancedCompEditorProps> = memo(
  ({ moduleId, settings, onChange }) => {
    const [selectedPresetId, setSelectedPresetId] = useState<string>(
      COMPRESSOR_PRESETS[0]?.id ?? "mix-eq-bus"
    );

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);
    const historyRef = useRef<number[]>(new Array(HISTORY_LENGTH).fill(0));

    const update = useCallback(
      (updates: Partial<AdvancedCompressorSettings>) => {
        onChange({ ...settings, ...updates });
      },
      [settings, onChange]
    );

    const changeMode = useCallback(
      (mode: CompressorMode) => update({ mode }),
      [update]
    );

    const selectPreset = useCallback(
      (id: string) => {
        setSelectedPresetId(id);
        const preset = COMPRESSOR_PRESETS.find((p) => p.id === id);
        if (!preset) return;
        const next = applyCompressorPreset(settings, preset);
        onChange(next);
      },
      [settings, onChange]
    );

    useEffect(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      let logicalW = 0;
      let logicalH = 0;
      let isVisible = true;

      const resizeCanvas = () => {
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        logicalW = rect.width;
        logicalH = rect.height;

        canvas.width = logicalW * dpr;
        canvas.height = logicalH * dpr;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
      };

      const draw = () => {
        if (!isVisible) {
          if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
          return;
        }

        const grRaw = audioEngine.getModuleGainReduction(moduleId) ?? 0;
        const gr = Math.abs(grRaw);

        const history = historyRef.current;
        history.push(gr);
        history.shift();

        const W = logicalW;
        const H = logicalH;
        if (W === 0 || H === 0) {
          rafRef.current = requestAnimationFrame(draw);
          return;
        }

        ctx.clearRect(0, 0, W, H);

        ctx.strokeStyle = "#2A2A2E";
        ctx.lineWidth = 1;
        for (let i = 1; i <= 4; i++) {
          const y = i * (H / 5);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();

          ctx.fillStyle = "#4B5563";
          ctx.font = "8px monospace";
          ctx.fillText(`-${i * 4}dB`, 2, y - 2);
        }

        ctx.beginPath();
        ctx.strokeStyle = "#F43F5E";
        ctx.lineWidth = 2;

        for (let i = 0; i < history.length; i++) {
          const x = (i / (history.length - 1)) * W;
          const normalized = Math.max(0, Math.min(1, history[i] / MAX_GR_DB));
          const y = normalized * H;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.lineTo(W, 0);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fillStyle = "rgba(244, 63, 94, 0.2)";
        ctx.fill();

        rafRef.current = requestAnimationFrame(draw);
      };

      const resizeObserver = new ResizeObserver(() => {
        resizeCanvas();
      });

      const intersectionObserver = new IntersectionObserver(([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible && rafRef.current === null) {
          rafRef.current = requestAnimationFrame(draw);
        } else if (!isVisible && rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      });

      resizeCanvas();
      resizeObserver.observe(container);
      intersectionObserver.observe(canvas);

      rafRef.current = requestAnimationFrame(draw);

      return () => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
      };
    }, [moduleId]);

    return (
      <div className="flex flex-col space-y-4 bg-[#0F0F11] rounded-xl border border-[#2A2A2E] p-4 mt-3">
        <div
          ref={containerRef}
          className="relative h-24 bg-[#18181B] rounded-lg border border-[#2A2A2E] overflow-hidden"
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            role="img"
            aria-label="Compressor gain reduction meter"
          />
          <div className="absolute top-2 right-2 flex space-x-1">
            {(["vca", "opto", "fet", "clean"] as CompressorMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => changeMode(mode)}
                aria-pressed={settings.mode === mode}
                aria-label={`Compressor mode ${mode.toUpperCase()}`}
                className={`px-2 py-0.5 rounded text-[9px] font-mono border transition-colors ${
                  settings.mode === mode
                    ? "bg-rose-600 text-[#0A0A0C] border-rose-500"
                    : "bg-[#2A2A2E] text-gray-400 border-[#3A3A3F] hover:bg-[#3A3A3F]"
                }`}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {(() => {
          const isOpto = settings.mode === "opto";
          const isFet = settings.mode === "fet";
          const isVca = settings.mode === "vca";
          
          let knobColor = "#F43F5E";
          if (isFet) knobColor = "#E5E7EB";
          else if (isOpto) knobColor = "#38BDF8";
          else if (isVca) knobColor = "#10B981";
          
          const threshLabel = isOpto ? "Peak Reduct" : isFet ? "Input Level" : "Thresh";
          const makeupLabel = isOpto ? "Gain" : isFet ? "Output" : "Makeup";
          
          return (
            <div className="grid grid-cols-5 gap-6">
              <Knob
                label={threshLabel}
                value={settings.threshold}
                min={-60}
                max={0}
                step={0.1}
                color={knobColor}
                onChange={(v) => update({ threshold: v })}
                unit="dB"
              />
              <div className={isOpto ? "opacity-25 pointer-events-none relative" : "relative"}>
                <Knob
                  label={isOpto ? "Ratio (T4)" : "Ratio"}
                  value={isOpto ? 4 : settings.ratio}
                  min={1}
                  max={20}
                  step={0.1}
                  color={knobColor}
                  onChange={(v) => update({ ratio: v })}
                  unit=":1"
                />
                {isOpto && (
                  <span className="absolute inset-x-0 bottom-[-8px] text-[7px] font-mono font-bold text-[#38BDF8] text-center uppercase tracking-tighter">
                    Fixed ~4:1
                  </span>
                )}
              </div>
              <div className={isOpto ? "opacity-25 pointer-events-none relative" : "relative"}>
                <Knob
                  label={isOpto ? "Attack (T4)" : "Attack"}
                  value={isOpto ? 10 : settings.attackMs}
                  min={0.1}
                  max={100}
                  step={0.1}
                  color={knobColor}
                  onChange={(v) => update({ attackMs: v })}
                  unit="ms"
                />
                {isOpto && (
                  <span className="absolute inset-x-0 bottom-[-8px] text-[7px] font-mono font-bold text-[#38BDF8] text-center uppercase tracking-tighter">
                    ~10ms Opto
                  </span>
                )}
              </div>
              <div className={isOpto ? "opacity-25 pointer-events-none relative" : "relative"}>
                <Knob
                  label={isOpto ? "Release (T4)" : "Release"}
                  value={isOpto ? 150 : settings.releaseMs}
                  min={10}
                  max={1000}
                  step={1}
                  color={knobColor}
                  onChange={(v) => update({ releaseMs: v })}
                  unit="ms"
                />
                {isOpto && (
                  <span className="absolute inset-x-0 bottom-[-8px] text-[7px] font-mono font-bold text-[#38BDF8] text-center uppercase tracking-tighter">
                    Multi-Stage
                  </span>
                )}
              </div>
              <Knob
                label={makeupLabel}
                value={settings.makeupGain}
                min={-12}
                max={24}
                step={0.1}
                color={knobColor}
                onChange={(v) => update({ makeupGain: v })}
                unit="dB"
              />
            </div>
          );
        })()}

        <div className="flex items-center justify-between border-t border-[#2A2A2E] pt-3">
          <div className="flex items-center space-x-4">
            <select
              value={selectedPresetId}
              onChange={(e) => selectPreset(e.target.value)}
              aria-label="Compressor preset"
              className="bg-[#1E1E21] border border-[#2A2A2E] rounded px-2 py-1 text-[10px] font-mono text-white focus:outline-none focus:border-rose-500"
            >
              {COMPRESSOR_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <div className="flex items-center space-x-2">
              <span className="text-[9px] font-mono text-[#8E9299]">
                Auto Rel
              </span>
              <input
                type="checkbox"
                checked={settings.autoRelease}
                onChange={(e) => update({ autoRelease: e.target.checked })}
                className="accent-rose-500"
                aria-label="Auto release"
              />
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Knob
              label="Mix"
              value={settings.mixPercent}
              min={0}
              max={100}
              step={1}
              onChange={(v) => update({ mixPercent: v })}
              unit="%"
            />
          </div>
        </div>
      </div>
    );
  }
);

AdvancedCompEditor.displayName = "AdvancedCompEditor";
