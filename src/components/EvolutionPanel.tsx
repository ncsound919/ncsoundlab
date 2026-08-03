/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  RefreshCw, 
  Plus, 
  Play, 
  Square,
  Trash2, 
  Zap,
  Layers,
  Upload,
  FileAudio,
  Drum,
  Loader2
} from 'lucide-react';
import { EvolutionVariation, SoundLayer } from '../types';
import { audioEngine } from '../lib/audioEngine';
import { generateEvolutionVariations, FXEvolutionOption } from '../lib/evolutionEngine';

interface EvolutionPanelProps {
  variations: EvolutionVariation[];
  onAddLayer: (variation: EvolutionVariation) => void;
  onSaveToKit: (variation: EvolutionVariation) => void;
  onReEvolve: (mode?: 'mutations' | 'melodic' | 'kit', fxOption?: FXEvolutionOption) => void;
  onDiscard?: (id: string) => void;
  isEvolving: boolean;
  onSetVariations?: (variations: EvolutionVariation[]) => void;
  onSendToPads?: (sounds: { name: string; buffer: AudioBuffer }[]) => void;
}

export const EvolutionPanel: React.FC<EvolutionPanelProps> = ({
  variations,
  onAddLayer,
  onSaveToKit,
  onReEvolve,
  onDiscard,
  isEvolving,
  onSetVariations,
  onSendToPads,
}) => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Batch Field Recording Upload & Evolution Engine States
  const [uploadedBatch, setUploadedBatch] = useState<{ id: string; name: string; buffer: AudioBuffer; isEvolving: boolean }[]>([]);
  const [isDecodingBatch, setIsDecodingBatch] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [playingRawId, setPlayingRawId] = useState<string | null>(null);
  const [isBatchEvolving, setIsBatchEvolving] = useState(false);
  const [evolutionMode, setEvolutionMode] = useState<'mutations' | 'melodic' | 'kit'>('mutations');
  const [fxOption, setFxOption] = useState<FXEvolutionOption>('mutate');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddFiles = async (files: File[]) => {
    const audioCtx = audioEngine.getContext();
    if (!audioCtx) return;
    setIsDecodingBatch(true);
    
    const newFiles: { id: string; name: string; buffer: AudioBuffer; isEvolving: boolean }[] = [];
    for (const file of files) {
      if (!file.type.startsWith('audio/') && !file.name.endsWith('.wav') && !file.name.endsWith('.mp3')) continue;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        const cleanName = file.name.replace(/\.[^/.]+$/, '').toUpperCase();
        newFiles.push({
          id: crypto.randomUUID(),
          name: cleanName,
          buffer: decoded,
          isEvolving: false,
        });
      } catch (e) {
        console.error('Failed to decode batch file:', file.name, e);
      }
    }
    setUploadedBatch(prev => [...prev, ...newFiles]);
    setIsDecodingBatch(false);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      handleAddFiles(Array.from(e.dataTransfer.files));
    }
  };

  const playRawBuffer = (id: string, buffer: AudioBuffer) => {
    if (playingRawId === id) {
      audioEngine.stop();
      setPlayingRawId(null);
      return;
    }
    audioEngine.stop();
    const ctx = audioEngine.getContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    setPlayingRawId(id);
    source.onended = () => {
      setPlayingRawId(prev => prev === id ? null : prev);
    };
  };

  const handleEvolveRecording = async (rec: typeof uploadedBatch[0]) => {
    const ctx = audioEngine.getContext();
    if (!ctx) return;
    
    setUploadedBatch(prev => prev.map(item => item.id === rec.id ? { ...item, isEvolving: true } : item));
    try {
      const generated = await generateEvolutionVariations(ctx, rec.buffer, 6, 0.6, evolutionMode, fxOption);
      const prefixed = generated.map((v, idx) => ({ 
        ...v, 
        name: `${rec.name} // MT-${idx + 1}`
      }));
      if (onSetVariations) {
        onSetVariations([...prefixed, ...variations]);
      }
    } catch (e) {
      console.error('Failed to evolve individual recording:', e);
    } finally {
      setUploadedBatch(prev => prev.map(item => item.id === rec.id ? { ...item, isEvolving: false } : item));
    }
  };

  const handleEvolveEntireBatch = async () => {
    const ctx = audioEngine.getContext();
    if (!ctx || uploadedBatch.length === 0) return;
    setIsBatchEvolving(true);
    try {
      let allNewVariations: EvolutionVariation[] = [];
      for (const rec of uploadedBatch) {
        const generated = await generateEvolutionVariations(ctx, rec.buffer, 3, 0.65, evolutionMode, fxOption);
        const prefixed = generated.map((v, idx) => ({ 
          ...v, 
          name: `${rec.name} // MT-${idx + 1}`
        }));
        allNewVariations = [...allNewVariations, ...prefixed];
      }
      if (onSetVariations) {
        onSetVariations([...allNewVariations, ...variations]);
      }
    } catch (e) {
      console.error('Failed to evolve entire batch:', e);
    } finally {
      setIsBatchEvolving(false);
    }
  };

  const removeRawRecording = (id: string) => {
    setUploadedBatch(prev => prev.filter(item => item.id !== id));
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handlePreview = (variation: EvolutionVariation) => {
    if (!variation.buffer) return;

    if (playingId === variation.id) {
      audioEngine.stop();
      setPlayingId(null);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      return;
    }

    // Stop any currently playing sound first
    audioEngine.stop();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    setPlayingId(variation.id);

    const tempLayer: SoundLayer = {
      id: variation.id,
      name: `Mutant_${variation.id.slice(0, 4)}`,
      type: 'sample',
      enabled: true,
      gain: 0.8,
      pan: 0,
      pitch: 0,
      envelope: { attack: 0.01, decay: 0.2, sustain: 1.0, release: 0.5 },
      fx: { 
        distortion: 0, 
        bitcrush: 0, 
        filterFreq: 20000, 
        filterRes: 1, 
        filterType: 'lowpass', 
        delayTime: 0, 
        delayFeedback: 0, 
        reverbMix: 0, 
        chorusMix: 0, 
        compressorThreshold: 0, 
        compressorRatio: 1 
      },
      audioBuffer: variation.buffer
    };

    audioEngine.playLayer(tempLayer);

    const durationMs = (variation.buffer.duration ?? 2) * 1000;
    timeoutRef.current = setTimeout(() => {
      setPlayingId((prev) => (prev === variation.id ? null : prev));
    }, durationMs + 200);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-cyan-400 uppercase tracking-[0.2em] flex items-center gap-3">
            <Sparkles className="w-8 h-8" />
            Sound Evolution Engine
          </h2>
          <p className="text-sm text-gray-500 font-medium">
            Mutating source material through multi-state chaotic synthesis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Mode Selector */}
          <div className="flex items-center gap-1 bg-[#0F0F11] border border-[#2A2A2E] rounded-lg p-1">
            {(['mutations', 'melodic', 'kit'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setEvolutionMode(mode)}
                className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${
                  evolutionMode === mode 
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' 
                    : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                }`}
              >
                {mode === 'mutations' ? 'Mutations' : mode === 'melodic' ? 'Melodic Set' : 'Drum Kit'}
              </button>
            ))}
          </div>

          {/* FX Mutation Mode Control */}
          <div className="flex items-center gap-1 bg-[#0F0F11] border border-[#2A2A2E] rounded-lg p-1">
            {([
              { id: 'mutate', label: '⚡ Mutate All' },
              { id: 'freeze', label: '❄️ Freeze FX' },
              { id: 'fx_only', label: '🎛️ Change FX Only' }
            ] as const).map(opt => (
              <button
                key={opt.id}
                onClick={() => setFxOption(opt.id)}
                className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${
                  fxOption === opt.id 
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                    : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => onReEvolve(evolutionMode, fxOption)}
            disabled={isEvolving}
            className="px-6 py-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-xl flex items-center gap-3 transition-all group disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 text-cyan-400 ${isEvolving ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
            <span className="text-xs font-bold text-cyan-300 uppercase tracking-widest">
              {isEvolving ? 'Evolving...' : 'Generate New Generation'}
            </span>
          </button>

          {onSendToPads && variations.length > 0 && (
            <button
              onClick={() => onSendToPads(variations.map((v) => ({ name: v.name, buffer: v.buffer })))}
              className="px-6 py-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl flex items-center gap-3 transition-all group"
              title="Send these variations to the MPC pads as a program"
            >
              <Drum className="w-5 h-5 text-rose-400" />
              <span className="text-xs font-bold text-rose-300 uppercase tracking-widest">Send to Pads</span>
            </button>
          )}
        </div>
      </div>

      {/* Cyberpunk Batch Ingest Dropzone & Stage Panel */}
      <div className="bg-[#0b0b0d] border border-[#1e293b] rounded-2xl p-5 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#1e293b] pb-3 gap-2">
          <div className="flex items-center gap-2">
            <span className="p-1 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-bold font-mono">
              BATCH
            </span>
            <div>
              <div className="text-xs font-black text-white uppercase tracking-wider">
                Field Recordings & Batch Samples Ingestion
              </div>
              <p className="text-[10px] text-gray-500">
                Drag batches of audio recordings into the evolution engine to generate custom mutated kits
              </p>
            </div>
          </div>
          
          {uploadedBatch.length > 0 && (
            <button
              onClick={handleEvolveEntireBatch}
              disabled={isBatchEvolving}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 disabled:from-gray-800 disabled:to-gray-800 text-black text-[10px] font-black uppercase rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-cyan-500/10"
            >
              {isBatchEvolving ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  <span>Evolving Batch...</span>
                </>
              ) : (
                <>
                  <Sparkles size={12} />
                  <span>Evolve Entire Batch ({uploadedBatch.length})</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Drag & Drop zone */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
            isDragOver 
              ? 'border-cyan-500 bg-cyan-500/5 text-cyan-300' 
              : 'border-[#1e293b] bg-[#070709] hover:border-gray-700 text-gray-400'
          }`}
        >
          <input 
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleAddFiles(Array.from(e.target.files));
            }}
          />
          <Upload size={24} className={isDragOver ? 'text-cyan-400 animate-bounce' : 'text-gray-500'} />
          <div className="text-xs font-bold uppercase tracking-wider">
            {isDecodingBatch ? 'Decoding Audio Files...' : 'Drop Field Recordings here or Click to Browse'}
          </div>
          <p className="text-[9px] text-gray-500 font-mono">
            Supports WAV, MP3, AIFF up to 48kHz (Select multiple files to upload in batches)
          </p>
        </div>

        {/* Uploaded Files Stage */}
        {uploadedBatch.length > 0 && (
          <div className="space-y-2">
            <div className="text-[9px] text-gray-500 font-extrabold uppercase tracking-widest px-1">
              Staged Recordings ({uploadedBatch.length})
            </div>
            <div className="max-h-[220px] overflow-y-auto custom-scrollbar border border-[#1e293b] rounded-xl bg-black divide-y divide-[#121926]">
              {uploadedBatch.map((rec) => (
                <div key={rec.id} className="flex items-center justify-between p-3 hover:bg-[#070709] transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-1.5 bg-cyan-500/5 border border-cyan-500/20 text-cyan-400 rounded-lg shrink-0">
                      <FileAudio size={14} />
                    </div>
                    <div className="truncate text-left">
                      <span className="text-[11px] font-bold text-gray-200 block truncate leading-tight">
                        {rec.name}
                      </span>
                      <span className="text-[9px] text-gray-500 font-mono block">
                        {(rec.buffer.duration).toFixed(2)}s • {rec.buffer.sampleRate}Hz • {rec.buffer.numberOfChannels}Ch
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Raw Audition Button */}
                    <button
                      onClick={() => playRawBuffer(rec.id, rec.buffer)}
                      className={`px-2.5 py-1.5 border rounded-lg text-[9px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1 ${
                        playingRawId === rec.id
                          ? 'bg-cyan-500 border-cyan-500 text-black shadow-lg shadow-cyan-500/10'
                          : 'bg-[#0f0f12] border-[#1e293b] text-gray-400 hover:text-white'
                      }`}
                      title="Audition raw unmodified field recording"
                    >
                      {playingRawId === rec.id ? <Square size={10} className="fill-current" /> : <Play size={10} />}
                      <span>Audition</span>
                    </button>

                    {/* Evolve Mutant variants button */}
                    <button
                      onClick={() => handleEvolveRecording(rec)}
                      disabled={rec.isEvolving}
                      className="px-2.5 py-1.5 bg-[#0a151b] hover:bg-[#0f242e] border border-cyan-500/20 hover:border-cyan-400 text-cyan-400 font-black text-[9px] uppercase tracking-wider rounded-lg transition-all flex items-center gap-1"
                      title="Generate 6 unique mutated variations of this recording"
                    >
                      {rec.isEvolving ? (
                        <>
                          <Loader2 size={10} className="animate-spin" />
                          <span>Evolving...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={10} />
                          <span>Evolve x6</span>
                        </>
                      )}
                    </button>

                    {/* Discard button */}
                    <button
                      onClick={() => removeRawRecording(rec.id)}
                      className="p-2 bg-[#121215] hover:bg-rose-950/20 border border-[#1e1e22] hover:border-rose-900 text-gray-500 hover:text-rose-400 rounded-lg transition-all"
                      title="Remove from batch"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mutant Variations Pool Section Header */}
      <div className="border-b border-[#1e293b] pb-2">
        <h3 className="text-xs font-extrabold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
          <Zap size={12} className="text-cyan-400" />
          Mutant Variations Pool ({variations.length})
        </h3>
      </div>

      {/* Variation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {variations.length === 0 && !isEvolving && (
          <div className="col-span-full py-20 border-2 border-dashed border-[#1f1f23] rounded-3xl flex flex-col items-center justify-center space-y-4">
            <div className="p-4 bg-[#1f1f23] rounded-full">
              <Zap className="w-8 h-8 text-gray-600" />
            </div>
            <p className="text-gray-500 text-sm font-medium">No variations generated yet. Select a layer and evolve it.</p>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {variations.map((v, idx) => (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ delay: idx * 0.02 }}
              className="bg-[#0f0f12] border border-[#1f1f23] hover:border-cyan-500/50 rounded-2xl p-5 group transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="space-y-1">
                  <div className="text-[10px] text-cyan-500 font-black uppercase tracking-tighter">
                    {v.role ? `${v.role} (Mutant)` : `Mutant Generation ${idx + 1}`}
                  </div>
                  <h3 className="text-sm font-bold text-gray-200">
                    {v.name || v.id.slice(0, 8).toUpperCase()}
                  </h3>
                </div>
                <div className="flex gap-1.5">
                  <button 
                    onClick={() => handlePreview(v)}
                    title={playingId === v.id ? "Stop preview" : "Preview mutant"}
                    className={`p-2 rounded-lg transition-colors ${
                      playingId === v.id
                        ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(34,211,238,0.5)]'
                        : 'bg-[#1a1a1f] hover:bg-cyan-500/20 text-gray-400 hover:text-cyan-400'
                    }`}
                  >
                    {playingId === v.id ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button 
                    onClick={() => onAddLayer(v)}
                    title="Add as Layer"
                    className="p-2 bg-[#1a1a1f] hover:bg-emerald-500/20 text-gray-400 hover:text-emerald-400 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => onSaveToKit(v)}
                    title="Save to Kit"
                    className="p-2 bg-[#1a1a1f] hover:bg-purple-500/20 text-gray-400 hover:text-purple-400 rounded-lg transition-colors"
                  >
                    <Layers className="w-4 h-4" />
                  </button>
                  {onDiscard && (
                    <button 
                      onClick={() => onDiscard(v.id)}
                      title="Discard mutant"
                      className="p-2 bg-[#1a1a1f] hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Stats / Parameters */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-[#0a0a0c] p-2 rounded-lg border border-[#1f1f23]">
                  <div className="text-[8px] text-gray-600 uppercase font-black tracking-widest mb-1">Chaos</div>
                  <div className="h-1 bg-gray-900 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.5)]" 
                      style={{ width: `${v.chaosLevel * 100}%` }} 
                    />
                  </div>
                </div>
                <div className="bg-[#0a0a0c] p-2 rounded-lg border border-[#1f1f23]">
                  <div className="text-[8px] text-gray-600 uppercase font-black tracking-widest mb-1">Density</div>
                  <div className="h-1 bg-gray-900 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]" 
                      style={{ width: `${v.spectralDensity * 100}%` }} 
                    />
                  </div>
                </div>
              </div>

              {/* Routing Tag Cloud */}
              <div className="flex flex-wrap gap-1">
                {v.routingPath.map(r => (
                  <span key={r} className="px-2 py-0.5 bg-[#1a1a1f] text-[8px] font-black text-gray-500 uppercase tracking-tighter border border-[#1f1f23] rounded">
                    {r}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
