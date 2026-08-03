/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useMemo, useState } from 'react';
import { Upload, Palette, Dice5, Cloud, Lock, Sparkles } from 'lucide-react';
import { CoverArtOptions, HipHopEra } from '../types';
import {
  runCoverArtPipeline,
  AgentPipelineResult,
} from './coverArtAgents';
import { drawEraBackground } from './coverArtRenderers';

interface CoverArtGeneratorProps {
  options: CoverArtOptions;
  onChange: (updated: CoverArtOptions) => void;
  onExportDataUrl?: (dataUrl: string) => void;
  /**
   * Optional Cloud Drive / MCP import hook.
   */
  onImportFromDrive?: () => Promise<string | null>;
}

const ERA_META: Record<HipHopEra, { label: string; sub: string }> = {
  boom_bap: { label: 'Boom Bap', sub: '90s NY / dusty & boxy' },
  golden_era: { label: 'Golden Era', sub: 'early 90s / vintage stamp' },
  trap: { label: 'Trap', sub: 'ATL / glossy & sharp' },
  drill: { label: 'Drill', sub: 'UK/CHI / cold & harsh' },
  g_funk: { label: 'G-Funk', sub: 'West Coast / sunset gold' },
  vinyl_press: { label: 'Vinyl Press', sub: 'record sleeve / spine' },
  conscious_jazz: { label: 'Conscious Jazz', sub: 'organic / laid back chords' },
  crunk: { label: 'Crunk', sub: 'heavy brass / high energy' },
  cloud_rap: { label: 'Cloud Rap', sub: 'hazy / ethereal & spaced out' },
  grime: { label: 'Grime', sub: 'UK garage derivative / raw energy' },
  mixtape_era: { label: 'Mixtape Era', sub: 'classic CD booklet / raw' },
};

export interface PictureArtPreset {
  id: string;
  name: string;
  category: 'hardware' | 'urban' | 'abstract' | 'retro';
  previewGradient: string;
  render: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

const PICTURE_ART_PRESETS: PictureArtPreset[] = [
  {
    id: 'tape_reel',
    name: 'Analog Reel Deck',
    category: 'hardware',
    previewGradient: 'from-amber-900 to-black',
    render: (ctx, w, h) => {
      // Vintage Tape Reel photo-style rendering
      ctx.fillStyle = '#0a0908';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#3d2b1f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.38, 0, Math.PI * 2);
      ctx.stroke();
      
      // Dual Reel Flanges
      const r = w * 0.16;
      [w * 0.32, w * 0.68].forEach(cx => {
        const grad = ctx.createRadialGradient(cx, h / 2, 5, cx, h / 2, r);
        grad.addColorStop(0, '#d97706');
        grad.addColorStop(0.5, '#451a03');
        grad.addColorStop(1, '#000000');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, h / 2, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f59e0b';
        ctx.stroke();
        // Spokes
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
          ctx.beginPath();
          ctx.moveTo(cx, h / 2);
          ctx.lineTo(cx + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
          ctx.stroke();
        }
      });
    }
  },
  {
    id: 'mpc_drum_pad',
    name: 'MPC 16-Pad Grid',
    category: 'hardware',
    previewGradient: 'from-gray-800 to-[#121215]',
    render: (ctx, w, h) => {
      ctx.fillStyle = '#121215';
      ctx.fillRect(0, 0, w, h);
      // 4x4 Pads
      const margin = 80;
      const padSize = (w - margin * 2 - 36) / 4;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const px = margin + c * (padSize + 12);
          const py = margin + r * (padSize + 12);
          const isHit = (r === 2 && c === 1) || (r === 3 && c === 0);
          ctx.fillStyle = isHit ? '#f97316' : '#222228';
          ctx.strokeStyle = isHit ? '#fdba74' : '#33333e';
          ctx.lineWidth = 2;
          ctx.fillRect(px, py, padSize, padSize);
          ctx.strokeRect(px, py, padSize, padSize);
        }
      }
    }
  },
  {
    id: 'cyber_neon_city',
    name: 'Cyberpunk Neon Street',
    category: 'urban',
    previewGradient: 'from-purple-900 via-pink-900 to-blue-950',
    render: (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#581c87');
      grad.addColorStop(1, '#0284c7');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Grid Perspective Floor
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.35)';
      ctx.lineWidth = 1.5;
      for (let x = -w; x < w * 2; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(w / 2, h * 0.45);
        ctx.stroke();
      }
      for (let y = h * 0.45; y < h; y += (y - h * 0.4) * 0.25) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }
  },
  {
    id: 'obsidian_fluid',
    name: 'Obsidian Liquid Aura',
    category: 'abstract',
    previewGradient: 'from-orange-950 via-zinc-900 to-black',
    render: (ctx, w, h) => {
      ctx.fillStyle = '#08080a';
      ctx.fillRect(0, 0, w, h);
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 10, w * 0.5, h * 0.5, w * 0.6);
      grad.addColorStop(0, 'rgba(249, 115, 22, 0.4)');
      grad.addColorStop(0.4, 'rgba(168, 85, 247, 0.2)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  },
  {
    id: 'g_funk_sunset',
    name: 'G-Funk West Coast Gold',
    category: 'retro',
    previewGradient: 'from-amber-500 via-orange-600 to-purple-950',
    render: (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#f59e0b');
      grad.addColorStop(0.5, '#ea580c');
      grad.addColorStop(1, '#3b0764');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Palm tree silhouettes
      ctx.fillStyle = '#09090b';
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.45, 60, 0, Math.PI * 2);
      ctx.fill();
    }
  }
];

const CANVAS_SIZE = 600;

export const CoverArtGenerator: React.FC<CoverArtGeneratorProps> = ({
  options,
  onChange,
  onExportDataUrl,
  onImportFromDrive,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Map legacy theme strings to HipHopEra if options.era is missing
  const era: HipHopEra = useMemo(() => {
    if (options.era) return options.era;
    switch (options.theme) {
      case 'cyberpunk': return 'trap';
      case 'gold_analog': return 'golden_era';
      case 'acid_retro': return 'g_funk';
      case 'minimal': return 'vinyl_press';
      case 'obsidian': return 'drill';
      default: return 'boom_bap';
    }
  }, [options.era, options.theme]);

  // Deterministic pipeline execution
  const pipeline: AgentPipelineResult = useMemo(
    () =>
      runCoverArtPipeline({
        title: options.title || 'NEW SOUND KIT',
        producer: options.producer || 'PRODUCER VAULT',
        era,
        seedOverride: options.seedOverride,
      }),
    [options.title, options.producer, era, options.seedOverride]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    const render = () => {
      // Draw background picture art or era background
      if (options.customImageUrl) {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.src = options.customImageUrl;
        img.onload = () => {
          ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
          drawOverlays(ctx, pipeline, options);
        };
        img.onerror = () => {
          drawEraBackground(ctx, CANVAS_SIZE, CANVAS_SIZE, era, pipeline.palette, pipeline.layout);
          drawOverlays(ctx, pipeline, options);
        };
      } else if (options.selectedPicturePreset) {
        const preset = PICTURE_ART_PRESETS.find(p => p.id === options.selectedPicturePreset);
        if (preset) {
          preset.render(ctx, CANVAS_SIZE, CANVAS_SIZE);
        } else {
          drawEraBackground(ctx, CANVAS_SIZE, CANVAS_SIZE, era, pipeline.palette, pipeline.layout);
        }
        drawOverlays(ctx, pipeline, options);
      } else {
        drawEraBackground(ctx, CANVAS_SIZE, CANVAS_SIZE, era, pipeline.palette, pipeline.layout);
        drawOverlays(ctx, pipeline, options);
      }
    };

    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, pipeline, era]);

  const drawOverlays = (
    ctx: CanvasRenderingContext2D,
    pipe: AgentPipelineResult,
    opts: CoverArtOptions
  ) => {
    const { palette, layout, typography } = pipe;
    const width = CANVAS_SIZE;
    const height = CANVAS_SIZE;

    // Additional Texture Overlays (if user selected one explicitly)
    if (opts.overlayTexture === 'vinyl') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let r = 40; r < width / 2 + 100; r += 12) {
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (opts.overlayTexture === 'grid') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i < width; i += 24) {
        ctx.beginPath();
        ctx.moveTo(i, 0); ctx.lineTo(i, height);
        ctx.moveTo(0, i); ctx.lineTo(width, i);
        ctx.stroke();
      }
    } else if (opts.overlayTexture === 'foil') {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, 'rgba(255,255,255,0.08)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.12)');
      grad.addColorStop(1, 'rgba(255,255,255,0.08)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    // Header / producer tag
    ctx.font = `700 16px ${typography.headerFontStack}`;
    ctx.fillStyle = opts.accentColor || palette.accent;
    ctx.textAlign = 'left';
    ctx.fillText((opts.producer || 'PRODUCER VAULT').toUpperCase(), 40, 60);

    ctx.strokeStyle = opts.accentColor || palette.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 72);
    ctx.lineTo(160, 72);
    ctx.stroke();

    // Title, positioned per LayoutAgent decision
    ctx.font = `${typography.titleWeight} ${typography.titleSizePx}px ${typography.titleFontStack}`;
    ctx.fillStyle = palette.text;
    (ctx as any).letterSpacing = `${typography.titleTracking}px`;

    const words = (opts.title || 'NEW SOUND KIT').toUpperCase().split(' ');
    const lines = buildLines(words, layout.lineBreakStrategy);
    const { x, yStart, align, lineHeight } = resolveTitleAnchor(
      layout.titleAnchor,
      width,
      height,
      lines.length,
      typography.titleSizePx
    );
    ctx.textAlign = align;
    lines.forEach((line, i) => ctx.fillText(line, x, yStart + i * lineHeight));

    // Subtitle
    ctx.font = `600 18px ${typography.headerFontStack}`;
    ctx.fillStyle = palette.textMuted;
    ctx.textAlign = align;
    ctx.fillText(opts.subtitle || '24-Bit WAV / 100% Royalty Free', x, yStart + lines.length * lineHeight + 30);

    // Badge, positioned per LayoutAgent decision
    if (opts.badgeText) {
      ctx.save();
      ctx.font = '800 12px monospace';
      const badgeLabel = opts.badgeText.toUpperCase();
      const badgeWidth = ctx.measureText(badgeLabel).width + 30;
      const { bx, by } = resolveBadgePosition(layout.badgePosition, width, height, badgeWidth);

      ctx.translate(bx + badgeWidth / 2, by + 16);
      ctx.rotate((layout.rotationDeg * Math.PI) / 180);
      ctx.fillStyle = opts.accentColor || palette.accent;
      ctx.fillRect(-badgeWidth / 2, -16, badgeWidth, 32);
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.fillText(badgeLabel, 0, 4);
      ctx.restore();
    }

    if (onExportDataUrl && canvasRef.current) {
      onExportDataUrl(canvasRef.current.toDataURL('image/png'));
    }
  };

  const buildLines = (words: string[], strategy: string): string[] => {
    if (strategy === 'single-line') return [words.join(' ')];
    if (strategy === 'stacked-each-word') return words;
    // half-split (default)
    if (words.length <= 2) return [words.join(' ')];
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  };

  const resolveTitleAnchor = (
    anchor: string,
    width: number,
    height: number,
    lineCount: number,
    fontSize: number
  ) => {
    const lineHeight = fontSize * 1.15;
    const blockHeight = lineCount * lineHeight;
    switch (anchor) {
      case 'top-left':
        return { x: 40, yStart: 130, align: 'left' as CanvasTextAlign, lineHeight };
      case 'center':
        return { x: width / 2, yStart: height / 2 - blockHeight / 2, align: 'center' as CanvasTextAlign, lineHeight };
      case 'bottom-center':
        return { x: width / 2, yStart: height - 110 - blockHeight, align: 'center' as CanvasTextAlign, lineHeight };
      case 'bottom-left':
      default:
        return { x: 40, yStart: height - 110 - blockHeight, align: 'left' as CanvasTextAlign, lineHeight };
    }
  };

  const resolveBadgePosition = (pos: string, width: number, height: number, badgeWidth: number) => {
    switch (pos) {
      case 'top-left':
        return { bx: 40, by: 40 };
      case 'bottom-right':
        return { bx: width - badgeWidth - 40, by: height - 72 };
      case 'top-right':
      default:
        return { bx: width - badgeWidth - 40, by: 40 };
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      onChange({ ...options, theme: 'custom', customImageUrl: url });
    };
    reader.readAsDataURL(file);
  };

  const handleDriveImport = async () => {
    if (!onImportFromDrive) return;
    setImportError(null);
    setImporting(true);
    try {
      const url = await onImportFromDrive();
      if (url) {
        onChange({ ...options, customImageUrl: url });
      }
    } catch {
      setImportError('Import failed. Check the connection and try again.');
    } finally {
      setImporting(false);
    }
  };

  const rerollSeed = () => {
    onChange({ ...options, seedOverride: pipeline.seed + 1 });
  };

  return (
    <div className="bg-[#121215] border border-[#2A2A2E] rounded-2xl p-5 shadow-2xl flex flex-col md:flex-row gap-6">
      {/* Canvas Preview Box */}
      <div className="flex flex-col items-center gap-3 shrink-0">
        <div className="relative w-64 h-64 rounded-2xl overflow-hidden border-2 border-[#3E3E4A] shadow-2xl group">
          <canvas ref={canvasRef} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-xl bg-white/20 backdrop-blur text-white hover:bg-white/40 transition-colors"
              title="Upload Custom Image"
            >
              <Upload className="w-5 h-5" />
            </button>
            <button
              onClick={handleDriveImport}
              disabled={!onImportFromDrive || importing}
              className="p-2 rounded-xl bg-white/20 backdrop-blur text-white hover:bg-white/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={onImportFromDrive ? 'Import from Drive' : 'Drive import not connected'}
            >
              {onImportFromDrive ? <Cloud className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </button>
          </div>
        </div>
        <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
          600x600 &middot; seed {pipeline.seed}
        </span>
        {importError && <span className="text-[9px] text-red-400">{importError}</span>}
      </div>

      {/* Customization Controls */}
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#2A2A2E]">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-orange-400" />
            <h4 className="text-xs font-bold uppercase tracking-widest text-white">
              Deterministic Hip-Hop Cover Art Designer
            </h4>
          </div>
          <button
            onClick={rerollSeed}
            className="flex items-center gap-1 text-[9px] font-mono text-orange-400 uppercase hover:text-orange-300 transition-colors bg-orange-500/10 border border-orange-500/30 px-2 py-1 rounded-lg"
            title="Reroll layout/palette/type deterministically from this seed"
          >
            <Dice5 className="w-3.5 h-3.5" /> Reroll Seed
          </button>
        </div>

        {/* Era Select — cartridge-slot style cards */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Hip-Hop Era Archetype</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {(Object.keys(ERA_META) as HipHopEra[]).map((eraId) => (
              <button
                key={eraId}
                onClick={() => onChange({ ...options, era: eraId, theme: eraId })}
                className={`text-left py-2 px-2.5 rounded-lg border transition-all ${
                  era === eraId
                    ? 'bg-orange-500 text-black border-orange-400 font-extrabold'
                    : 'bg-[#1A1A1E] border-[#2A2A2E] text-gray-300 hover:border-gray-500'
                }`}
              >
                <div className="text-[10px] uppercase tracking-wider">{ERA_META[eraId].label}</div>
                <div className={`text-[8px] uppercase tracking-wide ${era === eraId ? 'text-black/70' : 'text-gray-500'}`}>
                  {ERA_META[eraId].sub}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Picture Art Gallery & Photo Options */}
        <div className="space-y-2 pt-1 border-t border-[#2A2A2E]">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Picture Art & Photo Options
            </label>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1 bg-[#1A1A1E] hover:bg-[#2A2A2E] border border-[#3A3A3E] text-orange-400 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors"
            >
              <Upload className="w-3 h-3" />
              <span>Upload Picture</span>
            </button>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <button
              onClick={() => onChange({ ...options, selectedPicturePreset: undefined, customImageUrl: undefined })}
              className={`p-2 rounded-lg border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                !options.selectedPicturePreset && !options.customImageUrl
                  ? 'bg-orange-500 text-black border-orange-400 font-extrabold'
                  : 'bg-[#1A1A1E] border-[#2A2A2E] text-gray-400 hover:text-white'
              }`}
            >
              <span className="text-[9px] uppercase font-bold">Default</span>
              <span className="text-[7px] opacity-75">Era Vector</span>
            </button>

            {PICTURE_ART_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => onChange({ ...options, selectedPicturePreset: preset.id, customImageUrl: undefined })}
                className={`p-1.5 rounded-lg border text-left transition-all relative overflow-hidden group ${
                  options.selectedPicturePreset === preset.id
                    ? 'bg-orange-500/20 border-orange-500 text-white font-bold'
                    : 'bg-[#1A1A1E] border-[#2A2A2E] text-gray-400 hover:text-white'
                }`}
              >
                <div className={`w-full h-7 rounded bg-gradient-to-br ${preset.previewGradient} mb-1 border border-white/10`} />
                <div className="text-[8px] uppercase tracking-wider truncate font-bold leading-tight">{preset.name}</div>
              </button>
            ))}
          </div>

          {options.customImageUrl && (
            <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 p-2 rounded-lg text-[10px] text-amber-300 font-mono">
              <span>Active Uploaded Photo Attached</span>
              <button
                onClick={() => onChange({ ...options, customImageUrl: undefined })}
                className="text-red-400 hover:text-red-300 font-bold uppercase text-[9px]"
              >
                Remove Custom Photo
              </button>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />

        {/* Text Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Kit Title</label>
            <input
              type="text"
              value={options.title}
              onChange={(e) => onChange({ ...options, title: e.target.value })}
              placeholder="e.g. OBSIDIAN 808 VAULT"
              className="w-full bg-[#1A1A1E] border border-[#2A2A2E] rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-orange-500 font-bold"
            />
          </div>

          <div>
            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Producer / Studio Brand</label>
            <input
              type="text"
              value={options.producer}
              onChange={(e) => onChange({ ...options, producer: e.target.value })}
              placeholder="e.g. SONIK AUDIO LABS"
              className="w-full bg-[#1A1A1E] border border-[#2A2A2E] rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Subtitle / Format Specs</label>
            <input
              type="text"
              value={options.subtitle || ''}
              onChange={(e) => onChange({ ...options, subtitle: e.target.value })}
              placeholder="e.g. 50+ Analog Kicks & Sub 808s"
              className="w-full bg-[#1A1A1E] border border-[#2A2A2E] rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Badge Text Stamp</label>
            <input
              type="text"
              value={options.badgeText || ''}
              onChange={(e) => onChange({ ...options, badgeText: e.target.value })}
              placeholder="e.g. 100% ROYALTY FREE"
              className="w-full bg-[#1A1A1E] border border-[#2A2A2E] rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-orange-500 font-mono"
            />
          </div>
        </div>

        {/* Texture & Accent override */}
        <div className="flex items-center gap-4 pt-1">
          <div className="flex-1">
            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Texture Overlay</label>
            <div className="flex gap-2">
              {[
                { id: 'none', label: 'Clean' },
                { id: 'vinyl', label: 'Vinyl Grooves' },
                { id: 'grid', label: 'Cyber Grid' },
                { id: 'foil', label: 'Foil Glaze' },
              ].map((tex) => (
                <button
                  key={tex.id}
                  onClick={() => onChange({ ...options, overlayTexture: tex.id as any })}
                  className={`px-2.5 py-1 rounded text-[9px] font-bold uppercase transition-all ${
                    options.overlayTexture === tex.id
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
                      : 'bg-[#1A1A1E] text-gray-400 hover:text-white border border-[#2A2A2E]'
                  }`}
                >
                  {tex.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Accent Color
            </label>
            <input
              type="color"
              value={options.accentColor || pipeline.palette.accent}
              onChange={(e) => onChange({ ...options, accentColor: e.target.value })}
              className="w-8 h-8 rounded border border-[#2A2A2E] bg-transparent cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
