/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Controller configuration store (MPD226 / generic MIDI controller).
 *
 * Three control profiles are kept — "beat" (kit + chord pads), "sampler" (edit
 * the loaded sample) and "recourse" (the composer) — and `mode` selects the
 * active one. `profile` always holds the active profile so consumers can keep
 * reading `state.profile`. `samplerMode` is kept in sync for older callers.
 *
 * Persisted to localStorage so a mapping survives reloads and can be
 * exported/imported as JSON.
 */

import { create } from 'zustand';
import type { ControllerBinding, ControllerProfile, IncomingMidiMessage } from '../lib/controller/types';
import { applyLearnedMessage } from '../lib/controller/mapping';
import { DEFAULT_SECTION, type ControllerSection } from '../lib/controller/sectionMap';
import {
  createBlankProfile,
  createDefaultMpd226Profile,
  createMpd226SamplerProfile,
  createMpd226RecourseProfile,
  defaultActionFor,
} from '../lib/controller/defaultMpd226';
import { applyChordParam, type ChordParamName } from '../lib/controller/actions';
import { DEFAULT_CHORD_SETTINGS, type ChordPadSettings } from '../lib/controller/chordPads';

export const CONTROLLER_STORAGE_KEY = 'soundlab-controller-v1';

/**
 * Bump when the built-in mapping changes. Profiles saved by an older build are
 * discarded and the corrected defaults take over (a stale profile silently
 * mis-binds hardware, which is worse than losing a mapping the user can redo).
 */
export const CONTROLLER_PROFILE_VERSION = 5;

export type ControllerMode = 'beat' | 'sampler' | 'recourse';

const MODES: ControllerMode[] = ['beat', 'sampler', 'recourse'];

interface PersistedControllerState {
  /** Active profile (derived from `mode`). */
  profile: ControllerProfile;
  beatProfile: ControllerProfile;
  samplerProfile: ControllerProfile;
  recourseProfile: ControllerProfile;
  mode: ControllerMode;
  chord: ChordPadSettings;
}

interface StoredControllerState extends PersistedControllerState {
  version: number;
}

/** Defensive rehydration — tolerate hand-edited or older stored JSON. */
export function sanitizeProfile(raw: unknown): ControllerProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<ControllerProfile>;
  if (!p.bindings || typeof p.bindings !== 'object') return null;
  const bindings: Record<string, ControllerBinding> = {};
  for (const [key, value] of Object.entries(p.bindings)) {
    if (!value || typeof value !== 'object') continue;
    const b = value as Partial<ControllerBinding>;
    if (typeof b.action !== 'string' || typeof b.number !== 'number' || typeof b.messageType !== 'string') continue;
    bindings[key] = {
      enabled: b.enabled !== false,
      messageType: b.messageType,
      number: b.number,
      channel: typeof b.channel === 'number' ? b.channel : null,
      action: b.action,
      min: typeof b.min === 'number' ? b.min : undefined,
      max: typeof b.max === 'number' ? b.max : undefined,
      invert: b.invert === true,
      curve: b.curve === 'log' ? 'log' : 'linear',
    };
  }
  return {
    id: typeof p.id === 'string' ? p.id : 'imported',
    name: typeof p.name === 'string' ? p.name : 'Imported',
    bindings,
    followPadBank: p.followPadBank !== false,
    enabledInputIds: Array.isArray(p.enabledInputIds) ? p.enabledInputIds.filter((x) => typeof x === 'string') : [],
  };
}

function defaults(): PersistedControllerState {
  const beatProfile = createDefaultMpd226Profile();
  return {
    profile: beatProfile,
    beatProfile,
    samplerProfile: createMpd226SamplerProfile(),
    recourseProfile: createMpd226RecourseProfile(),
    mode: 'beat',
    chord: { ...DEFAULT_CHORD_SETTINGS },
  };
}

export function loadPersistedControllerState(): PersistedControllerState {
  const fallback = defaults();
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(CONTROLLER_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== CONTROLLER_PROFILE_VERSION) {
      // Keep chord settings (orthogonal) but discard stale mappings.
      return { ...fallback, chord: { ...DEFAULT_CHORD_SETTINGS, ...(parsed?.chord ?? {}) } };
    }
    const chord = { ...DEFAULT_CHORD_SETTINGS, ...(parsed?.chord ?? {}) };
    const mode: ControllerMode = MODES.includes(parsed?.mode)
      ? (parsed.mode as ControllerMode)
      : parsed?.samplerMode === true ? 'sampler' : 'beat';
    // `profile` is the active profile; use it for whichever mode was active so
    // edits made right before a reload are not lost.
    const active = sanitizeProfile(parsed?.profile);
    const storedBeat = sanitizeProfile(parsed?.beatProfile);
    const storedSampler = sanitizeProfile(parsed?.samplerProfile);
    const storedRecourse = sanitizeProfile(parsed?.recourseProfile);
    const beatProfile = mode === 'beat' && active ? active : storedBeat ?? fallback.beatProfile;
    const samplerProfile = mode === 'sampler' && active ? active : storedSampler ?? fallback.samplerProfile;
    const recourseProfile = mode === 'recourse' && active ? active : storedRecourse ?? fallback.recourseProfile;
    const profile = mode === 'sampler' ? samplerProfile : mode === 'recourse' ? recourseProfile : beatProfile;
    return { profile, beatProfile, samplerProfile, recourseProfile, mode, chord };
  } catch {
    return fallback;
  }
}

export function persistControllerState(state: PersistedControllerState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const stored: StoredControllerState = { version: CONTROLLER_PROFILE_VERSION, ...state };
    localStorage.setItem(CONTROLLER_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* storage full / disabled — config simply won't persist */
  }
}

interface ControllerStore extends PersistedControllerState {
  /** True only while `mode === 'sampler'` (kept for older callers). */
  samplerMode: boolean;
  /** controlKey currently armed for MIDI-learn, or null. */
  learnTarget: string | null;
  /** Global touch-to-assign learn mode. */
  learnMode: boolean;
  /** Most recent incoming message (for the live monitor). */
  lastMessage: IncomingMidiMessage | null;

  setBinding: (controlKey: string, patch: Partial<ControllerBinding>) => void;
  clearBinding: (controlKey: string) => void;
  startLearn: (controlKey: string) => void;
  /** Arm a control for learn mode, seeding a default action when it is empty. */
  armLearn: (controlKey: string) => void;
  setLearnMode: (enabled: boolean) => void;
  cancelLearn: () => void;
  /** Called by the MIDI layer for every incoming message. */
  ingestMessage: (msg: IncomingMidiMessage) => void;
  setChord: (patch: Partial<ChordPadSettings>) => void;
  setChordParam: (param: ChordParamName, value: number) => void;
  setProfile: (profile: ControllerProfile) => void;
  resetProfile: () => void;
  loadBlankProfile: () => void;
  setFollowPadBank: (value: boolean) => void;
  setEnabledInputIds: (ids: string[]) => void;
  /** Switch the active control profile. */
  setMode: (mode: ControllerMode) => void;
  /** Back-compat wrapper: sampler on/off. */
  setSamplerMode: (enabled: boolean) => void;
  /** Workflow section the knobs/faders follow (runtime-only, not persisted). */
  section: ControllerSection;
  setSection: (section: ControllerSection) => void;
}

const initial = loadPersistedControllerState();

export const useControllerStore = create<ControllerStore>((set, get) => ({
  profile: initial.profile,
  beatProfile: initial.beatProfile,
  samplerProfile: initial.samplerProfile,
  recourseProfile: initial.recourseProfile,
  mode: initial.mode,
  samplerMode: initial.mode === 'sampler',
  chord: initial.chord,
  section: DEFAULT_SECTION,
  learnTarget: null,
  learnMode: false,
  lastMessage: null,

  setBinding: (controlKey, patch) =>
    set((s) => {
      const existing: ControllerBinding = s.profile.bindings[controlKey] ?? {
        enabled: true,
        messageType: 'cc',
        number: 0,
        channel: null,
        action: '',
      };
      return {
        profile: {
          ...s.profile,
          bindings: { ...s.profile.bindings, [controlKey]: { ...existing, ...patch } },
        },
      };
    }),

  clearBinding: (controlKey) =>
    set((s) => {
      const bindings = { ...s.profile.bindings };
      delete bindings[controlKey];
      return { profile: { ...s.profile, bindings } };
    }),

  startLearn: (controlKey) => set({ learnTarget: controlKey }),

  armLearn: (controlKey) =>
    set((s) => {
      const existing = s.profile.bindings[controlKey];
      const bindings = { ...s.profile.bindings };
      if (!existing || !existing.action) {
        const spec = defaultActionFor(controlKey);
        bindings[controlKey] = {
          enabled: true,
          messageType: 'cc',
          number: 0,
          channel: null,
          action: spec.action,
          min: spec.min,
          max: spec.max,
          curve: spec.curve,
        };
      }
      return { learnTarget: controlKey, learnMode: true, profile: { ...s.profile, bindings } };
    }),

  setLearnMode: (enabled) => set((s) => ({ learnMode: enabled, learnTarget: enabled ? s.learnTarget : null })),

  cancelLearn: () => set({ learnTarget: null }),

  ingestMessage: (msg) => {
    set({ lastMessage: msg });
    const target = get().learnTarget;
    if (!target) return;
    set((s) => {
      const existing: ControllerBinding = s.profile.bindings[target] ?? {
        enabled: true,
        messageType: msg.messageType,
        number: msg.number,
        channel: msg.channel,
        action: '',
      };
      return {
        learnTarget: null,
        profile: {
          ...s.profile,
          bindings: { ...s.profile.bindings, [target]: applyLearnedMessage(existing, msg) },
        },
      };
    });
  },

  setChord: (patch) => set((s) => ({ chord: { ...s.chord, ...patch } })),
  setChordParam: (param, value) => set((s) => ({ chord: applyChordParam(s.chord, param, value) })),

  setProfile: (profile) => set({ profile: { ...profile, enabledInputIds: profile.enabledInputIds ?? [] } }),
  resetProfile: () =>
    set((s) => ({
      profile: s.mode === 'sampler'
        ? createMpd226SamplerProfile()
        : s.mode === 'recourse'
          ? createMpd226RecourseProfile()
          : createDefaultMpd226Profile(),
    })),
  loadBlankProfile: () => set({ profile: createBlankProfile() }),
  setFollowPadBank: (value) => set((s) => ({ profile: { ...s.profile, followPadBank: value } })),
  setEnabledInputIds: (ids) => set((s) => ({ profile: { ...s.profile, enabledInputIds: [...ids] } })),

  setMode: (mode) =>
    set((s) => {
      if (mode === s.mode) return {};
      // Stash the (possibly edited) active profile, then load the target one.
      const beatProfile = s.mode === 'beat' ? s.profile : s.beatProfile;
      const samplerProfile = s.mode === 'sampler' ? s.profile : s.samplerProfile;
      const recourseProfile = s.mode === 'recourse' ? s.profile : s.recourseProfile;
      const active = mode === 'beat' ? beatProfile : mode === 'sampler' ? samplerProfile : recourseProfile;
      return { beatProfile, samplerProfile, recourseProfile, mode, samplerMode: mode === 'sampler', profile: active };
    }),

  setSamplerMode: (enabled) => get().setMode(enabled ? 'sampler' : 'beat'),

  setSection: (section) => set({ section }),
}));

// Persist all three profiles + mode + chord settings on every change.
useControllerStore.subscribe((state) => {
  persistControllerState({
    profile: state.profile,
    beatProfile: state.beatProfile,
    samplerProfile: state.samplerProfile,
    recourseProfile: state.recourseProfile,
    mode: state.mode,
    chord: state.chord,
  });
});
