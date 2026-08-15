/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Save, Trash2, Cloud, FolderOpen, RefreshCw, 
  AlertCircle, Clock, HelpCircle,
  FileCode, Layers, ArrowRight, Server, Database, Globe
} from 'lucide-react';
import { SoundLayer } from '../types';
import { 
  saveProject, 
  fetchUserProjects, 
  deleteProject, 
  SavedSoundProject 
} from '../lib/db';

interface ProjectManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  layers: SoundLayer[];
  onLoadProject: (layers: SoundLayer[], title: string) => void;
  onAddToast: (message: string, type: 'success' | 'info' | 'warn') => void;
  snapshotA: SoundLayer[] | null;
  snapshotB: SoundLayer[] | null;
  onLoadSnapshot: (slot: 'A' | 'B') => void;
  onStoreSnapshot: (slot: 'A' | 'B') => void;
}

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  isOpen,
  onClose,
  layers,
  onLoadProject,
  onAddToast,
  snapshotA,
  snapshotB,
  onLoadSnapshot,
  onStoreSnapshot,
}) => {
  const [projects, setProjects] = useState<SavedSoundProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Save form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectTags, setProjectTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // UI state
  const [activeTab, setActiveTab] = useState<'browse' | 'save' | 'snapshots'>('browse');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch projects from local IndexedDB on open/mount
  const loadProjects = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const fetched = await fetchUserProjects();
      
      // Update local cache
      localStorage.setItem('sonik_projects_cache', JSON.stringify(fetched));
      setProjects(fetched);
    } catch (err) {
      console.warn('Error loading local projects, reading from cache', err);
      // Fallback to local cache
      try {
        const cached = localStorage.getItem('sonik_projects_cache');
        if (cached) {
          setProjects(JSON.parse(cached));
        }
      } catch (cacheErr) {
        console.warn('Project cache is corrupt', cacheErr);
      }
      onAddToast('Could not load projects. Using cached list.', 'info');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadProjects();
      // Pre-fill save form if there's a custom name
      const firstLayerName = layers[0]?.name || '';
      if (firstLayerName) {
        setTitle(`${firstLayerName.split(' (')[0]} Stack`);
      } else {
        setTitle('New Sound Stack');
      }
    }
  }, [isOpen]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      onAddToast('Please enter a project title', 'warn');
      return;
    }

    setSaving(true);
    const projId = crypto.randomUUID();
    const projTitle = title.trim();
    const projDesc = description.trim();

    try {
      await saveProject(projId, projTitle, layers, projDesc, projectTags);
      
      onAddToast(`Project "${projTitle}" saved to local library!`, 'success');
      
      // Clear save form and reload list
      setTitle('');
      setDescription('');
      setProjectTags([]);
      setActiveTab('browse');
      await loadProjects(true);
    } catch (err) {
      onAddToast('Failed to save project locally.', 'warn');
      // Save locally to local cache list anyway for offline resilience
      let cacheList: SavedSoundProject[] = [];
      try {
        const cached = localStorage.getItem('sonik_projects_cache');
        cacheList = cached ? JSON.parse(cached) : [];
      } catch (cacheErr) {
        console.warn('Project cache is corrupt', cacheErr);
      }
      
      const offlineProj: SavedSoundProject = {
        id: projId,
        title: projTitle,
        ownerId: 'offline-user',
        layers: layers.map(({ audioBuffer, ...rest }) => rest),
        updatedAt: new Date().toISOString(),
        description: projDesc,
        tags: projectTags
      };
      
      const updatedCache = [offlineProj, ...cacheList.filter(p => p.id !== projId)];
      localStorage.setItem('sonik_projects_cache', JSON.stringify(updatedCache));
      setProjects(updatedCache);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteProject(id);
      onAddToast(`Deleted project "${name}"`, 'info');
      
      // Update state and cache
      const updated = projects.filter(p => p.id !== id);
      setProjects(updated);
      localStorage.setItem('sonik_projects_cache', JSON.stringify(updated));
      setDeleteConfirmId(null);
    } catch (err) {
      onAddToast('Failed to delete project.', 'warn');
    }
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const tag = tagInput.trim().toLowerCase();
      if (tag && !projectTags.includes(tag)) {
        setProjectTags([...projectTags, tag]);
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (indexToRemove: number) => {
    setProjectTags(projectTags.filter((_, i) => i !== indexToRemove));
  };

  // Filter projects by search
  const filteredProjects = projects.filter(proj => {
    const term = searchTerm.toLowerCase();
    const matchesTitle = proj.title.toLowerCase().includes(term);
    const matchesDesc = (proj.description || '').toLowerCase().includes(term);
    const matchesTags = (proj.tags || []).some(t => t.toLowerCase().includes(term));
    return matchesTitle || matchesDesc || matchesTags;
  });

  const getLayerBreakdown = (projLayers: any[]) => {
    const synths = projLayers.filter(l => l.type === 'synth').length;
    const samples = projLayers.filter(l => l.type === 'sample').length;
    
    const parts: string[] = [];
    if (synths > 0) parts.push(`${synths} Synth${synths > 1 ? 's' : ''}`);
    if (samples > 0) parts.push(`${samples} Sample${samples > 1 ? 's' : ''}`);
    return parts.join(', ') || 'Empty';
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffSecs < 60) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'Unknown date';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Project Manager">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className="relative w-full max-w-2xl bg-[#0b0c10] border border-[#1e293b] rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="px-6 py-5 bg-[#0e1117] border-b border-[#1e293b] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-yellow-500/20 to-blue-500/20 border border-yellow-500/30 text-yellow-400">
                  <Database size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-black font-urban uppercase tracking-widest text-white">
                    Sound Lab Backup & Presets
                  </h2>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono mt-0.5 flex items-center gap-1.5">
                    <Globe size={10} className={isOffline ? "text-red-400 animate-pulse" : "text-green-400"} />
                    {isOffline ? 'Offline Cache Storage active' : 'Local Library active'}
                  </p>
                </div>
              </div>
              
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-[#111827] bg-[#0c0f14]/50 px-6 pt-2">
              <button
                onClick={() => setActiveTab('browse')}
                className={`py-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'browse'
                    ? 'border-yellow-400 text-yellow-400 font-bold'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <FolderOpen size={14} />
                <span>Browse Project Stacks ({projects.length})</span>
              </button>
              
              <button
                onClick={() => setActiveTab('save')}
                className={`py-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'save'
                    ? 'border-yellow-400 text-yellow-400 font-bold'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Save size={14} />
                <span>Backup Current Setup</span>
              </button>

              <button
                onClick={() => setActiveTab('snapshots')}
                className={`py-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'snapshots'
                    ? 'border-yellow-400 text-yellow-400 font-bold'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <FileCode size={14} />
                <span>Volatile Snapshots</span>
              </button>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-6 min-h-[350px]">
              {activeTab === 'browse' && (
                <div className="space-y-4">
                  {/* Search Bar & Refresh */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Search saved stacks by title, tag, or description..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="flex-1 bg-[#050508] border border-[#1e293b] hover:border-slate-700 focus:border-yellow-400 transition-colors rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none"
                    />
                    <button
                      onClick={() => loadProjects()}
                      disabled={loading}
                      title="Sync from local library"
                      className="p-2.5 bg-[#0e1117] border border-[#1e293b] text-slate-300 hover:text-yellow-400 rounded-xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center"
                    >
                      <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                  </div>

                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 space-y-3">
                      <RefreshCw className="w-8 h-8 text-yellow-400 animate-spin" />
                      <p className="text-xs text-slate-400 uppercase tracking-widest font-mono">Synchronizing Sound Stacks...</p>
                    </div>
                  ) : filteredProjects.length === 0 ? (
                    <div className="border border-dashed border-[#1e293b] rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-4 bg-black/20">
                      <div className="p-3 bg-slate-900/40 rounded-2xl text-slate-500">
                        <FolderOpen size={32} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-white uppercase tracking-wider">No Project Stacks Found</p>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm">
                          {searchTerm ? "No projects match your search term. Try another word." : "You haven't backed up any sound setups yet. Head over to the 'Backup Current Setup' tab."}
                        </p>
                      </div>
                      {!searchTerm && (
                        <button
                          onClick={() => setActiveTab('save')}
                          className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-black text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                        >
                          Back Up Current State Now
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {filteredProjects.map((proj) => (
                        <div
                          key={proj.id}
                          className="p-4 rounded-2xl bg-[#0c0e14] border border-[#1e293b] hover:border-slate-700 transition-all group flex flex-col md:flex-row md:items-center justify-between gap-4"
                        >
                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-xs font-black text-white uppercase tracking-wider">
                                {proj.title}
                              </h3>
                              <span className="text-[9px] font-mono font-bold bg-[#1e293b] px-1.5 py-0.5 rounded text-blue-300 border border-blue-900/30 flex items-center gap-1">
                                <Layers size={10} />
                                {getLayerBreakdown(proj.layers)}
                              </span>
                            </div>

                            {proj.description && (
                              <p className="text-[10px] text-slate-400 line-clamp-2 pr-4 leading-relaxed">
                                {proj.description}
                              </p>
                            )}

                            <div className="flex items-center gap-3 pt-0.5 flex-wrap">
                              <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                <Clock size={10} />
                                {formatRelativeTime(proj.updatedAt)}
                              </span>

                              {(proj.tags || []).map((t) => (
                                <span
                                  key={t}
                                  className="text-[8px] font-mono font-black text-yellow-300 uppercase bg-[#251f10]/40 border border-yellow-500/20 px-1.5 py-0.5 rounded"
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 justify-end self-end md:self-center">
                            {deleteConfirmId === proj.id ? (
                              <div className="flex items-center gap-1.5 bg-red-950/30 border border-red-500/30 p-1.5 rounded-xl">
                                <span className="text-[9px] font-mono font-bold text-red-300 px-2">Delete permanently?</span>
                                <button
                                  onClick={() => handleDelete(proj.id, proj.title)}
                                  className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-[9px] font-black uppercase rounded-lg transition-colors cursor-pointer"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] font-black uppercase rounded-lg transition-colors cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    onLoadProject(proj.layers, proj.title);
                                    onClose();
                                  }}
                                  className="px-3.5 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-black text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1 hover:scale-[1.02] cursor-pointer"
                                >
                                  Load Stack
                                  <ArrowRight size={10} className="stroke-[3]" />
                                </button>
                                
                                <button
                                  onClick={() => setDeleteConfirmId(proj.id)}
                                  className="p-1.5 border border-transparent hover:border-red-900/50 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                                  title="Delete from list"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'save' && (
                <form onSubmit={handleSave} className="space-y-4">
                  <div className="bg-[#0f172a]/20 border border-[#1e293b] rounded-2xl p-4 flex gap-3 items-start">
                    <AlertCircle className="text-yellow-400 shrink-0 mt-0.5" size={16} />
                    <div className="space-y-1">
                      <h4 className="text-xs font-black text-white uppercase tracking-wider">Save Entire Layer Configuration</h4>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        This action will serialize all active and inactive sound layers, volume faders, LFO filters, tape delays, and analog engine models. Due to size constraints, raw sample files are not stored in the local database, but all crop boundaries, parameters, and paths will be safely restored.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">Stack / Preset Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Heavy Analog Kick Layer, Cinematic Brass Stack"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-[#050508] border border-[#1e293b] focus:border-yellow-400 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">Description (Optional)</label>
                      <textarea
                        placeholder="Write a brief note detailing the sound layering concept, filters applied, or spatial placement..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        className="w-full bg-[#050508] border border-[#1e293b] focus:border-yellow-400 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none resize-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">Tags (Press Enter or Comma to add)</label>
                      <div className="w-full bg-[#050508] border border-[#1e293b] focus-within:border-yellow-400 rounded-xl p-2.5 flex flex-wrap gap-2 items-center">
                        {projectTags.map((tag, index) => (
                          <span
                            key={tag}
                            className="text-[9px] font-mono font-black text-yellow-300 uppercase bg-[#251f10] border border-yellow-500/20 px-2 py-0.5 rounded-lg flex items-center gap-1"
                          >
                            #{tag}
                            <button
                              type="button"
                              onClick={() => handleRemoveTag(index)}
                              className="text-slate-400 hover:text-white font-sans text-[10px] ml-1 focus:outline-none cursor-pointer"
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                        <input
                          type="text"
                          placeholder="e.g. 808, lofi, dark"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={handleAddTag}
                          className="bg-transparent text-xs text-white placeholder-slate-600 focus:outline-none flex-1 min-w-[120px]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-6 py-3 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 disabled:opacity-50 text-black font-black font-hiphop uppercase tracking-widest rounded-xl text-xs transition-all flex items-center gap-2 hover:scale-[1.02] cursor-pointer shadow-lg shadow-yellow-500/10"
                    >
                      <Cloud size={14} className={saving ? 'animate-spin' : ''} />
                      <span>{saving ? 'Saving...' : 'Store Local Backup'}</span>
                    </button>
                  </div>
                </form>
              )}

              {activeTab === 'snapshots' && (
                <div className="space-y-5">
                  <div className="bg-[#0f172a]/20 border border-[#1e293b] rounded-2xl p-4 flex gap-3 items-start">
                    <HelpCircle className="text-blue-400 shrink-0 mt-0.5" size={16} />
                    <div className="space-y-1">
                      <h4 className="text-xs font-black text-white uppercase tracking-wider">Fast A/B State Comparisons</h4>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Snapshots let you instantly freeze your entire stack and compare parameters during tweaking or mastering. Unlike standard library saves, snapshots are meant for rapid workspace comparisons. We have enhanced these volatile snapshots to persist to your local browser storage, protecting your work even if you close the tab.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Snapshot A Slot */}
                    <div className="p-4 rounded-2xl bg-[#0c0e14] border border-[#1e293b] flex flex-col justify-between space-y-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold text-yellow-400 uppercase tracking-widest">Snapshot A Slot</span>
                          <span className={`text-[8px] font-mono font-black uppercase px-1.5 py-0.5 rounded ${
                            snapshotA ? 'bg-green-500/20 text-green-300 border border-green-500/20' : 'bg-slate-800 text-slate-500'
                          }`}>
                            {snapshotA ? 'Active' : 'Empty'}
                          </span>
                        </div>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider mt-2">
                          {snapshotA ? `${snapshotA.length} Saved Layer Stack` : 'No Saved Setup'}
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {snapshotA ? 'Stored in local browser storage' : 'Ready to capture current workbench state.'}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => onStoreSnapshot('A')}
                          className="flex-1 py-2 border border-blue-500/30 hover:border-blue-500 bg-blue-950/10 hover:bg-blue-950/30 text-blue-300 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer"
                        >
                          Store Current
                        </button>
                        <button
                          onClick={() => {
                            if (!snapshotA) {
                              onAddToast('Snapshot A is empty. Store current setup first.', 'warn');
                              return;
                            }
                            onLoadSnapshot('A');
                            onClose();
                          }}
                          disabled={!snapshotA}
                          className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-900 disabled:text-slate-600 text-white text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer"
                        >
                          Load
                        </button>
                      </div>
                    </div>

                    {/* Snapshot B Slot */}
                    <div className="p-4 rounded-2xl bg-[#0c0e14] border border-[#1e293b] flex flex-col justify-between space-y-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold text-purple-400 uppercase tracking-widest">Snapshot B Slot</span>
                          <span className={`text-[8px] font-mono font-black uppercase px-1.5 py-0.5 rounded ${
                            snapshotB ? 'bg-green-500/20 text-green-300 border border-green-500/20' : 'bg-slate-800 text-slate-500'
                          }`}>
                            {snapshotB ? 'Active' : 'Empty'}
                          </span>
                        </div>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider mt-2">
                          {snapshotB ? `${snapshotB.length} Saved Layer Stack` : 'No Saved Setup'}
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {snapshotB ? 'Stored in local browser storage' : 'Ready to capture current workbench state.'}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => onStoreSnapshot('B')}
                          className="flex-1 py-2 border border-purple-500/30 hover:border-purple-500 bg-purple-950/10 hover:bg-purple-950/30 text-purple-300 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer"
                        >
                          Store Current
                        </button>
                        <button
                          onClick={() => {
                            if (!snapshotB) {
                              onAddToast('Snapshot B is empty. Store current setup first.', 'warn');
                              return;
                            }
                            onLoadSnapshot('B');
                            onClose();
                          }}
                          disabled={!snapshotB}
                          className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-900 disabled:text-slate-600 text-white text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer"
                        >
                          Load
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-[#0e1117] border-t border-[#1e293b] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Server size={12} className="text-blue-500" />
                Durable Backup Version 2.0 • Encryption Enabled
              </span>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer"
              >
                Close Panel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
