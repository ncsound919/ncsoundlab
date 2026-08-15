/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import JSZip from 'jszip';
import { SoundKit, SoundKitSample } from '../types';
import { audioBufferToWav, synthesizeSampleBuffer } from '../lib/audioUtils';
import { audioEngine } from '../audio/AudioEngine';
import {
  fetchSoundKits,
  fetchUserFavorites,
  toggleFavorite,
} from '../lib/db';
import { 
  ShoppingBag, 
  Sparkles, 
  Download, 
  Play, 
  Square, 
  Star, 
  Search, 
  Layers, 
  Zap,
  FolderOpen
} from 'lucide-react';

interface SoundKitCatalogProps {
  customKits: SoundKit[];
  onLoadKitToSoundLab?: (samples: SoundKitSample[]) => void;
}

// Initial Factory Kits for Marketplace
const FACTORY_KITS: SoundKit[] = [
  {
    id: 'factory-1',
    title: 'OBSIDIAN 808 & TRAP DRUMS V2',
    producer: 'SONIK AUDIO LABS',
    description: 'Ultra-heavy sub 808s, analog saturated kicks, surgical snares, and crisp hi-hats crafted for modern Trap & Drill production.',
    genre: 'Trap / Drill',
    tags: ['808', 'Trap', 'Analog', 'Punchy'],
    price: 0, // FREE — bundled demo content (founder doesn't sell kits)
    isPublished: true,
    coverArt: {
      theme: 'cyberpunk',
      title: 'OBSIDIAN 808 & TRAP DRUMS',
      subtitle: '24-Bit / 100% Royalty Free',
      producer: 'SONIK AUDIO LABS',
      overlayTexture: 'grid',
      badgeText: 'FREE DEMO',
      accentColor: '#F27D26',
    },
    samples: [
      {
        id: 's1',
        name: 'OBSIDIAN_808_C1',
        fileName: 'OBSIDIAN_808_C1.wav',
        category: '808',
        tags: ['808', 'sub', 'heavy'],
        key: 'C1',
        gain: 0.8,
        pitch: 0,
        analysis: {
          peakDb: -0.1,
          rmsDb: -8.5,
          lufsDb: -5.4,
          transientSharpness: 8.5,
          durationSeconds: 1.8,
          sampleRate: 48000,
          channels: 2,
          suggestedCategory: '808',
        },
      },
      {
        id: 's2',
        name: 'ANALOG_KICK_PUNCH',
        fileName: 'ANALOG_KICK_PUNCH.wav',
        category: 'Kick',
        tags: ['kick', 'punchy'],
        key: 'F1',
        gain: 0.8,
        pitch: 0,
        analysis: {
          peakDb: -0.2,
          rmsDb: -12.1,
          lufsDb: -9.0,
          transientSharpness: 9.2,
          durationSeconds: 0.45,
          sampleRate: 48000,
          channels: 2,
          suggestedCategory: 'Kick',
        },
      },
      {
        id: 's3',
        name: 'SURGICAL_SNARE_CRACK',
        fileName: 'SURGICAL_SNARE_CRACK.wav',
        category: 'Snare',
        tags: ['snare', 'tight'],
        key: 'E2',
        gain: 0.8,
        pitch: 0,
        analysis: {
          peakDb: -0.1,
          rmsDb: -14.2,
          lufsDb: -11.1,
          transientSharpness: 8.8,
          durationSeconds: 0.35,
          sampleRate: 48000,
          channels: 2,
          suggestedCategory: 'Snare',
        },
      },
    ],
    createdAt: '2026-07-20T10:00:00Z',
    downloadsCount: 1840,
    rating: 4.9,
  },
  {
    id: 'factory-2',
    title: 'VINTAGE LO-FI TAPE VAULT',
    producer: 'RETRO MAGNETICS',
    description: 'Warm tape saturated vinyl kicks, dusty rimshots, crunchy hi-hats, and authentic cassette noise floor percussions.',
    genre: 'Lo-Fi / Boombap',
    tags: ['Tape', 'Lo-Fi', 'Vinyl', 'Boombap'],
    price: 0, // FREE
    isPublished: true,
    coverArt: {
      theme: 'gold_analog',
      title: 'VINTAGE LO-FI TAPE VAULT',
      subtitle: 'Cassette Saturation / Free Download',
      producer: 'RETRO MAGNETICS',
      overlayTexture: 'vinyl',
      badgeText: 'FREE DOWNLOAD',
      accentColor: '#D97706',
    },
    samples: [
      {
        id: 's4',
        name: 'DUSTY_TAPE_KICK',
        fileName: 'DUSTY_TAPE_KICK.wav',
        category: 'Kick',
        tags: ['kick', 'warm', 'lofi'],
        key: 'G1',
        gain: 0.8,
        pitch: 0,
        analysis: {
          peakDb: -1.2,
          rmsDb: -15.0,
          lufsDb: -11.9,
          transientSharpness: 6.5,
          durationSeconds: 0.5,
          sampleRate: 44100,
          channels: 2,
          suggestedCategory: 'Kick',
        },
      },
      {
        id: 's5',
        name: 'VINYL_RIMSHOT_CLAP',
        fileName: 'VINYL_RIMSHOT_CLAP.wav',
        category: 'Clap',
        tags: ['rimshot', 'clap', 'lofi'],
        gain: 0.8,
        pitch: 0,
        analysis: {
          peakDb: -2.0,
          rmsDb: -18.2,
          lufsDb: -15.1,
          transientSharpness: 7.0,
          durationSeconds: 0.28,
          sampleRate: 44100,
          channels: 2,
          suggestedCategory: 'Clap',
        },
      },
    ],
    createdAt: '2026-07-22T14:30:00Z',
    downloadsCount: 3420,
    rating: 4.8,
  },
  {
    id: 'factory-3',
    title: 'CYBERPUNK NEON VOX & FX',
    producer: 'SYNTHWAVE CORE',
    description: 'Futuristic vocal chops, neon synth risers, sub impacts, and dark cybernetic sound effects.',
    genre: 'Synthwave / Cyberpunk',
    tags: ['Cyberpunk', 'Vox', 'FX', 'Neon'],
    price: 0, // FREE — bundled demo content (founder doesn't sell kits)
    isPublished: true,
    coverArt: {
      theme: 'acid_retro',
      title: 'NEON VOX & FX',
      subtitle: 'Futuristic Sound Design',
      producer: 'SYNTHWAVE CORE',
      overlayTexture: 'foil',
      badgeText: 'FREE DEMO',
      accentColor: '#EC4899',
    },
    samples: [
      {
        id: 's6',
        name: 'CYBER_CHANT_VOX',
        fileName: 'CYBER_CHANT_VOX.wav',
        category: 'Vox',
        tags: ['vox', 'cyber', 'chant'],
        key: 'A2',
        gain: 0.8,
        pitch: 0,
        analysis: {
          peakDb: -0.5,
          rmsDb: -11.0,
          lufsDb: -7.9,
          transientSharpness: 7.8,
          durationSeconds: 0.9,
          sampleRate: 48000,
          channels: 2,
          suggestedCategory: 'Vox',
        },
      },
    ],
    createdAt: '2026-07-24T09:15:00Z',
    downloadsCount: 950,
    rating: 5.0,
  },
];

export const SoundKitCatalog: React.FC<SoundKitCatalogProps> = ({
  customKits,
  onLoadKitToSoundLab,
}) => {
  const [cloudKits, setCloudKits] = useState<SoundKit[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  
  // Combine custom kits, cloud kits, and factory kits safely deduplicated by ID
  const allKits = useMemo(() => {
    const combinedMap = new Map<string, SoundKit>();
    [...customKits, ...cloudKits, ...FACTORY_KITS].forEach(kit => {
      if (kit.id && !combinedMap.has(kit.id)) {
        combinedMap.set(kit.id, kit);
      }
    });
    return Array.from(combinedMap.values());
  }, [customKits, cloudKits]);

  const [selectedKitId, setSelectedKitId] = useState<string>('factory-1');
  const selectedKit = useMemo(() => {
    return allKits.find(k => k.id === selectedKitId) || allKits[0] || null;
  }, [allKits, selectedKitId]);

  const [searchQuery, setSearchQuery] = useState('');
  const [priceFilter, setPriceFilter] = useState<'all' | 'free' | 'paid'>('all');
  const [playingSampleId, setPlayingSampleId] = useState<string | null>(null);
  const [downloadingKitId, setDownloadingKitId] = useState<string | null>(null);

  // Audio source ref and synthesis cache ref
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const synthCacheRef = useRef<Map<string, AudioBuffer>>(new Map());

  useEffect(() => {
    let isMounted = true;
    const loadLocalData = async () => {
      try {
        const fetchedKits = await fetchSoundKits();
        if (isMounted && fetchedKits.length > 0) {
          setCloudKits(fetchedKits);
        }
        const favs = await fetchUserFavorites();
        if (isMounted && favs.length > 0) {
          setFavoriteIds((prev) => Array.from(new Set([...prev, ...favs])));
        }
      } catch (err) {
        console.warn('Marketplace local sync notice:', err);
      }
    };
    loadLocalData();
    return () => { isMounted = false; };
  }, []);

  const handleToggleFavorite = async (kitId: string) => {
    const isFav = favoriteIds.includes(kitId);
    const nextFavs = isFav ? favoriteIds.filter(id => id !== kitId) : [...favoriteIds, kitId];
    setFavoriteIds(nextFavs);
    try {
      await toggleFavorite(kitId, !isFav);
    } catch (e) {
      console.warn('Failed saving favorite locally:', e);
    }
  };

  const filteredKits = allKits.filter((kit) => {
    const matchesSearch =
      kit.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      kit.producer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      kit.genre.toLowerCase().includes(searchQuery.toLowerCase());

    if (priceFilter === 'free') return matchesSearch && kit.price === 0;
    if (priceFilter === 'paid') return matchesSearch && kit.price > 0;
    return matchesSearch;
  });

  const handlePlayPreview = (sample: SoundKitSample) => {
    // If clicking same sample that's currently playing, stop it
    if (playingSampleId === sample.id) {
      if (activeSourceRef.current) {
        try { activeSourceRef.current.stop(); } catch (e) {}
        activeSourceRef.current = null;
      }
      setPlayingSampleId(null);
      return;
    }

    // Stop previous playing source if any
    if (activeSourceRef.current) {
      try { activeSourceRef.current.stop(); } catch (e) {}
      try { activeSourceRef.current.disconnect(); } catch {}
      activeSourceRef.current = null;
    }

    const audioCtx = audioEngine.getContext();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    // Get buffer without mutating state objects or constants
    let buffer = sample.audioBuffer;
    if (!buffer) {
      const cacheKey = `${sample.category}_${sample.id || sample.name}`;
      if (synthCacheRef.current.has(cacheKey)) {
        buffer = synthCacheRef.current.get(cacheKey)!;
      } else {
        buffer = synthesizeSampleBuffer(sample.category);
        synthCacheRef.current.set(cacheKey, buffer);
      }
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);
    activeSourceRef.current = source;
    setPlayingSampleId(sample.id);

    source.onended = () => {
      if (activeSourceRef.current === source) activeSourceRef.current = null;
      try { source.disconnect(); } catch {}
      setPlayingSampleId((prev) => (prev === sample.id ? null : prev));
    };
  };

  const handleDownloadKit = async (kit: SoundKit, isCommercial = false) => {
    setDownloadingKitId(kit.id);
    try {
      const zip = new JSZip();

      // Cover Art Image
      if (kit.coverArtDataUrl) {
        const base64Data = kit.coverArtDataUrl.replace(/^data:image\/[a-zA-Z0-9+-]+;base64,/, '');
        zip.file('cover.png', base64Data, { base64: true });
      }

      // Documentation & Metadata for Selling
      const manifest = {
        title: kit.title,
        producer: kit.producer,
        version: "1.0.0",
        description: kit.description,
        format: "24-Bit WAV / 48kHz Stereo",
        sampleCount: kit.samples.length,
        exportDate: new Date().toISOString(),
        isCommercialExport: isCommercial
      };

      zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      if (isCommercial) {
        zip.file('LICENSE.txt', `COMMERCIAL USE LICENSE: ${kit.title}\n\nProducer: ${kit.producer}\n\nThis license grants the user a worldwide, non-exclusive, royalty-free license to use the samples in this pack for musical compositions and audio-visual productions. Resale of the individual samples as a standalone library is strictly prohibited.`);
        zip.file('READ_ME.txt', `Thank you for purchasing ${kit.title}.\n\nThis pack is structured for professional DAWs. Samples are categorized by type (808s, Kicks, Snares, etc.).\n\nGenerated with SONIK STUDIO ARCHITECTURE.`);
      }

      const usedNames = new Set<string>();

      for (const sample of kit.samples) {
        // Synthesize audioBuffer if missing (e.g. factory mock presets)
        const buffer = sample.audioBuffer || synthesizeSampleBuffer(sample.category);
        sample.audioBuffer = buffer;

        const wavBlob = audioBufferToWav(buffer);
        const folderName = isCommercial ? `Samples/${sample.category}s` : `${sample.category}s`;
        let safeName = sample.name.trim().replace(/[^a-z0-9_-]/gi, '_') || 'sample';

        let filename = `${safeName}.wav`;
        let counter = 2;
        while (usedNames.has(`${folderName}/${filename}`)) {
          filename = `${safeName}_${counter}.wav`;
          counter++;
        }
        usedNames.add(`${folderName}/${filename}`);

        zip.folder(folderName)?.file(filename, wavBlob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${kit.title.toLowerCase().replace(/[^a-z0-9]/gi, '_')}${isCommercial ? '_FOR_SALE' : ''}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download error', e);
      alert('Failed to download sound kit package.');
    } finally {
      setDownloadingKitId(null);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 flex flex-col gap-6 text-[#E2E8F0] select-none">
      {/* Top Banner */}
      {/* Marketplace Compact Search & Filter Toolbar */}
      <div className="bg-[#121215] border border-[#2A2A2E] rounded-2xl p-4 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white uppercase tracking-wider">Catalog & Sound Library Search</div>
            <p className="text-[10px] text-gray-400">Royalty-free commercial drum kits, samples & 808s</p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
          {/* Quick Tag Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {['All Tags', '808', 'Trap', 'Lo-Fi', 'Synthwave', 'Analog'].map((tag) => (
              <button
                key={tag}
                onClick={() => {
                  if (tag === 'All Tags') setSearchQuery('');
                  else setSearchQuery(tag);
                }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase transition-all whitespace-nowrap border ${
                  (tag === 'All Tags' && searchQuery === '') || searchQuery.toLowerCase() === tag.toLowerCase()
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 shadow-sm'
                    : 'bg-[#1a1a20] border-[#2a2a35] text-gray-400 hover:text-white hover:border-gray-500'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="relative flex-1 md:w-56">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search kits, producers, tags..."
              className="w-full bg-[#1A1A1E] border border-[#2A2A2E] rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-white transition-colors"
                title="Clear Search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Result Count Badge */}
          <div className="hidden lg:flex items-center px-2.5 py-1.5 bg-[#16161a] border border-[#262632] rounded-xl text-[10px] font-mono text-gray-400 whitespace-nowrap">
            <span className="text-blue-400 font-bold mr-1">{filteredKits.length}</span> / {allKits.length} Kits
          </div>

          <div className="flex items-center bg-[#1A1A1E] border border-[#2A2A2E] rounded-xl p-1 gap-1">
            <button
              onClick={() => setPriceFilter('all')}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                priceFilter === 'all' ? 'bg-yellow-400 text-black' : 'text-gray-400'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setPriceFilter('free')}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                priceFilter === 'free' ? 'bg-emerald-500 text-black' : 'text-gray-400'
              }`}
            >
              Free
            </button>
            <button
              onClick={() => setPriceFilter('paid')}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                priceFilter === 'paid' ? 'bg-amber-500 text-black' : 'text-gray-400'
              }`}
            >
              Paid
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Kit Cards & Detail Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kit Cards Grid */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredKits.map((kit) => (
            <div
              key={kit.id}
              onClick={() => setSelectedKitId(kit.id)}
              className={`bg-[#121215] border rounded-2xl p-4 shadow-xl cursor-pointer transition-all flex flex-col justify-between group ${
                selectedKit?.id === kit.id
                  ? 'border-blue-500/80 ring-1 ring-blue-500/30'
                  : 'border-[#2A2A2E] hover:border-gray-500'
              }`}
            >
              <div className="space-y-3">
                {/* Visual Cover Preview Header */}
                <div className="relative h-44 rounded-xl overflow-hidden bg-[#1A1A1E] border border-[#2A2A2E]">
                  {kit.coverArtDataUrl ? (
                    <img
                      src={kit.coverArtDataUrl}
                      alt={kit.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-950 via-slate-900 to-black p-4 flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <span className="text-[9px] font-mono text-blue-400 font-bold uppercase">
                          {kit.producer}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-black/60 backdrop-blur text-[10px] font-mono font-bold text-amber-400 border border-amber-500/30">
                          {kit.price === 0 ? 'FREE' : `$${kit.price.toFixed(2)}`}
                        </span>
                      </div>
                      <h4 className="text-base font-black text-white uppercase tracking-tight line-clamp-2">
                        {kit.title}
                      </h4>
                    </div>
                  )}

                  {/* Rating & Favorite Badge */}
                  <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavorite(kit.id);
                      }}
                      className={`p-1.5 rounded-lg border backdrop-blur transition-all ${
                        favoriteIds.includes(kit.id)
                          ? 'bg-amber-500/20 border-amber-500/60 text-amber-400'
                          : 'bg-black/70 border-white/10 text-gray-400 hover:text-amber-400'
                      }`}
                      title="Save to Favorites"
                    >
                      <Star className={`w-3.5 h-3.5 ${favoriteIds.includes(kit.id) ? 'fill-amber-400' : ''}`} />
                    </button>
                    <div className="px-2 py-1 bg-black/70 backdrop-blur rounded-lg border border-white/10 text-[10px] font-mono font-bold text-amber-300 flex items-center gap-1">
                      {kit.rating ? (
                        <>
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          <span>{kit.rating.toFixed(1)}</span>
                        </>
                      ) : (
                        <span className="text-blue-400 font-extrabold tracking-wider">NEW</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white uppercase truncate">{kit.title}</h3>
                    <span className="text-xs font-mono font-extrabold text-blue-400 shrink-0">
                      {kit.price === 0 ? 'FREE' : `$${kit.price.toFixed(2)}`}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 line-clamp-2 mt-1">{kit.description}</p>
                </div>
              </div>

              {/* Card Footer */}
              <div className="mt-4 pt-3 border-t border-[#2A2A2E]/50 flex items-center justify-between text-[10px] font-mono text-gray-500">
                <span className="flex items-center gap-1">
                  <Layers className="w-3 h-3 text-sky-400" />
                  {kit.samples.length} Samples
                </span>
                <span className="text-blue-400 font-bold group-hover:translate-x-1 transition-transform flex items-center gap-1">
                  Inspect Kit &rarr;
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Selected Kit Detail Inspector Drawer */}
        {selectedKit && (
          <div className="bg-[#121215] border border-[#2A2A2E] rounded-2xl p-5 shadow-2xl space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#2A2A2E]">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-white">
                    Kit Inspection Vault
                  </h3>
                </div>
                <span className="text-xs font-mono font-extrabold text-emerald-400">
                  {selectedKit.price === 0 ? 'FREE DOWNLOAD' : `$${selectedKit.price.toFixed(2)}`}
                </span>
              </div>

              {/* Cover Art Preview */}
              {selectedKit.coverArtDataUrl && (
                <div className="w-full h-48 rounded-xl overflow-hidden border border-[#2A2A2E]">
                  <img
                    src={selectedKit.coverArtDataUrl}
                    alt={selectedKit.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div>
                <h2 className="text-base font-black text-white uppercase">{selectedKit.title}</h2>
                <span className="text-[10px] font-mono text-blue-400 font-bold block mt-0.5">
                  BY {selectedKit.producer} • {selectedKit.genre}
                </span>
                <p className="text-xs text-gray-400 mt-2">{selectedKit.description}</p>
              </div>

              {/* Sample Previews List */}
              <div className="space-y-2 pt-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block">
                  Included Audio Samples ({selectedKit.samples.length})
                </span>

                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {selectedKit.samples.map((sample) => (
                    <div
                      key={sample.id}
                      className="p-2 rounded-xl bg-[#1A1A1E] border border-[#2A2A2E] flex items-center justify-between text-xs font-mono"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <button
                          onClick={() => handlePlayPreview(sample)}
                          className={`p-1.5 rounded-lg transition-all ${
                            playingSampleId === sample.id
                              ? 'bg-blue-600 text-black'
                              : 'bg-[#25252A] text-gray-300 hover:text-white'
                          }`}
                        >
                          {playingSampleId === sample.id ? (
                            <Square className="w-3 h-3 fill-current" />
                          ) : (
                            <Play className="w-3 h-3 fill-current" />
                          )}
                        </button>
                        <span className="text-white font-bold truncate">{sample.name}</span>
                      </div>

                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="px-1.5 py-0.5 rounded bg-blue-600/10 text-blue-400 font-bold">
                          {sample.category}
                        </span>
                        {sample.key && (
                          <span className="text-sky-400 font-bold">{sample.key}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-4 border-t border-[#2A2A2E]">
              {onLoadKitToSoundLab && (
                <button
                  onClick={() => onLoadKitToSoundLab(selectedKit.samples)}
                  className="w-full py-2.5 rounded-xl bg-[#1A1A1E] border border-blue-500/40 hover:border-blue-500 text-blue-400 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                >
                  <Zap className="w-4 h-4 text-blue-400" />
                  Load Kit into One-Shot Sound Lab
                </button>
              )}

              <button
                onClick={() => handleDownloadKit(selectedKit, true)}
                disabled={downloadingKitId === selectedKit.id}
                className="w-full py-3 rounded-xl bg-[#1A1A1E] border border-sky-500/40 hover:border-sky-500 text-sky-400 font-extrabold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Export for External Sale (.zip)</span>
              </button>

              <button
                onClick={() => handleDownloadKit(selectedKit)}
                disabled={downloadingKitId === selectedKit.id}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-yellow-400 text-black font-extrabold text-xs uppercase tracking-widest hover:opacity-95 shadow-[0_0_16px_rgba(37,99,235,0.3)] transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>
                  {downloadingKitId === selectedKit.id
                    ? 'Downloading Package...'
                    : 'Download Kit (.zip)'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
