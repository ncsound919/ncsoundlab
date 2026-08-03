import React, {
  memo,
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect,
} from "react";
import {
  AdvancedEQSettings,
  EQBand,
  calculateAdvancedEQResponse,
} from "../audio/dsp/AdvancedParametricEQ";
import { Knob } from "./Knob";
import { audioEngine } from "../audio/AudioEngine";

/* ── Constants ────────────────────────────────────────────── */
const DB_RANGE = 24;
const CURVE_POINTS = 200;
const HANDLE_RADIUS = 6;
const GRID_FREQS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const LOG_MIN = Math.log2(20);
const LOG_MAX = Math.log2(20000);
const LOG_RANGE = LOG_MAX - LOG_MIN;

/* ── Pre-computed frequency table (avoids per-frame work) ── */
const FINE_FREQS = new Float32Array(CURVE_POINTS);
for (let i = 0; i < CURVE_POINTS; i++) {
  FINE_FREQS[i] = 20 * Math.pow(1000, i / (CURVE_POINTS - 1));
}
/* Pre-computed X ratios for fine freqs so we don't recompute log2 200×/frame */
const FINE_FREQ_X_RATIOS = new Float32Array(CURVE_POINTS);
for (let i = 0; i < CURVE_POINTS; i++) {
  FINE_FREQ_X_RATIOS[i] = (Math.log2(FINE_FREQS[i]) - LOG_MIN) / LOG_RANGE;
}

/* ── Coordinate helpers (module-level pure functions) ───── */
const freqToX = (freq: number, width: number): number =>
  ((Math.log2(Math.max(20, freq)) - LOG_MIN) / LOG_RANGE) * width;

const dbToY = (db: number, height: number): number =>
  height / 2 - (db / DB_RANGE) * (height / 2);

const xToFreq = (x: number, width: number): number => {
  const ratio = Math.max(0, Math.min(1, x / width));
  return Math.round(Math.pow(2, ratio * LOG_RANGE + LOG_MIN));
};

const yToGain = (y: number, height: number): number =>
  parseFloat(((height / 2 - y) * DB_RANGE / (height / 2)).toFixed(1));

const formatFreqLabel = (f: number): string =>
  f >= 1000 ? `${f / 1000}k` : `${f}`;

/* ── Draw the static background (grid + labels) once per size change ─ */
const drawGrid = (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number
): void => {
  ctx.clearRect(0, 0, W, H);

  /* Vertical frequency grid */
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#94a3b8";
  ctx.font = "8px monospace";
  ctx.textAlign = "left";

  GRID_FREQS.forEach((f) => {
    const x = freqToX(f, W);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
    ctx.fillText(formatFreqLabel(f), x + 2, H - 2);
  });

  /* Horizontal dB grid */
  for (let db = -DB_RANGE; db <= DB_RANGE; db += 12) {
    const y = dbToY(db, H);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    if (db !== 0) {
      ctx.fillText(`${db > 0 ? "+" : ""}${db}dB`, 2, y - 2);
    }
  }
};

/* ── Draw the real-time spectrum analyser overlay ────────── */
const drawSpectrum = (
  ctx: CanvasRenderingContext2D,
  analyser: AnalyserNode,
  spectrumData: Float32Array,
  W: number,
  H: number
): void => {
  analyser.getFloatFrequencyData(spectrumData);
  const sampleRate = analyser.context.sampleRate;
  const nyquist = sampleRate / 2;

  ctx.beginPath();
  let started = false;
  let lastX = 0;

  for (let i = 0; i < spectrumData.length; i++) {
    const freq = (i / spectrumData.length) * nyquist;
    if (freq < 20 || freq > 20000) continue;

    const x = freqToX(freq, W);
    const dbFs = Math.max(-100, Math.min(0, spectrumData[i]));
    const dbDisplay = ((dbFs + 100) / 100) * (DB_RANGE * 2) - DB_RANGE;
    const y = dbToY(dbDisplay, H);

    if (!started) {
      ctx.moveTo(x, H / 2);
      ctx.lineTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
    lastX = x;
  }

  ctx.lineTo(lastX, H / 2);
  ctx.closePath();
  ctx.fillStyle = "rgba(37, 99, 235, 0.2)";
  ctx.fill();
};

/* ── Draw the EQ response curve (fill + stroke) ───────────── */
const drawResponseCurve = (
  ctx: CanvasRenderingContext2D,
  fineResponse: { magnitudeDb: number }[],
  W: number,
  H: number
): void => {
  if (fineResponse.length === 0) return;

  /* Filled area */
  ctx.beginPath();
  fineResponse.forEach((pt, i) => {
    const x = FINE_FREQ_X_RATIOS[i] * W;
    const y = dbToY(pt.magnitudeDb, H);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });

  ctx.lineTo(FINE_FREQ_X_RATIOS[CURVE_POINTS - 1] * W, H / 2);
  ctx.lineTo(FINE_FREQ_X_RATIOS[0] * W, H / 2);
  ctx.closePath();
  ctx.fillStyle = "rgba(250, 204, 21, 0.15)";
  ctx.fill();

  /* Stroke line */
  ctx.beginPath();
  fineResponse.forEach((pt, i) => {
    const x = FINE_FREQ_X_RATIOS[i] * W;
    const y = dbToY(pt.magnitudeDb, H);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 2.5;
  ctx.stroke();
};

/* ── Draw band handles ────────────────────────────────────── */
const drawBandHandles = (
  ctx: CanvasRenderingContext2D,
  bands: EQBand[],
  selectedBandId: string | null,
  W: number,
  H: number
): void => {
  ctx.textAlign = "center";
  bands.forEach((band) => {
    if (!band.enabled) return;
    const x = freqToX(band.freq, W);
    const y = dbToY(band.gain, H);
    const isSelected = band.id === selectedBandId;

    ctx.beginPath();
    ctx.arc(x, y, HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? "#facc15" : "#0f172a";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = isSelected ? "#ffffff" : "#2563eb";
    ctx.stroke();

    ctx.fillStyle = isSelected ? "#000000" : "#ffffff";
    ctx.font = "9px monospace";
    ctx.fillText(band.id.replace("b", ""), x, y + 3);
  });
  ctx.textAlign = "left";
};

/* ── Component props ──────────────────────────────────────── */
interface AdvancedEQEditorProps {
  moduleId: string;
  settings: AdvancedEQSettings;
  onChange: (next: AdvancedEQSettings) => void;
}

export const AdvancedEQEditor: React.FC<AdvancedEQEditorProps> = memo(
  ({ moduleId, settings, onChange }) => {
    /* ── State ── */
    const [selectedBandId, setSelectedBandId] = useState<string | null>(
      settings.bands[0]?.id ?? null
    );

    /* ── Refs (avoid re-renders for drag & draw) ── */
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>(0);
    const isVisibleRef = useRef(true);
    const needsRedrawRef = useRef(true);

    /* Drag state kept entirely in refs — no React state churn */
    const isDraggingRef = useRef(false);
    const draggingBandIdRef = useRef<string | null>(null);
    const dragMovedRef = useRef(false);

    /* Mutable copies of latest props for use inside the rAF loop */
    const settingsRef = useRef(settings);
    const selectedBandIdRef = useRef(selectedBandId);
    settingsRef.current = settings;
    selectedBandIdRef.current = selectedBandId;

    /* ── Memoised EQ curve ── */
    const fineResponse = useMemo(
      () => calculateAdvancedEQResponse(settings, FINE_FREQS),
      [settings]
    );
    const fineResponseRef = useRef(fineResponse);
    fineResponseRef.current = fineResponse;

    /* ── Stable onChange wrapper that writes to the ref ── */
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const selectedBand: EQBand | undefined =
      settings.bands.find((b) => b.id === selectedBandId) ?? settings.bands[0];

    /* ── updateBand — stable identity, reads from ref ── */
    const updateBand = useCallback(
      (bandId: string, updates: Partial<EQBand>) => {
        const current = settingsRef.current;
        const bands = current.bands.map((b) =>
          b.id === bandId ? { ...b, ...updates } : b
        );
        onChangeRef.current({ ...current, bands });
      },
      []
    );

    const toggleBandEnabled = useCallback(
      (bandId: string) => {
        const band = settingsRef.current.bands.find((b) => b.id === bandId);
        if (!band) return;
        updateBand(bandId, { enabled: !band.enabled });
      },
      [updateBand]
    );

    /* ── Mark for redraw whenever settings or selection change ── */
    useEffect(() => {
      needsRedrawRef.current = true;
    }, [settings, selectedBandId]);

    /* ════════════════════════════════════════════════════════
       POINTER / DRAG HANDLERS  (unified mouse + touch + pen)
       ════════════════════════════════════════════════════════ */

    const getCanvasCoords = useCallback(
      (clientX: number, clientY: number): { x: number; y: number; W: number; H: number } | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        return {
          x: Math.max(0, Math.min(rect.width, clientX - rect.left)),
          y: Math.max(0, Math.min(rect.height, clientY - rect.top)),
          W: rect.width,
          H: rect.height,
        };
      },
      []
    );

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        const coords = getCanvasCoords(e.clientX, e.clientY);
        if (!coords) return;
        const { x, y, W, H } = coords;

        /* Find nearest enabled band within hit radius */
        let closestBand: EQBand | null = null;
        let minDistance = 24;

        settingsRef.current.bands.forEach((band) => {
          if (!band.enabled) return;
          const bandX = freqToX(band.freq, W);
          const bandY = dbToY(band.gain, H);
          const dist = Math.hypot(bandX - x, bandY - y);
          if (dist < minDistance) {
            minDistance = dist;
            closestBand = band;
          }
        });

        if (closestBand) {
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setSelectedBandId(closestBand.id);
          isDraggingRef.current = true;
          draggingBandIdRef.current = closestBand.id;
          dragMovedRef.current = false;
        }
      },
      [getCanvasCoords]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDraggingRef.current || !draggingBandIdRef.current) return;
        const coords = getCanvasCoords(e.clientX, e.clientY);
        if (!coords) return;
        const { x, y, W, H } = coords;

        const freq = xToFreq(x, W);
        const gain = yToGain(y, H);
        const clampedFreq = Math.max(20, Math.min(20000, freq));
        const clampedGain = Math.max(-DB_RANGE, Math.min(DB_RANGE, gain));

        dragMovedRef.current = true;
        updateBand(draggingBandIdRef.current, { freq: clampedFreq, gain: clampedGain });
      },
      [getCanvasCoords, updateBand]
    );

    const handlePointerUp = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (isDraggingRef.current) {
          try {
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
          } catch {
            /* no-op */
          }
        }
        isDraggingRef.current = false;
        draggingBandIdRef.current = null;
      },
      []
    );

    /* Double-click to reset selected band to flat (0 dB, default Q) */
    const handleDoubleClick = useCallback(
      () => {
        if (!selectedBandIdRef.current) return;
        updateBand(selectedBandIdRef.current, { gain: 0, q: 1.0 });
      },
      [updateBand]
    );

    /* Wheel to adjust frequency of the band under cursor */
    const handleWheel = useCallback(
      (e: React.WheelEvent<HTMLCanvasElement>) => {
        const coords = getCanvasCoords(e.clientX, e.clientY);
        if (!coords) return;
        const { x, y, W, H } = coords;

        let closestBand: EQBand | null = null;
        let minDistance = 24;

        settingsRef.current.bands.forEach((band) => {
          if (!band.enabled) return;
          const bandX = freqToX(band.freq, W);
          const bandY = dbToY(band.gain, H);
          const dist = Math.hypot(bandX - x, bandY - y);
          if (dist < minDistance) {
            minDistance = dist;
            closestBand = band;
          }
        });

        if (closestBand) {
          e.preventDefault();
          const direction = e.deltaY < 0 ? 1.05 : 0.9524;
          const newFreq = Math.max(20, Math.min(20000, Math.round(closestBand.freq * direction)));
          updateBand(closestBand.id, { freq: newFreq });
        }
      },
      [getCanvasCoords, updateBand]
    );

    /* ════════════════════════════════════════════════════════
       CANVAS SIZING  (ResizeObserver + DPR)
       ════════════════════════════════════════════════════════ */
    const sizeRef = useRef({ W: 600, H: 200, dpr: 1 });

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const resize = () => {
        const dpr = window.devicePixelRatio || 1;
        const logicalW = canvas.offsetWidth || 600;
        const logicalH = canvas.offsetHeight || 200;

        canvas.width = logicalW * dpr;
        canvas.height = logicalH * dpr;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.scale(dpr, dpr);

        sizeRef.current = { W: logicalW, H: logicalH, dpr };
        needsRedrawRef.current = true;
      };

      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);

      return () => ro.disconnect();
    }, []);

    /* ════════════════════════════════════════════════════════
       INTERSECTION OBSERVER  (pause rAF when off-screen)
       ════════════════════════════════════════════════════════ */
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const io = new IntersectionObserver(
        (entries) => {
          isVisibleRef.current = entries[0]?.isIntersecting ?? true;
        },
        { threshold: 0 }
      );
      io.observe(canvas);

      return () => io.disconnect();
    }, []);

    /* ════════════════════════════════════════════════════════
       DRAW LOOP  (rAF, always running; skips work when idle)
       ════════════════════════════════════════════════════════ */
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const spectrumData = new Float32Array(1024);

      const draw = () => {
        rafRef.current = requestAnimationFrame(draw);

        if (!isVisibleRef.current) return;

        const { W, H } = sizeRef.current;

        /* Always need at least the spectrum + handles for live analyser */
        const hasAnalyser = !!audioEngine.getModuleAnalyser(moduleId);

        if (needsRedrawRef.current || hasAnalyser) {
          /* Full redraw */
          drawGrid(ctx, W, H);

          const analyser = audioEngine.getModuleAnalyser(moduleId);
          if (analyser) {
            drawSpectrum(ctx, analyser, spectrumData, W, H);
          }

          drawResponseCurve(ctx, fineResponseRef.current, W, H);
          drawBandHandles(
            ctx,
            settingsRef.current.bands,
            selectedBandIdRef.current,
            W,
            H
          );

          needsRedrawRef.current = false;
        }
      };

      rafRef.current = requestAnimationFrame(draw);
      return () => cancelAnimationFrame(rafRef.current);
    }, [moduleId]);

    if (!settings.bands.length) return null;

    /* ════════════════════════════════════════════════════════
       RENDER
       ════════════════════════════════════════════════════════ */
    return (
      <div className="flex flex-col space-y-4 bg-black rounded-xl border-2 border-[#1e293b] p-4 mt-3 shadow-2xl">
        <div
          className="relative h-48 bg-[#020617] rounded-lg border border-[#1e293b] overflow-hidden"
          aria-hidden="true"
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
            className="w-full h-full cursor-grab active:cursor-grabbing touch-none select-none"
            role="img"
            aria-label="EQ frequency response curve"
          />
        </div>

        <div className="flex flex-col space-y-4">
          {/* Band selector chips */}
          <div className="flex items-center space-x-2 overflow-x-auto custom-scrollbar pb-2">
            {settings.bands.map((band) => (
              <button
                key={band.id}
                onClick={() => setSelectedBandId(band.id)}
                aria-pressed={selectedBandId === band.id}
                aria-label={`Select band ${band.id.replace("b", "")} at ${Math.round(band.freq)} Hz`}
                className={`flex-shrink-0 px-3 py-1 rounded text-[10px] font-mono border font-bold transition-colors ${
                  selectedBandId === band.id
                    ? "bg-blue-600 border-blue-400 text-yellow-300 shadow-[0_0_10px_rgba(37,99,235,0.5)]"
                    : "bg-[#0f172a] border-[#1e293b] text-slate-300 hover:bg-[#1e293b] hover:text-white"
                }`}
              >
                Band {band.id.replace("b", "")}: {Math.round(band.freq)}Hz
              </button>
            ))}
          </div>

          {/* Selected band controls */}
          {selectedBand && (
            <div className="bg-[#050507] rounded-lg border border-[#1e293b] p-4 flex items-center justify-between">
              <div className="flex items-center space-x-6">
                <div className="flex flex-col space-y-2">
                  <span className="text-[11px] font-mono font-black text-yellow-400">
                    BAND {selectedBand.id.replace("b", "")}
                  </span>
                  <select
                    value={selectedBand.type}
                    onChange={(e) =>
                      updateBand(selectedBand.id, { type: e.target.value as EQBand["type"] })
                    }
                    aria-label="Filter type"
                    className="bg-black border border-[#1e293b] rounded px-2 py-1 text-[10px] font-mono text-white font-bold focus:outline-none focus:border-yellow-400"
                  >
                    <option value="bell">Bell</option>
                    <option value="lowShelf">Low Shelf</option>
                    <option value="highShelf">High Shelf</option>
                    <option value="lowpass">Lowpass</option>
                    <option value="highpass">Highpass</option>
                    <option value="notch">Notch</option>
                  </select>
                  <button
                    onClick={() => toggleBandEnabled(selectedBand.id)}
                    aria-pressed={selectedBand.enabled}
                    aria-label={`${selectedBand.enabled ? "Bypass" : "Enable"} band ${selectedBand.id.replace("b", "")}`}
                    className={`mt-2 px-2 py-1 rounded text-[10px] font-mono font-bold border transition-colors ${
                      selectedBand.enabled
                        ? "bg-yellow-400 text-black border-yellow-300 font-black shadow-[0_0_8px_rgba(250,204,21,0.5)]"
                        : "bg-[#0f172a] text-slate-400 border-[#1e293b]"
                    }`}
                  >
                    {selectedBand.enabled ? "ACTIVE" : "BYPASSED"}
                  </button>
                </div>

                <div className="flex space-x-4">
                  <Knob
                    label="Freq"
                    value={selectedBand.freq}
                    min={20}
                    max={20000}
                    step={1}
                    onChange={(v) => updateBand(selectedBand.id, { freq: v })}
                    unit="Hz"
                  />
                  <Knob
                    label="Gain"
                    value={selectedBand.gain}
                    min={-DB_RANGE}
                    max={DB_RANGE}
                    step={0.1}
                    onChange={(v) => updateBand(selectedBand.id, { gain: v })}
                    unit="dB"
                  />
                  <Knob
                    label="Q"
                    value={selectedBand.q}
                    min={0.1}
                    max={18}
                    step={0.1}
                    onChange={(v) => updateBand(selectedBand.id, { q: v })}
                    unit=""
                  />
                </div>
              </div>

              <div className="flex flex-col items-end space-y-4">
                <Knob
                  label="Trim"
                  value={settings.outputTrimDb}
                  min={-DB_RANGE}
                  max={DB_RANGE}
                  step={0.1}
                  onChange={(v) => onChange({ ...settings, outputTrimDb: v })}
                  unit="dB"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

AdvancedEQEditor.displayName = "AdvancedEQEditor";
