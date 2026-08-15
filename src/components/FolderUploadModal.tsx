/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { BatchProcessOptions, SoundKitSample, SampleCategory, StyleProfile, VariantProfile } from '../types';
import { analyzeAudioBuffer, processAudioBuffer, generateVariants } from '../lib/batchAudioProcessor';
import { audioEngine } from '../audio/AudioEngine';
import { Knob } from './Knob';
import {
  FolderOpen,
  Zap,
  CheckCircle2,
  Sliders,
  Layers,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Upload,
  X,
  Play,
  Square,
} from 'lucide-react';

interface WaveformProps {
  buffer: AudioBuffer;
  height?: number;
  color?: string;
  transientColor?: string;
  transientSharpness?: number;
}

export const StagedSampleWaveform: React.FC<WaveformProps> = ({
  buffer,
  height = 24,
  color = '#0ea5e9', // sky-500
  transientColor = '#f59e0b', // amber-500
  transientSharpness = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.offsetWidth || 120;
    const computedHeight = height;
    canvas.width = width * dpr;
    canvas.height = computedHeight * dpr;
    ctx.scale(dpr, dpr);

    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = computedHeight / 2;

    ctx.clearRect(0, 0, width, computedHeight);

    // Draw baseline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, amp);
    ctx.lineTo(width, amp);
    ctx.stroke();

    // Draw waveform bars
    ctx.fillStyle = color;
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j] || 0;
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      
      const y = (1 + min) * amp;
      const h = Math.max(1, (max - min) * amp);
      ctx.fillRect(i, y, 1.5, h);
    }

    // Draw transient marker if transient is sharp
    if (transientSharpness && transientSharpness > 4) {
      ctx.fillStyle = transientColor;
      ctx.fillRect(0, 0, 2.5, computedHeight);
    }
  }, [buffer, color, height, transientColor, transientSharpness]);

  return <canvas ref={canvasRef} className="w-28 h-6 rounded bg-[#101014] border border-[#202025]/50 overflow-hidden" style={{ minWidth: '110px' }} />;
};

interface FolderUploadModalProps {
  onAddSamplesToKit: (samples: SoundKitSample[]) => void;
  onClose?: () => void; // modal close / exit handler
}

interface StagedFileItem {
  id: string;
  file: File;
  name: string;
  category: SampleCategory;
  rawBuffer: AudioBuffer;
  processedBuffer?: AudioBuffer;
  selected: boolean;
  applyFx: boolean;
  analysis: ReturnType<typeof analyzeAudioBuffer>;
}

const CATEGORIES: SampleCategory[] = [
  'Atmospheres', 'Impacts', 'Transitions', 'Glitches', 'FX Elements', 'Percussive FX', 'Melodic FX',
  'Kick', 'Snare', 'HiHat', 'Clap', '808', 'Perc', 'Vox', 'FX', 'Melody', 'Bass',
];

export const FolderUploadModal: React.FC<FolderUploadModalProps> = ({
  onAddSamplesToKit,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const [stagedItems, setStagedItems] = useState<StagedFileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [playingItemId, setPlayingItemId] = useState<string | null>(null);
  const [auditionMode, setAuditionMode] = useState<'raw' | 'processed'>('raw');
  const [errors, setErrors] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showFxSettings, setShowFxSettings] = useState(false);
  const [vibePrompt, setVibePrompt] = useState('OBSIDIAN');

  // Dynamic buffer helper for waveform display
  const getDisplayBuffer = (item: StagedFileItem) => {
    if (auditionMode === 'processed' || item.applyFx) {
      if (item.processedBuffer) {
        return item.processedBuffer;
      }
      const audioCtx = audioEngine.getContext();
      if (audioCtx) {
        try {
          const processed = processAudioBuffer(audioCtx, item.rawBuffer, batchOptions);
          item.processedBuffer = processed;
          return processed;
        } catch (e) {
          console.error('Failed on-the-fly preview generation:', e);
        }
      }
    }
    return item.rawBuffer;
  };

  // Automated Semantic Studio-Naming Assistant
  const handleSmartRebrandNames = (vibe: string) => {
    if (!vibe.trim()) return;
    const cleanVibe = vibe.trim().toUpperCase().replace(/[^A-Z0-9_\s-]/g, '').replace(/\s+/g, '_');
    
    setStagedItems(prev => prev.map((item, idx) => {
      const catShortMap: Record<string, string> = {
        'Kick': 'KICK',
        'Snare': 'SNARE',
        'HiHat': 'HAT',
        'Clap': 'CLAP',
        '808': '808',
        'Perc': 'PERC',
        'Vox': 'VOX',
        'FX': 'FX',
        'Melody': 'LOOP',
        'Bass': 'BASS',
        'Atmospheres': 'ATMOS',
        'Impacts': 'IMPACT',
        'Transitions': 'RISER',
        'Glitches': 'GLITCH',
        'FX Elements': 'FX_HIT',
        'Percussive FX': 'PERC_FX',
        'Melodic FX': 'MEL_FX',
      };
      const shortCat = catShortMap[item.category] || 'HIT';
      const keySuffix = item.analysis.estimatedKey ? `_${item.analysis.estimatedKey.toUpperCase()}` : '';
      const formattedName = `${cleanVibe}_${shortCat}_0${idx + 1}${keySuffix}`;
      return {
        ...item,
        name: formattedName
      };
    }));
  };

  // Audio playback source tracking
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isMountedRef = useRef(true);

  // Batch DSP Options State (FX parameters)
  const [activeProfile, setActiveProfile] = useState<StyleProfile>('Punchy');
  const [variantCount, setVariantCount] = useState(1);
  const [batchOptions, setBatchOptions] = useState<BatchProcessOptions>({
    normalizePeak: true,
    targetPeakDb: -0.1,
    trimSilence: true,
    silenceThresholdDb: -45,
    transientSharpness: 25,
    pitchSemitones: 0,
    tubeDrive: 10,
    highPassFreq: 20,
    lowPassFreq: 20000,
    fadeOutDurationSec: 0.05,
    reverbSpace: 0,
    bitcrushDepth: 0,
    stereoWidening: 100,
  });

  const STYLE_PROFILES: Record<StyleProfile, VariantProfile> = {
    Clean: { name: 'Clean', transientBoost: 0, saturation: 0, eqTilt: 0 },
    Punchy: { name: 'Punchy', transientBoost: 30, saturation: 20, eqTilt: 40 },
    LoFi: { name: 'Lo-Fi', transientBoost: -10, saturation: 50, eqTilt: 100, bitDepth: 12 },
    Soft: { name: 'Soft', transientBoost: -20, saturation: 5, eqTilt: 20 },
    Experimental: { name: 'Experimental', transientBoost: 50, saturation: 80, eqTilt: 200 }
  };

  // Handle ESC key to exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Clean up playback on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (activeSourceRef.current) {
        activeSourceRef.current.onended = null;
        activeSourceRef.current.stop();
        try { activeSourceRef.current.disconnect(); } catch {}
        activeSourceRef.current = null;
      }
    };
  }, []);

  // ---- Load Files & Stage for Auditioning ----

  const processIncomingFiles = async (files: File[]) => {
    const audioFiles = files.filter((f) =>
      /\.(wav|mp3|ogg|flac|aiff|m4a)$/i.test(f.name)
    );
    if (audioFiles.length === 0) return;

    setIsLoadingFiles(true);
    setErrors([]);

    const audioCtx = audioEngine.getContext();
    if (!audioCtx) {
      setErrors(['AudioContext is not available. Click anywhere on the page to unlock audio.']);
      setIsLoadingFiles(false);
      return;
    }

    if (audioCtx.state === 'suspended') {
      try {
        await audioCtx.resume();
      } catch {
        setErrors(['Could not unlock AudioContext.']);
        setIsLoadingFiles(false);
        return;
      }
    }

    const newStaged: StagedFileItem[] = [];

    for (const file of audioFiles) {
      if (!isMountedRef.current) break;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const rawBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        if (!isMountedRef.current) break;
        const analysis = analyzeAudioBuffer(rawBuffer, file.name);

        const cleanName = file.name
          .replace(/\.[^/.]+$/, '')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .toUpperCase();

        newStaged.push({
          id: crypto.randomUUID(),
          file,
          name: cleanName,
          category: analysis.suggestedCategory,
          rawBuffer,
          selected: true,
          applyFx: false,
          analysis,
        });
      } catch (err: any) {
        console.error(`Failed decoding ${file.name}`, err);
        if (isMountedRef.current) {
          setErrors((prev) => [...prev, `${file.name}: ${err && typeof err.message === 'string' ? err.message : 'Decode failed'}`]);
        }
      }
    }

    if (isMountedRef.current) {
      setStagedItems((prev) => {
        // Dedupe on full relative path when available (so `Kick/kick.wav` and
        // `Extra/kick.wav` from one folder-drop are distinct), falling back to
        // the file name. Checks both the existing batch AND within this drop.
        const existingKeys = new Set(prev.map((i) => i.file.webkitRelativePath || i.file.name));
        const seen = new Set<string>();
        const freshUnique = newStaged.filter((i) => {
          const key = i.file.webkitRelativePath || i.file.name;
          if (existingKeys.has(key) || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return [...prev, ...freshUnique];
      });

      setIsLoadingFiles(false);
    }
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processIncomingFiles(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      processIncomingFiles(Array.from(e.dataTransfer.files));
    }
  };

  // ---- Audition Playback ----

  const handleAuditionSample = (item: StagedFileItem) => {
    const audioCtx = audioEngine.getContext();
    if (!audioCtx) return;

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    // Stop current source if playing
    if (activeSourceRef.current) {
      activeSourceRef.current.onended = null;
      activeSourceRef.current.stop();
      try { activeSourceRef.current.disconnect(); } catch {}
      activeSourceRef.current = null;
    }

    if (playingItemId === item.id) {
      setPlayingItemId(null);
      return;
    }

    // Select buffer: Raw or Processed
    let playBuffer = item.rawBuffer;
    if (auditionMode === 'processed' || item.applyFx) {
      if (!item.processedBuffer) {
        // Generate on the fly
        item.processedBuffer = processAudioBuffer(audioCtx, item.rawBuffer, batchOptions);
      }
      playBuffer = item.processedBuffer;
    }

    const source = audioCtx.createBufferSource();
    source.buffer = playBuffer;
    source.connect(audioCtx.destination);
    source.start(0);
    activeSourceRef.current = source;
    setPlayingItemId(item.id);

    source.onended = () => {
      if (activeSourceRef.current === source) activeSourceRef.current = null;
      try { source.disconnect(); } catch {}
      setPlayingItemId((prev) => (prev === item.id ? null : prev));
    };
  };

  // Recalculate processed buffers if FX options change
  const handleFxOptionsChange = (newOpts: BatchProcessOptions) => {
    setBatchOptions(newOpts);
    // Invalidate cached processed buffers so they re-compute on play/compile
    setStagedItems((prev) =>
      prev.map((item) => ({
        ...item,
        processedBuffer: undefined,
      }))
    );
  };

  // ---- Item Toggles & Selection ----

  const toggleSelectAll = (select: boolean) => {
    setStagedItems((prev) => prev.map((item) => ({ ...item, selected: select })));
  };

  const toggleFxAll = (applyFx: boolean) => {
    setStagedItems((prev) => prev.map((item) => ({ ...item, applyFx })));
  };

  const toggleItemSelect = (id: string) => {
    setStagedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const toggleItemFx = (id: string) => {
    setStagedItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, applyFx: !item.applyFx, processedBuffer: undefined }
          : item
      )
    );
  };

  const updateItemName = (id: string, name: string) => {
    setStagedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, name } : item))
    );
  };

  const updateItemCategory = (id: string, category: SampleCategory) => {
    setStagedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, category } : item))
    );
  };

  const removeItem = (id: string) => {
    if (playingItemId === id) {
      activeSourceRef.current?.stop();
      activeSourceRef.current = null;
      setPlayingItemId(null);
    }
    setStagedItems((prev) => prev.filter((item) => item.id !== id));
  };

  // ---- Compile Selected Sounds into Sound Kit ----

  const handleCompileSelectedIntoKit = async () => {
    const selected = stagedItems.filter((i) => i.selected);
    if (selected.length === 0) return;

    const audioCtx = audioEngine.getContext();
    if (!audioCtx) return;

    const compiledSamples: SoundKitSample[] = [];

    try {
      setIsCompiling(true);
      for (const item of selected) {
      if (variantCount > 1) {
        // Generate multiple variants
        const profile = STYLE_PROFILES[activeProfile];
        const variants = await generateVariants(audioCtx, item.rawBuffer, variantCount, profile);
        
        variants.forEach((vBuffer, idx) => {
          const finalAnalysis = analyzeAudioBuffer(vBuffer, item.file.name);
          const variantName = idx === 0 ? 'CLEAN' : idx === 1 ? 'PUNCHY' : idx === 2 ? 'LOFI' : `VAR_${idx}`;
          
          compiledSamples.push({
            id: crypto.randomUUID(),
            name: `${item.name.trim()}_${variantName}`,
            fileName: `${item.file.name.split('.')[0]}_${variantName}.wav`,
            category: item.category,
            tags: [item.category.toLowerCase(), activeProfile.toLowerCase(), variantName.toLowerCase(), 'evolved'],
            key: finalAnalysis.estimatedKey,
            gain: 0.85,
            pitch: 0,
            audioBuffer: vBuffer,
            analysis: finalAnalysis,
            sizeBytes: item.file.size,
          });
        });
      } else {
        // Standard single sample path
        let finalBuffer = item.rawBuffer;
        if (item.applyFx) {
          finalBuffer = item.processedBuffer || processAudioBuffer(audioCtx, item.rawBuffer, batchOptions);
        }

        const finalAnalysis = analyzeAudioBuffer(finalBuffer, item.file.name);

        compiledSamples.push({
          id: crypto.randomUUID(),
          name: item.name.trim() || 'SAMPLE',
          fileName: item.file.name,
          category: item.category,
          tags: [
            item.category.toLowerCase(),
            item.applyFx ? 'analog_dsp' : 'raw_clean',
            'kit_sample',
          ],
          key: finalAnalysis.estimatedKey,
          gain: 0.85,
          pitch: 0,
          audioBuffer: finalBuffer,
          analysis: finalAnalysis,
          sizeBytes: item.file.size,
        });
      }
    }

    onAddSamplesToKit(compiledSamples);

    // Auto close modal on successful compilation
    if (onClose) {
      onClose();
    }
    } catch (err: any) {
      setErrors((prev) => [
        ...prev,
        `Compile failed: ${err && typeof err.message === 'string' ? err.message : 'unknown error'}`,
      ]);
    } finally {
      setIsCompiling(false);
    }
  };

  const selectedCount = stagedItems.filter((i) => i.selected).length;
  const fxCount = stagedItems.filter((i) => i.selected && i.applyFx).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      <div className="bg-[#121215] border border-[#2A2A2E] rounded-2xl p-5 sm:p-6 shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden relative">
        
        {/* Top Header Bar with Explicit Exit Button */}
        <div className="flex items-center justify-between pb-4 border-b border-[#2A2A2E] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <span>Drum Folder Import & Audition Workspace</span>
              </h3>
              <p className="text-[11px] text-gray-400">
                Audition raw vs FX, select individual sounds, tweak optional DSP, and compile into your Sound Kit.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {onClose && (
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-xl bg-[#1A1A1E] border border-[#2A2A2E] hover:border-gray-500 text-xs font-bold text-gray-300 hover:text-white uppercase tracking-wider flex items-center gap-1.5 transition-all"
                title="Exit workspace and return to Kit Studio"
              >
                <X className="w-4 h-4 text-gray-400" />
                <span>Exit Workspace</span>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Main Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-5">
          
          {/* Drop Zone */}
          <div
            ref={dropZoneRef}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragOver(false);
            }}
            className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all ${
              isDragOver
                ? 'border-orange-500 bg-orange-500/10 scale-[1.01]'
                : 'border-[#2A2A2E] bg-[#16161A] hover:bg-[#1A1A1E] hover:border-orange-500/60'
            }`}
          >
            <Upload
              className={`w-8 h-8 mb-2 transition-all ${
                isDragOver ? 'text-orange-400 scale-110' : 'text-gray-500'
              }`}
            />
            <h4 className="text-xs font-bold uppercase tracking-widest text-white">
              {isDragOver ? 'Drop Sound Files Here' : 'Click or Drag Audio Files / Drum Folder Here'}
            </h4>
            <p className="text-[11px] text-gray-500 mt-1 text-center">
              Supports WAV, MP3, FLAC, OGG, AIFF, M4A. Load entire sample libraries or single hits.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".wav,.mp3,.ogg,.flac,.aiff,.m4a"
              // @ts-ignore
              webkitdirectory=""
              directory=""
              onChange={handleFolderSelect}
              className="hidden"
            />
          </div>

          {isLoadingFiles && (
            <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl text-xs font-bold text-orange-300 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-orange-400" />
              <span>Decoding & analyzing audio files for auditioning...</span>
            </div>
          )}

          {errors.length > 0 && (
            <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-3 text-xs text-red-300 space-y-1">
              {errors.map((err, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}

          {/* Staged Items Audition & Selection Section */}
          {stagedItems.length > 0 && (
            <div className="space-y-4">
              
              {/* AI Semantic Naming Panel */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#131316] border border-[#2A2A2E] p-3 rounded-xl shadow-md">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <div>
                    <span className="text-xs font-bold text-white uppercase tracking-wider block">Aesthetic Studio-Naming Assistant</span>
                    <span className="text-[10px] text-gray-400 font-mono">Standardizes names with vibe codes, category initials, and key tags</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                  <input
                    type="text"
                    placeholder="Vibe Name (e.g. DRIFT, TOXIC, DRILL)"
                    value={vibePrompt}
                    onChange={(e) => setVibePrompt(e.target.value)}
                    className="bg-[#1C1C22] border border-[#2A2A2E] rounded px-2.5 py-1 text-xs text-white placeholder-gray-500 font-mono focus:outline-none focus:border-amber-400 min-w-[180px]"
                  />
                  <button
                    onClick={() => handleSmartRebrandNames(vibePrompt)}
                    className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5 fill-current" />
                    <span>Re-brand Names</span>
                  </button>
                </div>
              </div>

              {/* Batch Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1A1A1E] border border-[#2A2A2E] p-3 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleSelectAll(true)}
                      className="px-2.5 py-1 rounded bg-[#25252A] border border-[#3E3E48] hover:border-orange-500 text-[11px] text-white font-bold"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => toggleSelectAll(false)}
                      className="px-2.5 py-1 rounded bg-[#25252A] border border-[#3E3E48] hover:border-gray-500 text-[11px] text-gray-400 hover:text-white"
                    >
                      Deselect All
                    </button>
                  </div>

                  <div className="h-4 w-px bg-[#333]" />

                  {/* Optional FX Global Toggle */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase font-bold text-gray-400">DSP FX:</span>
                    <button
                      onClick={() => toggleFxAll(false)}
                      className="px-2.5 py-1 rounded bg-[#25252A] border border-[#3E3E48] hover:border-sky-500 text-[11px] text-sky-300 font-bold"
                    >
                      Keep All Raw
                    </button>
                    <button
                      onClick={() => toggleFxAll(true)}
                      className="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[11px] hover:bg-amber-500 hover:text-black"
                    >
                      Apply FX to All
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Audition Mode Switcher */}
                  <div className="flex items-center gap-1 bg-[#121215] border border-[#2A2A2E] p-1 rounded-lg">
                    <span className="text-[9px] uppercase font-bold text-gray-500 px-1">Audition:</span>
                    <button
                      onClick={() => setAuditionMode('raw')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        auditionMode === 'raw'
                          ? 'bg-sky-500 text-black'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Raw
                    </button>
                    <button
                      onClick={() => setAuditionMode('processed')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        auditionMode === 'processed'
                          ? 'bg-amber-500 text-black'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      FX Processed
                    </button>
                  </div>

                  <button
                    onClick={() => setShowFxSettings(!showFxSettings)}
                    className="px-3 py-1 rounded-lg bg-[#25252A] border border-[#3E3E48] hover:border-amber-400 text-amber-300 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>{showFxSettings ? 'Hide FX Tweaks' : 'Tweak FX Options'}</span>
                  </button>
                </div>
              </div>

              {/* Collapsible FX Parameters Panel */}
              {showFxSettings && (
                <div className="bg-[#18181C] border border-[#2A2A2E] rounded-xl p-4 space-y-3 animate-fadeIn">
                  <div className="flex items-center justify-between pb-2 border-b border-[#2A2A2E]">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold uppercase tracking-wider text-white">
                        Optional DSP Transformation Controls
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      Changes apply only to sounds with "Apply FX" enabled.
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                    {/* Pipeline Profile */}
                    <div className="bg-[#121215] border border-[#2A2A2E] rounded-xl p-2.5 space-y-1 col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase text-cyan-400">Pipeline Profile</span>
                        <Zap className="w-3.5 h-3.5 text-cyan-500" />
                      </div>
                      <div className="flex gap-1">
                        {Object.keys(STYLE_PROFILES).map((p) => (
                          <button
                            key={p}
                            onClick={() => setActiveProfile(p as StyleProfile)}
                            className={`flex-1 py-1 text-[10px] font-bold rounded ${
                              activeProfile === p 
                                ? 'bg-cyan-500 text-black' 
                                : 'bg-[#1a1a1f] text-gray-500 hover:text-white border border-[#2A2A2E]'
                             }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Variant Count */}
                    <div className="bg-[#121215] border border-[#2A2A2E] rounded-xl p-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-purple-400">Variant Generation</span>
                        <Layers className="w-3.5 h-3.5 text-purple-500" />
                      </div>
                      <select
                        value={variantCount}
                        onChange={(e) => setVariantCount(parseInt(e.target.value))}
                        className="w-full bg-[#1a1a1f] border border-[#2A2A2E] rounded py-1 text-[10px] font-bold text-gray-300 focus:outline-none"
                      >
                        <option value={1}>Single (1)</option>
                        <option value={4}>4 Variants</option>
                        <option value={8}>8 Variants</option>
                        <option value={16}>16 Variants</option>
                      </select>
                    </div>

                    {/* Peak Normalize */}
                    <div className="bg-[#121215] border border-[#2A2A2E] rounded-xl p-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-gray-300">Normalize</span>
                        <input
                           type="checkbox"
                           checked={batchOptions.normalizePeak}
                           onChange={(e) =>
                             handleFxOptionsChange({ ...batchOptions, normalizePeak: e.target.checked })
                           }
                           className="accent-orange-500 cursor-pointer"
                        />
                      </div>
                      <span className="text-[10px] font-mono text-orange-400 block">
                        Target: {batchOptions.targetPeakDb} dBFS
                      </span>
                    </div>

                    {/* Transient Boost */}
                    <div className="bg-[#121215] border border-[#2A2A2E] rounded-xl p-3 flex flex-col items-center justify-center space-y-2 shadow-md">
                      <Knob 
                        label="Transient Punch" 
                        value={batchOptions.transientSharpness || 0} 
                        min={0} 
                        max={100} 
                        step={1}
                        unit="%"
                        color="#f59e0b"
                        onChange={(v) => handleFxOptionsChange({ ...batchOptions, transientSharpness: Math.round(v) })}
                        size={52}
                      />
                    </div>

                    {/* Tube Drive */}
                    <div className="bg-[#121215] border border-[#2A2A2E] rounded-xl p-3 flex flex-col items-center justify-center space-y-2 shadow-md">
                      <Knob 
                        label="Tube Drive" 
                        value={batchOptions.tubeDrive} 
                        min={0} 
                        max={100} 
                        step={1}
                        unit="%"
                        color="#f43f5e"
                        onChange={(v) => handleFxOptionsChange({ ...batchOptions, tubeDrive: Math.round(v) })}
                        size={52}
                      />
                    </div>

                    {/* Pitch Shift */}
                    <div className="bg-[#121215] border border-[#2A2A2E] rounded-xl p-3 flex flex-col items-center justify-center space-y-2 shadow-md">
                      <Knob 
                        label="Pitch Shift" 
                        value={batchOptions.pitchSemitones} 
                        min={-12} 
                        max={12} 
                        step={1}
                        unit="ST"
                        color="#0ea5e9"
                        onChange={(v) => handleFxOptionsChange({ ...batchOptions, pitchSemitones: Math.round(v) })}
                        size={52}
                      />
                    </div>

                    {/* Reverb Space */}
                    <div className="bg-[#121215] border border-[#2A2A2E] rounded-xl p-3 flex flex-col items-center justify-center space-y-2 shadow-md">
                      <Knob 
                        label="Reverb Space" 
                        value={batchOptions.reverbSpace || 0} 
                        min={0} 
                        max={100} 
                        step={1}
                        unit="%"
                        color="#a855f7"
                        onChange={(v) => handleFxOptionsChange({ ...batchOptions, reverbSpace: Math.round(v) })}
                        size={52}
                      />
                    </div>

                    {/* Bitcrush Decimation */}
                    <div className="bg-[#121215] border border-[#2A2A2E] rounded-xl p-3 flex flex-col items-center justify-center space-y-2 shadow-md">
                      <Knob 
                        label="Bitcrusher" 
                        value={batchOptions.bitcrushDepth || 0} 
                        min={0} 
                        max={100} 
                        step={1}
                        unit="%"
                        color="#10b981"
                        onChange={(v) => handleFxOptionsChange({ ...batchOptions, bitcrushDepth: Math.round(v) })}
                        size={52}
                      />
                    </div>

                    {/* Stereo Widening */}
                    <div className="bg-[#121215] border border-[#2A2A2E] rounded-xl p-3 flex flex-col items-center justify-center space-y-2 shadow-md">
                      <Knob 
                        label="Stereo Width" 
                        value={batchOptions.stereoWidening === undefined ? 100 : batchOptions.stereoWidening} 
                        min={0} 
                        max={200} 
                        step={5}
                        unit="%"
                        color="#06b6d4"
                        onChange={(v) => handleFxOptionsChange({ ...batchOptions, stereoWidening: Math.round(v) })}
                        size={52}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Staged Samples Audition Table */}
              <div className="bg-[#16161A] border border-[#2A2A2E] rounded-xl overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="border-b border-[#2A2A2E] bg-[#121215] text-[10px] font-bold text-gray-400 uppercase tracking-wider sticky top-0 z-10">
                      <th className="p-2.5 text-center w-10">Select</th>
                      <th className="p-2.5 w-12 text-center">Listen</th>
                      <th className="p-2.5">Sample Name</th>
                      <th className="p-2.5">Category</th>
                      <th className="p-2.5 text-center">Waveform</th>
                      <th className="p-2.5 w-24 text-center">FX Opt-In</th>
                      <th className="p-2.5 text-center">Key</th>
                      <th className="p-2.5 text-center">Peak</th>
                      <th className="p-2.5 text-center">Transient</th>
                      <th className="p-2.5 text-right pr-3">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2A2A2E]">
                    {stagedItems.map((item) => (
                      <tr
                        key={item.id}
                        className={`hover:bg-[#1C1C22] transition-colors ${
                          item.selected ? 'bg-[#18181F]' : 'opacity-60'
                        }`}
                      >
                        {/* Select Checkbox */}
                        <td className="p-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => toggleItemSelect(item.id)}
                            className="accent-orange-500 cursor-pointer w-4 h-4"
                          />
                        </td>

                        {/* Play / Audition */}
                        <td className="p-2.5 text-center">
                          <button
                            onClick={() => handleAuditionSample(item)}
                            className={`p-1.5 rounded-lg border transition-all ${
                              playingItemId === item.id
                                ? 'bg-orange-500 text-black border-orange-400'
                                : 'bg-[#222228] border-[#3E3E48] text-gray-200 hover:text-white'
                            }`}
                            title="Audition sound"
                          >
                            {playingItemId === item.id ? (
                              <Square className="w-3.5 h-3.5 fill-current" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current" />
                            )}
                          </button>
                        </td>

                        {/* Editable Name */}
                        <td className="p-2.5">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateItemName(item.id, e.target.value)}
                            className="bg-transparent border-b border-transparent hover:border-[#444] focus:border-orange-500 text-white font-bold text-xs focus:outline-none px-1 py-0.5"
                          />
                        </td>

                        {/* Category Dropdown */}
                        <td className="p-2.5">
                          <select
                            value={item.category}
                            onChange={(e) => updateItemCategory(item.id, e.target.value as SampleCategory)}
                            className="bg-[#222228] border border-[#3E3E48] rounded px-2 py-0.5 text-[11px] text-orange-400 font-bold focus:outline-none"
                          >
                            {CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Real-time Waveform Rendering */}
                        <td className="p-2.5 text-center">
                          <div className="flex justify-center items-center">
                            <StagedSampleWaveform 
                              buffer={getDisplayBuffer(item)} 
                              transientSharpness={item.applyFx ? batchOptions.transientSharpness : 0} 
                              color={item.applyFx ? '#06b6d4' : '#38bdf8'}
                            />
                          </div>
                        </td>

                        {/* Apply FX Toggle */}
                        <td className="p-2.5 text-center">
                          <button
                            onClick={() => toggleItemFx(item.id)}
                            className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${
                              item.applyFx
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-[#222] text-gray-400 border-[#333]'
                            }`}
                          >
                            {item.applyFx ? '+ FX ON' : 'RAW (OFF)'}
                          </button>
                        </td>

                        {/* Acoustic Details */}
                        <td className="p-2.5 text-center text-sky-400 font-bold">
                          {item.analysis.estimatedKey || '—'}
                        </td>
                        <td className="p-2.5 text-center text-gray-300">
                          {item.analysis.peakDb} dB
                        </td>
                        <td className="p-2.5 text-center text-amber-400">
                          {item.analysis.transientSharpness}/10
                        </td>

                        {/* Remove */}
                        <td className="p-2.5 text-right pr-3">
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                            title="Remove from workspace"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions: Compile into Kit + Exit */}
        <div className="pt-4 border-t border-[#2A2A2E] flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
          <div className="text-xs text-gray-400 font-mono">
            <span>{selectedCount} sound(s) selected</span>
            {fxCount > 0 && <span className="text-amber-400 ml-2">({fxCount} with FX)</span>}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-[#1A1A1E] border border-[#2A2A2E] hover:border-gray-500 text-xs font-bold text-gray-300 uppercase tracking-wider transition-all"
              >
                Back to Kit Studio
              </button>
            )}

            <button
              onClick={handleCompileSelectedIntoKit}
              disabled={isCompiling || selectedCount === 0}
              className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-black font-extrabold text-xs uppercase tracking-widest hover:opacity-95 shadow-[0_0_20px_rgba(242,125,38,0.3)] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isCompiling ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-black" />
                  <span>Compiling Kit Folder...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-black" />
                  <span>Compile {selectedCount} Sounds into Kit Folder</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
