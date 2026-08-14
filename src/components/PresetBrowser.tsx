/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { presets } from '../presets';
import { useRackStore } from '../store/rackStore';
import { saveProject, fetchUserProjects } from '../lib/db';
import { Bookmark, Save, Trash2, FolderOpen, Star, Search } from 'lucide-react';

export const PresetBrowser: React.FC = () => {
  const { modules, setModules } = useRackStore();
  const [userPresets, setUserPresets] = useState<Record<string, any[]>>(() => {
    try {
      const saved = localStorage.getItem('studio_rack_user_presets');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });
  
  const [newPresetName, setNewPresetName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'favorites' | 'factory' | 'user'>('all');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('studio_rack_favorite_presets');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('studio_rack_favorite_presets', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    let isMounted = true;
    const syncLocalPresets = async () => {
      try {
        const cloudProjects = await fetchUserProjects();
        if (isMounted && cloudProjects.length > 0) {
          setUserPresets(prev => {
            const merged = { ...prev };
            cloudProjects.forEach((proj) => {
              if (proj.title && proj.layers && proj.layers.length > 0) {
                // Only load if it's a DSP rack preset, not a sound lab project stack
                const firstItem = proj.layers[0];
                const isRackPreset = firstItem && !('gain' in firstItem) && !('envelope' in firstItem);
                if (isRackPreset) {
                  merged[proj.title] = proj.layers;
                }
              }
            });
            return merged;
          });
        }
      } catch (err) {
        console.warn('Local preset sync note:', err);
      }
    };
    syncLocalPresets();
    return () => { isMounted = false; };
  }, []);

  const handleApplyPreset = (name: string, isUser = false) => {
    if (isUser && userPresets[name]) {
      setModules(JSON.parse(JSON.stringify(userPresets[name])));
    } else if (presets[name]) {
      setModules(presets[name]());
    }
    setSelectedPreset(name);
  };

  const handleSaveCurrentPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim() || modules.length === 0) return;

    const name = newPresetName.trim();
    const updated = {
      ...userPresets,
      [name]: JSON.parse(JSON.stringify(modules)),
    };
    setUserPresets(updated);
    try {
      localStorage.setItem('studio_rack_user_presets', JSON.stringify(updated));
      await saveProject(name, name, modules);
    } catch (err) {
      console.error('Failed saving preset to storage', err);
    }
    setNewPresetName('');
    setSelectedPreset(name);
  };

  const handleDeleteUserPreset = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = { ...userPresets };
    delete updated[name];
    setUserPresets(updated);
    try {
      localStorage.setItem('studio_rack_user_presets', JSON.stringify(updated));
    } catch (err) {
      console.error('Failed deleting preset', err);
    }
  };

  const toggleFavorite = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev =>
      prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]
    );
  };

  // Filter Factory and User list based on search and selected categories
  const factoryKeys = Object.keys(presets).filter(name => {
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase());
    const isFav = favorites.includes(name);
    if (activeFilter === 'favorites') return matchesSearch && isFav;
    if (activeFilter === 'user') return false;
    return matchesSearch;
  });

  const userKeys = Object.keys(userPresets).filter(name => {
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase());
    const isFav = favorites.includes(name);
    if (activeFilter === 'favorites') return matchesSearch && isFav;
    if (activeFilter === 'factory') return false;
    return matchesSearch;
  });

  const totalFilteredCount = factoryKeys.length + userKeys.length;

  return (
    <div className="bg-[#121215] rounded-2xl border border-[#2A2A2E] p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#2A2A2E] gap-2">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-orange-400" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-white">Rack Preset Manager</h3>
        </div>
        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
          {totalFilteredCount} of {Object.keys(presets).length + Object.keys(userPresets).length} Presets Listed
        </span>
      </div>

      {/* Search and Category Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search rack presets..."
            className="w-full bg-[#1A1A1E] border border-[#2A2A2E] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>

        {/* Filter Dropdown Selector */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as any)}
            className="bg-[#1A1A1E] border border-[#2A2A2E] rounded-lg text-xs font-bold uppercase tracking-wider px-3 py-1.5 text-orange-400 focus:outline-none focus:border-orange-500 cursor-pointer"
          >
            <option value="all">📁 All Preset Types</option>
            <option value="factory">📦 Factory Presets</option>
            <option value="user">👤 User Saved Presets</option>
            <option value="favorites">★ Starred Favorites</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Factory Presets Column */}
        {activeFilter !== 'user' && (
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">
              Factory Presets
            </span>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {factoryKeys.length === 0 ? (
                <div className="h-20 flex items-center justify-center text-[10px] text-gray-600 italic text-center">
                  No matching factory presets.
                </div>
              ) : (
                factoryKeys.map((name) => (
                  <div
                    key={name}
                    onClick={() => handleApplyPreset(name)}
                    className={`w-full text-left p-2.5 rounded-lg border font-mono text-xs transition-all flex items-center justify-between cursor-pointer ${
                      selectedPreset === name
                        ? 'bg-orange-500/15 border-orange-400 text-orange-300 font-bold'
                        : 'bg-[#1A1A1E] border-[#2A2A2E] hover:border-gray-600 text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Bookmark className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                      <span className="truncate pr-1">{name}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[8.5px] text-gray-500 font-sans">
                        {presets[name]().length} FX
                      </span>
                      <button
                        onClick={(e) => toggleFavorite(name, e)}
                        className="p-1 rounded hover:bg-gray-800 transition-colors cursor-pointer"
                        title={favorites.includes(name) ? "Unstar preset" : "Star preset"}
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            favorites.includes(name) ? 'text-amber-400 fill-amber-400' : 'text-gray-500 hover:text-gray-300'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* User Presets Column */}
        {activeFilter !== 'factory' && (
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">
              Saved User Presets
            </span>
            
            <form onSubmit={handleSaveCurrentPreset} className="flex gap-2 mb-2">
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="Save current FX chain..."
                className="flex-1 bg-[#1A1A1E] border border-[#2A2A2E] rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-orange-500"
              />
              <button
                type="submit"
                disabled={!newPresetName.trim() || modules.length === 0}
                className="px-3.5 py-1.5 rounded-lg bg-orange-500 text-black font-bold text-xs hover:bg-orange-400 disabled:opacity-40 flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Save
              </button>
            </form>

            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {userKeys.length === 0 ? (
                <div className="h-20 flex items-center justify-center text-[10px] text-gray-600 italic text-center">
                  {searchTerm ? "No matching user presets." : "No user presets saved yet. Build your FX chain and click Save."}
                </div>
              ) : (
                userKeys.map((name) => (
                  <div
                    key={name}
                    onClick={() => handleApplyPreset(name, true)}
                    className={`p-2.5 rounded-lg border font-mono text-xs transition-all flex items-center justify-between cursor-pointer ${
                      selectedPreset === name
                        ? 'bg-orange-500/15 border-orange-400 text-orange-300 font-bold'
                        : 'bg-[#1A1A1E] border-[#2A2A2E] hover:border-gray-600 text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Bookmark className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="truncate pr-1">{name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={(e) => toggleFavorite(name, e)}
                        className="p-1 rounded hover:bg-gray-800 transition-colors cursor-pointer"
                        title={favorites.includes(name) ? "Unstar preset" : "Star preset"}
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            favorites.includes(name) ? 'text-amber-400 fill-amber-400' : 'text-gray-500 hover:text-gray-300'
                          }`}
                        />
                      </button>
                      <button
                        onClick={(e) => handleDeleteUserPreset(name, e)}
                        className="p-1 text-red-400/50 hover:text-red-400 hover:bg-red-500/10 rounded cursor-pointer"
                        title="Delete Preset"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
