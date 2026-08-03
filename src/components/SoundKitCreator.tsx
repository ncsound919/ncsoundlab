/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { SoundKit, SoundKitSample, CoverArtOptions, SampleCategory } from '../types';
import { CoverArtGenerator } from './CoverArtGenerator';
import { FolderUploadModal } from './FolderUploadModal';
import { audioBufferToWav, synthesizeSampleBuffer, safeAudioValue } from '../lib/audioUtils';
import { saveSoundKit } from '../lib/db';
import {
  Package,
  Sparkles,
  Download,
  Play,
  Square,
  Trash2,
  Tag,
  DollarSign,
  Layers,
  CheckCircle2,
  Share2,
  FolderPlus,
  ShoppingBag,
  ArrowRight,
  FolderOpen,
} from 'lucide-react';

interface SoundKitCreatorProps {
  onPublishToMarketplace: (kit: SoundKit) => void;
  onNavigateToMarketplace?: () => void;
}

const CATEGORIES: SampleCategory[] = [
  'Atmospheres', 'Impacts', 'Transitions', 'Glitches', 'FX Elements', 'Percussive FX', 'Melodic FX',
  'Kick', 'Snare', 'HiHat', 'Clap', '808', 'Perc', 'Vox', 'FX', 'Melody', 'Bass',
];

/** Derive badge text from price — single source of truth */
const priceToBadge = (p: number): string =>
  p === 0 ? 'FREE DOWNLOAD' : `$${p.toFixed(2)} PREMIUM`;

export const SoundKitCreator: React.FC<SoundKitCreatorProps> = ({
  onPublishToMarketplace,
  onNavigateToMarketplace,
}) => {
  const [kitTitle, setKitTitle] = useState('OBSIDIAN ANALOG DRUMS & 808s');
  const [producer, setProducer] = useState('SONIK AUDIO LABS');
  const [description, setDescription] = useState(
    'A premium collection of punchy analog kicks, distorted sub 808s, surgical snares, and crisp hi-hats processed through tube saturation.'
  );
  const [genre, setGenre] = useState('Trap / Cyberpunk / Hip-Hop');
  const [price, setPrice] = useState<number>(19.0);
  const [samples, setSamples] = useState<SoundKitSample[]>([]);
  const [playingSampleId, setPlayingSampleId] = useState<string | null>(null);
  const [coverDataUrl, setCoverDataUrl] = useState<string>('');
  const [isZipping, setIsZipping] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [isCloudSynced, setIsCloudSynced] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Single reusable AudioContext + ref to active source
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Clean up AudioContext and publish timer on unmount
  const publishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      audioCtxRef.current?.close();
      if (publishTimerRef.current) clearTimeout(publishTimerRef.current);
    };
  }, []);

  const [coverOptions, setCoverOptions] = useState<CoverArtOptions>({
    theme: 'cyberpunk',
    title: 'OBSIDIAN ANALOG DRUMS',
    subtitle: '50+ WAVS / 100% ROYALTY FREE',
    producer: 'SONIK AUDIO LABS',
    badgeText: priceToBadge(19.0),
    accentColor: '#f27d26',
    overlayTexture: 'vinyl',
  });

  // Keep cover options title & producer synchronized with form inputs
  const handleTitleChange = (val: string) => {
    setKitTitle(val);
    setCoverOptions((prev) => ({ ...prev, title: val }));
  };

  const handleProducerChange = (val: string) => {
    setProducer(val);
    setCoverOptions((prev) => ({ ...prev, producer: val }));
  };

  const handlePriceChange = (valStr: string) => {
    const num = Math.max(0, parseFloat(valStr) || 0);
    setPrice(num);
    setCoverOptions((prev) => ({ ...prev, badgeText: priceToBadge(num) }));
  };

  // Sound auditioning with shared AudioContext
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const handlePlaySample = (sample: SoundKitSample) => {
    if (playingSampleId === sample.id) {
      if (activeSourceRef.current) {
        activeSourceRef.current.onended = null;
        activeSourceRef.current.stop();
        activeSourceRef.current = null;
      }
      setPlayingSampleId(null);
      return;
    }

    if (activeSourceRef.current) {
      activeSourceRef.current.onended = null;
      activeSourceRef.current.stop();
      activeSourceRef.current = null;
    }

    const ctx = getAudioContext();
    let bufferToPlay = sample.audioBuffer;
    if (!bufferToPlay) {
      bufferToPlay = synthesizeSampleBuffer(sample.category, 0.8);
    }

    const source = ctx.createBufferSource();
    source.buffer = bufferToPlay;

    const gainNode = ctx.createGain();
    gainNode.gain.value = safeAudioValue(sample.gain ?? 0.8, 0.8);

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start(0);
    activeSourceRef.current = source;
    setPlayingSampleId(sample.id);

    source.onended = () => {
      activeSourceRef.current = null;
      setPlayingSampleId(null);
    };
  };

  const handleAddSamplesFromFolder = (newSamples: SoundKitSample[]) => {
    setSamples((prev) => [...prev, ...newSamples]);
    setIsUploadModalOpen(false); // close modal when sounds are compiled into kit!
  };

  const handleRemoveSample = (id: string) => {
    if (playingSampleId === id && activeSourceRef.current) {
      activeSourceRef.current.stop();
      activeSourceRef.current = null;
      setPlayingSampleId(null);
    }
    setSamples((prev) => prev.filter((s) => s.id !== id));
  };

  const handleUpdateSample = (id: string, updates: Partial<SoundKitSample>) => {
    setSamples((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const handleBatchAutoTag = () => {
    setSamples((prev) =>
      prev.map((s) => {
        const cat = s.category.toLowerCase();
        return {
          ...s,
          tags: Array.from(new Set([...s.tags, cat, 'analog_dsp', '100% royalty free'])),
        };
      })
    );
  };

  // Export Zip archive of WAVs + cover art
  const handleExportZip = async () => {
    if (samples.length === 0) return;
    setIsZipping(true);

    try {
      const zip = new JSZip();
      const ctx = getAudioContext();

      const folderName = kitTitle.replace(/[^a-zA-Z0-9_-]/g, '_').toUpperCase();
      const kitFolder = zip.folder(folderName) || zip;

      // Render WAV files
      for (const sample of samples) {
        const buf =
          sample.audioBuffer ||
          synthesizeSampleBuffer(sample.category, 0.8);

        const wavData = audioBufferToWav(buf);
        const fileName = `${sample.category.toUpperCase()}_${sample.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.wav`;
        kitFolder.file(fileName, wavData);
      }

      // Render Metadata manifest
      const manifest = {
        title: kitTitle,
        producer,
        genre,
        price,
        description,
        totalSamples: samples.length,
        createdAt: new Date().toISOString(),
        samples: samples.map((s) => ({
          name: s.name,
          category: s.category,
          key: s.key,
          tags: s.tags,
          analysis: s.analysis,
        })),
      };
      kitFolder.file('kit_manifest.json', JSON.stringify(manifest, null, 2));

      // Embed Cover Art image if present
      if (coverDataUrl) {
        const base64Data = coverDataUrl.split(',')[1];
        if (base64Data) {
          kitFolder.file('CoverArt.png', base64Data, { base64: true });
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `${folderName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed generating zip:', err);
    } finally {
      setIsZipping(false);
    }
  };

  // Port/Publish to Marketplace
  const handlePublishKit = async () => {
    const newKit: SoundKit = {
      id: crypto.randomUUID(),
      title: kitTitle,
      producer,
      description,
      genre,
      tags: Array.from(
        new Set([
          ...genre.toLowerCase().split(/[\/\s,]+/),
          'sound kit',
          'wav samples',
          'analog',
        ])
      ).filter(Boolean),
      price,
      isPublished: true,
      coverArt: coverOptions,
      coverArtDataUrl: coverDataUrl,
      samples,
      createdAt: new Date().toISOString().split('T')[0],
    };

    let syncedToCloud = true;
    try {
      await saveSoundKit(newKit);
    } catch (e) {
      console.warn('Could not save kit locally:', e);
      syncedToCloud = false;
    }

    setIsCloudSynced(syncedToCloud);
    onPublishToMarketplace(newKit);
    setPublishSuccess(true);
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 text-white font-sans">
      
      {/* Compact Sound Kit Creator Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#121215] border border-[#2A2A2E] rounded-2xl p-3.5 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Package className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider">Loaded Working Samples:</span>
            <span className="px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 text-xs font-mono font-bold">
              {samples.length} Samples
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Main Upload Folder Trigger */}
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-[#1D1D22] border border-[#3A3A42] hover:border-blue-500 text-blue-400 hover:text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-md"
          >
            <FolderPlus className="w-4 h-4 text-blue-400" />
            <span>Import / Audition Folder</span>
            <span className="px-1.5 py-0.5 rounded bg-blue-600/20 text-[10px] font-mono text-blue-300">
              {samples.length}
            </span>
          </button>

          <button
            onClick={handleExportZip}
            disabled={isZipping || samples.length === 0}
            className="px-4 py-2.5 rounded-xl bg-[#1A1A1E] border border-[#2A2A2E] text-gray-300 hover:text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all hover:border-gray-500 disabled:opacity-40"
          >
            <Download className="w-4 h-4 text-sky-400" />
            <span>{isZipping ? 'Zipping WAVs...' : 'Export ZIP'}</span>
          </button>

          <button
            onClick={handlePublishKit}
            disabled={samples.length === 0}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-yellow-400 to-blue-700 text-black font-extrabold text-xs uppercase tracking-widest hover:opacity-95 shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all flex items-center gap-2 disabled:opacity-40"
          >
            <ShoppingBag className="w-4 h-4 text-black" />
            <span>Port to Marketplace</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner after Porting */}
      {publishSuccess && (
        <div className={`border rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-fadeIn ${
          isCloudSynced 
            ? 'bg-emerald-950/40 border-emerald-500/40' 
            : 'bg-amber-950/40 border-amber-500/40'
        }`}>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-400" />
            <div>
              <h4 className={`text-xs font-extrabold uppercase tracking-wider ${isCloudSynced ? 'text-emerald-300' : 'text-amber-300'}`}>
                {isCloudSynced ? 'Kit Ported & Synced to Local Marketplace!' : 'Kit Ported to Local Catalog (Offline Mode)'}
              </h4>
              <p className="text-[11px] text-gray-300">
                {isCloudSynced 
                  ? `"${kitTitle}" is now live in your local Marketplace catalog.`
                  : `"${kitTitle}" is stored locally in your catalog. (Local sync unavailable).`
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onNavigateToMarketplace && (
              <button
                onClick={onNavigateToMarketplace}
                className={`px-4 py-2 rounded-xl text-black font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  isCloudSynced ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-amber-500 hover:bg-amber-400'
                }`}
              >
                <span>View in Marketplace</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setPublishSuccess(false)}
              className="px-3 py-2 rounded-xl bg-[#1A1A1E] text-gray-400 hover:text-white text-xs font-bold"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: Kit Details Form & Artwork Generator */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kit Details Form */}
        <div className="bg-[#121215] border border-[#2A2A2E] rounded-2xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#2A2A2E]">
            <Tag className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-white">
              Kit Metadata & Pricing
            </h3>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Sound Kit Title
            </label>
            <input
              type="text"
              value={kitTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full bg-[#1A1A1E] border border-[#2A2A2E] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-bold"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Producer / Designer Label
            </label>
            <input
              type="text"
              value={producer}
              onChange={(e) => handleProducerChange(e.target.value)}
              className="w-full bg-[#1A1A1E] border border-[#2A2A2E] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Primary Genre / Vibe
            </label>
            <input
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full bg-[#1A1A1E] border border-[#2A2A2E] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Marketplace Pricing ($ USD)
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <DollarSign className="w-4 h-4 text-blue-400 absolute left-3 top-2.5" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="9999.99"
                  value={price}
                  onChange={(e) => handlePriceChange(e.target.value)}
                  className="w-full bg-[#1A1A1E] border border-[#2A2A2E] rounded-xl pl-8 pr-3 py-2 text-xs text-white font-mono font-bold focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                onClick={() => {
                  setPrice(0);
                  setCoverOptions((prev) => ({ ...prev, badgeText: 'FREE DOWNLOAD' }));
                }}
                className={`px-3 py-2 rounded-xl text-xs font-bold uppercase transition-all ${
                  price === 0
                    ? 'bg-emerald-500 text-black'
                    : 'bg-[#1A1A1E] text-gray-400 hover:text-white border border-[#2A2A2E]'
                }`}
              >
                Set Free
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Description & Details
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#1A1A1E] border border-[#2A2A2E] rounded-xl p-3 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Cover Art Generator */}
        <div className="lg:col-span-2">
          <CoverArtGenerator
            options={coverOptions}
            onChange={setCoverOptions}
            onExportDataUrl={setCoverDataUrl}
          />
        </div>
      </div>

      {/* Render Upload & Audition Modal when toggled */}
      {isUploadModalOpen && (
        <FolderUploadModal
          onAddSamplesToKit={handleAddSamplesFromFolder}
          onClose={() => setIsUploadModalOpen(false)}
        />
      )}

      {/* Sample Metatagging Table & Sample Management */}
      <div className="bg-[#121215] border border-[#2A2A2E] rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#2A2A2E]">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-400" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-white">
              Compiled Kit Audio Samples ({samples.length})
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-blue-600/15 border border-blue-400/40 text-blue-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-blue-600 hover:text-black transition-all"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              Import More Sounds
            </button>

            <button
              onClick={handleBatchAutoTag}
              disabled={samples.length === 0}
              className="px-3 py-1.5 rounded-xl bg-[#1A1A1E] border border-[#2A2A2E] text-gray-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 hover:text-white transition-all disabled:opacity-40"
            >
              <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
              Auto-Tag All
            </button>

            {samples.length > 0 && (
              <button
                onClick={() => {
                  activeSourceRef.current?.stop();
                  activeSourceRef.current = null;
                  setPlayingSampleId(null);
                  setSamples([]);
                }}
                className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-wider hover:bg-red-500 hover:text-white transition-all"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {samples.length === 0 ? (
          <div className="h-44 border border-dashed border-[#2A2A2E] rounded-2xl flex flex-col items-center justify-center text-center p-6 bg-[#16161A]/50">
            <FolderOpen className="w-9 h-9 text-blue-400/60 mb-2" />
            <p className="text-xs text-gray-300 font-bold uppercase tracking-widest">
              No samples compiled in kit yet
            </p>
            <p className="text-[11px] text-gray-500 max-w-sm mt-1 mb-4">
              Import a drum folder to audition raw vs processed sounds, select your favorites, and compile them here.
            </p>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="px-5 py-2 rounded-xl bg-blue-600 text-white font-extrabold text-xs uppercase tracking-wider hover:bg-blue-500 shadow-lg transition-all flex items-center gap-2"
            >
              <FolderPlus className="w-4 h-4" />
              Open Folder Audition Workspace
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-[#2A2A2E] text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="pb-2 pl-2">Play</th>
                  <th className="pb-2">Sample Name</th>
                  <th className="pb-2">Category</th>
                  <th className="pb-2">Key / Pitch</th>
                  <th className="pb-2">Peak (dBFS)</th>
                  <th className="pb-2">RMS (dB)</th>
                  <th className="pb-2">Transient</th>
                  <th className="pb-2">Tags</th>
                  <th className="pb-2 pr-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2A2E]/50">
                {samples.map((sample) => (
                  <tr key={sample.id} className="hover:bg-[#16161A] transition-colors group">
                    <td className="py-2.5 pl-2">
                      <button
                        onClick={() => handlePlaySample(sample)}
                        className={`p-2 rounded-lg border transition-all ${
                          playingSampleId === sample.id
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-[#1A1A1E] border-[#2A2A2E] text-gray-300 hover:text-white'
                        }`}
                      >
                        {playingSampleId === sample.id ? (
                          <Square className="w-3.5 h-3.5 fill-current" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                      </button>
                    </td>

                    <td className="py-2.5 font-bold text-white">
                      <input
                        type="text"
                        value={sample.name}
                        onChange={(e) => handleUpdateSample(sample.id, { name: e.target.value })}
                        className="bg-transparent border-b border-transparent hover:border-[#3E3E4A] focus:border-blue-500 text-white font-bold text-xs focus:outline-none px-1"
                      />
                    </td>

                    <td className="py-2.5">
                      <select
                        value={sample.category}
                        onChange={(e) =>
                           handleUpdateSample(sample.id, { category: e.target.value as SampleCategory })
                        }
                        className="bg-[#1A1A1E] border border-[#2A2A2E] rounded px-2 py-1 text-[11px] text-blue-400 font-bold focus:outline-none"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </td>

                    <td className="py-2.5 text-gray-300">
                      <input
                        type="text"
                        value={sample.key ?? ''}
                        placeholder="—"
                        onChange={(e) =>
                          handleUpdateSample(sample.id, {
                            key: e.target.value || undefined,
                          })
                        }
                        className="w-14 bg-[#1A1A1E] border border-[#2A2A2E] rounded px-1.5 py-0.5 text-[11px] text-center text-sky-400 focus:outline-none font-bold placeholder-gray-600"
                      />
                    </td>

                    <td className="py-2.5 text-gray-400 font-bold">
                      {sample.analysis ? `${sample.analysis.peakDb} dB` : '—'}
                    </td>

                    <td className="py-2.5 text-gray-400">
                      {sample.analysis ? `${sample.analysis.rmsDb} dB` : '—'}
                    </td>

                    <td className="py-2.5">
                      <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold">
                        {sample.analysis ? `${sample.analysis.transientSharpness}/10` : '—'}
                      </span>
                    </td>

                    <td className="py-2.5 text-gray-400">
                      <input
                        type="text"
                        value={sample.tags.join(', ')}
                        onChange={(e) =>
                          handleUpdateSample(sample.id, {
                            tags: e.target.value
                              .split(',')
                              .map((t) => t.trim())
                              .filter(Boolean),
                          })
                        }
                        className="bg-transparent border-b border-transparent hover:border-[#3E3E4A] focus:border-blue-500 text-[10px] text-gray-400 focus:outline-none"
                      />
                    </td>

                    <td className="py-2.5 pr-2 text-right">
                      <button
                        onClick={() => handleRemoveSample(sample.id)}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
