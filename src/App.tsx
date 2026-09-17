/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
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
  Zap,
  Sliders,
  Activity,
  Package,
  ShoppingBag,
  Drum,
  Cloud,
  PanelLeftClose,
  PanelLeft,
  ChevronRight,
  ChevronLeft,
  Sparkles,
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
import { ControllerHost } from './components/controller/ControllerHost';
import { useControllerStore } from './store/controllerStore';
import { synthLayerFor, patternFor, isRecoursePiece } from './lib/recourseBridge';
import { audioEngine as sharedAudioEngine } from './audio/AudioEngine';
import { audioBufferToWav } from './lib/audioUtils';
const SamplerUnit = lazy(() => import('./components/sampler/SamplerUnit').then(m => ({ default: m.SamplerUnit })));
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

const AafExportPanel = lazy(() => import('./components/AafExportPanel').then(m => ({ default: m.AafExportPanel })));
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

// Hardware & Sound Kit Components
import { MasterMeter } from './components/MasterMeter';
import { ToastContainer, ToastMessage } from './components/ToastContainer';
import { useSequencerStore, BankId } from './store/sequencerStore';
import { usePatternStore } from './store/patternStore';
import { useRackStore } from './store/rackStore';
import { useMixerStore } from './store/mixerStore';
import { useMasterDynamicsStore } from './store/masterDynamicsStore';
import { useHistoryStore, buildSnapshot, snapshotsEqual, useCanUndo, useCanRedo, type HistorySnapshot } from './store/historyStore';
import {
  scheduleAutosave,
  installAutosaveFlushHandlers,
  uninstallAutosaveFlushHandlers,
  readAutosaveDocument,
  clearAutosave,
} from './lib/autosave';
import { deserializeProject } from './lib/projectFormat';
import {
  useAudioTelemetry,
  formatLatency,
  formatSampleRate,
  describeContextState,
} from './lib/audioTelemetry';
import { nextLayerColor } from './lib/layerColors';
import { LayerRow } from './components/LayerRow';
import { AiSettingsPanel } from './components/AiSettingsPanel';
import { useLayerLevels } from './audio/useLayerLevels';
import { CommandPalette } from './components/CommandPalette';
import { HeaderTransport } from './components/HeaderTransport';
import { buildCommands } from './lib/appCommands';

import { EvolutionVariation } from './types';
import {
  WORKFLOW_STAGES,
  TAB_LABELS,
  stageForTab,
  resolveHashTarget,
  type TabType,
} from './lib/workflowStages';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('soundlab');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Deep-linkable screens: #stage=<id> accepts both condensed stage ids and
  // the legacy per-tab ids, and stays in sync with navigation so users can
  // bookmark/share a screen and use browser back/forward.
  useEffect(() => {
    const stageFromHash = () => {
      const match = window.location.hash.match(/^#stage=([a-z-]+)/);
      if (!match) return;
      const target = resolveHashTarget(match[1]);
      if (target) setActiveTab(target.tab);
    };
    stageFromHash();
    window.addEventListener('hashchange', stageFromHash);
    return () => window.removeEventListener('hashchange', stageFromHash);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextHash = `#stage=${stageForTab(activeTab).id}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash);
    }
  }, [activeTab]);

  // The MPD follows the visible screen: bank-0 pads/knobs/faders are
  // re-targeted by the section map; see lib/controller/sectionMap.ts.
  const setControllerSection = useControllerStore((s) => s.setSection);
  useEffect(() => {
    setControllerSection(activeTab);
  }, [activeTab, setControllerSection]);

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
  const mixerBuses = useMixerStore((s) => s.buses);
  const mixerLayerSends = useMixerStore((s) => s.layerSends);
  const masterDynamicsSettings = useMasterDynamicsStore((s) => s.settings);
  const masterDynamicsSidechains = useMasterDynamicsStore((s) => s.sidechains);

  const applyHistorySnapshot = useCallback((snap: HistorySnapshot) => {
    setLayersInternal(snap.layers);
    usePatternStore.setState({
      patterns: snap.patterns,
      activePatternId: snap.activePatternId,
      songChain: { order: snap.songChain.order as unknown as string[] },
      arrangement: snap.arrangement,
    });
    useSequencerStore.setState({
      programs: snap.programs,
      activeBank: snap.activeBank,
    });
    setRackModules(snap.masterRack);
    setMasterLevel(snap.masterLevel);
    useMixerStore.setState({ buses: snap.buses, layerSends: snap.layerSends });
    useMasterDynamicsStore.setState({
      settings: snap.masterDynamics,
      sidechains: snap.sidechains,
    });
    setActiveSnapshotName(null);
  }, [setRackModules]);

  useEffect(() => {
    useHistoryStore.getState().setApplier(applyHistorySnapshot);
    return () => {
      useHistoryStore.getState().setApplier(null);
    };
  }, [applyHistorySnapshot]);

  // Skip committing the very first state on mount (avoids a phantom undo
  // entry for the initial empty layers array).
  const isInitialMountRef = useRef(true);
  const evolveInFlightRef = useRef(false);
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
      masterRack: rackModules,
      globalSwing: 0,
      bpm: patternStore.patterns[patternStore.activePatternId].bpm,
      timeSignature: patternStore.patterns[patternStore.activePatternId].timeSignature,
      arrangement: patternStore.arrangement,
      buses: mixerBuses,
      layerSends: mixerLayerSends,
      masterDynamics: masterDynamicsSettings,
      sidechains: masterDynamicsSidechains,
    });
    // Skip commits that are byte-for-byte identical to the current history head.
    // Undo/redo re-applies the snapshot state via the applier (sharing the same
    // object references), so without this dedup the resulting re-commit would
    // both break consecutive undos AND clear the `future` stack, killing redo.
    const history = useHistoryStore.getState();
    const last = history.past[history.past.length - 1];
    if (last && snapshotsEqual(last, snap)) return;
    useHistoryStore.getState().commit(snap);
  }, [
    layers, masterLevel, patternStore, sequencerStore, rackModules,
    mixerBuses, mixerLayerSends, masterDynamicsSettings, masterDynamicsSidechains,
  ]);

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // UX Enhancement States & Handlers
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isUserManualOpen, setIsUserManualOpen] = useState(false);
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
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
  const [, setActiveSnapshotName] = useState<'A' | 'B' | null>(null);

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
      color: nextLayerColor(layers.length),
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
    // Dispose the per-layer analyser/gain modules of the outgoing project so
    // switching sessions doesn't leak audio nodes on the shared engine.
    layers.forEach((l) => {
      try {
        sharedAudioEngine.disposeModule(l.id);
      } catch {
        // module may already be gone — ignore
      }
    });
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
  const [fadeDuration] = useState<number>(0.1);
  const [glitchIntensity] = useState<number>(0.4);
  const [gainDB] = useState<number>(3.0);

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

  const currentStage = stageForTab(activeTab);
  const currentStageIndex = WORKFLOW_STAGES.indexOf(currentStage);

  // Live engine telemetry for the status bar (replaces the old fake readout).
  const audioTelemetry = useAudioTelemetry();
  // Per-layer peak levels for the Sound Design rows (one shared rAF loop).
  const layerLevels = useLayerLevels(layers.map((l) => l.id), isPlaying);
  // Current key/scale for the header transport readout.
  const chordSettings = useControllerStore((s) => s.chord);

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
  const [recoveryChecked, setRecoveryChecked] = useState(false);
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
      } finally {
        if (!cancelled) setRecoveryChecked(true);
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
        ...(hydrated.patternPrograms ? { patternPrograms: hydrated.patternPrograms } : {}),
      });
      setMasterLevel(hydrated.document.masterLevel);
      setRackModules(hydrated.document.masterRack?.modules ?? []);
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

  // Recourse bridge: lets the Recourse composer load a piece into SoundLab's own
  // synth layers + a playable pattern + song chain, then request playback. Web
  // Audio requires a user gesture, so `play()` only asks the mounted sequencer;
  // audible start follows a user click (or an earlier gesture this session).
  const setLayersLatest = useRef(setLayers);
  setLayersLatest.current = setLayers;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const recWin = window as unknown as { __recourse?: unknown };
    const bridge: any = {
      ready: true,
      loaded: true,
      load: (piece: unknown) => {
        try {
          if (!isRecoursePiece(piece)) return { ok: false, error: 'not a recourse-soundlab-piece' };
          const newLayers = piece.layers.map((pl) => synthLayerFor(pl));
          setLayersLatest.current(newLayers);
          const pattern = patternFor(piece);
          const bars = Math.max(1, Math.min(64, piece.chainBars || piece.bars || 1));
          usePatternStore.setState({
            patterns: { ...usePatternStore.getState().patterns, A: pattern },
            activePatternId: 'A',
            songChain: { order: Array.from({ length: bars }, () => 'A') },
          });
          setSelectedLayerId(newLayers[0]?.id ?? null);
          setActiveTab('produce');
          return { ok: true, layers: newLayers.length, pattern: 'A', bars };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
      play: () => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent('recourse:play'));
      },
      // Pull a piece from a CORS-enabled Recourse URL, then load (and optionally play).
      pull: async (url: string, opts?: { play?: boolean }) => {
        try {
          const res = await fetch(String(url), { cache: 'no-store' });
          if (!res.ok) return { ok: false, error: `pull HTTP ${res.status}` };
          const piece = (await res.json()) as unknown;
          const loaded = bridge.load(piece);
          if (opts?.play !== false && (loaded as { ok?: boolean }).ok) window.dispatchEvent(new CustomEvent('recourse:play'));
          return loaded;
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      },
      // Poll a Recourse URL and auto-load when a NEW piece appears (web-safe push).
      autoPull: (url: string, intervalMs?: number) => {
        let lastKey = '';
        const id = window.setInterval(async () => {
          try {
            const res = await fetch(String(url), { cache: 'no-store' });
            if (!res.ok) return;
            const piece = (await res.json()) as { style?: string; headChord?: { rootPc?: number; quality?: string } };
            const key = `${piece?.style ?? ''}:${piece?.headChord?.rootPc ?? ''}:${piece?.headChord?.quality ?? ''}`;
            if (key && key !== lastKey) {
              lastKey = key;
              bridge.load(piece as unknown);
              window.dispatchEvent(new CustomEvent('recourse:play'));
            }
          } catch { /* keep polling */ }
        }, Math.max(500, intervalMs ?? 2000));
        return { stop: () => window.clearInterval(id), id };
      },
    };
    recWin.__recourse = bridge;
    return () => {
      recWin.__recourse = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize with a default synth layer if empty (and no auto-save was
  // restored). Gated on the startup recovery check completing so a slow
  // IndexedDB read can't let this add a throwaway layer that then clobbers the
  // real recovery snapshot via autosave.
  useEffect(() => {
    if (!recoveryChecked) return;
    const checkAndInit = setTimeout(() => {
      if (layers.length === 0 && !hasAutoSave) {
        addLayer('synth');
      }
    }, 100);
    return () => clearTimeout(checkAndInit);
  }, [hasAutoSave, layers.length, recoveryChecked]);

  // Debounced autosave (Phase 0.4) — schedules a snapshot of the full
  // session to IndexedDB. `flushAutosave()` is invoked on
  // visibilitychange/beforeunload so the snapshot survives a tab close.
  useEffect(() => {
    const snapshot = {
      title: 'Untitled Session',
      appVersion: '1.1.0',
      layers,
      patterns: patternStore.patterns,
      activePatternId: patternStore.activePatternId,
      songChain: { order: patternStore.songChain.order },
      programs: sequencerStore.programs,
      patternPrograms: sequencerStore.patternPrograms,
      activeBank: sequencerStore.activeBank,
      bpm: patternStore.patterns[patternStore.activePatternId].bpm,
      timeSignature: patternStore.patterns[patternStore.activePatternId].timeSignature,
      masterLevel,
      masterRack: { modules: rackModules },
      globalSwing: 0,
    };
    if (layers.length > 0 || patternStore.songChain.order.length > 0) {
      // Never clobber a recovery snapshot that the user hasn't resolved yet —
      // the recovery banner (Keep saved version / Discard) is the only writer
      // until the user acts, otherwise a stray autosave of a fresh session
      // would destroy the crash-recovery data before it can be restored.
      if (!hasAutoSave) {
        scheduleAutosave(snapshot, '1.1.0');
      }
    }
  }, [layers, masterLevel, patternStore, sequencerStore, rackModules, hasAutoSave]);

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

  // Clear the workspace into a fresh empty session (Ctrl/Cmd+N, command palette).
  const startNewSession = () => {
    layers.forEach((l) => {
      try {
        sharedAudioEngine.disposeModule(l.id);
      } catch {
        // module may already be gone — ignore
      }
    });
    setLayers([]);
    setSelectedLayerId(null);
    patternStore.reset();
    useSequencerStore.setState({
      programs: {
        A: Array(16).fill(null), B: Array(16).fill(null), C: Array(16).fill(null), D: Array(16).fill(null),
      },
    });
    addToast('New Session', 'info');
  };

  // Global Interactive Keyboard Shortcuts
  useEffect(() => {
    const otherModalOpen = isShortcutsOpen || isUserManualOpen || isAiSettingsOpen || isProjectManagerOpen || isAddToKitOpen || !!chopBuffer;
    const isAnyModalOpen = otherModalOpen || isCommandPaletteOpen;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      const inField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON' || !!document.activeElement?.hasAttribute('contenteditable');

      // Command palette: Ctrl/Cmd+K toggles it (unless another modal is open).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !otherModalOpen) {
        e.preventDefault();
        setIsCommandPaletteOpen((v) => !v);
        return;
      }

      // Escape always closes the topmost modal, even when a control is focused
      if (e.key === 'Escape' && isAnyModalOpen) {
        if (isCommandPaletteOpen) { setIsCommandPaletteOpen(false); return; }
        if (isShortcutsOpen) { setIsShortcutsOpen(false); return; }
        if (isUserManualOpen) { setIsUserManualOpen(false); return; }
        if (isAiSettingsOpen) { setIsAiSettingsOpen(false); return; }
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
          setActiveTab(WORKFLOW_STAGES[currentStageIndex + 1].defaultTab);
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentStageIndex > 0) {
          setActiveTab(WORKFLOW_STAGES[currentStageIndex - 1].defaultTab);
        }
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        // Space (and Shift+Space) toggle the master mix playback. The two
        // branches were byte-identical, so they've been merged into one.
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
      } else if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) {
        // Phase 6.4 — Ctrl/Cmd+S opens the save/project manager.
        e.preventDefault();
        setIsProjectManagerOpen(true);
      } else if ((e.key === 'n' || e.key === 'N') && (e.ctrlKey || e.metaKey)) {
        // Phase 6.4 — Ctrl/Cmd+N new project (empty session).
        e.preventDefault();
        startNewSession();
      } else if (/^[a-dA-D]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
        // Phase 6.4 — A/B/C/D switches the active pattern.
        const pid = e.key.toUpperCase() as 'A' | 'B' | 'C' | 'D';
        patternStore.setActivePattern(pid);
        e.preventDefault();
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
  }, [layers, selectedLayerId, activeTab, currentStageIndex, isShortcutsOpen, isUserManualOpen,
    isAiSettingsOpen, isProjectManagerOpen, isAddToKitOpen, isCommandPaletteOpen, chopBuffer]);

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

  const handleEvolveLayer = async (
    layer: SoundLayer, 
    mode: 'mutations' | 'melodic' | 'kit' = 'mutations',
    fxOption: 'mutate' | 'freeze' | 'fx_only' = 'mutate'
  ) => {
    if (!layer.audioBuffer && layer.type === 'sample') return;
    // Guard against double-fire: evolve runs 24 offline renders, so two
    // overlapping runs would freeze the tab and race the result.
    if (evolveInFlightRef.current) return;
    evolveInFlightRef.current = true;
    
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
      evolveInFlightRef.current = false;
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
      color: nextLayerColor(layers.length),
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

  /**
   * Create a synth layer derived from `source` (same synth/FX/envelope),
   * transposed by `semitones`. Used by the theory panel's "Roots → Pads" so
   * each generated chord root becomes a playable pad layer instead of a
   * throwaway preview.
   */
  const addSynthLayerFrom = (source: SoundLayer, name: string, semitones: number): string => {
    const newLayer: SoundLayer = {
      ...source,
      id: crypto.randomUUID(),
      name,
      type: 'synth',
      audioBuffer: undefined,
      pitch: (source.pitch || 0) + semitones,
      synth: { ...DEFAULT_SYNTH, ...(source.synth || {}) },
      color: nextLayerColor(layers.length),
    };
    setLayers(prev => [...prev, newLayer]);
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
      color: nextLayerColor(layers.length),
    };
    setLayers(prev => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
    addToast(`Added new preset layer: ${preset.name}`, 'success');
  };

  const handleLoadKitToSoundLab = (kitSamples: SoundKitSample[]) => {
    const newLayers: SoundLayer[] = kitSamples.map((s, i) => ({
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
      color: nextLayerColor(layers.length + i),
    }));

    setLayers((prev) => [...prev, ...newLayers]);
    if (newLayers.length > 0) setSelectedLayerId(newLayers[0].id);
    setActiveTab('soundlab');
  };

  const handlePublishNewKit = async (newKit: SoundKit) => {
    // Functional update so two rapid publishes can't overwrite each other via
    // a stale `publishedKits` closure.
    setPublishedKits((prev) => {
      const next = [newKit, ...prev];
      try {
        localStorage.setItem('sonik_published_kits', JSON.stringify(next));
      } catch {
        // quota/private mode — non-fatal
      }
      return next;
    });
    try {
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

  // Chop editor "Send to Pads" → creates the chop layers and routes to Program D.
  // The persisted chop map (if any) is stamped as a Program D program so the
  // chop → program → sequence loop is recoverable from the saved-chops list.
  const handleChopEditorSend = async (sounds: { name: string; buffer?: AudioBuffer; start?: number; end?: number; gain?: number; tune?: number }[], ctx?: { chopMapId: string | null }) => {
    handleSendToPads(sounds, 'D');
    if (ctx?.chopMapId) {
      try {
        const { stampChopMapSent } = await import('./lib/chopMaps');
        await stampChopMapSent(ctx.chopMapId, 'D');
      } catch (err) {
        console.warn('Chop program stamp failed:', err);
      }
    }
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
      setActiveTab(WORKFLOW_STAGES[currentStageIndex + 1].defaultTab);
    }
  };

  const goToPrevStage = () => {
    if (currentStageIndex > 0) {
      setActiveTab(WORKFLOW_STAGES[currentStageIndex - 1].defaultTab);
    }
  };

  // ⌘/Ctrl+K action registry (see lib/appCommands). Rebuilt each render so
  // every command sees the latest state; the palette reads it only while open.
  const commands = buildCommands({
    setActiveTab,
    layers,
    selectedLayer,
    selectedLayerId,
    setSelectedLayerId,
    addLayer,
    sampleFileInput: fileInputRef,
    duplicateLayer: handleDuplicateLayer,
    removeLayer,
    updateLayer,
    playSelectedLayer,
    isPlaying,
    playAll,
    stopAll: () => audioEngine.stop(),
    bpm: patternStore.patterns[patternStore.activePatternId].bpm,
    setBpm: patternStore.setBpm,
    loopEnabled,
    toggleLoop: handleToggleLoop,
    exportWav,
    setProjectManagerOpen: setIsProjectManagerOpen,
    newSession: startNewSession,
    toggleSidebar: () => setIsSidebarCollapsed((v) => !v),
    setShortcutsOpen: setIsShortcutsOpen,
    setManualOpen: setIsUserManualOpen,
  });

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDropFile}
      className="h-screen flex bg-[#08080a] text-[#e0e0e0] font-sans overflow-hidden relative"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[200] focus:top-2 focus:left-2 focus:px-3 focus:py-2 focus:bg-yellow-400 focus:text-black focus:rounded-lg focus:text-xs focus:font-black focus:uppercase"
      >
        Skip to workspace
      </a>
      <h1 className="sr-only">NC Sound Lab</h1>
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
                <p className="text-base font-fastblaze tracking-wider text-white uppercase drop-shadow-[0_0_12px_rgba(37,99,235,0.9)]">
                  NC SOUNDLAB
                </p>
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
                const isActive = currentStage.id === stage.id;

                if (isSidebarCollapsed) {
                  return (
                    <button
                      key={stage.id}
                      onClick={() => setActiveTab(stage.defaultTab)}
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
                    onClick={() => setActiveTab(stage.defaultTab)}
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
              <div className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[#a1a1aa] px-2">
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
            <div className="flex items-center justify-between text-[9px] font-mono text-[#a1a1aa]">
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
            const isActive = currentStage.id === stage.id;
            return (
              <button
                key={stage.id}
                onClick={() => setActiveTab(stage.defaultTab)}
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
              <p className="text-sm sm:text-base font-fastblaze tracking-wider text-white truncate">
                {currentStage.name}
              </p>
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
            {/* Persistent transport (visible on every screen) */}
            <HeaderTransport
              isPlaying={isPlaying}
              onTogglePlay={() => { if (isPlaying) audioEngine.stop(); else audioEngine.playAll(layers); }}
              bpm={patternStore.patterns[patternStore.activePatternId].bpm}
              onBpmChange={(bpm) => patternStore.setBpm(bpm)}
              keyName={chordSettings.key}
              scaleName={chordSettings.scale}
            />

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

            {/* Producer Manual Trigger (always reachable, incl. mobile) */}
            <button
              onClick={() => setIsUserManualOpen(true)}
              className="p-2 bg-[#000000] hover:bg-[#1e3a8a] border border-[#1e293b] text-blue-400 rounded-xl transition-all flex items-center justify-center"
              title="Open Studio Manual & System Guide"
              aria-label="Open Studio Manual"
            >
              <BookOpen size={14} />
            </button>

            {/* AI Provider Settings Trigger */}
            <button
              onClick={() => setIsAiSettingsOpen(true)}
              className="p-2 bg-[#000000] hover:bg-[#1e3a8a] border border-[#1e293b] text-fuchsia-400 rounded-xl transition-all flex items-center justify-center"
              title="AI Provider Settings"
              aria-label="AI Provider Settings"
            >
              <Sparkles size={14} />
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

        {/* Sub-tab strip for condensed stages (e.g. Mixer / 3D Space / Compare) */}
        {currentStage.tabs.length > 1 && (
          <nav
            aria-label={`${currentStage.name} views`}
            className="flex items-center gap-1 px-6 py-1.5 bg-[#0c0c0f] border-b border-[#1e293b] shrink-0 overflow-x-auto custom-scrollbar no-scrollbar"
          >
            {currentStage.tabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all shrink-0 ${
                    isActive
                      ? `bg-[#0f172a] text-white ${currentStage.borderActive}`
                      : 'bg-black border-[#1e293b] text-slate-400 hover:text-white hover:border-blue-900'
                  }`}
                >
                  {TAB_LABELS[tab]}
                </button>
              );
            })}
          </nav>
        )}

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
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-hidden relative bg-[#08080a]">
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

          {/* Panel mount is not gated on the previous panel's exit animation:
              switching screens is instant, and the panels overlap (absolute). */}
          <AnimatePresence>
            {activeTab === 'soundlab' && (
              <motion.div 
                key="soundlab"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute inset-0 h-full overflow-y-auto custom-scrollbar p-6 space-y-6"
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
                      id="sample-upload"
                      name="sample-upload"
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
                      {layers.map((l, idx) => (
                        <LayerRow
                          key={l.id}
                          layer={l}
                          index={idx}
                          isSelected={selectedLayerId === l.id}
                          level={layerLevels[l.id] ?? 0}
                          onSelect={() => setSelectedLayerId(l.id)}
                          onRename={(name) => updateLayer(l.id, { name })}
                          onToggleEnabled={() => updateLayer(l.id, { enabled: !l.enabled })}
                          onPlay={() => audioEngine.playLayer(l)}
                          onDuplicate={() => handleDuplicateLayer(l.id)}
                          onDelete={() => removeLayer(l.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Waveform DSP Editor / Sample Editor Block (always visible) */}
                <section
                  aria-label="Sample Waveform & Detailed DSP Editor"
                  className="bg-[#0b0b0d] border border-[#1e293b] rounded-2xl overflow-hidden shadow-2xl flex flex-col w-full"
                >
                  <div className="flex items-center justify-between border-b border-[#1e293b] bg-black px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Music className="w-4 h-4 text-sky-400" />
                      <span className="text-xs font-black uppercase tracking-wider text-white">Sample Waveform & Detailed DSP Editor</span>
                      {selectedLayer ? (
                        <span className="text-[9px] font-mono text-slate-400">
                          {selectedLayer.type === 'sample' ? 'waveform + destructive DSP' : 'bounce this synth to a sample to edit its waveform'}
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono text-slate-500">select a layer to begin</span>
                      )}
                    </div>
                  </div>

                  <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                    {selectedLayer && selectedLayer.type === 'synth' && (
                      <div className="lg:col-span-12 -mb-2 flex justify-end">
                        <button
                          onClick={() => handleBounceLayer(selectedLayer)}
                          className="px-3 py-1.5 bg-[#121215] border border-blue-500 hover:bg-blue-600 rounded text-[9.5px] uppercase font-bold text-blue-400 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
                          title="Bounce this synth's current parameters into a brand new Sample Layer for waveform rendering"
                        >
                          <Sparkles className="w-3 h-3 text-sky-400" /> Bounce Synth to Sample
                        </button>
                      </div>
                    )}

                    {/* Sampler screen — MPD226-framed, full-width sample editor */}
                    <div className="lg:col-span-12 space-y-2">
                      {selectedLayer ? (
                        <>
                          <Suspense fallback={<div className="h-[260px] flex items-center justify-center bg-black border border-[#1e293b] rounded-2xl"><Loader2 className="w-8 h-8 animate-spin text-slate-500" /></div>}>
                            <SamplerUnit
                              buffer={selectedLayer.audioBuffer || compositeBuffer}
                              selectionStart={selectionStart}
                              selectionEnd={selectionEnd}
                              onSelectionChange={(start, end) => {
                                setSelectionStart(start);
                                setSelectionEnd(end);
                              }}
                              layerName={selectedLayer.name}
                              onApplyEffect={applyWaveformEdit}
                              onParamChange={(param, value) => {
                                // Persist sampler knob moves to the layer so they
                                // affect sequenced playback, not just preview.
                                updateLayer(selectedLayer.id, param === 'gain' ? { gain: value } : { pitch: value });
                              }}
                              onAudition={(semitones, velocity01) => {
                                // Route auditions through the engine's full FX chain,
                                // scaling gain by the pad velocity.
                                audioEngine.triggerLayer(
                                  { ...selectedLayer, gain: Math.max(0.02, (selectedLayer.gain || 1) * velocity01) },
                                  0.6,
                                  undefined,
                                  undefined,
                                  {
                                    note: 60 + (selectedLayer.pitch || 0) + semitones,
                                    respectDuration: true,
                                    maxVoices: 4,
                                  }
                                );
                              }}
                            />
                          </Suspense>
                          <div className="text-[9.5px] text-slate-500 font-mono flex justify-between items-center bg-[#070709] border border-[#1e293b]/40 px-3 py-1.5 rounded-lg">
                            <span>Active Layer buffer rendering: {selectedLayer.name}</span>
                            <span className="text-yellow-400 font-bold font-mono text-[8.5px]">Drag the on-screen region to set crop / fades · zoom in for sample-precise edits</span>
                          </div>
                        </>
                      ) : (
                        <div className="bg-black border border-[#1e293b] rounded-2xl flex flex-col items-center justify-center text-center text-slate-500 py-12 gap-2">
                          <Music className="w-8 h-8 text-slate-700 animate-pulse" />
                          <p className="text-xs uppercase font-extrabold tracking-wider">No Active Layer Waveform</p>
                          <p className="text-[10px] text-slate-400">Select any Layer above to inspect and edit its sample buffer.</p>
                        </div>
                      )}
                    </div>

                    {/* Waveform DSP Toolbar (full width, below the screen) */}
                    <div className="lg:col-span-12 bg-black border border-[#1e293b] rounded-xl p-4 flex flex-col justify-between">
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

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                </section>
              </motion.div>
            )}

            {activeTab === 'tweaking' && (
              <motion.div 
                key="tweaking"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute inset-0 h-full overflow-y-auto custom-scrollbar p-6 space-y-6"
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
                className="absolute inset-0 h-full overflow-y-auto custom-scrollbar p-6 space-y-6"
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
                className="absolute inset-0 h-full overflow-y-auto custom-scrollbar p-6 space-y-6"
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
                className="absolute inset-0 h-full overflow-y-auto custom-scrollbar p-4"
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
                className="absolute inset-0 w-full h-full p-8 overflow-y-auto"
              >
                <Suspense fallback={<div className="h-[400px] flex items-center justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-green-500" /></div>}>
                  <EvolutionPanel 
                    variations={evolutionVariations}
                    onSetVariations={setEvolutionVariations}
                    onAddLayer={(v) => addLayer('sample', v.buffer, `Mutant_${v.id.slice(0,4)}`)}
                    onSaveToKit={async (v) => {
                      const { analyzeAudioBuffer } = await import('./lib/batchAudioProcessor');
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
                className="absolute inset-0 h-full overflow-y-auto custom-scrollbar p-4"
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
                className="absolute inset-0 h-full overflow-y-auto custom-scrollbar p-4"
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
                className="absolute inset-0 h-full"
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
                    onAddSynthLayer={addSynthLayerFrom}
                  />
                </Suspense>
                {/* AAF / Pro Tools interchange (Phase 4.5, desktop-only) */}
                <div className="absolute top-20 right-4 z-40">
                  <Suspense fallback={null}>
                    <AafExportPanel
                      layers={layers}
                      songName="My Song"
                      bpm={patternStore.patterns[patternStore.activePatternId]?.bpm ?? 120}
                      patterns={patternStore.patterns}
                      songChain={patternStore.songChain}
                      onToast={addToast}
                    />
                  </Suspense>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Studio Workspace Bottom Status Bar */}
        <footer className="h-8 bg-[#0a0a0c] border-t border-[#1f1f21] px-6 flex items-center justify-between text-[9px] text-[#a1a1aa] flex-shrink-0 font-mono">
          <div className="flex items-center space-x-6">
            <span
              className={`flex items-center gap-1.5 font-bold ${describeContextState(audioTelemetry.state).ok ? 'text-blue-400' : 'text-amber-400'}`}
              data-audio-state={audioTelemetry.state}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${describeContextState(audioTelemetry.state).ok ? 'bg-blue-500 animate-pulse' : 'bg-amber-500'}`}
              />
              {describeContextState(audioTelemetry.state).label}
            </span>
            <span data-audio-latency>LATENCY: {formatLatency(audioTelemetry.latencyMs)}</span>
            <span className="hidden sm:inline" data-audio-samplerate>
              {formatSampleRate(audioTelemetry.sampleRateKHz)}
            </span>
            <span className="hidden sm:inline">WORKFLOW: {currentStage.shortName.toUpperCase()}</span>
          </div>
          <div className="uppercase tracking-widest text-[#a1a1aa]">
            SONIK STUDIO ARCHITECTURE v1.1
          </div>
        </footer>

      </div>

      {/* Right-rail MIDI centrepiece: a single engine for every screen. */}
      <ControllerHost
        layers={layers}
        selectedLayerId={selectedLayerId}
        updateLayer={updateLayer}
        playAll={playAll}
        stopStack={() => audioEngine.stop()}
        stackPlaying={isPlaying}
        selectLayer={(index) => {
          const target = layers[index];
          if (target) setSelectedLayerId(target.id);
        }}
      />

      <Suspense fallback={null}>
        {/* Command palette (⌘/Ctrl+K) */}
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          commands={commands}
        />

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

      {/* AI Provider Settings (Phase 3.1). Eagerly imported: it is small, and a
          lazy mount here would suspend the shared modal boundary and blank the
          other modals until its chunk resolved. Rendered only while open. */}
      {isAiSettingsOpen && (
        <AiSettingsPanel
          isOpen
          onClose={() => setIsAiSettingsOpen(false)}
          onToast={addToast}
        />
      )}

      {/* Chop Editor (opens when a sample is uploaded in Chop mode) */}
      <Suspense fallback={null}>
        {chopBuffer && (
          <ChopEditor
            buffer={chopBuffer}
            fileName={chopFileName}
            defaultCount={chopCount}
            onSendToPads={handleChopEditorSend}
            onClose={() => setChopBuffer(null)}
            onLoadSource={(buffer, fileName) => {
              setChopBuffer(buffer);
              setChopFileName(fileName);
            }}
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
