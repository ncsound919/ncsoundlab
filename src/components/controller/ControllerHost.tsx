/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * App-level controller host (Phase 8).
 *
 * Mounted once by App so the MPD226 keeps working across workflow sections:
 * it owns the single `useControllerMidi` subscription and renders the
 * controller dock (slim status bar + expandable full panel). The visible
 * section re-targets bank-0 knobs/faders via the section map (see
 * `lib/controller/sectionMap.ts`); pads, switches and transport keep their
 * profile behavior.
 *
 * Sequencer-owned closures (pattern clock, pad tune/choke, arrange edits)
 * arrive through the `sequencerBridge` while Beat Studio is mounted. Off-tab
 * the host falls back to honest store-backed behavior: layer-stack transport,
 * direct layer triggering, pattern BPM/swing writes. Arrange-editing ops with
 * no portable equivalent (quantize/humanize/groove/to-pattern) are safe
 * no-ops until Beat Studio remounts.
 */

import React, { useRef, useState } from 'react';
import { PanelRight, PanelRightClose, X } from 'lucide-react';
import { clampBpm } from '../../lib/controlRanges';
import { audioEngine } from '../../lib/audioEngine';
import { applySemitoneShift } from '../../lib/sequencerHelpers';
import { useControllerStore } from '../../store/controllerStore';
import { useSequencerStore, type BankId } from '../../store/sequencerStore';
import { usePatternStore } from '../../store/patternStore';
import { useMixerStore } from '../../store/mixerStore';
import { useSamplerStore, type SamplerParam } from '../../store/samplerStore';
import { useRecourseStore, type RecourseParam } from '../../store/recourseStore';
import { useCompareEngineStore } from '../../store/compareEngineStore';
import { useEvolutionStore, EVOLUTION_MODES, EVOLUTION_FX } from '../../store/evolutionStore';
import { getSequencerBridge } from '../../lib/controller/sequencerBridge';
import {
  createStudioControllerHandlers,
  generateProgressionFromChord,
  type StudioControllerDeps,
} from './studioControllerHandlers';
import { sectionDisplayName, sectionRoleSummary } from '../../lib/controller/sectionMap';
import { useControllerMidi } from './useControllerMidi';
import { ControllerPanelView } from './ControllerPanelView';
import type { ControllerHandlers } from '../../lib/controller/actions';
import type { SoundLayer } from '../../types';

export interface ControllerHostProps {
  layers: SoundLayer[];
  selectedLayerId: string | null;
  updateLayer: (id: string, updates: Partial<SoundLayer>) => void;
  /** Audition the whole layer stack (App-level transport fallback). */
  playAll: () => void;
  stopStack: () => void;
  stackPlaying: boolean;
  /** Select the Nth layer in the stack (per-screen pad action). */
  selectLayer?: (index: number) => void;
}

/** Mixer mute/solo-aware audibility check (mirrors the sequencer's). */
export const isLayerAudible = (layer: SoundLayer, layers: SoundLayer[]): boolean => {
  if (!layer.enabled || layer.muted === true) return false;
  const anySolo = layers.some((l) => l.soloed === true);
  return !anySolo || layer.soloed === true;
};

interface HostRefs {
  props: React.MutableRefObject<ControllerHostProps>;
  tapTimes: React.MutableRefObject<number[]>;
}

function buildHostDeps({ props, tapTimes }: HostRefs): StudioControllerDeps {
  const bridge = () => getSequencerBridge();
  const current = () => props.current;
  return {
    getPrograms: () => useSequencerStore.getState().programs,
    getActiveBank: () => useSequencerStore.getState().activeBank,
    setActiveBank: (bank) => useSequencerStore.getState().setActiveBank(bank as BankId),
    followPadBank: () => useControllerStore.getState().profile.followPadBank,
    getPadTune: () => bridge()?.getPadTune() ?? {},
    getPadChoke: () => bridge()?.getPadChoke() ?? {},
    triggerLayer: (layerId, semitones, velocity01, chokeKey) => {
      const b = bridge();
      if (b) {
        b.triggerLayer(layerId, semitones, velocity01, chokeKey);
        return;
      }
      const { layers } = current();
      const layer = layers.find((l) => l.id === layerId);
      if (!layer || !isLayerAudible(layer, layers)) return;
      const base = { ...layer, gain: Math.max(0.02, (layer.gain || 1) * velocity01) };
      audioEngine.triggerLayer(applySemitoneShift(base, semitones), undefined, chokeKey);
    },
    playNote: (midi, velocity01) => {
      const b = bridge();
      if (b) {
        b.playNote(midi, velocity01);
        return;
      }
      // Off-tab preview: pitch the selected layer around middle C.
      const { layers, selectedLayerId } = current();
      const layer = layers.find((l) => l.id === selectedLayerId);
      if (!layer || !isLayerAudible(layer, layers)) return;
      const v = Math.max(0, Math.min(1, velocity01));
      audioEngine.triggerLayer(
        applySemitoneShift({ ...layer, gain: (layer.gain || 1) * v }, midi - 60)
      );
    },
    stopNote: (m) => {
      bridge()?.stopNote(m);
    },
    getIsPlaying: () => bridge()?.getIsPlaying() ?? current().stackPlaying,
    togglePlay: () => {
      const b = bridge();
      if (b) {
        b.togglePlay();
        return;
      }
      const p = current();
      if (p.stackPlaying) p.stopStack();
      else p.playAll();
    },
    toggleRecord: () => {
      bridge()?.toggleRecord();
    },
    tapTempo: () => {
      const b = bridge();
      if (b) {
        b.tapTempo();
        return;
      }
      const now = performance.now();
      const times = tapTimes.current;
      const last = times[times.length - 1];
      if (last !== undefined && now - last > 2000) {
        tapTimes.current = [now];
        return;
      }
      times.push(now);
      if (times.length > 4) times.shift();
      if (times.length >= 2) {
        const avg = (times[times.length - 1] - times[0]) / (times.length - 1);
        usePatternStore.getState().setBpm(clampBpm(60000 / avg));
      }
    },
    setBpm: (v) => usePatternStore.getState().setBpm(v),
    setSwing: (v) => {
      const b = bridge();
      if (b) {
        b.setSwing(v);
        return;
      }
      usePatternStore.getState().setSwing(v / 100);
    },
    setMaster: (v) => audioEngine.setMasterLevel(v),
    getActiveLayer: () => {
      const { layers, selectedLayerId } = current();
      return layers.find((l) => l.id === selectedLayerId) ?? null;
    },
    getLayers: () => current().layers,
    updateLayer: (id, updates) => current().updateLayer(id, updates),
    setLayerSend: (id, bus, v) => useMixerStore.getState().setLayerSend(id, bus, v),
    getSelectedPad: () => bridge()?.getSelectedPad() ?? 0,
    clearPad: (index) => {
      const b = bridge();
      if (b) {
        b.clearPad(index);
        return;
      }
      const seq = useSequencerStore.getState();
      seq.setPatternProgramSlot(usePatternStore.getState().activePatternId, seq.activeBank, index, null);
    },
    assignPad: (index) => {
      const b = bridge();
      if (b) {
        b.assignPad(index);
        return;
      }
      const { selectedLayerId, layers } = current();
      if (selectedLayerId && layers.some((l) => l.id === selectedLayerId)) {
        const seq = useSequencerStore.getState();
        seq.setPatternProgramSlot(
          usePatternStore.getState().activePatternId,
          seq.activeBank,
          index,
          selectedLayerId
        );
      }
    },
    togglePadMute: (layerId) => {
      const { layers } = current();
      const layer = layers.find((l) => l.id === layerId);
      current().updateLayer(layerId, { muted: !(layer?.muted === true) });
    },
    selectLayer: (index) => current().selectLayer?.(index),
    toggleChannelMute: (index) => {
      const { layers } = current();
      const layer = layers[index];
      if (layer) current().updateLayer(layer.id, { muted: !(layer.muted === true) });
    },
    clearPattern: () => {
      const pid = usePatternStore.getState().activePatternId;
      usePatternStore.getState().clearPatternCells(pid);
    },
    quantizePattern: () => {
      bridge()?.quantizePattern();
    },
    humanizePattern: () => {
      bridge()?.humanizePattern();
    },
    applyGroove: (tpl) => {
      bridge()?.applyGroove(tpl);
    },
    getChord: () => useControllerStore.getState().chord,
    setChord: (patch) => useControllerStore.getState().setChord(patch),
    setChordParam: (param, v) => useControllerStore.getState().setChordParam(param, v),
    generateProgression: () => generateProgressionFromChord(useControllerStore.getState().chord),
    applyProgressionToPattern: (chords) => {
      bridge()?.applyProgressionToPattern(chords);
    },
    sampleCommand: (cmd) => useSamplerStore.getState().runCommand(cmd),
    sampleParam: (param, value) => useSamplerStore.getState().setParam(param as SamplerParam, value),
    samplePad: (index, velocity01) => useSamplerStore.getState().triggerPad(index, velocity01),
    recourseCommand: (cmd) => useRecourseStore.getState().runCommand(cmd),
    recourseParam: (param, value) => useRecourseStore.getState().setParam(param as RecourseParam, value),
    sectionCompare: (param, value) => {
      const cmp = useCompareEngineStore.getState();
      switch (param) {
        case 'refGain': cmp.setRefGain(value); break;
        case 'loopStart': cmp.setLoop(value, cmp.loopEnd, cmp.loopEnabled); break;
        case 'loopEnd': cmp.setLoop(cmp.loopStart, value, cmp.loopEnabled); break;
        case 'track': {
          const track = cmp.referenceTracks[Math.round(value)];
          if (track) cmp.selectReferenceTrack(track.id);
          break;
        }
        case 'source': cmp.setSource(value >= 0.5 ? 'B' : 'A'); break;
        case 'loop': cmp.setLoop(cmp.loopStart, cmp.loopEnd, value >= 0.5); break;
        case 'levelMatch': cmp.triggerLevelMatch(); break;
        case 'loopSync': cmp.setLoopSync(value >= 0.5); break;
      }
    },
    sectionEvolution: (param, value, on) => {
      const evo = useEvolutionStore.getState();
      const bridge = evo.bridge;
      switch (param) {
        case 'mode':
          bridge?.setMode(EVOLUTION_MODES[Math.round(value) % EVOLUTION_MODES.length]);
          break;
        case 'fx':
          bridge?.setFx(EVOLUTION_FX[Math.round(value) % EVOLUTION_FX.length]);
          break;
        case 'variation':
          evo.selectIndex(Math.round(value));
          break;
        case 'reEvolve': bridge?.reEvolve(); break;
        case 'play':
          if (on) bridge?.playVariation(evo.selectedIndex);
          else bridge?.stopPlayback();
          break;
        case 'add': bridge?.addVariation(evo.selectedIndex); break;
        case 'save': bridge?.saveVariationToKit(evo.selectedIndex); break;
        case 'discard': bridge?.discardVariation(evo.selectedIndex); break;
      }
    },
  };
}

export const ControllerHost: React.FC<ControllerHostProps> = (props) => {
  const propsRef = useRef(props);
  propsRef.current = props;
  const tapTimes = useRef<number[]>([]);

  const handlersRef = useRef<ControllerHandlers | null>(null);
  if (handlersRef.current === null) {
    handlersRef.current = createStudioControllerHandlers(() => buildHostDeps({ props: propsRef, tapTimes }));
  }
  const midi = useControllerMidi(handlersRef.current);

  const section = useControllerStore((s) => s.section);
  const mode = useControllerStore((s) => s.mode);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const statusDot = (
    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${midi.active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
  );

  // The controller is the centrepiece: a persistent rail whose on-screen pads /
  // knobs / faders are labelled with this screen's mapping. The rail collapses
  // to a tab; on small screens it becomes a launcher + overlay drawer.
  const railHeader = (
    <button
      type="button"
      data-controller-dock
      onClick={() => setCollapsed((v) => !v)}
      aria-expanded={!collapsed}
      aria-label={`MPD · ${sectionDisplayName(section)}`}
      className="h-11 w-full flex items-center gap-2 px-2.5 text-left bg-black border-b border-[#1e293b] hover:bg-white/[0.03] transition-colors shrink-0"
      title={collapsed ? 'Expand controller' : 'Collapse controller'}
    >
      {statusDot}
      {!collapsed && (
        <>
          <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400 whitespace-nowrap">
            MPD · {sectionDisplayName(section)}
          </span>
          <span className="text-[9px] font-mono text-slate-500 truncate flex-1">
            {mode === 'beat' ? sectionRoleSummary(section) : `${mode} mode · follow off`}
          </span>
        </>
      )}
      {collapsed && <span className="flex-1" />}
      {collapsed ? (
        <PanelRight size={14} className="text-slate-400" />
      ) : (
        <PanelRightClose size={14} className="text-slate-400" />
      )}
    </button>
  );

  const railBody = (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2">
      <ControllerPanelView handlers={handlersRef.current} midi={midi} />
    </div>
  );

  return (
    <>
      <aside
        data-controller-host
        className={`hidden lg:flex flex-col flex-shrink-0 border-l border-[#1e293b] bg-[#0b0b0d] transition-[width] duration-200 ${
          collapsed ? 'w-12' : 'w-[380px]'
        }`}
      >
        {railHeader}
        {!collapsed && railBody}
      </aside>

      {/* Compact screens: floating launcher + overlay drawer */}
      <button
        type="button"
        onClick={() => { setCollapsed(false); setMobileOpen(true); }}
        aria-label="Open MIDI controller"
        title="Open MIDI controller"
        className="lg:hidden fixed right-3 bottom-24 z-[80] flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#0f172a] border border-cyan-500/50 text-cyan-200 shadow-lg"
      >
        {statusDot}
        <span className="text-[10px] font-black uppercase tracking-widest">MPD</span>
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[130] flex" role="dialog" aria-modal="true" aria-label="MIDI controller">
          <div className="flex-1 bg-black/70" onClick={() => setMobileOpen(false)} />
          <div className="w-[92vw] max-w-[420px] h-full bg-[#0b0b0d] border-l border-[#1e293b] flex flex-col">
            <div className="flex items-center justify-between h-11 px-3 bg-black border-b border-[#1e293b] shrink-0">
              <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
                MPD · {sectionDisplayName(section)}
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close controller"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            {railBody}
          </div>
        </div>
      )}
    </>
  );
};
