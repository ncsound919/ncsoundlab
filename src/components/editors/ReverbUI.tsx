import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Knob } from '../Knob';
import { audioEngine } from '../../lib/audioEngine';
import { CONVOLUTION_REVERB_PRESETS } from '../../lib/convolutionAndTapePresets';
import { ConvolutionPreset } from '../../types';
import {
  Sparkles,
  Activity,
  Repeat,
  SlidersHorizontal,
  Layers3,
  Wand2,
  Gauge,
  AudioLines,
  Upload,
} from 'lucide-react';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const categoryColorMap: Record<string, string> = {
  all: 'from-sky-500 to-cyan-500',
  room: 'from-emerald-500 to-teal-500',
  hall: 'from-violet-500 to-fuchsia-500',
  plate: 'from-amber-500 to-orange-500',
  special: 'from-pink-500 to-rose-500',
  fx: 'from-cyan-500 to-blue-500',
};

function formatHz(v: number) {
  return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}kHz` : `${Math.round(v)}Hz`;
}

function percent(v: number) {
  return `${Math.round(v * 100)}%`;
}

function usePresetProfile(preset: ConvolutionPreset) {
  return useMemo(() => {
    const wet = clamp(preset.mix.wet, 0, 1);
    const stretch = clamp((preset.irProcessing.stretchFactor - 0.5) / 1.5, 0, 1);
    const brightness =
      clamp((preset.postEq.airDb + 6) / 18, 0, 1) * 0.32 +
      clamp((preset.postEq.presenceDb + 6) / 12, 0, 1) * 0.22 +
      clamp((preset.postEq.dampingFreq - 1000) / 19000, 0, 1) * 0.46;
    const width =
      clamp(wet * 0.58, 0, 1) +
      (preset.irProcessing.mode === 'multiband' ? 0.18 : 0.06) +
      (preset.irProcessing.reverse ? 0.08 : 0);
    const density =
      0.38 +
      stretch * 0.18 +
      (preset.irProcessing.mode === 'multiband' ? 0.22 : 0.08) +
      clamp(preset.nonlinearTail.tailModDepth * 0.14, 0, 0.14);
    const grit =
      clamp(preset.nonlinearTail.saturationAmount * 0.78, 0, 1) +
      clamp((preset.irProcessing.irLowShelfDb + 6) / 12, 0, 1) * 0.16;
    const tail =
      clamp(wet * 0.35, 0, 1) +
      stretch * 0.45 +
      clamp(preset.nonlinearTail.tailModDepth * 0.2, 0, 0.2);

    return {
      wet: clamp(wet, 0, 1),
      brightness: clamp(brightness, 0, 1),
      width: clamp(width, 0, 1),
      density: clamp(density, 0, 1),
      grit: clamp(grit, 0, 1),
      tail: clamp(tail, 0, 1),
    };
  }, [preset]);
}

function Meter({
  label,
  value,
  color = 'from-sky-500 to-cyan-400',
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider">
        <span className="text-zinc-500">{label}</span>
        <span className="text-white">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 rounded-full bg-[#17171C] border border-[#25252C] overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#27272A] bg-gradient-to-b from-[#151519] to-[#101014] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#24242A] mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-300 flex items-center justify-center">
            {icon}
          </div>
          <div>
            <h4 className="text-[11px] font-black uppercase tracking-[0.18em] text-white">
              {title}
            </h4>
            <p className="text-[10px] text-zinc-500 mt-0.5">{subtitle}</p>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function PresetVisualizer({ preset }: { preset: ConvolutionPreset }) {
  const profile = usePresetProfile(preset);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const sizeRef = useRef({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    const resize = () => {
      const rect = el.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = (time: number) => {
      const { w: W, h: H } = sizeRef.current;
      if (!W || !H) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const t = time * 0.001;
      const centerY = H * 0.52;
      const pad = 18;

      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, 'rgba(10,15,24,1)');
      bg.addColorStop(0.45, 'rgba(13,19,34,1)');
      bg.addColorStop(1, 'rgba(7,9,13,1)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const radial = ctx.createRadialGradient(W * 0.7, H * 0.35, 0, W * 0.7, H * 0.35, W * 0.75);
      radial.addColorStop(0, 'rgba(56,189,248,0.22)');
      radial.addColorStop(0.45, 'rgba(129,140,248,0.10)');
      radial.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 5; i++) {
        const y = pad + ((H - pad * 2) / 5) * i;
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(W - pad, y);
        ctx.stroke();
      }
      for (let i = 0; i <= 9; i++) {
        const x = pad + ((W - pad * 2) / 9) * i;
        ctx.beginPath();
        ctx.moveTo(x, pad);
        ctx.lineTo(x, H - pad);
        ctx.stroke();
      }

      const tailSharpness = 2.4 + profile.tail * 5.2;
      const shimmer = 0.12 + profile.brightness * 0.22;
      const widthAmp = 20 + profile.width * 48;
      const decayHeight = 22 + profile.tail * 58;
      const grit = profile.grit;
      const density = profile.density;
      const reverseFactor = preset.irProcessing.reverse ? 1 : 0;

      const fill = ctx.createLinearGradient(0, 0, W, H);
      fill.addColorStop(0, 'rgba(56,189,248,0.05)');
      fill.addColorStop(0.35, 'rgba(59,130,246,0.20)');
      fill.addColorStop(0.75, 'rgba(167,139,250,0.28)');
      fill.addColorStop(1, 'rgba(236,72,153,0.12)');

      ctx.beginPath();
      for (let x = pad; x <= W - pad; x += 2) {
        const nx = (x - pad) / (W - pad * 2);
        const decay = reverseFactor
          ? Math.pow(nx, tailSharpness) * 0.95 + 0.05
          : Math.exp(-nx * tailSharpness * 1.65);

        const warp =
          Math.sin(nx * 11.5 + t * (0.8 + preset.nonlinearTail.tailModDepth * 1.8)) * shimmer +
          Math.sin(nx * (28 + grit * 20) - t * (1.2 + grit * 1.5)) * (0.03 + grit * 0.08) +
          Math.cos(nx * (18 + density * 12) + t * 0.75) * (0.025 + density * 0.05);

        const spread =
          decayHeight * decay +
          widthAmp * Math.abs(Math.sin(nx * Math.PI * (1.2 + density * 0.6) + t * 0.35));

        const y = centerY - spread * (0.32 + warp);
        if (x === pad) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let x = W - pad; x >= pad; x -= 2) {
        const nx = (x - pad) / (W - pad * 2);
        const decay = reverseFactor
          ? Math.pow(nx, tailSharpness) * 0.95 + 0.05
          : Math.exp(-nx * tailSharpness * 1.65);

        const warp =
          Math.sin(nx * 11.5 + t * (0.8 + preset.nonlinearTail.tailModDepth * 1.8)) * shimmer +
          Math.sin(nx * (28 + grit * 20) - t * (1.2 + grit * 1.5)) * (0.03 + grit * 0.08) +
          Math.cos(nx * (18 + density * 12) + t * 0.75) * (0.025 + density * 0.05);

        const spread =
          decayHeight * decay +
          widthAmp * Math.abs(Math.sin(nx * Math.PI * (1.2 + density * 0.6) + t * 0.35));

        const y = centerY + spread * (0.32 + warp);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();

      ctx.beginPath();
      for (let x = pad; x <= W - pad; x += 2) {
        const nx = (x - pad) / (W - pad * 2);
        const decay = reverseFactor
          ? Math.pow(nx, tailSharpness) * 0.95 + 0.05
          : Math.exp(-nx * tailSharpness * 1.65);

        const motion =
          Math.sin(nx * 14 + t * (0.85 + profile.wet)) * (10 + profile.tail * 26) +
          Math.sin(nx * 48 - t * (1.1 + profile.grit)) * (2 + profile.grit * 10);

        const y = centerY - decay * motion;
        if (x === pad) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(103,232,249,0.95)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(56,189,248,0.55)';
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.shadowBlur = 0;

      const barCount = 40;
      const barGap = 4;
      const barWidth = (W - pad * 2 - (barCount - 1) * barGap) / barCount;
      for (let i = 0; i < barCount; i++) {
        const nx = i / (barCount - 1);
        const spectralTilt = preset.preEq.tiltAmount * (nx - 0.5) * 0.65;
        const damping = 1 - clamp(nx - profile.brightness * 0.55, 0, 1) * 0.75;
        const animated =
          0.35 +
          Math.abs(Math.sin(t * 1.4 + nx * 9.2)) * 0.45 +
          profile.wet * 0.25 +
          spectralTilt;
        const barH = clamp(animated * damping, 0.06, 1) * 34;
        const x = pad + i * (barWidth + barGap);
        const y = H - pad - barH;

        const g = ctx.createLinearGradient(0, y, 0, y + barH);
        g.addColorStop(0, 'rgba(125,211,252,0.85)');
        g.addColorStop(0.6, 'rgba(99,102,241,0.55)');
        g.addColorStop(1, 'rgba(244,114,182,0.28)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, barWidth, barH);
      }

      const particleCount = 18;
      for (let i = 0; i < particleCount; i++) {
        const px = pad + ((i * 61.7 + t * (18 + profile.width * 12)) % (W - pad * 2));
        const py =
          centerY +
          Math.sin(i * 1.9 + t * (0.6 + profile.tail)) * (18 + profile.width * 30) -
          profile.brightness * 22;
        const r = 1.2 + ((i % 4) / 4) * 2.2;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.08 + (i % 5) * 0.03})`;
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(`IR ${preset.irProcessing.mode.toUpperCase()}`, pad, 18);
      ctx.fillStyle = 'rgba(161,161,170,0.95)';
      ctx.fillText(
        `${preset.irProcessing.reverse ? 'REVERSED' : 'FORWARD'} • WET ${Math.round(
          profile.wet * 100
        )}% • TAIL ${Math.round(profile.tail * 100)}%`,
        pad + 110,
        18
      );

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [preset, profile]);

  return (
    <div
      ref={wrapRef}
      className="relative h-[280px] rounded-2xl border border-[#27272A] overflow-hidden bg-[#0B0F14]"
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/60 via-black/15 to-transparent">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-white/10 bg-black/25 backdrop-blur-sm px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">Tail</div>
            <div className="text-sm font-black text-white">{percent(profile.tail)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 backdrop-blur-sm px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">Width</div>
            <div className="text-sm font-black text-white">{percent(profile.width)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 backdrop-blur-sm px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">Brightness</div>
            <div className="text-sm font-black text-white">{percent(profile.brightness)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 backdrop-blur-sm px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">Grit</div>
            <div className="text-sm font-black text-white">{percent(profile.grit)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReverbUI({
  settings,
  onChange,
}: {
  settings: any;
  onChange: (s: any) => void;
}) {
  const activePreset: ConvolutionPreset =
    settings.convolutionPreset || CONVOLUTION_REVERB_PRESETS[0];

  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(CONVOLUTION_REVERB_PRESETS.map((p) => p.category)))],
    []
  );

  const filteredPresets =
    selectedCategory === 'all'
      ? CONVOLUTION_REVERB_PRESETS
      : CONVOLUTION_REVERB_PRESETS.filter((p) => p.category === selectedCategory);

  const profile = usePresetProfile(activePreset);

  const updatePreset = (nextPreset: ConvolutionPreset) => {
    onChange({
      ...settings,
      reverbMix: Math.round(nextPreset.mix.wet * 100),
      convolutionPreset: nextPreset,
    });
  };

  const updatePreEq = (preEq: Partial<ConvolutionPreset['preEq']>) => {
    updatePreset({
      ...activePreset,
      preEq: { ...activePreset.preEq, ...preEq },
    });
  };

  const updateIrProcessing = (
    irProcessing: Partial<ConvolutionPreset['irProcessing']>
  ) => {
    updatePreset({
      ...activePreset,
      irProcessing: { ...activePreset.irProcessing, ...irProcessing },
    });
  };

  const updatePostEq = (postEq: Partial<ConvolutionPreset['postEq']>) => {
    updatePreset({
      ...activePreset,
      postEq: { ...activePreset.postEq, ...postEq },
    });
  };

  const updateNonlinearTail = (
    nonlinearTail: Partial<ConvolutionPreset['nonlinearTail']>
  ) => {
    updatePreset({
      ...activePreset,
      nonlinearTail: { ...activePreset.nonlinearTail, ...nonlinearTail },
    });
  };

  const updateMix = (mix: Partial<ConvolutionPreset['mix']>) => {
    const wet = mix.wet ?? activePreset.mix.wet;
    updatePreset({
      ...activePreset,
      mix: {
        ...activePreset.mix,
        ...mix,
        wet,
        dry: clamp(1 - wet * 0.5, 0, 1),
      },
    });
  };

  const handleSelectPreset = (preset: ConvolutionPreset) => {
    onChange({
      ...settings,
      reverbMix: Math.round(preset.mix.wet * 100),
      convolutionPreset: preset,
      reverbIRUrl: undefined,
      reverbIRBuffer: undefined
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleIRUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioEngine.getContext().decodeAudioData(arrayBuffer);
      
      onChange({
        ...settings,
        reverbIRUrl: file.name,
        reverbIRBuffer: audioBuffer,
        convolutionPreset: {
          ...activePreset,
          name: file.name,
          category: 'custom'
        }
      });
    } catch (err) {
      console.error("Error loading IR:", err);
    }
  };

  return (
    <div className="relative rounded-[26px] border border-[#27272A] bg-[#0B0C0F] text-[#E4E4E7] shadow-[0_24px_80px_rgba(0,0,0,0.55)] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.10),transparent_24%)] pointer-events-none" />

      <div className="relative p-5 md:p-6 space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-[#232329] pb-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-300 flex items-center justify-center shadow-[0_0_30px_rgba(14,165,233,0.16)]">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm md:text-base font-black uppercase tracking-[0.22em] text-white">
                  Convolution Reverb
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Premium space designer • IR shaping • nonlinear tail coloration
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.18em] bg-sky-500/10 text-sky-300 border border-sky-500/20">
                {activePreset.category}
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.18em] bg-white/5 text-zinc-300 border border-white/10">
                {activePreset.irProcessing.mode}
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.18em] bg-white/5 text-zinc-300 border border-white/10">
                Wet {Math.round(activePreset.mix.wet * 100)}%
              </span>
              {activePreset.irProcessing.reverse && (
                <span className="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.18em] bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  Reverse IR
                </span>
              )}
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleIRUpload} 
                accept="audio/*" 
                className="hidden" 
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="ml-2 flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.1em] font-bold bg-[#1A1A1E] hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 transition-colors"
                title="Load Custom IR File (.wav, .mp3, etc.)"
              >
                <Upload className="w-3 h-3" />
                <span className="truncate max-w-[150px]">{settings.reverbIRUrl ? `IR: ${settings.reverbIRUrl}` : "Load Custom IR"}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="flex flex-wrap gap-1 p-1 rounded-2xl border border-[#27272A] bg-[#121318]">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold capitalize transition-all ${
                    selectedCategory === cat
                      ? `bg-gradient-to-r ${categoryColorMap[cat] || 'from-sky-500 to-cyan-500'} text-white shadow-lg`
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <select
              value={activePreset.id}
              onChange={(e) => {
                const preset = CONVOLUTION_REVERB_PRESETS.find((pr) => pr.id === e.target.value);
                if (preset) handleSelectPreset(preset);
              }}
              className="min-w-[220px] bg-[#121318] border border-sky-500/20 text-sky-200 text-xs font-semibold rounded-2xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            >
              {filteredPresets.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.name} • {pr.category.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.9fr] gap-5">
          <PresetVisualizer preset={activePreset} />

          <div className="space-y-4">
            <div className="rounded-2xl border border-[#27272A] bg-gradient-to-b from-[#14161B] to-[#101116] p-4">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-sky-300 mb-4">
                <AudioLines className="w-4 h-4" />
                Space Profile
              </div>

              <div className="space-y-3">
                <Meter label="Tail Length" value={profile.tail} color="from-cyan-400 to-sky-500" />
                <Meter label="Stereo Width" value={profile.width} color="from-violet-400 to-sky-500" />
                <Meter label="Brightness" value={profile.brightness} color="from-emerald-400 to-cyan-500" />
                <Meter label="Density" value={profile.density} color="from-fuchsia-400 to-violet-500" />
                <Meter label="Grit / Harmonics" value={profile.grit} color="from-amber-400 to-rose-500" />
              </div>
            </div>

            <div className="rounded-2xl border border-[#27272A] bg-[#111217] p-4">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-sky-300 mb-4">
                <Activity className="w-4 h-4" />
                DSP Chain
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                {[
                  'Pre-EQ',
                  'IR Process',
                  `Convolver:${activePreset.irProcessing.mode}`,
                  'Post-EQ',
                  'Nonlinear Tail',
                  `Mix:${Math.round(activePreset.mix.wet * 100)}%`,
                ].map((label, idx) => (
                  <React.Fragment key={label}>
                    <span className="px-2.5 py-1 rounded-xl bg-sky-500/10 text-sky-200 border border-sky-500/20">
                      {label}
                    </span>
                    {idx < 5 && <span className="text-zinc-600">→</span>}
                  </React.Fragment>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Input HP</div>
                  <div className="text-sm font-black text-white">{formatHz(activePreset.preEq.hpFreq)}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Damping</div>
                  <div className="text-sm font-black text-white">{formatHz(activePreset.postEq.dampingFreq)}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Tail Mod</div>
                  <div className="text-sm font-black text-white">
                    {Math.round(activePreset.nonlinearTail.tailModDepth * 100)}%
                  </div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Saturation</div>
                  <div className="text-sm font-black text-white">
                    {Math.round(activePreset.nonlinearTail.saturationAmount * 100)}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#27272A] bg-[#101115] p-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white">
                Preset Browser
              </div>
              <div className="text-[11px] text-zinc-500">
                Browse curated spaces and tweak from a strong starting point
              </div>
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              {filteredPresets.length} presets
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {filteredPresets.slice(0, 8).map((preset) => {
              const selected = preset.id === activePreset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset)}
                  className={`text-left rounded-2xl border p-4 transition-all ${
                    selected
                      ? 'border-sky-500/50 bg-gradient-to-b from-sky-500/10 to-cyan-500/5 shadow-[0_0_0_1px_rgba(14,165,233,0.2)]'
                      : 'border-[#27272A] bg-[#14161A] hover:border-white/15 hover:bg-[#181A20]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-white">{preset.name}</div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mt-1">
                        {preset.category}
                      </div>
                    </div>
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        selected ? 'bg-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.8)]' : 'bg-zinc-600'
                      }`}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4 text-[10px] font-mono">
                    <div className="rounded-lg bg-black/20 border border-white/5 px-2 py-1.5">
                      <div className="text-zinc-500">Wet</div>
                      <div className="text-white">{Math.round(preset.mix.wet * 100)}%</div>
                    </div>
                    <div className="rounded-lg bg-black/20 border border-white/5 px-2 py-1.5">
                      <div className="text-zinc-500">Mode</div>
                      <div className="text-white">{preset.irProcessing.mode}</div>
                    </div>
                    <div className="rounded-lg bg-black/20 border border-white/5 px-2 py-1.5">
                      <div className="text-zinc-500">Air</div>
                      <div className="text-white">{preset.postEq.airDb}dB</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <SectionCard
            icon={<SlidersHorizontal className="w-4 h-4" />}
            title="Pre-EQ Input"
            subtitle="Shape what enters the impulse"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Knob
                label="HP Freq"
                value={activePreset.preEq.hpFreq}
                min={20}
                max={500}
                step={5}
                unit="Hz"
                onChange={(v) => updatePreEq({ hpFreq: v })}
              />
              <Knob
                label="Tilt EQ"
                value={activePreset.preEq.tiltAmount}
                min={-1}
                max={1}
                step={0.05}
                onChange={(v) => updatePreEq({ tiltAmount: v })}
              />
              <div className="col-span-2 rounded-2xl border border-[#25252C] bg-[#111318] px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Character</div>
                  <div className="text-sm font-bold text-white">
                    {activePreset.preEq.tiltAmount > 0.2
                      ? 'Brighter feed'
                      : activePreset.preEq.tiltAmount < -0.2
                      ? 'Darker feed'
                      : 'Balanced feed'}
                  </div>
                </div>
                <div className="text-right text-[11px] font-mono text-sky-300">
                  HP {formatHz(activePreset.preEq.hpFreq)}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={<Layers3 className="w-4 h-4" />}
            title="IR Processor"
            subtitle="Transform the impulse before convolution"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Knob
                label="Time Warp"
                value={activePreset.irProcessing.stretchFactor}
                min={0.5}
                max={2}
                step={0.05}
                unit="x"
                onChange={(v) => updateIrProcessing({ stretchFactor: v })}
              />
              <Knob
                label="IR Low Shelf"
                value={activePreset.irProcessing.irLowShelfDb}
                min={-6}
                max={6}
                step={0.5}
                unit="dB"
                onChange={(v) => updateIrProcessing({ irLowShelfDb: v })}
              />

              <div className="rounded-2xl border border-[#25252C] bg-[#111318] p-3 flex flex-col justify-between">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Mode</div>
                <button
                  onClick={() =>
                    updateIrProcessing({
                      mode:
                        activePreset.irProcessing.mode === 'fullband'
                          ? 'multiband'
                          : 'fullband',
                    })
                  }
                  className="mt-2 rounded-xl px-3 py-2 bg-sky-500/10 text-sky-300 border border-sky-500/20 text-xs font-bold uppercase hover:bg-sky-500/15 transition-colors"
                >
                  {activePreset.irProcessing.mode}
                </button>
              </div>

              <div className="rounded-2xl border border-[#25252C] bg-[#111318] p-3 flex flex-col justify-between">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Reverse</div>
                <button
                  onClick={() =>
                    updateIrProcessing({
                      reverse: !activePreset.irProcessing.reverse,
                    })
                  }
                  className={`mt-2 rounded-xl px-3 py-2 border text-xs font-bold uppercase flex items-center justify-center gap-2 transition-colors ${
                    activePreset.irProcessing.reverse
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/25'
                      : 'bg-[#191B21] text-zinc-400 border-[#27272A] hover:text-white'
                  }`}
                >
                  <Repeat className="w-3.5 h-3.5" />
                  {activePreset.irProcessing.reverse ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={<Gauge className="w-4 h-4" />}
            title="Post-EQ Tone"
            subtitle="Control air, damping, and forward presence"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Knob
                label="Damp"
                value={activePreset.postEq.dampingFreq}
                min={1000}
                max={20000}
                step={200}
                unit="Hz"
                onChange={(v) => updatePostEq({ dampingFreq: v })}
              />
              <Knob
                label="Presence"
                value={activePreset.postEq.presenceDb}
                min={-6}
                max={6}
                step={0.5}
                unit="dB"
                onChange={(v) => updatePostEq({ presenceDb: v })}
              />
              <Knob
                label="Air Boost"
                value={activePreset.postEq.airDb}
                min={-6}
                max={12}
                step={0.5}
                unit="dB"
                onChange={(v) => updatePostEq({ airDb: v })}
              />
              <div className="rounded-2xl border border-[#25252C] bg-[#111318] px-4 py-3 flex flex-col justify-center">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Tone Summary</div>
                <div className="text-sm font-bold text-white mt-1">
                  {profile.brightness > 0.66
                    ? 'Bright / open'
                    : profile.brightness > 0.38
                    ? 'Balanced'
                    : 'Dark / damped'}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={<Wand2 className="w-4 h-4" />}
            title="Tail & Mix"
            subtitle="Add movement, harmonics, and blend"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Knob
                label="Sat Drive"
                value={activePreset.nonlinearTail.saturationAmount}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => updateNonlinearTail({ saturationAmount: v })}
              />
              <Knob
                label="Tail Mod"
                value={activePreset.nonlinearTail.tailModDepth}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => updateNonlinearTail({ tailModDepth: v })}
              />
              <Knob
                label="Wet Mix"
                value={Math.round(activePreset.mix.wet * 100)}
                min={0}
                max={100}
                step={1}
                unit="%"
                onChange={(v) => updateMix({ wet: v / 100 })}
              />
              <div className="rounded-2xl border border-[#25252C] bg-[#111318] p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Blend</div>
                <div className="mt-2 h-2 rounded-full overflow-hidden bg-[#1D1F25] border border-[#2A2A33]">
                  <div className="flex h-full">
                    <div
                      className="bg-zinc-400/70"
                      style={{ width: `${Math.round(activePreset.mix.dry * 100)}%` }}
                    />
                    <div
                      className="bg-gradient-to-r from-sky-500 to-cyan-400"
                      style={{ width: `${Math.round(activePreset.mix.wet * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-zinc-400">Dry {Math.round(activePreset.mix.dry * 100)}%</span>
                  <span className="text-sky-300">Wet {Math.round(activePreset.mix.wet * 100)}%</span>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
