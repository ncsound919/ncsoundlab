/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Square, 
  Download, 
  Upload, 
  UploadCloud,
  Trash2, 
  Layers, 
  Volume2, 
  Music,
  Waves,
  Settings2,
  Zap,
  Sliders,
  Activity,
  FolderOpen,
  Package,
  ShoppingBag,
  Drum,
  Cloud,
  Save,
  PanelLeftClose,
  PanelLeft,
  ChevronRight,
  ChevronLeft,
  Check,
  Sparkles,
  ArrowRight,
  PackagePlus,
  ShieldCheck,
  Plus,
  Move3d,
  BookOpen,
  Loader2
} from 'lucide-react';
import { 
  fetchSoundKits, 
  saveSoundKit
} from './lib/db';
import { 
  SoundLayer, 
  DEFAULT_ENVELOPE, 
  DEFAULT_FX, 
  DEFAULT_SYNTH,
  SoundKit,
  SoundKitSample,
  FXSettings
} from './types';
import { audioEngine } from './lib/audioEngine';
import { audioEngine as sharedAudioEngine } from './audio/AudioEngine';
import { audioBufferToWav } from './lib/audioUtils';
const WaveformEditor = lazy(() => import('./components/WaveformEditor').then(m => ({ default: m.WaveformEditor })));
import { Fader } from './components/Fader';
import { Knob } from './components/Knob';

// Lazy loaded heavy components
const ProjectManagerModal = lazy(() => import('./components/ProjectManagerModal').then(m => ({ default: m.ProjectManagerModal })));
const AddToKitModal = lazy(() => import('./components/AddToKitModal').then(m => ({ default: m.AddToKitModal })));
const KeyboardShortcutsModal = lazy(() => import('./components/KeyboardShortcutsModal').then(m => ({ default: m.KeyboardShortcutsModal })));
const UserManualModal = lazy(() => import('./components/UserManualModal').then(m => ({ default: m.UserManualModal })));
const CompareEnginePanel = lazy(() => import('./components/CompareEnginePanel').then(m => ({ default: m.CompareEnginePanel })));
const SoundKitCreator = lazy(() => import('./components/SoundKitCreator').then(m => ({ default: m.SoundKitCreator })));
const StudioSequencer = lazy(() => import('./components/StudioSequencer').then(m => ({ default: m.StudioSequencer })));
const ChopEditor = lazy(() => import('./components/ChopEditor').then(m => ({ default: m.ChopEditor })));
const SoundKitCatalog = lazy(() => import('./components/SoundKitCatalog').then(m => ({ default: m.SoundKitCatalog })));
const EvolutionPanel = lazy(() => import('./components/EvolutionPanel').then(m => ({ default: m.EvolutionPanel })));
const ThreeDSoundSpace = lazy(() => import('./components/ThreeDSoundSpace').then(m => ({ default: m.ThreeDSoundSpace })));
const StudioRack = lazy(() => import('./components/StudioRack').then(m => ({ default: m.StudioRack })));
const LayerMixer = lazy(() => import('./components/LayerMixer').then(m => ({ default: m.LayerMixer })));
const MasterDynamicsPanel = lazy(() => import('./components/MasterDynamicsPanel').then(m => ({ default: m.MasterDynamicsPanel })));
const FXChainPresetsPanel = lazy(() => import('./components/FXChainPresetsPanel').then(m => ({ default: m.FXChainPresetsPanel })));
const LayerEditor = lazy(() => import('./components/LayerEditor').then(m => ({ default: m.LayerEditor })));
const LayerPresetBrowser = lazy(() => import('./components/LayerPresetBrowser').then(m => ({ default: m.LayerPresetBrowser })));

const SystemCohesionDeck = lazy(() => import('./components/SystemCohesionDeck').then(m => ({ default: m.SystemCohesionDeck })));

// Advanced Waveform Editing and Procedural Chaos Synthesis imports
import { 
  reverseBuffer,
  normalizeBuffer,
  trimBuffer,
  fadeInBuffer,
  fadeOutBuffer,
  invertPhase,
  glitchBuffer,
  gainAdjustBuffer
} from './lib/waveformEditor';
import { generateChaosSynthBuffer } from './lib/chaosSynth';
import { generateEvolutionVariations } from './lib/evolutionEngine';
import { analyzeAudioBuffer } from './lib/batchAudioProcessor';

// Hardware & Sound Kit Components
import { MasterMeter } from './components/MasterMeter';
import { ToastContainer, ToastMessage } from './components/ToastContainer';
import { useSequencerStore, BankId } from './store/sequencerStore';
import { usePatternStore } from './store/patternStore';
import { useRackStore } from './store/rackStore';
import { useMasterDynamicsStore } from './store/masterDynamicsStore';
import { useHistoryStore, buildSnapshot, useCanUndo, useCanRedo, type HistorySnapshot } from './store/historyStore';
import {
  scheduleAutosave,
  flushAutosave,
  installAutosaveFlushHandlers,
  uninstallAutosaveFlushHandlers,
  readAutosaveDocument,
  clearAutosave,
} from './lib/autosave';
import { deserializeProject } from './lib/projectFormat';

type TabType = 'soundlab' | 'tweaking' | 'mixer' | 'spatial' | 'evolution' | 'compare' | 'kitcreator' | 'catalog' | 'produce';
import { EvolutionVariation } from './types';

interface WorkflowStage {
  id: TabType;
  stageNumber: string;
  name: string;
  shortName: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  accentClass: string;
  badgeClass: string;
  borderActive: string;
}

const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    id: 'soundlab',
    stageNumber: '01',
    name: 'Synth Layering & Samples',
    shortName: '01 Layering',
    subtitle: 'Layer & Preset Workspace',
    description: 'Manage sound layers, apply presets, and upload/edit audio sample files.',
    icon: Layers,
    accentClass: 'text-blue-400',
    badgeClass: 'bg-blue-600/20 text-blue-300 border-blue-500/40 shadow-[0_0_10px_rgba(37,99,235,0.3)]',
    borderActive: 'border-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.45)]',
  },
  {
    id: 'tweaking',
    stageNumber: '02',
    name: 'Synth Parameter Tweaker',
    shortName: '02 Tweaking',
    subtitle: 'Presets, LFO, Osc, Filter, FX',
    description: 'Tweak synthesis, envelope generators, layer presets, and effects parameters for the active layer.',
    icon: Sliders,
    accentClass: 'text-teal-400',
    badgeClass: 'bg-teal-600/20 text-teal-300 border-teal-500/40 shadow-[0_0_10px_rgba(20,184,166,0.3)]',
    borderActive: 'border-teal-400 shadow-[0_0_20px_rgba(20,184,166,0.45)]',
  },
  {
    id: 'produce',
    stageNumber: '03',
    name: 'Beat Studio & Sequencer',
    shortName: '03 Beat Studio',
    subtitle: 'MPC Pads · Step Sequencer · Piano',
    description: 'Build beats on MPC pads, program 16-step patterns per layer, and play the piano.',
    icon: Drum,
    accentClass: 'text-rose-400',
    badgeClass: 'bg-rose-600/20 text-rose-300 border-rose-500/40 shadow-[0_0_10px_rgba(244,63,94,0.3)]',
    borderActive: 'border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.45)]',
  },
  {
    id: 'mixer',
    stageNumber: '04',
    name: 'Studio Console Mixer',
    shortName: '04 Mixer Console',
    subtitle: 'Faders & Master Dynamics Rack',
    description: 'Full-screen multi-channel fader console, channel strip EQ, and master processing rack.',
    icon: Volume2,
    accentClass: 'text-indigo-400',
    badgeClass: 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40 shadow-[0_0_10px_rgba(99,102,241,0.3)]',
    borderActive: 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.45)]',
  },
  {
    id: 'spatial',
    stageNumber: '05',
    name: 'Spatial 3D & Reverb',
    shortName: '05 Spatial Space',
    subtitle: '3D Positioning & Reverb',
    description: 'Full-screen 3D spatial pan coordinates room, binaural sound stage, and spatial reverb parameters.',
    icon: Move3d,
    accentClass: 'text-amber-400',
    badgeClass: 'bg-amber-600/20 text-amber-300 border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.3)]',
    borderActive: 'border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.45)]',
  },
  {
    id: 'evolution',
    stageNumber: '06',
    name: 'Sound Evolution Engine',
    shortName: '06 Evolution',
    subtitle: 'Mutant Variation Lab',
    description: 'Take a sound and mutate it through multiple states to generate 10–50 unique variations.',
    icon: Sparkles,
    accentClass: 'text-fuchsia-300',
    badgeClass: 'bg-fuchsia-600/20 text-fuchsia-300 border-fuchsia-500/40 shadow-[0_0_10px_rgba(232,121,249,0.3)]',
    borderActive: 'border-fuchsia-400 shadow-[0_0_20px_rgba(232,121,249,0.45)]',
  },
  {
    id: 'compare',
    stageNumber: '07',
    name: 'Compare Engine',
    shortName: '07 Compare',
    subtitle: 'Dry vs Wet Level Matching',
    description: 'Compare Dry and Wet waveforms with zero‑latency volume matching and precise differential analysis.',
    icon: Activity,
    accentClass: 'text-orange-400',
    badgeClass: 'bg-orange-600/20 text-orange-300 border-orange-500/40 shadow-[0_0_10px_rgba(249,115,22,0.3)]',
    borderActive: 'border-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.45)]',
  },
  {
    id: 'kitcreator',
    stageNumber: '08',
    name: 'Sound Kit Creator',
    subtitle: 'Sample Pack & Artwork',
    shortName: '08 Creator',
    description: 'Bundle synthesized one-shots into distribution kits with AI artwork',
    icon: Package,
    accentClass: 'text-yellow-400',
    badgeClass: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40 shadow-[0_0_10px_rgba(250,204,21,0.3)]',
    borderActive: 'border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.45)]',
  },
  {
    id: 'catalog',
    stageNumber: '09',
    name: 'Production Catalog',
    shortName: '09 Catalog',
    subtitle: 'Publish & Cloud Distro',
    description: 'Publish sound kits to your local catalog or audition catalog packs',
    icon: ShoppingBag,
    accentClass: 'text-purple-300',
    badgeClass: 'bg-purple-600/20 text-purple-300 border-purple-500/40 shadow-[0_0_10px_rgba(192,132,252,0.3)]',
    borderActive: 'border-purple-400 shadow-[0_0_20px_rgba(192,132,252,0.45)]',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('soundlab');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const [layers, setLayersInternal] = useState<SoundLayer[]>([]);
  const [masterLevel, setMasterLevel] = useState(0.8);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Synchronous wrapper for layers state
  const setLayers = (newLayersOrFn: SoundLayer[] | ((prev: SoundLayer[]) => SoundLayer[])) => {
    setLayersInternal((prev) => {
      const next = typeof newLayersOrFn === 'function' ? newLayersOrFn(prev) : newLayersOrFn;
      return next;
    });
  };

  // ---- History (Phase 0.3) ----
  // Generalized undo/redo: layers + patterns + programs + chain + master are
  // captured into a `HistorySnapshot` whenever they change. The applier
  // restores those values back into the live state on undo/redo.
  const patternStore = usePatternStore();
  const sequencerStore = useSequencerStore();
  const rackModules = useRackStore((s) => s.modules);
  const setRackModules = useRackStore((s) => s.setModules);

  const applyHistorySnapshot = useCallback((snap: HistorySnapshot) => {
    setLayersInternal(snap.layers);
    usePatternStore.setState({
      patterns: snap.patterns,
      activePatternId: snap.activePatternId,
      songChain: { order: snap.songChain.order as unknown as string[] },
    });
    useSequencerStore.setState({
      programs: snap.programs,
      activeBank: snap.activeBank,
    });
    setMasterLevel(snap.masterLevel);
    setActiveSnapshotName(null);
  }, []);

  useEffect(() => {
    useHistoryStore.getState().setApplier(applyHistorySnapshot);
    return () => {
      useHistoryStore.getState().setApplier(null);
    };
  }, [applyHistorySnapshot]);

  // Skip committing the very first state on mount (avoids a phantom undo
  // entry for the initial empty layers array).
  const isInitialMountRef = useRef(true);
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    const snap = buildSnapshot({
      layers,
      patterns: patternStore.patterns,
      programs: sequencerStore.programs,
      activePatternId: patternStore.activePatternId,
      songChain: patternStore.songChain,
      activeBank: sequencerStore.activeBank,
      masterLevel,
      masterRack: [],
      globalSwing: 0,
      bpm: patternStore.patterns[patternStore.activePatternId].bpm,
      timeSignature: patternStore.patterns[patternStore.activePatternId].timeSignature,
    });
    useHistoryStore.getState().commit(snap);
  }, [layers, masterLevel, patternStore, sequencerStore]);

  const handleUndo = () => {
    const restored = useHistoryStore.getState().undo();
    if (!restored) return;
    if (restored.layers.length > 0) {
      if (!restored.layers.find(l => l.id === selectedLayerId)) {
        setSelectedLayerId(restored.layers[0].id);
      }
    } else {
      setSelectedLayerId(null);
    }
  };

  const handleRedo = () => {
    const restored = useHistoryStore.getState().redo();
    if (!restored) return;
    if (restored.layers.length > 0) {
      if (!restored.layers.find(l => l.id === selectedLayerId)) {
        setSelectedLayerId(restored.layers[0].id);
      }
    }
  };

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [compositeBuffer, setCompositeBuffer] = useState<AudioBuffer | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isAddToKitOpen, setIsAddToKitOpen] = useState(false);
  const [pendingKitSample, setPendingKitSample] = useState<SoundKitSample | null>(null);
  const [abState, setAbState] = useState<'A' | 'B'>('B');
  const [monitorTab, setMonitorTab] = useState<'waveform' | 'spatial'>('waveform');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // UX Enhancement States & Handlers
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isUserManualOpen, setIsUserManualOpen] = useState(false);
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState(false);
  const [hasAutoSave, setHasAutoSave] = useState(false);

  const [snapshotA, setSnapshotA] = useState<SoundLayer[] | null>(() => {
    try {
      const saved = localStorage.getItem('sonik_snapshot_a');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [snapshotB, setSnapshotB] = useState<SoundLayer[] | null>(() => {
    try {
      const saved = localStorage.getItem('sonik_snapshot_b');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [copiedFX, setCopiedFX] = useState<FXSettings | null>(null);
  const [exportFilename, setExportFilename] = useState('custom_oneshot');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [chopMode, setChopMode] = useState(false);
  const [chopCount, setChopCount] = useState(4);
  const [chopBuffer, setChopBuffer] = useState<AudioBuffer | null>(null);
  const [chopFileName, setChopFileName] = useState('sample');
  const [activeSnapshotName, setActiveSnapshotName] = useState<'A' | 'B' | null>(null);

  const addToast = (message: string, type: 'success' | 'info' | 'warn' | 'error' = 'info') => {
    const id = crypto.randomUUID();
    // Cap the stack at 4 toasts so they never flood the viewport
    setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleDuplicateLayer = (targetId?: string) => {
    const layerToDup = layers.find((l) => l.id === (targetId || selectedLayerId));
    if (!layerToDup) return;
    const duplicated: SoundLayer = {
      ...JSON.parse(JSON.stringify(layerToDup)),
      id: crypto.randomUUID(),
      name: `${layerToDup.name} (Copy)`,
      audioBuffer: layerToDup.audioBuffer,
    };
    setLayers((prev) => [...prev, duplicated]);
    setSelectedLayerId(duplicated.id);
    addToast(`Duplicated layer "${layerToDup.name}"`, 'success');
  };

  const handleCopyFX = (layerId: string) => {
    const target = layers.find((l) => l.id === layerId);
    if (target) {
      setCopiedFX(JSON.parse(JSON.stringify(target.fx)));
      addToast(`Copied FX settings from "${target.name}"`, 'info');
    }
  };

  const handlePasteFX = (layerId: string) => {
    if (!copiedFX) {
      addToast('No FX settings in clipboard to paste', 'warn');
      return;
    }
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, fx: JSON.parse(JSON.stringify(copiedFX)) } : l))
    );
    addToast('Pasted FX settings to active layer', 'success');
  };

  const handleRandomizePitchPan = (layerId: string) => {
    const randomPitch = Math.floor(Math.random() * 25) - 12;
    const randomPan = +(Math.random() * 1.6 - 0.8).toFixed(2);
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, pitch: randomPitch, pan: randomPan } : l))
    );
    addToast(`Randomized Pitch (${randomPitch > 0 ? '+' : ''}${randomPitch}ST) & Pan (${randomPan})`, 'info');
  };

  const handleStoreSnapshot = (slot: 'A' | 'B') => {
    if (layers.length === 0) return;
    const copy = layers.map(layer => ({
      ...JSON.parse(JSON.stringify(layer)),
      audioBuffer: layer.audioBuffer
    }));
    if (slot === 'A') {
      setSnapshotA(copy);
      addToast('Stored current setup into Snapshot A', 'success');
    } else {
      setSnapshotB(copy);
      addToast('Stored current setup into Snapshot B', 'success');
    }
  };

  const handleLoadSnapshot = (slot: 'A' | 'B') => {
    const snap = slot === 'A' ? snapshotA : snapshotB;
    if (!snap) {
      addToast(`Snapshot ${slot} is empty. Store a setup first.`, 'warn');
      return;
    }
    const copy = snap.map(layer => ({
      ...JSON.parse(JSON.stringify(layer)),
      audioBuffer: layer.audioBuffer
    }));
    setLayers(copy);
    setActiveSnapshotName(slot);
    addToast(`Loaded Snapshot ${slot}`, 'info');
  };

  const handleLoadProject = (newLayers: SoundLayer[], title: string) => {
    audioEngine.stop();
    setIsPlaying(false);
    setLayers(newLayers);
    if (newLayers.length > 0) {
      setSelectedLayerId(newLayers[0].id);
    } else {
      setSelectedLayerId(null);
    }
    setActiveSnapshotName(null);
    addToast(`Loaded Sound Lab Project: "${title}"`, 'success');
  };

  const [isPlaying, setIsPlaying] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  // Synchronize dynamic playback state from Audio Engine
  useEffect(() => {
    const interval = setInterval(() => {
      setIsPlaying(audioEngine.getIsPlaying());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Sync selected layer's play crop points to the visualizer selection
  useEffect(() => {
    if (selectedLayer) {
      setSelectionStart(selectedLayer.playStartPct ?? 0);
      setSelectionEnd(selectedLayer.playEndPct ?? 1);
    } else {
      setSelectionStart(0);
      setSelectionEnd(1);
    }
  }, [selectedLayerId, selectedLayer?.playStartPct, selectedLayer?.playEndPct]);

  // Waveform Edit Lab States
  const [selectionStart, setSelectionStart] = useState<number>(0);
  const [selectionEnd, setSelectionEnd] = useState<number>(1);
  const [fadeDuration, setFadeDuration] = useState<number>(0.1);
  const [glitchIntensity, setGlitchIntensity] = useState<number>(0.4);
  const [gainDB, setGainDB] = useState<number>(3.0);

  // Chaos One-Shot Sidebar Generator States
  const [chaosFXStyle, setChaosFXStyle] = useState<'swarm' | 'blast' | 'laser' | 'stutter' | 'drift'>('swarm');
  const [sidebarMacroChaos, setSidebarMacroChaos] = useState<number>(0.65);

  // Sync A/B state with the audio engine
  useEffect(() => {
    audioEngine.setBypassFX(abState === 'A');
    updatePreview();
  }, [abState]);

  // User published kits state
  const [publishedKits, setPublishedKits] = useState<SoundKit[]>(() => {
    try {
      const saved = localStorage.getItem('sonik_published_kits');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [evolutionVariations, setEvolutionVariations] = useState<EvolutionVariation[]>([]);
  const [isEvolving, setIsEvolving] = useState(false);

  const currentStageIndex = WORKFLOW_STAGES.findIndex(s => s.id === activeTab);
  const currentStage = WORKFLOW_STAGES[currentStageIndex] || WORKFLOW_STAGES[0];

  // Sync published kits from local IndexedDB on startup
  useEffect(() => {
    let isMounted = true;
    const loadLocalKits = async () => {
      try {
        const cloudKits = await fetchSoundKits();
        if (isMounted && cloudKits.length > 0) {
          setPublishedKits(prev => {
            const map = new Map<string, SoundKit>();
            [...prev, ...cloudKits].forEach(k => {
              if (k.id) map.set(k.id, k);
            });
            return Array.from(map.values());
          });
        }
      } catch (err) {
        console.warn('Local kit sync notice:', err);
      }
    };
    loadLocalKits();
    return () => { isMounted = false; };
  }, []);

  // Phase 0.4 — check for an autosave recovery document on startup.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const doc = await readAutosaveDocument();
        if (cancelled) return;
        if (doc && (doc.layers.length > 0 || doc.patterns.A.layerRows || Object.keys(doc.patterns.A.layerRows || {}).length > 0)) {
          setHasAutoSave(true);
        }
      } catch (e) {
        console.warn('Failed reading autosave', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleRestoreAutoSave = async () => {
    const ctx = audioEngine.getContext();
    if (!ctx) {
      addToast('Audio context unavailable — cannot restore samples.', 'warn');
      setHasAutoSave(false);
      return;
    }
    try {
      const doc = await readAutosaveDocument();
      if (!doc) {
        addToast('No autosave snapshot found.', 'info');
        setHasAutoSave(false);
        return;
      }
      const hydrated = await deserializeProject(ctx, doc);
      setLayersInternal(hydrated.layers);
      usePatternStore.setState({
        patterns: hydrated.patterns,
        activePatternId: hydrated.document.activePatternId,
        songChain: { order: hydrated.document.songChain.order as unknown as string[] },
      });
      useSequencerStore.setState({
        programs: hydrated.programs,
        activeBank: hydrated.document.activeBank,
      });
      setMasterLevel(hydrated.document.masterLevel);
      if (hydrated.layers.length > 0) {
        setSelectedLayerId(hydrated.layers[0].id);
      }
      addToast(`Restored autosave (${hydrated.layers.length} layer${hydrated.layers.length === 1 ? '' : 's'}).`, 'success');
    } catch (err) {
      console.warn('Failed to restore autosave', err);
      addToast('Failed to restore autosave session.', 'warn');
    } finally {
      setHasAutoSave(false);
    }
  };

  const handleDiscardAutoSave = async () => {
    await clearAutosave();
    setHasAutoSave(false);
    addToast('Discarded autosave recovery session', 'info');
  };

  // Install beforeunload / visibilitychange flush handlers.
  useEffect(() => {
    installAutosaveFlushHandlers();
    return () => uninstallAutosaveFlushHandlers();
  }, []);

  // Initialize with a default synth layer if empty (and no auto-save was restored)
  useEffect(() => {
    const checkAndInit = setTimeout(() => {
      if (layers.length === 0 && !hasAutoSave) {
        addLayer('synth');
      }
    }, 100);
    return () => clearTimeout(checkAndInit);
  }, [hasAutoSave, layers.length]);

  // Debounced autosave (Phase 0.4) — schedules a snapshot of the full
  // session to IndexedDB. `flushAutosave()` is invoked on
  // visibilitychange/beforeunload so the snapshot survives a tab close.
  useEffect(() => {
    const snapshot = {
      title: 'Untitled Session',
      appVersion: '1.0.0',
      layers,
      patterns: patternStore.patterns,
      activePatternId: patternStore.activePatternId,
      songChain: { order: patternStore.songChain.order },
      programs: sequencerStore.programs,
      activeBank: sequencerStore.activeBank,
      bpm: patternStore.patterns[patternStore.activePatternId].bpm,
      timeSignature: patternStore.patterns[patternStore.activePatternId].timeSignature,
      masterLevel,
      masterRack: { modules: [] as import('./types').RackModule[] },
      globalSwing: 0,
    };
    if (layers.length > 0 || patternStore.songChain.order.length > 0) {
      scheduleAutosave(snapshot, '1.0.0');
    }
  }, [layers, masterLevel, patternStore, sequencerStore]);

  // Sync snapshots to localStorage
  useEffect(() => {
    try {
      if (snapshotA) {
        const sanitized = snapshotA.map(({ audioBuffer, ...rest }) => rest);
        localStorage.setItem('sonik_snapshot_a', JSON.stringify(sanitized));
      } else {
        localStorage.removeItem('sonik_snapshot_a');
      }
    } catch { /* private browsing / quota — non-fatal */ }
  }, [snapshotA]);

  useEffect(() => {
    try {
      if (snapshotB) {
        const sanitized = snapshotB.map(({ audioBuffer, ...rest }) => rest);
        localStorage.setItem('sonik_snapshot_b', JSON.stringify(sanitized));
      } else {
        localStorage.removeItem('sonik_snapshot_b');
      }
    } catch { /* private browsing / quota — non-fatal */ }
  }, [snapshotB]);

  // Update master level in engine
  useEffect(() => {
    audioEngine.setMasterLevel(masterLevel);
  }, [masterLevel]);

  // Global Interactive Keyboard Shortcuts
  useEffect(() => {
    const isAnyModalOpen = isShortcutsOpen || isUserManualOpen || isProjectManagerOpen || isAddToKitOpen || !!chopBuffer;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      const inField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON' || !!document.activeElement?.hasAttribute('contenteditable');

      // Escape always closes the topmost modal, even when a control is focused
      if (e.key === 'Escape' && isAnyModalOpen) {
        if (isShortcutsOpen) { setIsShortcutsOpen(false); return; }
        if (isUserManualOpen) { setIsUserManualOpen(false); return; }
        if (isProjectManagerOpen) { setIsProjectManagerOpen(false); return; }
        if (isAddToKitOpen) { setIsAddToKitOpen(false); return; }
        if (chopBuffer) { setChopBuffer(null); return; }
        return;
      }

      // While any modal is open, ignore all other global shortcuts
      if (isAnyModalOpen) return;

      // Don't intercept when user is active in form fields or focused buttons
      if (inField) return;

      // Stage navigation (Arrow keys move through the production pipeline)
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentStageIndex < WORKFLOW_STAGES.length - 1) {
          setActiveTab(WORKFLOW_STAGES[currentStageIndex + 1].id);
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentStageIndex > 0) {
          setActiveTab(WORKFLOW_STAGES[currentStageIndex - 1].id);
        }
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        if (e.shiftKey) {
          // Shift+Space: preview the full master mix
          if (audioEngine.getIsPlaying()) {
            audioEngine.stop();
            addToast('Playback Stopped', 'info');
          } else {
            audioEngine.playAll(layers);
            addToast('Playing Master Mix', 'info');
          }
          return;
        }
        if (audioEngine.getIsPlaying()) {
          audioEngine.stop();
          addToast('Playback Stopped', 'info');
        } else {
          audioEngine.playAll(layers);
          addToast('Playing Master Mix', 'info');
        }
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === '?' || e.key === '/') {
        e.preventDefault();
        setIsShortcutsOpen((open) => !open);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLayerId) {
        e.preventDefault();
        const id = selectedLayerId;
        setLayers((prev) => prev.filter((l) => l.id !== id));
        setSelectedLayerId(null);
        sharedAudioEngine.disposeModule(id);
        addToast('Layer Deleted', 'info');
      } else if (/^[1-8]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const target = layers[idx];
        if (target) {
          e.preventDefault();
          setSelectedLayerId(target.id);
        }
      } else if (e.key.toLowerCase() === 'm' && selectedLayerId && activeTab !== 'compare' && activeTab !== 'produce') {
        e.preventDefault();
        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, muted: !l.muted } : l));
      } else if (e.key.toLowerCase() === 's' && selectedLayerId && activeTab !== 'compare' && activeTab !== 'produce') {
        e.preventDefault();
        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, soloed: !l.soloed } : l));
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [layers, selectedLayerId, activeTab, currentStageIndex, isShortcutsOpen, isUserManualOpen, isProjectManagerOpen, isAddToKitOpen, chopBuffer]);

  // Synchronize A/B state and handle automatic project-wide waveform preview updates with debouncing
  useEffect(() => {
    audioEngine.setBypassFX(abState === 'A');
    
    const timer = setTimeout(() => {
      updatePreview();
    }, 400);
    
    return () => clearTimeout(timer);
  }, [layers, abState]);

  const updatePreview = async () => {
    if (layers.length === 0) {
      setCompositeBuffer(null);
      return;
    }
    try {
      const buffer = await audioEngine.exportWav(layers, 1.5);
      setCompositeBuffer(buffer);
    } catch (e) {
      console.error('Failed to update preview', e);
    }
  };

  const applyWaveformEdit = (operation: 'reverse' | 'normalize' | 'crop' | 'fadein' | 'fadeout' | 'invert' | 'glitch' | 'gain') => {
    if (!selectedLayer) return;
    const ctx = audioEngine.getContext();
    if (!ctx) return;

    // Get or generate buffer if it's a synth layer without pre-existing buffer
    let currentBuffer = selectedLayer.audioBuffer;
    if (!currentBuffer && selectedLayer.type === 'synth') {
      const settings = selectedLayer.synth || DEFAULT_SYNTH;
      currentBuffer = generateChaosSynthBuffer(ctx, settings, 1.5);
    }

    if (!currentBuffer) return;

    let edited: AudioBuffer;
    switch (operation) {
      case 'reverse':
        edited = reverseBuffer(ctx, currentBuffer);
        break;
      case 'normalize':
        edited = normalizeBuffer(ctx, currentBuffer);
        break;
      case 'crop':
        edited = trimBuffer(ctx, currentBuffer, selectionStart, selectionEnd);
        // Reset selection range after crop
        setSelectionStart(0);
        setSelectionEnd(1);
        break;
      case 'fadein':
        edited = fadeInBuffer(ctx, currentBuffer, fadeDuration);
        break;
      case 'fadeout':
        edited = fadeOutBuffer(ctx, currentBuffer, fadeDuration);
        break;
      case 'invert':
        edited = invertPhase(ctx, currentBuffer);
        break;
      case 'glitch':
        edited = glitchBuffer(ctx, currentBuffer, glitchIntensity);
        break;
      case 'gain':
        edited = gainAdjustBuffer(ctx, currentBuffer, gainDB);
        break;
      default:
        return;
    }

    updateLayer(selectedLayer.id, { audioBuffer: edited });
    
    // Play back edited audio buffer immediately so they can audition the edit!
    audioEngine.playLayer({ ...selectedLayer, audioBuffer: edited });
  };

  const handleGenerateChaosFX = () => {
    const ctx = audioEngine.getContext();
    if (!ctx) return;

    let oscType: any = 'sine';
    let frequency = 440;
    let subLevel = 0;
    let phaseChaos = 0;
    let cycleStretch = 0;
    let fractalHarmonics = 0;
    let harmonicBias = 0;
    let lorenzRate = 0;
    let logisticChaos = 0;
    let feedbackTurbulence = 0;
    let grainCount = 0;
    let grainDrift = 0;
    let grainSizeJitter = 0;
    let sprayRadius = 0;
    let sampleRateChaos = 0;
    let errorInjection = 0;

    const m = sidebarMacroChaos; // macro scaling factor

    switch (chaosFXStyle) {
      case 'swarm':
        oscType = 'sawtooth';
        frequency = 120 + Math.random() * 260;
        phaseChaos = 0.4 + m * 0.5;
        fractalHarmonics = 0.5 + m * 0.4;
        grainCount = Math.floor(25 + m * 60);
        grainDrift = 0.3 + m * 0.6;
        grainSizeJitter = 0.4 + m * 0.5;
        sprayRadius = 0.8;
        errorInjection = 0.02 + m * 0.05;
        break;
      case 'blast':
        oscType = 'sine';
        frequency = 35 + Math.random() * 35; // ultra low
        subLevel = 1.0;
        lorenzRate = 0.5 + m * 0.4;
        logisticChaos = 0.6 + m * 0.3;
        feedbackTurbulence = 0.5 + m * 0.45;
        sampleRateChaos = 0.3 + m * 0.5;
        break;
      case 'laser':
        oscType = 'triangle';
        frequency = 550 + Math.random() * 650;
        cycleStretch = 0.5 + m * 0.4;
        fractalHarmonics = 0.6 + m * 0.3;
        harmonicBias = 0.5 + m * 0.4;
        lorenzRate = 0.8;
        break;
      case 'stutter':
        oscType = 'square';
        frequency = 90 + Math.random() * 120;
        phaseChaos = 0.8;
        feedbackTurbulence = 0.7 + m * 0.25;
        grainCount = Math.floor(10 + m * 30);
        grainDrift = 0.9;
        sampleRateChaos = 0.5 + m * 0.4;
        errorInjection = 0.08 + m * 0.02;
        break;
      case 'drift':
        oscType = 'sine';
        frequency = 180 + Math.random() * 200;
        lorenzRate = 0.3 + m * 0.5;
        phaseChaos = 0.2 + m * 0.4;
        feedbackTurbulence = 0.5 + m * 0.4;
        fractalHarmonics = 0.4 + m * 0.4;
        break;
    }

    const name = `👽_${chaosFXStyle.toUpperCase()}_FX`;

    const generatedSynth = {
      oscType,
      detune: 0,
      frequency,
      pitchEnvAmount: chaosFXStyle === 'laser' ? -24 : 0,
      pitchEnvDecay: 0.15,
      subLevel,
      phaseChaos,
      cycleStretch,
      fractalHarmonics,
      harmonicBias,
      lorenzRate,
      logisticChaos,
      feedbackTurbulence,
      macroChaos: m,
      grainCount,
      grainDrift,
      grainSizeJitter,
      sprayRadius,
      sampleRateChaos,
      errorInjection,
      zeroCrossingMutator: 0,
    };

    // Pre-synthesize the buffer so they see it instantly!
    const audioBuffer = generateChaosSynthBuffer(ctx, generatedSynth, 1.5);

    const newLayer: SoundLayer = {
      id: crypto.randomUUID(),
      name,
      type: 'synth',
      enabled: true,
      gain: 0.8,
      pan: 0,
      pitch: 0,
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.4 },
      fx: { ...DEFAULT_FX, distortion: chaosFXStyle === 'blast' ? 0.4 : 0, reverbMix: 0.25 },
      synth: generatedSynth,
      audioBuffer,
    };

    setLayers(prev => {
      // If we only have the default placeholder empty Synth Layer, replace it
      if (prev.length === 1 && prev[0].type === 'synth' && prev[0].name === 'Synth Layer' && !prev[0].audioBuffer) {
        return [newLayer];
      }
      return [...prev, newLayer];
    });
    setSelectedLayerId(newLayer.id);

    // Play it instantly
    audioEngine.playLayer(newLayer);
  };

  const handleEvolveLayer = async (
    layer: SoundLayer, 
    mode: 'mutations' | 'melodic' | 'kit' = 'mutations',
    fxOption: 'mutate' | 'freeze' | 'fx_only' = 'mutate'
  ) => {
    if (!layer.audioBuffer && layer.type === 'sample') return;
    
    setIsEvolving(true);
    try {
      let sourceBuffer = layer.audioBuffer;
      if (!sourceBuffer && layer.type === 'synth') {
        // Render synth to buffer first
        sourceBuffer = generateChaosSynthBuffer(audioEngine.getContext(), layer.synth || DEFAULT_SYNTH, 1.5);
      }
      
      if (sourceBuffer) {
        const variations = await generateEvolutionVariations(audioEngine.getContext(), sourceBuffer, 24, 0.6, mode, fxOption);
        setEvolutionVariations(variations);
        setActiveTab('evolution');
      }
    } catch (e) {
      console.error('Evolution failed', e);
      setErrorMessage('Evolution engine failed to mutate sound.');
    } finally {
      setIsEvolving(false);
    }
  };

  const addLayer = (type: 'sample' | 'synth', audioBuffer?: AudioBuffer, name?: string): string => {
    const count = layers.filter(l => l.type === type).length;
    const defaultName = `${type === 'sample' ? 'Sample' : 'Synth'} Layer ${count + 1}`;
    const newLayer: SoundLayer = {
      id: crypto.randomUUID(),
      name: name || defaultName,
      type,
      enabled: true,
      gain: 0.8,
      pan: 0,
      pitch: 0,
      envelope: { ...DEFAULT_ENVELOPE },
      fx: { ...DEFAULT_FX },
      audioBuffer,
      synth: type === 'synth' ? { ...DEFAULT_SYNTH } : undefined,
    };
    setLayers(prev => {
      if (type === 'sample' && prev.length === 1 && prev[0].type === 'synth' && (prev[0].name === 'Synth Layer' || prev[0].name === 'Synth Layer 1')) {
        return [newLayer];
      }
      return [...prev, newLayer];
    });
    setSelectedLayerId(newLayer.id);
    if (audioBuffer) {
      // Direct call is safer than arbitrary timeout
      audioEngine.playLayer(newLayer);
    }
    return newLayer.id;
  };

  const handleAddLayerWithPreset = (preset: any) => {
    const layerData = preset.layerData || preset;
    const newLayer: SoundLayer = {
      id: crypto.randomUUID(),
      name: preset.name || 'Preset Layer',
      type: 'synth',
      enabled: true,
      gain: 0.8,
      pan: 0,
      pitch: 0,
      envelope: layerData.envelope ? { ...DEFAULT_ENVELOPE, ...layerData.envelope } : { ...DEFAULT_ENVELOPE },
      fx: layerData.fx ? { ...DEFAULT_FX, ...layerData.fx } : { ...DEFAULT_FX },
      synth: layerData.synth ? { ...DEFAULT_SYNTH, ...layerData.synth } : { ...DEFAULT_SYNTH },
    };
    setLayers(prev => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
    addToast(`Added new preset layer: ${preset.name}`, 'success');
  };

  const handleLoadKitToSoundLab = (kitSamples: SoundKitSample[]) => {
    const newLayers: SoundLayer[] = kitSamples.map((s) => ({
      id: crypto.randomUUID(),
      name: s.name,
      type: 'sample',
      enabled: true,
      gain: s.gain || 0.8,
      pan: 0,
      pitch: s.pitch || 0,
      envelope: { ...DEFAULT_ENVELOPE },
      fx: { ...DEFAULT_FX },
      audioBuffer: s.audioBuffer,
    }));

    setLayers((prev) => [...prev, ...newLayers]);
    if (newLayers.length > 0) setSelectedLayerId(newLayers[0].id);
    setActiveTab('soundlab');
  };

  const handlePublishNewKit = async (newKit: SoundKit) => {
    const updated = [newKit, ...publishedKits];
    setPublishedKits(updated);
    try {
      localStorage.setItem('sonik_published_kits', JSON.stringify(updated));
      // Persist locally for multi-session availability
      await saveSoundKit(newKit);
    } catch (e) {
      console.error('Failed persisting kit', e);
    }
  };

  const handleAddToKit = (
    targetKitId: string | 'new',
    sampleName: string,
    category: any,
    newKitTitle?: string,
    extraOptions?: {
      sampleRate?: string;
      bitDepth?: string;
      stereoMode?: string;
      normalize?: boolean;
      rootKey?: string;
      bpm?: number;
      creator?: string;
      license?: string;
    }
  ) => {
    const bufferToUse = pendingKitSample?.audioBuffer || compositeBuffer || selectedLayer?.audioBuffer;

    const metadataTags = pendingKitSample?.tags || [
      category.toLowerCase(),
      'custom_oneshot',
      'synthesized',
    ];

    if (extraOptions) {
      if (extraOptions.sampleRate) metadataTags.push(`${extraOptions.sampleRate}Hz`);
      if (extraOptions.bitDepth) metadataTags.push(`${extraOptions.bitDepth}bit`);
      if (extraOptions.stereoMode) metadataTags.push(extraOptions.stereoMode);
      if (extraOptions.license) metadataTags.push(`license:${extraOptions.license.toLowerCase().replace(/\s+/g, '_')}`);
    }

    const newSample: SoundKitSample = {
      id: crypto.randomUUID(),
      name: sampleName,
      fileName: `${category.toUpperCase()}_${sampleName.replace(/[^a-zA-Z0-9_-]/g, '_')}.wav`,
      category,
      tags: metadataTags,
      key: extraOptions?.rootKey,
      bpm: extraOptions?.bpm,
      gain: selectedLayer?.gain || 0.8,
      pitch: selectedLayer?.pitch || 0,
      audioBuffer: bufferToUse || undefined,
    };

    let updatedKits: SoundKit[] = [];

    if (targetKitId === 'new') {
      const producerName = extraOptions?.creator || 'SONIK USER';
      const newKit: SoundKit = {
        id: crypto.randomUUID(),
        title: newKitTitle || 'CUSTOM ONE SHOT KIT',
        producer: producerName,
        description: 'A custom sound kit compiled from One-Shot Sound Lab synthesized elements.',
        genre: 'Experimental / Hybrid',
        tags: ['custom', 'oneshot', 'soundlab'],
        price: 0,
        isPublished: true,
        coverArt: {
          theme: 'obsidian',
          title: newKitTitle || 'CUSTOM ONE SHOT KIT',
          subtitle: 'PREMIUM ONE-SHOTS',
          producer: producerName,
          accentColor: '#fb923c',
          overlayTexture: 'vinyl',
        },
        samples: [newSample],
        createdAt: new Date().toISOString(),
      };
      updatedKits = [newKit, ...publishedKits];
    } else {
      updatedKits = publishedKits.map(kit => {
        if (kit.id === targetKitId) {
          return {
            ...kit,
            samples: [...kit.samples, newSample],
          };
        }
        return kit;
      });
    }

    setPublishedKits(updatedKits);
    try {
      localStorage.setItem('sonik_published_kits', JSON.stringify(updatedKits));
      
      // Persist locally
      if (targetKitId === 'new') {
        const newKit = updatedKits[0];
        saveSoundKit(newKit);
      } else {
        const updatedKit = updatedKits.find(k => k.id === targetKitId);
        if (updatedKit) saveSoundKit(updatedKit);
      }
    } catch (e) {
      console.error('Failed to save updated kits', e);
    }
  };

  const removeLayer = (id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id));
    if (selectedLayerId === id) setSelectedLayerId(null);
    // Properly dispose of audio nodes to prevent memory leaks
    sharedAudioEngine.disposeModule(id);
  };

  const handleBounceLayer = async (layer: SoundLayer) => {
    try {
      // Bounce duration: usually the length of the sample or 4 seconds for synth
      const duration = layer.type === 'sample' ? layer.audioBuffer?.duration || 4 : 4;
      const buffer = await audioEngine.exportWav([layer], duration);
      
      const newName = `${layer.name} (Bounce)`;
      addLayer('sample', buffer, newName);
    } catch (e) {
      console.error("Bounce failed:", e);
    }
  };

  // Build sample layers for a list of sounds (without auto-playing them) and
  // add them to the layer stack. MPC pads auto-map from enabled layers.
  const buildSampleLayers = (sounds: { name: string; buffer?: AudioBuffer; start?: number; end?: number; gain?: number; tune?: number }[]) => {
    const newLayers: SoundLayer[] = sounds.map((s) => ({
      id: crypto.randomUUID(),
      name: s.name,
      type: 'sample',
      enabled: true,
      gain: s.gain ?? 0.8,
      pan: 0,
      pitch: s.tune ?? 0,
      envelope: { ...DEFAULT_ENVELOPE },
      fx: { ...DEFAULT_FX },
      audioBuffer: s.buffer,
      playStartPct: s.start ?? 0,
      playEndPct: s.end ?? 1,
    }));
    setLayers((prev) => {
      if (prev.length === 1 && prev[0].type === 'synth' && /^Synth Layer ?1?$/.test(prev[0].name)) {
        return newLayers;
      }
      return [...prev, ...newLayers];
    });
    if (newLayers[0]) setSelectedLayerId(newLayers[0].id);
    return newLayers;
  };

  // Send a set of sounds to a specific MPC program (bank) as layers, then jump
  // to the Beat Studio. Each source maps to its own program bank.
  const handleSendToPads = (sounds: { name: string; buffer?: AudioBuffer; start?: number; end?: number; gain?: number; tune?: number }[], bank: BankId = 'D') => {
    if (!sounds.length) return;
    const added = buildSampleLayers(sounds);
    useSequencerStore.getState().setBankProgram(bank, added.map((l) => l.id));
    useSequencerStore.getState().setActiveBank(bank);
    addToast(`Sent ${added.length} sounds to pads (Program ${bank})`, 'success');
    setActiveTab('produce');
  };

  // Sound Lab layers → Program A
  const handleSendLayersToPads = () => {
    const ids = layers.filter((l) => l.enabled).slice(0, 16).map((l) => l.id);
    useSequencerStore.getState().setBankProgram('A', ids);
    useSequencerStore.getState().setActiveBank('A');
    setActiveTab('produce');
    addToast('Your layers are on the pads (Program A)', 'info');
  };

  // Bounce the current synth into a one-shot sample layer → Program B
  const handleSendSynthToPads = async (layer: SoundLayer) => {
    try {
      const buffer = await audioEngine.exportWav([layer], 4);
      handleSendToPads([{ name: `${layer.name} HIT`, buffer }], 'B');
    } catch (e) {
      console.error('Synth -> pads bounce failed:', e);
      addToast('Could not bounce synth to pads', 'error');
    }
  };

  // Chop editor "Send to Pads" → creates the chop layers and routes to Program D
  const handleChopEditorSend = (sounds: { name: string; buffer?: AudioBuffer; start?: number; end?: number; gain?: number; tune?: number }[]) => {
    handleSendToPads(sounds, 'D');
    setChopBuffer(null);
  };

  const updateLayer = (id: string, updates: Partial<SoundLayer>) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const reorderLayer = (id: string, direction: 'up' | 'down') => {
    setLayers(prev => {
      const idx = prev.findIndex(l => l.id === id);
      if (idx < 0) return prev;
      if (direction === 'up' && idx > 0) {
        const next = [...prev];
        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
        return next;
      }
      if (direction === 'down' && idx < prev.length - 1) {
        const next = [...prev];
        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
        return next;
      }
      return prev;
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = audioEngine.getContext();
      if (!ctx) throw new Error("Audio context not initialized");
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      if (chopMode) {
        setChopBuffer(audioBuffer);
        setChopFileName(file.name);
      } else {
        addLayer('sample', audioBuffer, file.name);
      }
    } catch (err) {
      console.error('Error decoding audio file:', err);
      setErrorMessage(`Failed to decode audio file: ${file.name}. Ensure it is a valid WAV/MP3/OGG.`);
      setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    // Only set to false if leaving the window boundaries
    if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
      setIsDraggingFile(false);
    }
  };

  const handleDropFile = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = audioEngine.getContext();
      if (!ctx) throw new Error("Audio context not initialized");
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      if (chopMode) {
        setChopBuffer(audioBuffer);
        setChopFileName(file.name);
      } else {
        addLayer('sample', audioBuffer, file.name);
      }
      addToast(`Successfully loaded "${file.name}"`, 'success');
    } catch (err) {
      console.error('Error decoding dropped audio file:', err);
      setErrorMessage(`Failed to decode dropped file: ${file.name}.`);
      addToast(`Failed to load "${file.name}"`, 'warn');
      setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  const playSelectedLayer = () => {
    if (selectedLayer) {
      audioEngine.playLayer(selectedLayer);
    } else {
      audioEngine.playAll(layers);
    }
  };

  const applyTemplate = (type: 'kick' | 'snare' | 'hat' | 'sub' | 'fm') => {
    const id = crypto.randomUUID();
    let template: Partial<SoundLayer> = { id, enabled: true, gain: 0.8 };

    switch(type) {
      case 'kick':
        template = {
          ...template,
          name: '909_KICK_INIT',
          type: 'synth',
          envelope: { attack: 0.001, decay: 0.3, sustain: 0.1, release: 0.2 },
          synth: { oscType: 'sine', detune: 0, frequency: 55, pitchEnvAmount: 24, pitchEnvDecay: 0.05, subLevel: 0.5 },
          fx: { ...DEFAULT_FX, distortion: 0.2, filterFreq: 120, filterRes: 1 }
        };
        break;
      case 'snare':
        template = {
          ...template,
          name: 'IND_SNARE_INIT',
          type: 'synth',
          envelope: { attack: 0.001, decay: 0.1, sustain: 0.1, release: 0.1 },
          synth: { oscType: 'square', detune: 0, frequency: 180, pitchEnvAmount: 12, pitchEnvDecay: 0.02, subLevel: 0 },
          fx: { ...DEFAULT_FX, bitcrush: 0.3, filterFreq: 3000, filterRes: 2, reverbMix: 0.1 }
        };
        break;
      case 'sub':
        template = {
          ...template,
          name: 'DEEP_SUB_INIT',
          type: 'synth',
          envelope: { attack: 0.05, decay: 0.5, sustain: 0.8, release: 0.5 },
          synth: { oscType: 'sine', detune: 0, frequency: 40, pitchEnvAmount: 0, pitchEnvDecay: 0.1, subLevel: 1.0 },
          fx: { ...DEFAULT_FX, filterFreq: 80, filterRes: 0.5 }
        };
        break;
      case 'hat':
        template = {
          ...template,
          name: 'CRISP_HAT_INIT',
          type: 'synth',
          envelope: { attack: 0.001, decay: 0.08, sustain: 0.01, release: 0.05 },
          synth: { oscType: 'triangle', detune: 12, frequency: 8000, pitchEnvAmount: 0, pitchEnvDecay: 0.01, subLevel: 0 },
          fx: { ...DEFAULT_FX, filterFreq: 9000, filterType: 'highpass', bitcrush: 0.15 }
        };
        break;
      case 'fm':
        template = {
          ...template,
          name: 'FM_METALLIC_PERC',
          type: 'synth',
          envelope: { attack: 0.002, decay: 0.15, sustain: 0.05, release: 0.1 },
          synth: { oscType: 'sawtooth', detune: 7, frequency: 440, pitchEnvAmount: 18, pitchEnvDecay: 0.03, subLevel: 0.2 },
          fx: { ...DEFAULT_FX, distortion: 0.35, chorusMix: 0.4 }
        };
        break;
    }
    setLayers(prev => [...prev, template as SoundLayer]);
    setSelectedLayerId(id);
  };

  const playAll = () => {
    audioEngine.playAll(layers);
  };

  const handleToggleLoop = () => {
    const next = !loopEnabled;
    setLoopEnabled(next);
    audioEngine.setLoopEnabled(next);
  };

  const exportWav = async () => {
    setIsExporting(true);
    try {
      const buffer = await audioEngine.exportWav(layers, 2);
      const wavBlob = audioBufferToWav(buffer);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      
      const cleanName = exportFilename.trim().replace(/[^a-zA-Z0-9_\-]/g, '') || 'custom_oneshot';
      a.download = `${cleanName}.wav`;
      
      a.click();
      URL.revokeObjectURL(url);
      addToast(`Exported "${cleanName}.wav"`, 'success');
    } catch (e) {
      console.error('Export failed', e);
      addToast('WAV Export Failed', 'warn');
    } finally {
      setIsExporting(false);
    }
  };

  const goToNextStage = () => {
    if (currentStageIndex < WORKFLOW_STAGES.length - 1) {
      setActiveTab(WORKFLOW_STAGES[currentStageIndex + 1].id);
    }
  };

  const goToPrevStage = () => {
    if (currentStageIndex > 0) {
      setActiveTab(WORKFLOW_STAGES[currentStageIndex - 1].id);
    }
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDropFile}
      className="h-screen flex bg-[#08080a] text-[#e0e0e0] font-sans overflow-hidden relative"
    >
      {/* File Drag Overlay Feedback */}
      <AnimatePresence>
        {isDraggingFile && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#090d16]/95 backdrop-blur-md z-50 flex flex-col items-center justify-center border-4 border-dashed border-blue-500 m-4 rounded-3xl pointer-events-none"
          >
            <UploadCloud className="w-16 h-16 text-yellow-400 animate-bounce mb-4" />
            <p className="text-xl font-black text-white uppercase tracking-wider font-urban">Drop Audio File to Load</p>
            <p className="text-[10px] text-gray-400 mt-2 font-mono">Supports WAV, MP3, OGG, & AIFF. Adds as a new sound layer.</p>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* ----------------- COLLAPSIBLE SIDEBAR ----------------- */}
      <aside 
        className={`hidden md:flex bg-[#0d0d10] border-r border-[#1f1f23] flex-col flex-shrink-0 transition-all duration-300 relative z-30 ${
          isSidebarCollapsed ? 'w-18' : 'w-72'
        }`}
      >
        {/* Sidebar Header / Logo */}
        <div className="h-16 px-4 border-b border-[#1a1a1e] flex items-center justify-between bg-black">
          {!isSidebarCollapsed ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/logo.png"
                alt="NC Sound Lab logo"
                className="w-11 h-11 object-contain shrink-0 drop-shadow-[0_0_10px_rgba(37,99,235,0.5)]"
              />
              <div className="min-w-0">
                <h1 className="text-base font-fastblaze tracking-wider text-white uppercase drop-shadow-[0_0_12px_rgba(37,99,235,0.9)]">
                  NC SOUNDLAB
                </h1>
                <p className="text-[9px] font-mono text-yellow-400 tracking-widest uppercase font-bold">
                  SOUND DESIGN ENGINE
                </p>
              </div>
            </div>
          ) : (
            <div className="w-full flex justify-center">
              <img
                src="/logo.png"
                alt="NC Sound Lab logo"
                className="w-9 h-9 object-contain drop-shadow-[0_0_10px_rgba(37,99,235,0.5)]"
              />
            </div>
          )}

          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="p-1.5 rounded-lg bg-[#111827] hover:bg-[#1e3a8a] text-yellow-400 hover:text-white transition-colors border border-blue-900/60 focus-visible:outline-2 focus-visible:outline-yellow-400"
            title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!isSidebarCollapsed}
          >
            {isSidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {/* Workflow Navigation Section */}
        <div className="flex-1 py-4 px-3 overflow-y-auto custom-scrollbar space-y-6">
          <div>
            {!isSidebarCollapsed && (
              <div className="px-2 mb-2 flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white">
                  PRODUCTION PIPELINE
                </span>
                <span className="text-[10px] font-mono text-yellow-400 font-bold">
                  STAGE {currentStage.stageNumber}/0{WORKFLOW_STAGES.length}
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              {WORKFLOW_STAGES.map((stage) => {
                const Icon = stage.icon;
                const isActive = activeTab === stage.id;

                if (isSidebarCollapsed) {
                  return (
                    <button
                      key={stage.id}
                      onClick={() => setActiveTab(stage.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full py-3 rounded-xl flex flex-col items-center justify-center relative transition-all focus-visible:outline-2 focus-visible:outline-yellow-400 ${
                        isActive
                          ? 'bg-[#0f172a] text-white border border-blue-500 shadow-lg shadow-blue-600/30'
                          : 'text-slate-300 hover:text-white hover:bg-[#141417]'
                      }`}
                      title={`${stage.stageNumber}. ${stage.name} - ${stage.subtitle}`}
                    >
                      <span className={`text-[9px] font-mono font-bold mb-1 ${isActive ? stage.accentClass : 'text-slate-400'}`}>
                        {stage.stageNumber}
                      </span>
                      <Icon size={18} className={isActive ? stage.accentClass : ''} />
                    </button>
                  );
                }

                return (
                  <button
                    key={stage.id}
                    onClick={() => setActiveTab(stage.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between group relative overflow-hidden focus-visible:outline-2 focus-visible:outline-yellow-400 ${
                      isActive
                        ? `bg-[#000000] ${stage.borderActive} text-white`
                        : 'bg-[#000000] border-[#1e293b] text-slate-300 hover:text-white hover:bg-[#0f172a] hover:border-blue-900'
                    }`}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-600 via-yellow-400 to-purple-500 shadow-[0_0_10px_#2563eb]" />
                    )}

                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg border flex items-center justify-center transition-colors ${
                        isActive 
                          ? stage.badgeClass
                          : 'bg-[#0f172a] border-[#1e293b] text-slate-300 group-hover:text-white'
                      }`}>
                        <Icon size={16} />
                      </div>

                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-mono font-bold ${isActive ? stage.accentClass : 'text-slate-400'}`}>
                            {stage.stageNumber}.
                          </span>
                          <span className={`text-xs font-black uppercase tracking-wide font-urban ${isActive ? 'text-white' : 'text-slate-200'}`}>
                            {stage.name}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-300 truncate max-w-[170px]">
                          {stage.subtitle}
                        </p>
                      </div>
                    </div>

                    <ChevronRight size={14} className={`transition-transform ${isActive ? 'text-yellow-400 translate-x-0.5' : 'text-slate-500 opacity-0 group-hover:opacity-100'}`} />
                  </button>
                );
              })}

              {/* Interactive Producer Manual Trigger (Positioned Directly Below Stage 04 Evolution Engine) */}
              <div className="pt-2 mt-2 border-t border-[#1e1e26]">
                {isSidebarCollapsed ? (
                  <button
                    onClick={() => setIsUserManualOpen(true)}
                    className="w-full py-3 rounded-xl flex flex-col items-center justify-center relative transition-all bg-gradient-to-b from-blue-600/20 to-yellow-400/10 hover:from-blue-600/30 hover:to-yellow-400/20 text-yellow-300 border border-blue-500/40 shadow-md shadow-blue-500/10 group"
                    title="Open Interactive Studio Manual & System Guide"
                  >
                    <BookOpen size={18} className="text-yellow-400 group-hover:scale-110 transition-transform" />
                    <span className="text-[9px] font-mono font-bold mt-1 text-yellow-300">MANUAL</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setIsUserManualOpen(true)}
                    className="w-full text-left p-3 rounded-xl border border-[#1e293b] bg-black hover:bg-[#0f172a] hover:border-blue-500 text-white transition-all flex items-center justify-between group relative overflow-hidden"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-[#0f172a] border border-[#1e293b] text-yellow-400 group-hover:text-white flex items-center justify-center">
                        <BookOpen size={16} />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-mono font-bold bg-[#0f172a] px-1.5 py-0.5 rounded text-yellow-300 border border-blue-900/60">
                            SYSTEM
                          </span>
                          <span className="text-xs font-black font-urban uppercase tracking-wide text-white">
                            Producer Manual
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-300 truncate max-w-[170px]">
                          Complete Handbook & Recipes
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-slate-400 group-hover:text-yellow-400 group-hover:translate-x-1 transition-transform" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Quick Audio Controls inside Sidebar */}
          {!isSidebarCollapsed && (
            <div className="pt-4 border-t border-[#1a1a1e] space-y-3">
              <div className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[#52525b] px-2">
                MASTER AUDIO BUS
              </div>

              <div className="bg-[#000000] p-3 rounded-xl border border-[#1e293b] flex flex-col items-center shadow-md">
                <Knob
                  label="Master Volume"
                  value={masterLevel}
                  min={0}
                  max={1.5}
                  step={0.01}
                  unit="lvl"
                  color="#facc15"
                  onChange={setMasterLevel}
                  size={52}
                />
              </div>
              <MasterMeter />

              <button
                onClick={() => setIsProjectManagerOpen(true)}
                className="w-full py-2.5 px-3 bg-[#0f172a] hover:bg-[#1e3a8a] text-yellow-300 border border-blue-600/60 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <Cloud size={14} className="text-yellow-400 animate-pulse" />
                <span>Save / Load Projects</span>
              </button>

              {/* WAV Export File Name */}
              <div className="flex flex-col gap-1 w-full bg-[#141416]/40 p-2.5 rounded-xl border border-[#1e293b]">
                <label className="text-[9px] font-mono font-bold text-gray-500 uppercase tracking-widest">WAV Export Name</label>
                <input
                  type="text"
                  value={exportFilename}
                  onChange={(e) => setExportFilename(e.target.value.replace(/[^a-zA-Z0-9_\-]/g, ''))}
                  placeholder="e.g. kick_thick"
                  className="bg-black border border-[#1e293b] rounded px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-yellow-400 font-mono w-full"
                />
              </div>

              <button
                onClick={exportWav}
                disabled={isExporting}
                className="w-full py-2.5 px-3 bg-gradient-to-r from-blue-600 via-yellow-500 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-black font-black font-hiphop rounded-xl text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 hover:scale-[1.02]"
              >
                <Download size={14} className="text-black stroke-[3]" />
                <span>{isExporting ? 'Rendering...' : 'Export One-Shot WAV'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 bg-[#0a0a0c] border-t border-[#1a1a1e]">
          {!isSidebarCollapsed ? (
            <div className="flex items-center justify-between text-[9px] font-mono text-[#52525b]">
              <span className="flex items-center gap-1 text-blue-400 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                LOCAL STORAGE
              </span>
              <span>v5.2-PRO</span>
            </div>
          ) : (
            <div className="flex justify-center">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" title="Local storage connected" />
            </div>
          )}
        </div>
      </aside>

      {/* ----------------- MAIN WORKSPACE CANVAS ----------------- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-black relative">
        {/* Brand watermark behind the workspace */}
        <img
          src="/logo.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-contain object-center opacity-[0.05] pointer-events-none select-none"
        />

        {/* Mobile Stage Switcher (sidebar is hidden below md) */}
        <div className="md:hidden flex items-center gap-1.5 px-3 py-2 bg-[#0d0d10] border-b border-[#1f1f23] overflow-x-auto custom-scrollbar no-scrollbar flex-shrink-0">
          <img src="/logo.png" alt="" className="h-6 w-auto object-contain shrink-0 mr-1" aria-hidden="true" />
          {WORKFLOW_STAGES.map((stage) => {
            const Icon = stage.icon;
            const isActive = activeTab === stage.id;
            return (
              <button
                key={stage.id}
                onClick={() => setActiveTab(stage.id)}
                aria-current={isActive ? 'page' : undefined}
                title={stage.name}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[9px] font-mono font-bold uppercase tracking-wider shrink-0 transition-all ${
                  isActive
                    ? 'bg-[#0f172a] text-white border-blue-500 shadow-md shadow-blue-600/20'
                    : 'bg-black text-slate-400 border-[#1e293b] hover:text-white hover:border-blue-900'
                }`}
              >
                <Icon size={13} className={isActive ? stage.accentClass : ''} />
                <span>{stage.stageNumber}</span>
              </button>
            );
          })}
        </div>

        {/* Workspace Top Header Bar */}
        <header className="h-16 border-b border-[#1e293b] bg-black px-4 sm:px-6 flex items-center justify-between gap-4 flex-shrink-0">
          
          {/* Active Stage Info */}
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logo.png"
              alt="NC Sound Lab"
              className="hidden sm:block h-9 sm:h-10 w-auto object-contain shrink-0 drop-shadow-[0_0_10px_rgba(37,99,235,0.5)]"
            />
            {/* Prev/Next stage navigation */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={goToPrevStage}
                disabled={currentStageIndex === 0}
                aria-label="Previous stage"
                title="Previous stage (Left arrow)"
                className="p-1.5 rounded-lg bg-[#111827] hover:bg-[#1e3a8a] disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 hover:text-white transition-colors border border-blue-900/60"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={goToNextStage}
                disabled={currentStageIndex === WORKFLOW_STAGES.length - 1}
                aria-label="Next stage"
                title="Next stage (Right arrow)"
                className="p-1.5 rounded-lg bg-[#111827] hover:bg-[#1e3a8a] disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 hover:text-white transition-colors border border-blue-900/60"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className={`p-2.5 rounded-xl border ${currentStage.badgeClass} flex items-center justify-center shrink-0`}>
              {React.createElement(currentStage.icon, { size: 18 })}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-fastblaze tracking-wider text-white truncate">
                {currentStage.name}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] font-mono font-bold text-yellow-400 uppercase tracking-widest">
                  Stage {currentStage.stageNumber}/{WORKFLOW_STAGES.length}
                </span>
                <span className="hidden sm:inline text-[9px] font-mono text-slate-500">
                  {currentStage.subtitle}
                </span>
              </div>
            </div>
          </div>

          {/* Top Quick Actions & Navigation Controls */}
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar no-scrollbar py-1">
            {/* Real-time A/B FX Bypass comparison toggle */}
            <div className="flex items-center bg-[#000000] border border-[#1e293b] p-0.5 rounded-xl gap-0.5 shrink-0 shadow-md">
              <span className="text-[8.5px] font-mono font-black text-gray-500 px-2 uppercase tracking-widest">Master FX</span>
              <button
                onClick={() => {
                  setAbState('A');
                  addToast('FX Bypassed (Original DRY Signal Active)', 'info');
                }}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black font-mono transition-all flex items-center gap-1 cursor-pointer ${
                  abState === 'A' 
                    ? 'bg-amber-500 text-black shadow-[0_0_12px_rgba(245,158,11,0.5)] font-black' 
                    : 'text-gray-400 hover:text-white hover:bg-slate-900/40'
                }`}
                title="Bypass all insert FX (A)"
              >
                DRY (A)
              </button>
              <button
                onClick={() => {
                  setAbState('B');
                  addToast('FX Processed (WET Output Active)', 'success');
                }}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black font-mono transition-all flex items-center gap-1 cursor-pointer ${
                  abState === 'B' 
                    ? 'bg-blue-600 text-yellow-300 shadow-[0_0_12px_rgba(37,99,235,0.6)] font-black' 
                    : 'text-gray-400 hover:text-white hover:bg-slate-900/40'
                }`}
                title="Enable all insert FX (B)"
              >
                WET (B)
              </button>
            </div>

            {/* Undo / Redo Actions */}
            <div className="flex items-center bg-[#000000] border border-[#1e293b] p-0.5 rounded-xl gap-0.5 flex-shrink-0">
              <button
                onClick={handleUndo}
                disabled={!useCanUndo()}
                className="px-2 py-1.5 rounded-lg text-[10px] font-black font-mono text-white hover:text-yellow-400 hover:bg-[#0f172a] disabled:opacity-25 disabled:pointer-events-none transition-all uppercase flex items-center gap-0.5"
                title="Undo last action"
              >
                <ChevronLeft size={12} />
                <span className="hidden lg:inline">Undo</span>
              </button>
              <div className="w-px h-3 bg-[#1e293b]" />
              <button
                onClick={handleRedo}
                disabled={!useCanRedo()}
                className="px-2 py-1.5 rounded-lg text-[10px] font-black font-mono text-white hover:text-yellow-400 hover:bg-[#0f172a] disabled:opacity-25 disabled:pointer-events-none transition-all uppercase flex items-center gap-0.5"
                title="Redo action"
              >
                <span className="hidden lg:inline">Redo</span>
                <ChevronRight size={12} />
              </button>
            </div>

            {/* A/B Comparison Snapshots */}
            <div className="flex items-center bg-[#000000] border border-[#1e293b] p-1 rounded-xl gap-1 shrink-0">
              <span className="text-[9px] font-mono font-black text-yellow-400 px-1">A/B SNAPSHOTS</span>
              <button
                onClick={() => handleLoadSnapshot('A')}
                className={`px-2 py-1 rounded text-[10px] font-black font-mono transition-all ${
                  snapshotA ? 'bg-blue-600/30 text-yellow-300 border border-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.4)]' : 'bg-[#0f172a] text-slate-400'
                }`}
                title="Load Snapshot A"
              >
                A
              </button>
              <button
                onClick={() => handleStoreSnapshot('A')}
                className="px-1.5 py-1 bg-[#0f172a] hover:bg-[#1e3a8a] text-[9px] font-mono font-bold text-white rounded border border-blue-900 transition-all"
                title="Save Current State to Snapshot A"
              >
                Save A
              </button>
              <div className="w-px h-3 bg-[#1e293b]" />
              <button
                onClick={() => handleLoadSnapshot('B')}
                className={`px-2 py-1 rounded text-[10px] font-black font-mono transition-all ${
                  snapshotB ? 'bg-purple-600/30 text-purple-300 border border-purple-500 shadow-[0_0_10px_rgba(192,132,252,0.4)]' : 'bg-[#0f172a] text-slate-400'
                }`}
                title="Load Snapshot B"
              >
                B
              </button>
              <button
                onClick={() => handleStoreSnapshot('B')}
                className="px-1.5 py-1 bg-[#0f172a] hover:bg-[#581c87] text-[9px] font-mono font-bold text-white rounded border border-purple-900 transition-all"
                title="Save Current State to Snapshot B"
              >
                Save B
              </button>
            </div>

            {/* Keyboard Shortcuts Trigger */}
            <button
              onClick={() => setIsShortcutsOpen(true)}
              className="p-2 bg-[#000000] hover:bg-[#1e3a8a] border border-[#1e293b] text-yellow-400 rounded-xl transition-all flex items-center justify-center font-mono font-black text-xs"
              title="Open Keyboard Shortcuts Guide (?)"
            >
              ?
            </button>

            {/* Play Working Sound Quick Button */}
            {selectedLayer && (
              <button 
                onClick={playSelectedLayer}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-blue-600/40 border border-blue-400 flex-shrink-0"
                title="Play Currently Working Sound Layer"
              >
                <Play size={12} fill="currentColor" className="text-yellow-400" />
                <span className="hidden lg:inline whitespace-nowrap">Play Sound</span>
              </button>
            )}

            {/* Preview All Layers */}
            <button 
              onClick={playAll}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#000000] hover:bg-[#0f172a] text-white border border-[#1e293b] rounded-xl text-xs font-black uppercase tracking-wider transition-all flex-shrink-0"
              title="Preview All Layers Mixed"
            >
              <Play size={12} fill="currentColor" className="text-purple-400" />
              <span className="hidden lg:inline whitespace-nowrap">Preview All</span>
            </button>
          </div>
        </header>

        {/* Stage Progress Bar */}
        <div className="h-1 bg-[#111113] shrink-0 relative" role="presentation" aria-hidden="true">
          <div
            className="h-full transition-all duration-300 bg-blue-500"
            style={{
              width: `${((currentStageIndex + 1) / WORKFLOW_STAGES.length) * 100}%`,
            }}
          />
        </div>

        {hasAutoSave && (
          <div className="bg-[#121824] border-b border-blue-900/40 px-6 py-2.5 flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="text-yellow-400 animate-pulse shrink-0" size={15} />
              <p className="text-[11px] text-slate-300">
                <strong className="text-white font-urban uppercase">Unsaved session found:</strong> We recovered your progress from your last session. Would you like to restore it?
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleRestoreAutoSave}
                className="px-2.5 py-1 bg-yellow-400 hover:bg-yellow-300 text-black text-[10px] font-black uppercase rounded transition-colors cursor-pointer"
              >
                Restore Session
              </button>
              <button
                onClick={handleDiscardAutoSave}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase rounded transition-colors cursor-pointer"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Main Stage Workspace Content */}
        <main className="flex-1 overflow-hidden relative bg-[#08080a]">
          {/* Global Error Banner */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 bg-red-950/80 border border-red-500/50 rounded-xl flex items-center gap-3 shadow-2xl backdrop-blur-md"
              >
                <Zap size={16} className="text-red-400 animate-pulse" />
                <span className="text-xs font-bold text-red-200 uppercase tracking-widest">{errorMessage}</span>
                <button 
                  onClick={() => setErrorMessage(null)}
                  className="p-1 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors"
                >
                  <Square size={12} fill="currentColor" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {activeTab === 'soundlab' && (
              <motion.div 
                key="soundlab"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="h-full overflow-y-auto custom-scrollbar p-6 space-y-6"
              >
                {/* Header Banner */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1e293b] pb-4">
                  <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <Layers className="w-5 h-5 text-blue-400" />
                      Synth Layering & Samples
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Manage sound layers, upload samples, and render waveforms. Open the Tweaking stage for the full synth & FX editor.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => addLayer('synth')}
                      className="px-3.5 py-2 bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-black uppercase rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" /> Add Synth Layer
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3.5 py-2 bg-[#121215] border border-blue-600 hover:border-yellow-400 text-white text-xs font-black uppercase rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-4 h-4" /> {chopMode ? 'Upload & Chop' : 'Upload Sample'}
                    </button>
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      accept="audio/*" 
                      className="hidden" 
                      onChange={handleFileUpload} 
                    />
                    {/* Chop mode toggle + count */}
                    <button
                      onClick={() => setChopMode((c) => !c)}
                      className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${
                        chopMode
                          ? 'bg-fuchsia-600/20 border-fuchsia-500/60 text-fuchsia-300'
                          : 'bg-[#121215] border-[#1e293b] text-slate-400 hover:text-white'
                      }`}
                      title="Slice uploaded samples into multiple pads"
                    >
                      Chop
                    </button>
                    {chopMode && (
                      <select
                        value={chopCount}
                        onChange={(e) => setChopCount(parseInt(e.target.value))}
                        className="bg-[#121215] border border-[#1e293b] rounded-lg text-[10px] font-bold px-2 py-2 text-fuchsia-300 focus:outline-none cursor-pointer"
                        aria-label="Chop count"
                      >
                        {[2, 4, 8, 16].map((n) => <option key={n} value={n} className="text-white">×{n}</option>)}
                      </select>
                    )}
                    <button
                      onClick={handleSendLayersToPads}
                      className="px-3 py-2 bg-[#121215] border border-rose-600 hover:border-rose-400 text-rose-400 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Open the Beat Studio — your layers are already mapped to pads"
                    >
                      <Drum size={13} /> Pads
                    </button>
                  </div>
                </div>

                {/* Grid of Sound Layers */}
                <div className="space-y-3">
                  <div className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <span>Active Layers Stack ({layers.length})</span>
                    <span className="text-[10px] text-slate-500 font-mono font-normal">(Click a row to edit; full gain/pan/pitch in Mixer & Level tabs)</span>
                  </div>

                  {layers.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center border-2 border-dashed border-[#1e293b] rounded-2xl bg-black text-slate-500 gap-3">
                      <Layers className="w-10 h-10 text-slate-700 animate-pulse" />
                      <div>
                        <p className="text-sm font-bold uppercase tracking-wider text-white">No Sound Layers Created Yet</p>
                        <p className="text-xs text-slate-400 max-w-sm mt-1">Add a new synth engine layer or upload an audio sample to start designing your custom sound.</p>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => addLayer('synth')} className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-extrabold uppercase rounded-lg transition-colors cursor-pointer">Add Synth</button>
                        <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-black border border-[#1e293b] hover:border-blue-500 text-white text-xs font-extrabold uppercase rounded-lg transition-colors cursor-pointer">Upload WAV</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {layers.map((l, idx) => {
                        const isSelected = selectedLayerId === l.id;
                        return (
                          <div
                            key={l.id}
                            onClick={() => setSelectedLayerId(l.id)}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all cursor-pointer group ${
                              isSelected
                                ? 'bg-[#0f172a]/30 border-yellow-400/70 shadow-[0_0_10px_rgba(250,204,21,0.08)]'
                                : 'bg-[#0b0b0d] border-[#1e293b] hover:border-slate-500 hover:bg-[#121215]'
                            }`}
                          >
                            <span className="text-[10px] font-mono font-bold text-slate-500 bg-black border border-[#1e293b] w-5 h-5 rounded flex items-center justify-center shrink-0">
                              {(idx + 1).toString().padStart(2, '0')}
                            </span>
                            <input
                              type="text"
                              value={l.name}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateLayer(l.id, { name: e.target.value })}
                              className="bg-transparent text-[11px] font-black text-white uppercase tracking-wider border-b border-transparent hover:border-slate-700 focus:border-yellow-400 focus:outline-none py-0.5 max-w-[140px] min-w-0 flex-1"
                            />
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest font-mono shrink-0 ${
                              l.type === 'synth'
                                ? 'bg-teal-950/50 text-teal-300 border border-teal-500/30'
                                : 'bg-orange-950/50 text-orange-300 border border-orange-500/30'
                            }`}>
                              {l.type}
                            </span>
                            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => updateLayer(l.id, { enabled: !l.enabled })}
                                className={`px-2 py-1 text-[9px] font-extrabold rounded border transition-all ${
                                  l.enabled
                                    ? 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/20'
                                    : 'bg-black border-[#1e293b] text-slate-500 hover:text-slate-300'
                                }`}
                                title={l.enabled ? 'Mute Layer' : 'Unmute Layer'}
                              >
                                {l.enabled ? 'ON' : 'OFF'}
                              </button>
                              <button
                                onClick={() => audioEngine.playLayer(l)}
                                className="p-1.5 rounded hover:bg-[#1a1a24] text-slate-400 hover:text-yellow-400 transition-colors"
                                title="Play Layer"
                              >
                                <Play size={12} fill="currentColor" />
                              </button>
                              <button
                                onClick={() => handleDuplicateLayer(l)}
                                className="p-1.5 rounded hover:bg-[#1a1a24] text-slate-400 hover:text-white transition-colors"
                                title="Duplicate Layer"
                              >
                                <Layers size={13} />
                              </button>
                              <button
                                onClick={() => setLayers(prev => prev.filter(item => item.id !== l.id))}
                                className="p-1.5 rounded hover:bg-red-950/40 text-slate-500 hover:text-red-400 transition-colors"
                                title="Delete Layer"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Waveform DSP Editor / Sample Editor Block (collapsible) */}
                <details className="bg-[#0b0b0d] border border-[#1e293b] rounded-2xl overflow-hidden shadow-2xl flex flex-col w-full">
                  <summary className="flex items-center justify-between border-b border-[#1e293b] bg-black px-4 py-3 cursor-pointer select-none list-none">
                    <div className="flex items-center gap-2">
                      <Music className="w-4 h-4 text-sky-400" />
                      <span className="text-xs font-black uppercase tracking-wider text-white">Sample Waveform & Detailed DSP Editor</span>
                      <span className="text-[9px] font-mono text-slate-500">(click to expand)</span>
                    </div>
                    {selectedLayer && selectedLayer.type === 'synth' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleBounceLayer(selectedLayer); }}
                        className="px-3 py-1.5 bg-[#121215] border border-blue-500 hover:bg-blue-600 rounded text-[9.5px] uppercase font-bold text-blue-400 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
                        title="Bounce this synth's current parameters into a brand new Sample Layer for waveform rendering"
                      >
                        <Sparkles className="w-3 h-3 text-sky-400" /> Bounce Synth to Sample
                      </button>
                    )}
                  </summary>

                  <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                    {/* Visualizer Plot (8 cols) */}
                    <div className="lg:col-span-8 bg-black border border-[#1e293b] rounded-xl p-4 flex flex-col justify-between min-h-[220px]">
                      {selectedLayer ? (
                        <div className="flex-1 flex flex-col justify-between h-full space-y-4">
                          <div className="flex-1 min-h-[140px] relative">
                            <Suspense fallback={<div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-500" /></div>}>
                              <WaveformEditor
                                buffer={selectedLayer.audioBuffer || compositeBuffer}
                                selectionStart={selectionStart}
                                selectionEnd={selectionEnd}
                                onSelectionChange={(start, end) => {
                                  setSelectionStart(start);
                                  setSelectionEnd(end);
                                }}
                              />
                            </Suspense>
                          </div>
                          <div className="text-[9.5px] text-slate-500 font-mono flex justify-between items-center bg-[#070709] border border-[#1e293b]/40 px-3 py-1.5 rounded-lg">
                            <span>Active Layer buffer rendering: {selectedLayer.name}</span>
                            <span className="text-yellow-400 font-bold font-mono text-[8.5px]">Drag waveform to highlight selection range for cropping / fades</span>
                          </div>
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-12 gap-2">
                          <Music className="w-8 h-8 text-slate-700 animate-pulse" />
                          <p className="text-xs uppercase font-extrabold tracking-wider">No Active Layer Waveform</p>
                          <p className="text-[10px] text-slate-400">Select any Layer above to inspect and edit its sample buffer.</p>
                        </div>
                      )}
                    </div>

                    {/* Waveform DSP Toolbar (4 cols) */}
                    <div className="lg:col-span-4 bg-black border border-[#1e293b] rounded-xl p-4 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
                          <span className="text-[10px] font-black text-white uppercase tracking-wider">Waveform DSP Edit Lab</span>
                          {selectedLayer && (
                            <span className="text-[8.5px] font-mono text-slate-400 bg-[#121215] border border-[#1e293b] px-1.5 py-0.5 rounded uppercase tracking-wider">
                              Sel: {Math.round(selectionStart * 100)}% - {Math.round(selectionEnd * 100)}%
                            </span>
                          )}
                        </div>

                        {selectedLayer ? (
                          <div className="space-y-3.5">
                            <p className="text-[9.5px] text-slate-400 leading-normal">
                              Run direct destructive digital signal processing on the selected layer's audio buffer waveform. You can edit the entire file, or highlight a specific selection segment!
                            </p>

                            <div className="grid grid-cols-2 gap-2">
                              <button onClick={() => applyWaveformEdit('reverse')} className="py-2 px-3 bg-[#121215] border border-[#1e293b] hover:border-yellow-400/40 hover:bg-[#1a1a24] rounded-lg text-[9.5px] uppercase font-extrabold text-slate-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer">🔄 Reverse</button>
                              <button onClick={() => applyWaveformEdit('normalize')} className="py-2 px-3 bg-[#121215] border border-[#1e293b] hover:border-yellow-400/40 hover:bg-[#1a1a24] rounded-lg text-[9.5px] uppercase font-extrabold text-slate-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer">🔊 Normalize</button>
                              <button onClick={() => applyWaveformEdit('invert')} className="py-2 px-3 bg-[#121215] border border-[#1e293b] hover:border-yellow-400/40 hover:bg-[#1a1a24] rounded-lg text-[9.5px] uppercase font-extrabold text-slate-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer">🔌 Phase Flip</button>
                              <button 
                                onClick={() => applyWaveformEdit('crop')} 
                                disabled={selectionStart >= selectionEnd || (selectionStart === 0 && selectionEnd === 1)}
                                className="py-2 px-3 bg-[#121215] border border-[#1e293b] hover:border-yellow-400/40 hover:bg-[#1a1a24] rounded-lg text-[9.5px] uppercase font-extrabold text-slate-300 transition-all disabled:opacity-20 disabled:pointer-events-none flex items-center justify-center gap-1.5 cursor-pointer"
                                title="Crop selected range and discard everything outside it"
                              >
                                ✂️ Crop Sel
                              </button>
                            </div>

                            <div className="grid grid-cols-3 gap-2.5 pt-3.5 border-t border-[#1e293b]/40">
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider">Fade Contours</span>
                                <div className="flex gap-1">
                                  <button onClick={() => applyWaveformEdit('fadein')} className="flex-1 py-1.5 bg-[#121215] border border-[#1e293b] hover:bg-sky-500 hover:text-black rounded text-[9px] font-mono text-sky-400 font-bold transition-all cursor-pointer">In</button>
                                  <button onClick={() => applyWaveformEdit('fadeout')} className="flex-1 py-1.5 bg-[#121215] border border-[#1e293b] hover:bg-sky-500 hover:text-black rounded text-[9px] font-mono text-sky-400 font-bold transition-all cursor-pointer">Out</button>
                                </div>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider">Chaos Glitch</span>
                                <button onClick={() => applyWaveformEdit('glitch')} className="py-1.5 bg-[#121215] border border-[#1e293b] hover:bg-red-500 hover:text-white rounded text-[9px] font-mono text-red-400 font-bold transition-all cursor-pointer">Inject</button>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider">Coarse Gain</span>
                                <button onClick={() => applyWaveformEdit('gain')} className="py-1.5 bg-[#121215] border border-[#1e293b] hover:bg-yellow-400 hover:text-black rounded text-[9px] font-mono text-yellow-400 font-bold transition-all cursor-pointer">Gain</button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="py-12 text-center text-slate-500 italic text-[10px] uppercase border border-dashed border-[#1e293b] rounded-xl">
                            Select a sound layer to enable DSP controls
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </details>
              </motion.div>
            )}

            {activeTab === 'tweaking' && (
              <motion.div 
                key="tweaking"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="h-full overflow-y-auto custom-scrollbar p-6 space-y-6"
              >
                {/* Header Banner */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1e293b] pb-4">
                  <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <Sliders className="w-5 h-5 text-teal-400" />
                      Synth Parameter Tweaker & Preset Browser
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Deep synthesis controls: oscillators, envelope generators, filters, digital multi-FX, and instant preset library.
                    </p>
                  </div>
                  {selectedLayer && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest bg-[#121215] border border-[#1e293b] px-3 py-1.5 rounded-lg">
                        Active Layer: {selectedLayer.name} ({selectedLayer.type.toUpperCase()})
                      </span>
                      <button
                        onClick={() => audioEngine.playLayer(selectedLayer)}
                        className="px-3.5 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-black uppercase rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        🔊 Trigger Sound
                      </button>
                    </div>
                  )}
                </div>

                {/* Layer Presets Browser Bar (Replaces Switch Active Layer Strip) */}
                <div className="w-full">
                  <Suspense fallback={<div className="h-20 flex items-center justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-teal-500" /></div>}>
                    <LayerPresetBrowser
                      selectedLayer={selectedLayer}
                      onUpdateLayer={updateLayer}
                      onAddLayerWithPreset={handleAddLayerWithPreset}
                      onAddToast={addToast}
                    />
                  </Suspense>
                </div>

                {/* Main Tweaker Panel */}
                <div className="w-full">
                  {selectedLayer && (
                    <div className="flex items-center justify-end pb-2">
                      <button
                        onClick={() => handleSendSynthToPads(selectedLayer)}
                        className="px-3 py-2 bg-[#121215] border border-rose-600 hover:border-rose-400 text-rose-400 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                        title="Bounce this synth into a one-shot and send it to the MPC pads"
                      >
                        <Drum size={13} /> Send Synth → Pads
                      </button>
                    </div>
                  )}
                  <AnimatePresence mode="wait">
                    {selectedLayer ? (
                      <motion.div
                        key={selectedLayer.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="h-full"
                      >
                        <Suspense fallback={<div className="h-[400px] flex items-center justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-teal-500" /></div>}>
                          <LayerEditor
                            selectedLayer={selectedLayer}
                            onUpdate={(updates) => updateLayer(selectedLayer.id, updates)}
                            onPlay={() => audioEngine.playLayer(selectedLayer)}
                            onEvolve={() => handleEvolveLayer(selectedLayer)}
                            onBounceLayer={handleBounceLayer}
                          />
                        </Suspense>
                      </motion.div>
                    ) : (
                      <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-[#71717a] italic text-xs bg-black rounded-2xl border border-dashed border-[#1e293b] p-12 text-center space-y-3">
                        <Sliders className="w-10 h-10 text-gray-700 animate-pulse" />
                        <div>
                          <p className="font-bold uppercase tracking-wider text-[11px] text-gray-400">No Sound Layer Selected</p>
                          <p className="max-w-[360px] text-[10px] leading-normal text-gray-500 mt-1">
                            Go to the <strong>01 Layering</strong> page to add or select a sound layer, then return here to unlock the modular synths and LFO FX controllers.
                          </p>
                        </div>
                        <button
                          onClick={() => setActiveTab('soundlab')}
                          className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-black text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer"
                        >
                          Go to Layering Page
                        </button>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {/* FULL STAGE 03: STUDIO CONSOLE MIXER */}
            {activeTab === 'mixer' && (
              <motion.div 
                key="mixer"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="h-full overflow-y-auto custom-scrollbar p-6 space-y-6"
              >
                {/* Header Banner */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1e293b] pb-4">
                  <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <Volume2 className="w-5 h-5 text-indigo-400" />
                      Studio Console Mixer
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Full-screen multi-channel fader console, channel strip controls, and universal master rack dynamics.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={playAll}
                      className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                        isPlaying 
                          ? 'bg-red-600 text-white animate-pulse' 
                          : 'bg-yellow-400 text-black hover:bg-yellow-300'
                      }`}
                    >
                      {isPlaying ? '⏹ Stop' : '▶ Play Layer Stack'}
                    </button>
                    <button
                      onClick={handleToggleLoop}
                      className={`px-3 py-2 text-xs font-bold uppercase rounded-lg border transition-all cursor-pointer ${
                        loopEnabled
                          ? 'bg-indigo-600/15 border-indigo-500 text-indigo-400'
                          : 'bg-black border-[#1e293b] text-slate-400 hover:text-white'
                      }`}
                    >
                      🔁 Loop: {loopEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                <Suspense fallback={<div className="flex-1 flex items-center justify-center p-12 min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>}>
                  <div className="flex flex-col gap-8 w-full">
                    {/* Full Console Multi-Channel Faders */}
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Console Multi-Channel Fader Board</span>
                        <span className="text-[9px] font-mono text-slate-400">Master Level: {Math.round(masterLevel * 100)}%</span>
                      </div>
                      <LayerMixer
                        layers={layers}
                        selectedLayerId={selectedLayerId}
                        onSelectLayer={setSelectedLayerId}
                        onUpdateLayer={updateLayer}
                        onReorderLayer={reorderLayer}
                        onPlayLayer={(l) => audioEngine.playLayer(l)}
                        onPlayAll={playAll}
                        onStop={() => audioEngine.stop()}
                        isPlaying={isPlaying}
                        loopEnabled={loopEnabled}
                        onToggleLoop={handleToggleLoop}
                        masterLevel={masterLevel}
                        onUpdateMasterLevel={setMasterLevel}
                        onDuplicateLayer={handleDuplicateLayer}
                        onCopyFX={handleCopyFX}
                        onPasteFX={handlePasteFX}
                        onRandomizePitchPan={handleRandomizePitchPan}
                      />
                    </div>

                    {/* Studio Mastering Rack & Processing Modules */}
                    <div className="space-y-3 pt-6 border-t border-[#1e293b]">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block">Studio Mastering Processing Chain</span>
                        <span className="text-[9px] font-mono text-slate-500 uppercase">Master Processing Rack</span>
                      </div>
                      <StudioRack />
                      {/* Phase 3.5 + 3.6 — master dynamics + sidechain routing,
                          and FX-chain preset save/load (both previously unwired). */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <MasterDynamicsPanel />
                        <FXChainPresetsPanel
                          modules={rackModules}
                          onLoad={(preset) => {
                            if (preset.target.kind === 'master-rack' && Array.isArray(preset.modules)) {
                              setRackModules(preset.modules.map((m) => ({ ...m, id: m.id || crypto.randomUUID() })));
                            }
                          }}
                          onClearRack={() => setRackModules([])}
                        />
                      </div>
                    </div>
                  </div>
                </Suspense>
              </motion.div>
            )}

            {/* FULL STAGE 04: SPATIAL 3D & REVERB */}
            {activeTab === 'spatial' && (
              <motion.div 
                key="spatial"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="h-full overflow-y-auto custom-scrollbar p-6 space-y-6"
              >
                {/* Header Banner */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1e293b] pb-4">
                  <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <Move3d className="w-5 h-5 text-amber-400" />
                      Spatial 3D & Reverb Stage
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Full-screen 3D binaural positioning room, distance depth panning, and dedicated spatial reverb controls.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={playAll}
                      className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                        isPlaying 
                          ? 'bg-red-600 text-white animate-pulse' 
                          : 'bg-yellow-400 text-black hover:bg-yellow-300'
                      }`}
                    >
                      {isPlaying ? '⏹ Stop' : '▶ Play Layer Stack'}
                    </button>
                    <button
                      onClick={handleToggleLoop}
                      className={`px-3 py-2 text-xs font-bold uppercase rounded-lg border transition-all cursor-pointer ${
                        loopEnabled
                          ? 'bg-amber-600/15 border-amber-500 text-amber-400'
                          : 'bg-black border-[#1e293b] text-slate-400 hover:text-white'
                      }`}
                    >
                      🔁 Loop: {loopEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                <Suspense fallback={<div className="flex-1 flex items-center justify-center p-12 min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>}>
                  <div className="w-full">
                    <ThreeDSoundSpace 
                      layers={layers} 
                      selectedLayerId={selectedLayerId}
                      onSelectLayer={setSelectedLayerId}
                      onUpdateLayer={updateLayer}
                    />
                  </div>
                </Suspense>
              </motion.div>
            )}


            {activeTab === 'kitcreator' && (
              <motion.div 
                key="kitcreator"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="h-full overflow-y-auto custom-scrollbar p-4"
              >
                <Suspense fallback={<div className="h-[400px] flex items-center justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-purple-500" /></div>}>
                  <SoundKitCreator 
                    onPublishToMarketplace={handlePublishNewKit}
                    onNavigateToMarketplace={() => setActiveTab('catalog')} 
                  />
                </Suspense>
              </motion.div>
            )}

            {activeTab === 'evolution' && (
              <motion.div 
                key="evolution"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="w-full h-full p-8 overflow-y-auto"
              >
                <Suspense fallback={<div className="h-[400px] flex items-center justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-green-500" /></div>}>
                  <EvolutionPanel 
                    variations={evolutionVariations}
                    onSetVariations={setEvolutionVariations}
                    onAddLayer={(v) => addLayer('sample', v.buffer, `Mutant_${v.id.slice(0,4)}`)}
                    onSaveToKit={(v) => {
                      const analysis = analyzeAudioBuffer(v.buffer, `Mutant_${v.id.slice(0,4)}.wav`);
                      const mockSample: SoundKitSample = {
                        id: v.id,
                        name: `Mutant_${v.id.slice(0,4)}`,
                        fileName: `Mutant_${v.id.slice(0,4)}.wav`,
                        category: analysis.suggestedCategory,
                        tags: ['mutant', 'evolution', ...v.routingPath],
                        gain: 0.85,
                        pitch: 0,
                        audioBuffer: v.buffer,
                        analysis: analysis,
                        sizeBytes: 0 // Will be computed on export
                      };
                      setPendingKitSample(mockSample);
                      setIsAddToKitOpen(true);
                    }}
                    onReEvolve={(mode, fxOption) => {
                      if (selectedLayer) handleEvolveLayer(selectedLayer, mode, fxOption);
                    }}
                    onDiscard={(id) => setEvolutionVariations(prev => prev.filter(v => v.id !== id))}
                    isEvolving={isEvolving}
                    onSendToPads={(sounds) => handleSendToPads(sounds, 'C')}
                  />
                </Suspense>
              </motion.div>
            )}

            {activeTab === 'catalog' && (
              <motion.div 
                key="catalog"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="h-full overflow-y-auto custom-scrollbar p-4"
              >
                <Suspense fallback={<div className="h-[400px] flex items-center justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>}>
                  <SoundKitCatalog 
                    customKits={publishedKits} 
                    onLoadKitToSoundLab={handleLoadKitToSoundLab} 
                  />
                </Suspense>
              </motion.div>
            )}

            {activeTab === 'compare' && (
              <motion.div 
                key="compare"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="h-full overflow-y-auto custom-scrollbar p-4"
              >
                <Suspense fallback={<div className="h-[400px] flex items-center justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-yellow-500" /></div>}>
                  <CompareEnginePanel isVisible={activeTab === 'compare'} />
                </Suspense>
              </motion.div>
            )}

            {activeTab === 'produce' && (
              <motion.div
                key="produce"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="h-full"
              >
                <Suspense fallback={<div className="h-[400px] flex items-center justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-rose-500" /></div>}>
                  <StudioSequencer
                    layers={layers}
                    selectedLayerId={selectedLayerId}
                    onSelectLayer={setSelectedLayerId}
                    onUpdateLayer={updateLayer}
                    onAddLayer={(buffer: AudioBuffer, name?: string) => addLayer('sample', buffer, name)}
                    onAddSlicedLayers={(buffers: AudioBuffer[]) => {
                      buffers.forEach((b, i) => addLayer('sample', b, `Slice ${i + 1}`));
                    }}
                  />
                </Suspense>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <Suspense fallback={<div className="h-16 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>}>
        <SystemCohesionDeck
          layers={layers}
          selectedLayerId={selectedLayerId}
          onUpdateLayer={updateLayer}
          onAddToast={addToast}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          bpm={120}
        />
      </Suspense>

        {/* Studio Workspace Bottom Status Bar */}
        <footer className="h-8 bg-[#0a0a0c] border-t border-[#1f1f21] px-6 flex items-center justify-between text-[9px] text-[#52525b] flex-shrink-0 font-mono">
          <div className="flex items-center space-x-6">
            <span className="flex items-center gap-1.5 text-blue-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              DSP ENGINE: ONLINE
            </span>
            <span>LATENCY: 0.8ms</span>
            <span className="hidden sm:inline">WORKFLOW: {currentStage.shortName.toUpperCase()}</span>
          </div>
          <div className="uppercase tracking-widest text-gray-500">
            SONIK STUDIO ARCHITECTURE v5.2 PRO
          </div>
        </footer>

      </div>

      <Suspense fallback={null}>
        {/* Add To Sound Kit Modal */}
        <AddToKitModal
          isOpen={isAddToKitOpen}
          onClose={() => {
            setIsAddToKitOpen(false);
            setPendingKitSample(null);
          }}
          availableKits={publishedKits}
          defaultSampleName={pendingKitSample?.name || selectedLayer?.name || 'CUSTOM_ONE_SHOT'}
          onConfirmAdd={handleAddToKit}
        />

        {/* Keyboard Shortcuts Modal */}
        <KeyboardShortcutsModal
          isOpen={isShortcutsOpen}
          onClose={() => setIsShortcutsOpen(false)}
        />

        {/* Studio User Manual Modal */}
        <UserManualModal
          isOpen={isUserManualOpen}
          onClose={() => setIsUserManualOpen(false)}
        />

        {/* Cloud Projects & Presets Manager */}
        <ProjectManagerModal
          isOpen={isProjectManagerOpen}
          onClose={() => setIsProjectManagerOpen(false)}
          layers={layers}
          onLoadProject={handleLoadProject}
          onAddToast={addToast}
          snapshotA={snapshotA}
          snapshotB={snapshotB}
          onLoadSnapshot={handleLoadSnapshot}
          onStoreSnapshot={handleStoreSnapshot}
        />
      </Suspense>

      {/* Chop Editor (opens when a sample is uploaded in Chop mode) */}
      <Suspense fallback={null}>
        {chopBuffer && (
          <ChopEditor
            buffer={chopBuffer}
            fileName={chopFileName}
            defaultCount={chopCount}
            onSendToPads={handleChopEditorSend}
            onClose={() => setChopBuffer(null)}
          />
        )}
      </Suspense>

      {/* Toast Notification Container */}
      <ToastContainer
        toasts={toasts}
        onDismiss={handleDismissToast}
      />
    </div>
  );
}
