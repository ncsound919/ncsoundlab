/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Visual MIDI controller configuration panel — pure view (Phase 8).
 *
 * The MIDI engine (`useControllerMidi`) lives outside this component so
 * exactly one subscription exists: the App-level `ControllerHost` owns it
 * and renders this view, while `ControllerPanel` (thin wrapper below kept
 * for standalone use) owns it when the view is used directly. Everything
 * here reads live store state, so any number of mounted views stay in sync
 * without ever double-dispatching hardware messages.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Download, Upload, RotateCcw, Piano, AlertTriangle, Trash2, Radio } from 'lucide-react';
import { Mpd226Layout } from './Mpd226Layout';
import { ControllerAssignPanel } from './ControllerAssignPanel';
import type { UseControllerMidiResult } from './useControllerMidi';
import { useControllerStore, sanitizeProfile } from '../../store/controllerStore';
import { resolveSectionBinding, sectionDisplayName, sectionRoleSummary } from '../../lib/controller/sectionMap';
import type { ControllerBinding } from '../../lib/controller/types';
import { useSamplerStore } from '../../store/samplerStore';
import { useRecourseStore } from '../../store/recourseStore';
import { describeIncoming } from '../../lib/controller/mapping';
import { chordPadAt, type ChordPadSettings } from '../../lib/controller/chordPads';
import { SURFACES, detectSkin, type ControllerSkin } from '../../lib/controller/surface';
import { SCALE_PRESETS } from '../../lib/musicTheory';
import type { ControllerHandlers } from '../../lib/controller/actions';

export interface ControllerPanelViewProps {
  handlers: ControllerHandlers;
  midi: UseControllerMidiResult;
}

const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const ControllerPanelView: React.FC<ControllerPanelViewProps> = ({ handlers, midi }) => {
  const { supported, active, inputs, error, enable, disable } = midi;

  const profile = useControllerStore((s) => s.profile);
  const chord = useControllerStore((s) => s.chord);
  const lastMessage = useControllerStore((s) => s.lastMessage);
  const learnTarget = useControllerStore((s) => s.learnTarget);
  const learnMode = useControllerStore((s) => s.learnMode);
  const armLearn = useControllerStore((s) => s.armLearn);
  const setLearnMode = useControllerStore((s) => s.setLearnMode);
  const mode = useControllerStore((s) => s.mode);
  const setMode = useControllerStore((s) => s.setMode);
  const section = useControllerStore((s) => s.section);
  const samplerBridge = useSamplerStore((s) => s.bridge);
  const samplerLayer = useSamplerStore((s) => s.layerName);
  const recourseBridge = useRecourseStore((s) => s.bridge);
  const setChord = useControllerStore((s) => s.setChord);
  const setProfile = useControllerStore((s) => s.setProfile);
  const resetProfile = useControllerStore((s) => s.resetProfile);
  const loadBlankProfile = useControllerStore((s) => s.loadBlankProfile);
  const setFollowPadBank = useControllerStore((s) => s.setFollowPadBank);
  const setEnabledInputIds = useControllerStore((s) => s.setEnabledInputIds);

  const [padPage, setPadPage] = useState(0);
  const [controlPage, setControlPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [skinOverride, setSkinOverride] = useState<ControllerSkin | 'auto'>('auto');
  const [showChord, setShowChord] = useState(true);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const previewTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const allInputs = enabledInputIdsDescriptor(profile.enabledInputIds, inputs.length);

  // Surface follows the connected hardware; the default profile is MPD226.
  const detectedSkin = inputs.length > 0 ? detectSkin(inputs.map((i) => i.name)) : 'mpd226';
  const skin = skinOverride === 'auto' ? detectedSkin : skinOverride;
  const surface = SURFACES[skin];

  const toggleInput = (id: string) => {
    const current = profile.enabledInputIds;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    setEnabledInputIds(next);
  };

  /** In learn mode, clicking a control arms it so the next hardware move binds it. */
  const handleSelect = (key: string) => {
    setSelected(key);
    if (learnMode) armLearn(key);
  };

  const handleArm = (key: string) => {
    setSelected(key);
    armLearn(key);
  };

  const exportProfile = () => {
    const payload = {
      format: 'ncsoundlab-controller',
      version: 1,
      profile,
      chord,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'soundlab-controller.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importProfile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const nextProfile = sanitizeProfile(data.profile);
        if (nextProfile) setProfile(nextProfile);
        if (data.chord && typeof data.chord === 'object') setChord(data.chord as Partial<ChordPadSettings>);
      } catch (err) {
        console.warn('Controller profile import failed', err);
      }
    };
    reader.readAsText(file);
  };

  const previewChord = (index: number) => {
    handlers.playChord(index, 0.8);
    const t = setTimeout(() => handlers.stopChord(index), 1200);
    previewTimers.current.push(t);
  };

  const chordPads = useMemo(
    () => Array.from({ length: 16 }, (_, i) => ({ index: i, pad: chordPadAt(chord, i) })),
    [chord]
  );

  // The visual's labels follow the visible screen: in Mixer/3D Space/Compare etc.
  // the same knob reads differently, exactly as the hardware behaves.
  const resolveControllerBinding = useCallback(
    (key: string, binding: ControllerBinding) =>
      resolveSectionBinding({ mode, section, controlKey: key, binding }) ?? binding,
    [mode, section]
  );

  return (
    <div className="bg-[#0f0f12] border border-[#1e293b] rounded-xl p-3 space-y-3" data-controller-panel>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400 flex items-center gap-1.5">
          <Piano size={12} /> MIDI Controller · {profile.name}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setLearnMode(!learnMode)}
            className={`px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider border transition-all flex items-center gap-1 ${
              learnMode ? 'bg-fuchsia-500/30 border-fuchsia-400 text-fuchsia-200 shadow-[0_0_14px_rgba(217,70,239,0.4)]' : 'bg-[#121215] border-[#1e293b] text-slate-300 hover:text-white'
            }`}
            title="Touch-to-assign: tap a control, then move it on your device"
          >
            <Radio size={10} /> MIDI Learn: {learnMode ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={() => (active ? disable() : enable())}
            className={`px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider border transition-all ${
              active ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-[#121215] border-[#1e293b] text-slate-300 hover:text-white'
            }`}
          >
            {active ? `Connected · ${inputs.length} in` : 'Connect MIDI'}
          </button>
        </div>
      </div>

      {/* Surface: follows the connected hardware, with a manual override. */}
      <div className="flex items-center gap-2 flex-wrap text-[9px] font-mono text-slate-500">
        <span>Surface: <span className="text-cyan-300">{surface.label}</span></span>
        <select
          value={skinOverride}
          onChange={(e) => setSkinOverride(e.target.value as ControllerSkin | 'auto')}
          className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white"
          aria-label="Controller surface"
        >
          <option value="auto">Auto-detect{inputs.length > 0 ? ` (${detectedSkin})` : ''}</option>
          {Object.values(SURFACES).map((s) => (
            <option key={s.skin} value={s.skin}>{s.label}</option>
          ))}
        </select>
        <span className="text-slate-600">
          {inputs.length === 0
            ? 'connect to detect your controller'
            : `${inputs.length} MIDI input${inputs.length === 1 ? '' : 's'} detected`}
        </span>
      </div>

      {/* Current screen mapping readout */}
      <div className="flex items-center gap-2 flex-wrap text-[9px] font-mono text-slate-400" data-section-readout>
        <span className="uppercase tracking-widest text-slate-500">Screen</span>
        <span className="text-cyan-300 font-bold">{sectionDisplayName(section)}</span>
        <span className="text-slate-500">
          {mode === 'beat' ? sectionRoleSummary(section) : `${mode} mode · section follow off`}
        </span>
      </div>

      {/* Mode: the unit's job — play the kit, edit the loaded sample, or compose. */}
      <div className="flex items-center gap-2 flex-wrap text-[9px] font-mono">
        <span className="text-slate-500 uppercase tracking-widest">Mode</span>
        <div className="flex items-center gap-1" data-controller-mode>
          {([
            { id: 'beat', label: 'Beat', tint: 'bg-amber-500/20 border-amber-500/50 text-amber-300' },
            { id: 'sampler', label: 'Sampler', tint: 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300' },
            { id: 'recourse', label: 'Recourse', tint: 'bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-300' },
          ] as const).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider border transition-all ${
                mode === m.id ? m.tint : 'bg-[#121215] border-[#1e293b] text-slate-400 hover:text-white'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode === 'sampler' && (
          <span className="text-cyan-300/80" data-sampler-status>
            {samplerBridge
              ? `sampler armed · editing ${samplerLayer ?? 'sample'} — pads play it chromatically, knobs/faders shape it, switches run DSP`
              : 'open a layer in Sound Lab → Sample Editor to arm the sampler'}
          </span>
        )}
        {mode === 'recourse' && (
          <span className="text-fuchsia-300/80" data-recourse-status>
            {recourseBridge
              ? 'composer armed · pads/knobs/faders drive the Recourse composer'
              : 'open the Recourse Composer panel (Beat Studio → right rail) to arm it'}
          </span>
        )}
      </div>

      {learnMode && (
        <div className="rounded-lg border border-fuchsia-500/40 bg-fuchsia-950/20 px-3 py-2 text-[10px] font-mono text-fuchsia-200" data-learn-banner>
          <Radio size={11} className="inline -mt-px mr-1" />
          <b>Learn mode:</b> tap a pad / knob / fader / switch / transport button on the surface below, then move that control on your device. It binds automatically and gets a sensible default action.
          {learnTarget && (
            <span className="block mt-1 text-fuchsia-300">
              Listening for: <b>{learnTarget}</b> — move it now.
            </span>
          )}
        </div>
      )}

      {!supported && (
        <p className="text-[10px] text-amber-300 font-mono flex items-center gap-1.5">
          <AlertTriangle size={11} /> Web MIDI not available in this browser. Use Chrome/Edge or the desktop build.
        </p>
      )}
      {error && <p className="text-[10px] text-amber-300 font-mono">{error}</p>}

      {/* Devices + monitor */}
      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">Inputs</span>
            {profile.enabledInputIds.length > 0 && (
              <button
                type="button"
                onClick={() => setEnabledInputIds([])}
                className="text-[9px] font-mono uppercase text-cyan-400 hover:text-cyan-200"
              >
                Use all
              </button>
            )}
          </div>
          {inputs.length === 0 && (
            <p className="text-[10px] text-slate-500 font-mono">
              {active ? `Waiting for a device… (${allInputs})` : 'Connect to scan for MIDI controllers.'}
            </p>
          )}
          {inputs.map((input) => {
            const checked = profile.enabledInputIds.length === 0 || profile.enabledInputIds.includes(input.id);
            return (
              <label key={input.id} className="flex items-center gap-2 px-2 py-1 rounded border border-white/10 bg-black/30 cursor-pointer">
                <input type="checkbox" checked={checked} onChange={() => toggleInput(input.id)} className="accent-emerald-400" />
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                <span className="text-[10px] font-bold text-white truncate flex-1">{input.name}</span>
                {input.manufacturer && <span className="text-[9px] text-slate-500">{input.manufacturer}</span>}
              </label>
            );
          })}
        </div>

        <div className="space-y-2">
          <div className="rounded-lg border border-[#1e293b] bg-black/40 px-2 py-1.5">
            <div className="text-[9px] font-mono uppercase tracking-widest text-slate-500">Live monitor</div>
            <div className="text-[10px] font-mono text-emerald-300 truncate" data-midi-monitor>
              {lastMessage ? describeIncoming(lastMessage) : '— no messages yet —'}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[9px] font-mono uppercase text-slate-400">
            <input
              type="checkbox"
              checked={profile.followPadBank}
              onChange={(e) => setFollowPadBank(e.target.checked)}
              className="accent-cyan-400"
            />
            Pad bank follows program bank
          </label>
          <p className="text-[9px] font-mono text-slate-600 leading-snug flex gap-1">
            <AlertTriangle size={10} className="mt-0.5 flex-shrink-0 text-amber-400/70" />
            Factory CC numbers vary by preset. Turn on <span className="text-fuchsia-300">MIDI Learn</span>, tap a control above, then move it on your device — or hit a control's <span className="text-fuchsia-300">L</span>.
          </p>
        </div>
      </div>

      {/* Profile toolbar */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          type="text"
          value={profile.name}
          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          className="bg-[#0a0a0c] border border-[#1e293b] rounded px-2 py-1 text-[10px] font-mono text-white w-44"
          aria-label="Profile name"
        />
        <button type="button" onClick={resetProfile} className="px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider border border-[#1e293b] text-slate-300 hover:text-white flex items-center gap-1">
          <RotateCcw size={10} /> MPD226 defaults
        </button>
        <button type="button" onClick={loadBlankProfile} className="px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider border border-[#1e293b] text-slate-300 hover:text-white flex items-center gap-1">
          <Trash2 size={10} /> Blank
        </button>
        <button type="button" onClick={exportProfile} className="px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider border border-[#1e293b] text-emerald-300 hover:text-white flex items-center gap-1">
          <Download size={10} /> Export
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider border border-[#1e293b] text-emerald-300 hover:text-white flex items-center gap-1">
          <Upload size={10} /> Import
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={importProfile} />
      </div>

      {/* Device + editor */}
      <div className="grid grid-cols-1 gap-3">
        <Mpd226Layout
          profile={profile}
          surface={surface}
          padPage={padPage}
          controlPage={controlPage}
          selected={selected}
          learnTarget={learnTarget}
          learnMode={learnMode}
          resolve={resolveControllerBinding}
          onSelect={handleSelect}
          onStartLearn={handleArm}
          onPadPageChange={setPadPage}
          onControlPageChange={setControlPage}
        />
        <ControllerAssignPanel selected={selected} learnTarget={learnTarget} onStartLearn={handleArm} />
      </div>

      {/* Chord pad settings */}
      <div className="border-t border-[#1e293b] pt-2 space-y-2">
        <button
          type="button"
          onClick={() => setShowChord((v) => !v)}
          className="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5"
        >
          Chord Pads {showChord ? '▾' : '▸'}
        </button>
        {showChord && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[9px]">
              <label className="flex items-center gap-1 text-slate-400">
                Key
                <select value={chord.key} onChange={(e) => setChord({ key: e.target.value })} className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white">
                  {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1 text-slate-400">
                Scale
                <select value={chord.scale} onChange={(e) => setChord({ scale: e.target.value })} className="bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white">
                  {SCALE_PRESETS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1 text-slate-400">
                <input type="checkbox" checked={chord.seventh} onChange={(e) => setChord({ seventh: e.target.checked })} className="accent-amber-400" />
                7th chords
              </label>
              <label className="flex items-center gap-1 text-slate-400">
                Octave
                <input type="number" min={1} max={6} value={chord.octave} onChange={(e) => setChord({ octave: parseInt(e.target.value) || 4 })} className="w-12 bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white" />
              </label>
              <label className="flex items-center gap-1 text-slate-400">
                Inversion
                <input type="number" min={0} max={3} value={chord.inversion} onChange={(e) => setChord({ inversion: parseInt(e.target.value) || 0 })} className="w-12 bg-[#0a0a0c] border border-[#1e293b] rounded px-1 py-0.5 text-white" />
              </label>
              <label className="flex items-center gap-1 text-slate-400">
                Strum
                <input type="range" min={0} max={120} value={chord.strumMs} onChange={(e) => setChord({ strumMs: parseInt(e.target.value) })} className="w-24 accent-amber-400" />
                <span className="text-slate-500 w-8">{chord.strumMs}ms</span>
              </label>
              <label className="flex items-center gap-1 text-slate-400">
                Spread
                <input type="range" min={0} max={1} step={0.05} value={chord.spread} onChange={(e) => setChord({ spread: parseFloat(e.target.value) })} className="w-20 accent-amber-400" />
              </label>
            </div>
            <div className="flex flex-wrap gap-1">
              {chordPads.map(({ index, pad }) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => previewChord(index)}
                  className="px-2 py-1 rounded border text-[10px] font-mono font-bold border-white/10 bg-black/30 text-slate-200 hover:border-amber-400/60"
                  title={`Preview ${pad.root}${pad.quality} · notes ${pad.notes.join(', ')}`}
                  data-chord-pad={index}
                >
                  {pad.root}{pad.quality}
                </button>
              ))}
            </div>
            <p className="text-[9px] font-mono text-slate-600">
              Pads 1–7 are the scale degrees, 8–14 repeat an octave up. Bank D is bound to these by default.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

function enabledInputIdsDescriptor(enabledIds: string[], total: number): string {
  if (enabledIds.length === 0) return `using all ${total} device(s)`;
  return `filtered to ${enabledIds.length} device(s)`;
}
