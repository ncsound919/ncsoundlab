/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase 5.1 — Sample Browser.
 *
 * A left-panel browser for the user's persistent sample library. Folders
 * (IndexedDB) on top, samples below. Each row is draggable
 * (`application/x-ncsoundlab-sample` MIME carrying the sample id) so the
 * Producer stage's pads + layers + chopper can accept drops. File drops
 * onto the panel import new samples into the library.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchLibraryFolders,
  createLibraryFolder,
  renameLibraryFolder,
  deleteLibraryFolder,
  fetchLibrarySamples,
  fetchLibrarySample,
  decodeLibrarySample,
  deleteLibrarySample,
  updateLibrarySample,
  saveLibrarySample,
  filterLibrarySamples,
  analyzeLibrarySample,
  type SampleLibrarySample,
  type SampleLibraryFolder,
} from '../lib/sampleLibrary';
import { audioEngine } from '../audio/AudioEngine';
import {
  Search,
  FolderPlus,
  FolderOpen,
  FolderMinus,
  Play,
  Square,
  Trash2,
  Edit2,
  Plus,
  Upload,
  Music,
} from 'lucide-react';

/** Custom MIME carried by dragstart so other components can detect a library
 * sample drag. The payload is the sample id; receivers decode via
 * `decodeLibrarySample`. */
export const SAMPLE_DRAG_MIME = 'application/x-ncsoundlab-sample';

const CATEGORY_COLORS: Record<string, string> = {
  Kick: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  Snare: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  HiHat: 'bg-yellow-500/20 text-yellow-200 border-yellow-500/40',
  Clap: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  '808': 'bg-red-500/20 text-red-300 border-red-500/40',
  Perc: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  Vox: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40',
  FX: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  Melody: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  Bass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
  Atmospheres: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  default: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
};

function categoryClass(cat: string): string {
  return CATEGORY_COLORS[cat] || CATEGORY_COLORS.default;
}

interface SampleBrowserProps {
  /** Active folder id, or `null` for "All Samples". Controlled by parent if needed. */
  selectedFolderId?: string | null;
  onSelectFolder?: (folderId: string | null) => void;
  /** Called when the user clicks the "send to current pad/layer" action on a sample. */
  onUseSample?: (sample: SampleLibrarySample, buffer: AudioBuffer) => void;
  /** Called for an external drag-drop onto the panel (e.g. native file drops). */
  onImportExternal?: (samples: SampleLibrarySample[]) => void;
  /** Compact mode hides the header to fit the panel inside a tight slot. */
  compact?: boolean;
}

export const SampleBrowser: React.FC<SampleBrowserProps> = ({
  selectedFolderId,
  onSelectFolder,
  onUseSample,
  onImportExternal,
  compact = false,
}) => {
  const [folders, setFolders] = useState<SampleLibraryFolder[]>([]);
  const [samples, setSamples] = useState<SampleLibrarySample[]>([]);
  const [internalFolderId, setInternalFolderId] = useState<string | null>(null);
  const activeFolderId = selectedFolderId === undefined ? internalFolderId : selectedFolderId;
  const setActiveFolder = onSelectFolder ?? setInternalFolderId;

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  // Guards against stale async responses overwriting newer ones: folder
  // switches and preview clicks each bump a token so a slow older response
  // can't clobber the newer request's result.
  const refreshRequestRef = useRef(0);
  const previewRequestRef = useRef(0);

  const refresh = useCallback(async () => {
    const reqId = ++refreshRequestRef.current;
    try {
      const [f, s] = await Promise.all([
        fetchLibraryFolders(),
        fetchLibrarySamples(activeFolderId === null ? null : activeFolderId),
      ]);
      if (reqId !== refreshRequestRef.current) return;
      setFolders(f);
      setSamples(s);
    } catch (err) {
      if (reqId !== refreshRequestRef.current) return;
      console.warn('Sample library refresh failed:', err);
    }
  }, [activeFolderId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const categories = useMemo(() => {
    const set = new Set<string>(['All']);
    for (const s of samples) set.add(s.category);
    return Array.from(set);
  }, [samples]);

  const filtered = useMemo(() => filterLibrarySamples(samples, query, category), [samples, query, category]);

  // Cleanup preview audio on unmount.
  useEffect(() => {
    return () => {
      if (activeSourceRef.current) {
        try { activeSourceRef.current.onended = null; activeSourceRef.current.stop(); } catch {}
        try { activeSourceRef.current.disconnect(); } catch {}
        activeSourceRef.current = null;
      }
    };
  }, []);

  // ----- Folder CRUD -----

  const handleCreateFolder = async () => {
    try {
      const id = await createLibraryFolder({ name: 'New Folder' });
      setActiveFolder(id);
      await refresh();
    } catch (err) {
      console.warn('Failed to create folder', err);
    }
  };

  const handleRenameFolder = async (id: string, name: string) => {
    try {
      await renameLibraryFolder(id, name);
    } catch (err) {
      console.warn('Failed to rename folder', err);
      setErrors(['Could not rename folder.']);
    }
    setRenamingFolderId(null);
    await refresh();
  };

  const handleDeleteFolder = async (id: string) => {
    try {
      await deleteLibraryFolder(id);
    } catch (err) {
      console.warn('Failed to delete folder', err);
      setErrors(['Could not delete folder.']);
    }
    if (activeFolderId === id) setActiveFolder(null);
    await refresh();
  };

  // ----- Sample CRUD -----

  const handleDeleteSample = async (id: string) => {
    if (playingId === id) {
      try { activeSourceRef.current?.stop(); } catch {}
      activeSourceRef.current = null;
      setPlayingId(null);
    }
    try {
      await deleteLibrarySample(id);
    } catch (err) {
      console.warn('Failed to delete sample', err);
      setErrors(['Could not delete sample.']);
    }
    await refresh();
  };

  const handleUpdateSample = async (id: string, patch: Parameters<typeof updateLibrarySample>[1]) => {
    try {
      await updateLibrarySample(id, patch);
    } catch (err) {
      console.warn('Failed to update sample', err);
      setErrors(['Could not update sample.']);
    }
    await refresh();
  };

  // ----- Preview / Play -----

  const handlePreview = async (sample: SampleLibrarySample) => {
    if (playingId === sample.id) {
      try { activeSourceRef.current?.stop(); } catch {}
      activeSourceRef.current = null;
      setPlayingId(null);
      return;
    }
    const previewRequestId = ++previewRequestRef.current;
    try {
      if (activeSourceRef.current) {
        try { activeSourceRef.current.onended = null; activeSourceRef.current.stop(); } catch {}
        try { activeSourceRef.current.disconnect(); } catch {}
      }
      const ctx = audioEngine.getContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') await ctx.resume();
      const buffer = await decodeLibrarySample(ctx, sample);
      // A newer preview click may have superseded this one while we decoded —
      // don't let a slow older decode stomp on the newer request.
      if (previewRequestId !== previewRequestRef.current) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      activeSourceRef.current = source;
      setPlayingId(sample.id);
      source.onended = () => {
        if (activeSourceRef.current === source) {
          activeSourceRef.current = null;
        }
        try { source.disconnect(); } catch {}
        setPlayingId((prev) => (prev === sample.id ? null : prev));
      };
    } catch (err) {
      console.warn('Sample preview failed', err);
      setErrors([`Could not preview "${sample.name}".`]);
    }
  };

  const handleUseSample = async (sample: SampleLibrarySample) => {
    if (!onUseSample) return;
    try {
      const ctx = audioEngine.getContext();
      if (!ctx) return;
      const buffer = await decodeLibrarySample(ctx, sample);
      onUseSample(sample, buffer);
    } catch (err) {
      console.warn('Could not decode sample for use', err);
    }
  };

  // ----- Drag start -----

  const handleDragStart = (e: React.DragEvent, sample: SampleLibrarySample) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(SAMPLE_DRAG_MIME, sample.id);
    e.dataTransfer.setData('text/plain', sample.name);
  };

  // ----- Import -----

  const importFiles = async (files: File[]) => {
    const audioFiles = files.filter((f) => /\.(wav|mp3|ogg|flac|aiff|m4a)$/i.test(f.name));
    if (audioFiles.length === 0) return;
    setIsImporting(true);
    setErrors([]);
    try {
      const ctx = audioEngine.getContext();
      if (!ctx) {
        setErrors(['AudioContext unavailable.']);
        return;
      }
      if (ctx.state === 'suspended') await ctx.resume();
      const imported: SampleLibrarySample[] = [];
      for (const file of audioFiles) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const decoded = await ctx.decodeAudioData(arrayBuffer);
          const analysis = analyzeLibrarySample(decoded);
          const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').toUpperCase();
          const id = await saveLibrarySample({
            name: cleanName || 'SAMPLE',
            fileName: file.name,
            folderId: activeFolderId,
            category: analysis.suggestedCategory,
            audioBuffer: decoded,
            analysis,
            sizeBytes: file.size,
          });
          const saved = await fetchLibrarySample(id);
          if (saved) imported.push(saved);
        } catch (err: any) {
          setErrors((prev) => [...prev, `${file.name}: ${err?.message || 'decode failed'}`]);
        }
      }
      onImportExternal?.(imported);
      await refresh();
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) importFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      importFiles(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div
      className={`flex flex-col h-full bg-[#0e0e12] border border-[#1e293b] rounded-xl overflow-hidden ${
        isDragOver ? 'ring-2 ring-blue-500/60' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragOver(false);
      }}
      onDrop={handleDrop}
    >
      {!compact && (
        <div className="px-3 py-2 border-b border-[#1e293b] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-blue-400" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-white">Sample Library</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              title="Import audio files"
              className="p-1.5 rounded-md bg-[#16161a] border border-[#2A2A2E] hover:border-blue-500 text-blue-400 disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleCreateFolder}
              title="New folder"
              className="p-1.5 rounded-md bg-[#16161a] border border-[#2A2A2E] hover:border-amber-500 text-amber-400"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".wav,.mp3,.ogg,.flac,.aiff,.m4a"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      )}

      {/* Folder tree */}
      <div className="border-b border-[#1e293b] bg-[#0a0a0e]">
        <FolderRow
          id={null}
          name="All Samples"
          count={null}
          active={activeFolderId === null}
          onClick={() => setActiveFolder(null)}
        />
        <div className="max-h-32 overflow-y-auto custom-scrollbar">
          {folders.map((f) => (
            <FolderRow
              key={f.id}
              id={f.id}
              name={f.name}
              count={null}
              active={activeFolderId === f.id}
              renaming={renamingFolderId === f.id}
              renameValue={renameValue}
              onClick={() => setActiveFolder(f.id)}
              onStartRename={() => { setRenamingFolderId(f.id); setRenameValue(f.name); }}
              onCancelRename={() => setRenamingFolderId(null)}
              onSubmitRename={(name) => handleRenameFolder(f.id, name)}
              onChangeRenameValue={setRenameValue}
              onDelete={() => handleDeleteFolder(f.id)}
            />
          ))}
          {folders.length === 0 && (
            <div className="px-3 py-2 text-[10px] text-slate-500">No folders yet.</div>
          )}
        </div>
      </div>

      {/* Search + category */}
      <div className="px-2 py-2 border-b border-[#1e293b] flex flex-col gap-1.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1.5" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or tag…"
            className="w-full bg-[#16161a] border border-[#2A2A2E] rounded-md pl-7 pr-2 py-1 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-[#16161a] border border-[#2A2A2E] rounded-md px-2 py-1 text-[11px] text-white focus:outline-none focus:border-blue-500"
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>
          ))}
        </select>
      </div>

      {/* Sample list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isImporting && (
          <div className="px-3 py-2 text-[10px] text-blue-300">Importing…</div>
        )}
        {errors.length > 0 && (
          <div className="px-3 py-2 space-y-1">
            {errors.map((e, i) => (
              <div key={i} className="text-[10px] text-red-300">{e}</div>
            ))}
          </div>
        )}
        {filtered.length === 0 && !isImporting && (
          <div className="px-3 py-4 text-[10px] text-slate-500 text-center">
            {samples.length === 0 ? 'No samples yet. Drag audio files here.' : 'No matches.'}
          </div>
        )}
        {filtered.map((sample) => (
          <div
            key={sample.id}
            draggable
            onDragStart={(e) => handleDragStart(e, sample)}
            className="group flex items-center gap-2 px-2 py-1.5 border-b border-[#1a1a22] hover:bg-[#16161e] cursor-grab active:cursor-grabbing"
          >
            <button
              onClick={() => handlePreview(sample)}
              title="Preview"
              className={`p-1 rounded border transition-all flex-shrink-0 ${
                playingId === sample.id
                  ? 'bg-blue-500 text-black border-blue-400'
                  : 'bg-[#1c1c22] border-[#2A2A2E] text-slate-300 hover:text-white'
              }`}
            >
              {playingId === sample.id ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold text-white truncate" title={sample.name}>{sample.name}</div>
              <div className="flex items-center gap-1.5 text-[9px] text-slate-400">
                <span className={`px-1 py-px rounded border ${categoryClass(sample.category)}`}>{sample.category}</span>
                <span>{sample.analysis?.durationSeconds?.toFixed(2) ?? '—'}s</span>
              </div>
            </div>
            {onUseSample && (
              <button
                onClick={() => handleUseSample(sample)}
                title="Use sample in active layer"
                className="p-1 rounded text-emerald-400 hover:text-emerald-200 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => handleUpdateSample(sample.id, { name: prompt('Rename sample', sample.name) || sample.name })}
              title="Rename"
              className="p-1 rounded text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            <button
              onClick={() => handleDeleteSample(sample.id)}
              title="Delete"
              className="p-1 rounded text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// FolderRow
// ---------------------------------------------------------------------------

interface FolderRowProps {
  id: string | null;
  name: string;
  count: number | null;
  active: boolean;
  renaming?: boolean;
  renameValue?: string;
  onClick: () => void;
  onStartRename?: () => void;
  onCancelRename?: () => void;
  onSubmitRename?: (name: string) => void;
  onChangeRenameValue?: (value: string) => void;
  onDelete?: () => void;
}

const FolderRow: React.FC<FolderRowProps> = ({
  name,
  count,
  active,
  renaming,
  renameValue,
  onClick,
  onStartRename,
  onCancelRename,
  onSubmitRename,
  onChangeRenameValue,
  onDelete,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  return (
    <div
      onClick={!renaming ? onClick : undefined}
      className={`group flex items-center gap-1.5 px-2 py-1 cursor-pointer text-[11px] ${
        active ? 'bg-blue-600/20 text-blue-200' : 'text-slate-300 hover:bg-[#16161e]'
      }`}
    >
      {active ? (
        <FolderOpen className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
      ) : (
        <FolderOpen className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
      )}
      {renaming ? (
        <input
          ref={inputRef}
          value={renameValue || ''}
          onChange={(e) => onChangeRenameValue?.(e.target.value)}
          onBlur={() => onSubmitRename?.((renameValue || '').trim() || 'Folder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmitRename?.((renameValue || '').trim() || 'Folder');
            if (e.key === 'Escape') onCancelRename?.();
          }}
          autoFocus
          className="flex-1 bg-[#1a1a22] border border-blue-500 rounded px-1 py-px text-[11px] text-white focus:outline-none"
        />
      ) : (
        <span className="flex-1 truncate" title={name}>{name}</span>
      )}
      {count !== null && <span className="text-[9px] text-slate-500">{count}</span>}
      {!renaming && onStartRename && (
        <button
          onClick={(e) => { e.stopPropagation(); onStartRename(); }}
          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-white p-0.5"
          title="Rename"
        >
          <Edit2 className="w-3 h-3" />
        </button>
      )}
      {!renaming && onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-0.5"
          title="Delete"
        >
          <FolderMinus className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};