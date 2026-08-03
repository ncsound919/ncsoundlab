/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { PRODUCER_SOUND_PRESETS, SoundPreset } from '../lib/soundPresets';
import { SoundLayer, DEFAULT_ENVELOPE, DEFAULT_FX } from '../types';
import { 
  Search, 
  Star, 
  Bookmark, 
  Plus, 
  Check, 
  Trash2, 
  Save, 
  Layers, 
  Sparkles, 
  Music, 
  Tag,
  FolderOpen
} from 'lucide-react';

interface LayerPresetBrowserProps {
  selectedLayer: SoundLayer | null;
  onUpdateLayer: (layerId: string, updates: Partial<SoundLayer>) => void;
  onAddLayerWithPreset: (preset: SoundPreset | UserSoundPreset) => void;
  onAddToast: (message: string, type: 'success' | 'info' | 'warn') => void;
}

export interface UserSoundPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  isUser: true;
  layerData: Omit<SoundLayer, 'id' | 'audioBuffer'>;
}

export const LayerPresetBrowser: React.FC<LayerPresetBrowserProps> = ({
  selectedLayer,
  onUpdateLayer,
  onAddLayerWithPreset,
  onAddToast
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'factory' | 'user' | 'favorites'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Custom Preset Form State
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDesc, setNewPresetDesc] = useState('');
  const [newPresetCat, setNewPresetCat] = useState('synth');
  const [newPresetIcon, setNewPresetIcon] = useState('🔥');

  // Load favorites from localstorage
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('soundlab_layer_preset_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Load user presets from localstorage
  const [userPresets, setUserPresets] = useState<UserSoundPreset[]>(() => {
    try {
      const saved = localStorage.getItem('soundlab_layer_user_presets');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('soundlab_layer_preset_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('soundlab_layer_user_presets', JSON.stringify(userPresets));
  }, [userPresets]);

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const handleApplyPreset = (preset: SoundPreset | UserSoundPreset) => {
    if (!selectedLayer) {
      onAddToast('Please select a layer first to apply this preset!', 'warn');
      return;
    }

    if ('isUser' in preset) {
      // User Preset
      if (preset.layerData) {
        const updates: Partial<SoundLayer> = {
          name: `${selectedLayer.name.split(' (')[0]} (${preset.name})`,
          envelope: preset.layerData.envelope ? { ...preset.layerData.envelope } : { ...DEFAULT_ENVELOPE },
          fx: preset.layerData.fx ? { ...preset.layerData.fx } : { ...DEFAULT_FX },
          gain: preset.layerData.gain ?? selectedLayer.gain,
          pan: preset.layerData.pan ?? selectedLayer.pan,
          pitch: preset.layerData.pitch ?? selectedLayer.pitch,
          macroPunch: preset.layerData.macroPunch,
          macroDepth: preset.layerData.macroDepth,
          macroSpace: preset.layerData.macroSpace,
          macroGrit: preset.layerData.macroGrit,
        };
        if (preset.layerData.synth) {
          updates.synth = { ...preset.layerData.synth };
        }
        onUpdateLayer(selectedLayer.id, updates);
        onAddToast(`Applied custom preset "${preset.name}" to ${selectedLayer.name}`, 'success');
      }
    } else {
      // Factory Preset
      const result = preset.apply(selectedLayer);
      onUpdateLayer(selectedLayer.id, {
        name: result.name,
        envelope: result.envelope,
        synth: result.synth,
        fx: result.fx,
        macroPunch: result.macroPunch,
        macroDepth: result.macroDepth,
        macroSpace: result.macroSpace,
        macroGrit: result.macroGrit,
      });
      onAddToast(`Applied factory preset "${preset.name}" to ${selectedLayer.name}`, 'success');
    }
  };

  const handleSaveCurrentAsPreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLayer) {
      onAddToast('Select a layer to save its settings!', 'warn');
      return;
    }
    if (!newPresetName.trim()) {
      onAddToast('Preset name cannot be empty!', 'warn');
      return;
    }

    // Extract layer data (without id and buffer)
    const { id, audioBuffer, name, ...rest } = selectedLayer;

    const newPreset: UserSoundPreset = {
      id: `user-${crypto.randomUUID()}`,
      name: newPresetName.trim(),
      category: newPresetCat,
      description: newPresetDesc.trim() || 'Custom user sound design patch',
      icon: newPresetIcon,
      isUser: true,
      layerData: JSON.parse(JSON.stringify(rest))
    };

    setUserPresets(prev => [...prev, newPreset]);
    setNewPresetName('');
    setNewPresetDesc('');
    onAddToast(`Saved preset "${newPreset.name}" successfully!`, 'success');
  };

  const handleDeleteUserPreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setUserPresets(prev => prev.filter(p => p.id !== id));
    setFavorites(prev => prev.filter(f => f !== id));
    onAddToast('Deleted custom preset', 'info');
  };

  // Filter Categories list
  const categories = [
    { id: 'all', label: 'All Sounds' },
    { id: 'kick', label: 'Kicks' },
    { id: 'snare', label: 'Snares' },
    { id: 'hat', label: 'Hats' },
    { id: 'sub', label: 'Sub Bass' },
    { id: 'synth', label: 'Lead/Synth' },
    { id: 'pad', label: 'Pads/Atmos' },
    { id: 'custom', label: 'User Custom' }
  ];

  // Helper to categorize factory presets
  const getPresetCategory = (preset: SoundPreset): string => {
    const id = preset.id.toLowerCase();
    if (id.includes('kick')) return 'kick';
    if (id.includes('snare')) return 'snare';
    if (id.includes('hihat') || id.includes('hat')) return 'hat';
    if (id.includes('sub')) return 'sub';
    if (id.includes('pluck') || id.includes('synth')) return 'synth';
    if (id.includes('pad')) return 'pad';
    return 'synth';
  };

  // Compile combined presets
  const factoryItems = PRODUCER_SOUND_PRESETS.map(p => ({
    ...p,
    category: getPresetCategory(p),
    isUser: false as const
  }));

  const allItems = [...factoryItems, ...userPresets];

  // Filter by search, tab filter, and selected category
  const filteredItems = allItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTab = 
      activeFilter === 'all' ? true :
      activeFilter === 'factory' ? !item.isUser :
      activeFilter === 'user' ? item.isUser :
      activeFilter === 'favorites' ? favorites.includes(item.id) : true;

    const matchesCategory = 
      selectedCategory === 'all' ? true :
      selectedCategory === 'custom' ? item.isUser :
      item.category === selectedCategory;

    return matchesSearch && matchesTab && matchesCategory;
  });

  return (
    <div className="bg-[#0b0b0d] border border-[#1e293b] rounded-2xl overflow-hidden shadow-2xl flex flex-col h-full">
      {/* Header and Search */}
      <div className="p-4 bg-black border-b border-[#1e293b] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-yellow-400" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-white">Preset Browser & Sound Design Library</h3>
          </div>
          
          <button
            onClick={() => setShowSaveForm(!showSaveForm)}
            className={`px-2.5 py-1 text-[9px] uppercase font-black tracking-wider rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
              showSaveForm 
                ? 'bg-yellow-400/10 border-yellow-400/40 text-yellow-400' 
                : 'bg-[#121215] border-[#1e293b] text-slate-400 hover:text-white hover:border-slate-500'
            }`}
          >
            <Save className="w-3 h-3" />
            <span>{showSaveForm ? 'Hide Save Panel' : 'Save Current Layer Settings'}</span>
          </button>
        </div>
        
        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search sound design presets..."
            className="w-full bg-[#121215] border border-[#1e293b] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-yellow-400/40"
          />
        </div>
      </div>

      {/* Dropdown selectors and Submenus */}
      <div className="p-4 bg-[#070709] border-b border-[#1e293b]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500">Filter By</span>
          
          <div className="flex items-center gap-2">
            {/* Filter Type Selector */}
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as any)}
              className="bg-[#121215] border border-[#1e293b] rounded-lg text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 text-yellow-400 focus:outline-none focus:border-yellow-400 cursor-pointer"
            >
              <option value="all">📁 All Source Types</option>
              <option value="factory">📦 Factory Presets</option>
              <option value="user">👤 User Saved Presets</option>
              <option value="favorites">★ Starred Favorites</option>
            </select>

            {/* Category Selector */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-[#121215] border border-[#1e293b] rounded-lg text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 text-blue-400 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label === 'All Sounds' ? '🔊 All Categories' : cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">
          {filteredItems.length} of {allItems.length} Presets Listed
        </span>
      </div>

      {/* List / Form Main layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 overflow-y-auto max-h-[500px] custom-scrollbar">
        {/* Left Side: Preset Cards (changes from 8 to 12 cols depending on save form visibility) */}
        <div className={`${showSaveForm ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-3`}>
          {filteredItems.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center border border-dashed border-[#1e293b] rounded-xl text-slate-500 gap-2">
              <FolderOpen className="w-8 h-8 text-slate-600 animate-pulse" />
              <p className="text-xs uppercase font-extrabold tracking-wider">No presets found</p>
              <p className="text-[10px] text-slate-400 max-w-xs">Try clearing your filters or search terms to find your sound design patches.</p>
            </div>
          ) : (
            <div className={`grid grid-cols-1 ${showSaveForm ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'} gap-3`}>
              {filteredItems.map((item) => {
                const isFav = favorites.includes(item.id);
                const isSelected = selectedLayer ? (selectedLayer.name.includes(`(${item.name})`) || selectedLayer.name === item.name) : false;
                
                return (
                  <div
                    key={item.id}
                    onClick={() => handleApplyPreset(item)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group ${
                      isSelected
                        ? 'bg-yellow-400/5 border-yellow-400/60 shadow-[0_0_15px_rgba(250,204,21,0.05)]'
                        : 'bg-black border-[#1e293b] hover:border-slate-500 hover:bg-[#0d0d10]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 overflow-hidden">
                        <span className="text-lg bg-[#121215] p-1.5 rounded-lg border border-[#1e293b] shrink-0">
                          {item.icon || '🔊'}
                        </span>
                        <div className="overflow-hidden">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-[11px] font-extrabold text-white uppercase tracking-wider truncate">
                              {item.name}
                            </h4>
                            {item.isUser ? (
                              <span className="text-[9px] font-mono px-1 bg-blue-900/40 text-blue-300 border border-blue-500/30 rounded uppercase tracking-wider shrink-0">User</span>
                            ) : (
                              <span className="text-[9px] font-mono px-1 bg-yellow-950/40 text-yellow-300 border border-yellow-500/30 rounded uppercase tracking-wider shrink-0">Factory</span>
                            )}
                          </div>
                          <p className="text-[9.5px] text-slate-400 line-clamp-2 mt-1 leading-normal">
                            {item.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => toggleFavorite(item.id, e)}
                          className="p-1 rounded hover:bg-[#1a1a24] text-slate-400 hover:text-amber-400 transition-colors"
                          title="Star preset"
                        >
                          <Star className={`w-3.5 h-3.5 ${isFav ? 'text-amber-400 fill-amber-400' : ''}`} />
                        </button>
                        {item.isUser && (
                          <button
                            onClick={(e) => handleDeleteUserPreset(item.id, e)}
                            className="p-1 rounded hover:bg-red-950/40 text-slate-500 hover:text-red-400 transition-colors"
                            title="Delete Preset"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-[#1e293b]/40 mt-3 pt-2.5">
                      <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1">
                        <Tag className="w-2.5 h-2.5" /> {item.category}
                      </span>
                      
                      <div className="flex gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddLayerWithPreset(item);
                          }}
                          className="px-2 py-1 bg-[#121215] border border-[#1e293b] hover:bg-yellow-400 hover:text-black rounded text-[8.5px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-2.5 h-2.5" /> New Layer
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApplyPreset(item);
                          }}
                          className={`px-2 py-1 rounded text-[8.5px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer ${
                            isSelected
                              ? 'bg-yellow-400 text-black border border-yellow-400'
                              : 'bg-yellow-400/10 hover:bg-yellow-400 hover:text-black border border-yellow-400/40 text-yellow-400'
                          }`}
                        >
                          <Check className="w-2.5 h-2.5" /> Apply
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: Save Current Layer Form (4 cols, render only if showSaveForm is true) */}
        {showSaveForm && (
          <div className="lg:col-span-4 bg-black border border-[#1e293b] rounded-xl p-4 flex flex-col justify-between h-fit">
            <form onSubmit={handleSaveCurrentAsPreset} className="space-y-4">
              <div className="flex items-center gap-2 border-b border-[#1e293b] pb-2">
                <Save className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[10px] font-black text-white uppercase tracking-wider">Save Current Layer Settings</span>
              </div>

              {selectedLayer ? (
                <>
                  <div className="p-3 bg-[#0a0a0c] border border-[#1e293b]/60 rounded-lg">
                    <span className="text-[9px] text-slate-500 font-mono block uppercase">Source Patch</span>
                    <span className="text-[10px] text-yellow-400 font-extrabold uppercase tracking-wide truncate block mt-0.5">
                      {selectedLayer.name}
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono block mt-1 uppercase">
                      Type: {selectedLayer.type} / Gain: {selectedLayer.gain} / Pitch: {selectedLayer.pitch}st
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[8.5px] text-slate-400 font-extrabold uppercase tracking-widest block">Preset Name</label>
                    <input
                      type="text"
                      required
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder="e.g., Heavy Sub Bass, Clean Snap Snare"
                      className="w-full bg-[#121215] border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-yellow-400/40"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <label className="text-[8.5px] text-slate-400 font-extrabold uppercase tracking-widest block">Category</label>
                      <select
                        value={newPresetCat}
                        onChange={(e) => setNewPresetCat(e.target.value)}
                        className="w-full bg-[#121215] border border-[#1e293b] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-yellow-400/40 cursor-pointer"
                      >
                        <option value="kick">Kick</option>
                        <option value="snare">Snare</option>
                        <option value="hat">Hi-Hat</option>
                        <option value="sub">Sub Bass</option>
                        <option value="synth">Lead/Synth</option>
                        <option value="pad">Pad/Atmos</option>
                        <option value="fx">FX/Perc</option>
                      </select>
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="text-[8.5px] text-slate-400 font-extrabold uppercase tracking-widest block">Avatar Icon</label>
                      <select
                        value={newPresetIcon}
                        onChange={(e) => setNewPresetIcon(e.target.value)}
                        className="w-full bg-[#121215] border border-[#1e293b] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-yellow-400/40 cursor-pointer"
                      >
                        <option value="🔊">🔊 Synth/Sample</option>
                        <option value="🔥">🔥 Heavy Bass</option>
                        <option value="💥">💥 Kick Punch</option>
                        <option value="⚡">⚡ Snare snap</option>
                        <option value="✨">✨ Bright Hat</option>
                        <option value="🌀">🌀 Lead Pluck</option>
                        <option value="🌊">🌊 Ambient Pad</option>
                        <option value="💫">💫 Special FX</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[8.5px] text-slate-400 font-extrabold uppercase tracking-widest block">Preset Description</label>
                    <textarea
                      value={newPresetDesc}
                      onChange={(e) => setNewPresetDesc(e.target.value)}
                      placeholder="Describe your synth/sample patch settings..."
                      rows={2}
                      className="w-full bg-[#121215] border border-[#1e293b] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-yellow-400/40 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-yellow-400 hover:bg-yellow-300 text-black text-[10px] font-black uppercase rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Sound Preset</span>
                  </button>
                </>
              ) : (
                <div className="py-6 text-center text-slate-500 italic text-[10px] uppercase">
                  Select a Sound Layer first to save custom presets
                </div>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
