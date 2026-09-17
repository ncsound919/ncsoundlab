/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONTROLLER_STORAGE_KEY,
  loadPersistedControllerState,
  persistControllerState,
  sanitizeProfile,
  useControllerStore,
} from './controllerStore';
import { createDefaultMpd226Profile, createMpd226SamplerProfile, createMpd226RecourseProfile } from '../lib/controller/defaultMpd226';
import { DEFAULT_CHORD_SETTINGS } from '../lib/controller/chordPads';

beforeEach(() => {
  localStorage.clear();
  const store = useControllerStore.getState();
  // Reset the mode first so `setProfile` lands on the beat slot, then load the
  // fresh defaults for all three profiles.
  store.setMode('beat');
  store.setProfile(createDefaultMpd226Profile());
  store.setChord({ ...DEFAULT_CHORD_SETTINGS });
  store.cancelLearn();
  store.setLearnMode(false);
  store.setSamplerMode(false);
});

describe('sanitizeProfile', () => {
  it('rejects non-profiles', () => {
    expect(sanitizeProfile(null)).toBeNull();
    expect(sanitizeProfile('nope')).toBeNull();
    expect(sanitizeProfile({ name: 'x' })).toBeNull();
  });

  it('keeps valid bindings and drops malformed ones', () => {
    const clean = sanitizeProfile({
      id: 'x',
      name: 'X',
      followPadBank: false,
      enabledInputIds: ['a', 3],
      bindings: {
        'knob:0:0': { messageType: 'cc', number: 3, action: 'fx:filterFreq', min: 0, max: 1, curve: 'log' },
        bad: { action: 'x' },
      },
    });
    expect(clean?.name).toBe('X');
    expect(clean?.followPadBank).toBe(false);
    expect(clean?.enabledInputIds).toEqual(['a']);
    expect(clean?.bindings['knob:0:0'].curve).toBe('log');
    expect(clean?.bindings.bad).toBeUndefined();
  });

  it('fills defaults for a minimal binding', () => {
    const clean = sanitizeProfile({ bindings: { k: { messageType: 'note', number: 36, action: 'pad:A:0' } } });
    expect(clean?.bindings.k).toMatchObject({ enabled: true, channel: null, invert: false, curve: 'linear' });
    expect(clean?.id).toBe('imported');
  });
});

describe('persistence', () => {
  it('round-trips through localStorage', () => {
    const profile = createDefaultMpd226Profile();
    profile.name = 'Custom';
    persistControllerState({
      profile,
      beatProfile: profile,
      samplerProfile: createMpd226SamplerProfile(),
      recourseProfile: createMpd226RecourseProfile(),
      mode: 'beat',
      chord: { ...DEFAULT_CHORD_SETTINGS, key: 'F#', seventh: true },
    });
    const loaded = loadPersistedControllerState();
    expect(loaded.profile.name).toBe('Custom');
    expect(loaded.chord.key).toBe('F#');
    expect(loaded.chord.seventh).toBe(true);
  });

  it('falls back to defaults on garbage', () => {
    localStorage.setItem(CONTROLLER_STORAGE_KEY, '{not json');
    const loaded = loadPersistedControllerState();
    expect(loaded.profile.id).toBe('mpd226-default');
    expect(loaded.chord.scale).toBe('minor');
  });

  it('discards a profile saved by an older mapping version', () => {
    localStorage.setItem(
      CONTROLLER_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        profile: { id: 'old', name: 'Stale', bindings: { 'knob:0:0': { messageType: 'cc', number: 99, action: 'fx:filterFreq' } } },
        chord: { key: 'A' },
      })
    );
    const loaded = loadPersistedControllerState();
    expect(loaded.profile.id).toBe('mpd226-default');
    // Chord settings are orthogonal to the mapping and are preserved.
    expect(loaded.chord.key).toBe('A');
  });
});

describe('controller store', () => {
  it('sets, patches and clears bindings', () => {
    useControllerStore.getState().setBinding('knob:0:0', { action: 'fx:distortion', number: 9 });
    let b = useControllerStore.getState().profile.bindings['knob:0:0'];
    expect(b.action).toBe('fx:distortion');
    expect(b.number).toBe(9);

    useControllerStore.getState().setBinding('knob:0:9', { action: 'mix:master' });
    b = useControllerStore.getState().profile.bindings['knob:0:9'];
    expect(b).toMatchObject({ action: 'mix:master', enabled: true, messageType: 'cc' });

    useControllerStore.getState().clearBinding('knob:0:0');
    expect(useControllerStore.getState().profile.bindings['knob:0:0']).toBeUndefined();
  });

  it('learns the next message and clears the learn target', () => {
    useControllerStore.getState().startLearn('knob:0:1');
    expect(useControllerStore.getState().learnTarget).toBe('knob:0:1');
    useControllerStore.getState().ingestMessage({ messageType: 'cc', number: 42, value: 90, channel: 2 });
    const learned = useControllerStore.getState().profile.bindings['knob:0:1'];
    expect(learned).toMatchObject({ messageType: 'cc', number: 42, channel: 2 });
    expect(useControllerStore.getState().learnTarget).toBeNull();
  });

  it('records messages without a learn target', () => {
    useControllerStore.getState().ingestMessage({ messageType: 'note', number: 40, value: 1, channel: 1 });
    expect(useControllerStore.getState().lastMessage).toMatchObject({ number: 40 });
    expect(useControllerStore.getState().learnTarget).toBeNull();
  });

  it('arms learn mode and seeds a default action for an empty control', () => {
    useControllerStore.getState().clearBinding('knob:0:0');
    useControllerStore.getState().armLearn('knob:0:0');
    const s = useControllerStore.getState();
    expect(s.learnTarget).toBe('knob:0:0');
    expect(s.learnMode).toBe(true);
    expect(s.profile.bindings['knob:0:0'].action).toBe('fx:filterFreq');
    expect(s.profile.bindings['knob:0:0'].min).toBe(200);
  });

  it('keeps the existing action when arming a bound control', () => {
    useControllerStore.getState().setBinding('knob:0:0', { action: 'mix:master' });
    useControllerStore.getState().armLearn('knob:0:0');
    expect(useControllerStore.getState().profile.bindings['knob:0:0'].action).toBe('mix:master');
  });

  it('toggles learn mode and clears the target when disabled', () => {
    useControllerStore.getState().setLearnMode(true);
    useControllerStore.getState().startLearn('fader:0:1');
    expect(useControllerStore.getState().learnMode).toBe(true);
    expect(useControllerStore.getState().learnTarget).toBe('fader:0:1');
    useControllerStore.getState().setLearnMode(false);
    expect(useControllerStore.getState().learnTarget).toBeNull();
  });

  it('switches between the beat and sampler profiles without losing edits', () => {
    expect(useControllerStore.getState().samplerMode).toBe(false);
    useControllerStore.getState().setSamplerMode(true);
    expect(useControllerStore.getState().samplerMode).toBe(true);
    expect(useControllerStore.getState().mode).toBe('sampler');
    expect(useControllerStore.getState().profile.id).toBe('mpd226-sampler');

    useControllerStore.getState().setBinding('knob:0:0', { action: 'sample:param:zoom' });
    useControllerStore.getState().setSamplerMode(false);
    expect(useControllerStore.getState().profile.id).toBe('mpd226-default');
    // Beat profile is untouched by the sampler edit.
    expect(useControllerStore.getState().profile.bindings['knob:0:0'].action).toBe('fx:filterFreq');

    useControllerStore.getState().setSamplerMode(true);
    expect(useControllerStore.getState().profile.bindings['knob:0:0'].action).toBe('sample:param:zoom');
  });

  it('switches to the recourse profile and back', () => {
    useControllerStore.getState().setMode('recourse');
    expect(useControllerStore.getState().mode).toBe('recourse');
    expect(useControllerStore.getState().profile.id).toBe('mpd226-recourse');
    expect(useControllerStore.getState().samplerMode).toBe(false);

    useControllerStore.getState().setSamplerMode(true);
    expect(useControllerStore.getState().mode).toBe('sampler');
    expect(useControllerStore.getState().profile.id).toBe('mpd226-sampler');

    useControllerStore.getState().setMode('beat');
    expect(useControllerStore.getState().profile.id).toBe('mpd226-default');
  });

  it('applies chord params and patches', () => {
    useControllerStore.getState().setChord({ key: 'G' });
    expect(useControllerStore.getState().chord.key).toBe('G');
    useControllerStore.getState().setChordParam('seventh' as never, 1);
    useControllerStore.getState().setChordParam('octave', 5);
    expect(useControllerStore.getState().chord.octave).toBe(5);
  });

  it('manages profile-level switches', () => {
    useControllerStore.getState().setFollowPadBank(false);
    expect(useControllerStore.getState().profile.followPadBank).toBe(false);
    useControllerStore.getState().setEnabledInputIds(['dev1']);
    expect(useControllerStore.getState().profile.enabledInputIds).toEqual(['dev1']);

    useControllerStore.getState().setProfile({ ...createDefaultMpd226Profile(), enabledInputIds: undefined as never });
    expect(useControllerStore.getState().profile.enabledInputIds).toEqual([]);
  });

  it('resets and blanks', () => {
    useControllerStore.getState().clearBinding('knob:0:0');
    useControllerStore.getState().resetProfile();
    expect(useControllerStore.getState().profile.bindings['knob:0:0'].action).toBe('fx:filterFreq');

    useControllerStore.getState().loadBlankProfile();
    expect(useControllerStore.getState().profile.id).toBe('blank');
    expect(Object.keys(useControllerStore.getState().profile.bindings)).toHaveLength(64);
  });

  it('persists changes to localStorage', () => {
    useControllerStore.getState().setChord({ key: 'A' });
    const raw = localStorage.getItem(CONTROLLER_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).chord.key).toBe('A');
  });
});
