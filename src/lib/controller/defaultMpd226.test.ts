/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { createBlankProfile, createDefaultMpd226Profile, createMpd226SamplerProfile, createMpd226RecourseProfile, defaultActionFor } from './defaultMpd226';
import { controlKey, padNoteFor } from './mapping';

describe('createDefaultMpd226Profile', () => {
  const profile = createDefaultMpd226Profile();

  it('binds the full control surface (64 pads + 12 knobs + 12 faders + 12 switches + transport)', () => {
    expect(Object.keys(profile.bindings)).toHaveLength(64 + 12 + 12 + 12 + 5);
    expect(profile.followPadBank).toBe(true);
    expect(profile.enabledInputIds).toEqual([]);
    expect(profile.name).toContain('Soundlab');
  });

  it('maps pad notes with the MPC bank convention', () => {
    for (let page = 0; page < 4; page++) {
      const first = profile.bindings[controlKey('pad', page, 0)];
      expect(first.messageType).toBe('note');
      expect(first.number).toBe(padNoteFor(page, 0));
    }
    expect(profile.bindings[controlKey('pad', 3, 15)].number).toBe(99);
  });

  it('uses program pads for banks A–C and chord pads for bank D', () => {
    expect(profile.bindings[controlKey('pad', 0, 5)].action).toBe('pad:A:5');
    expect(profile.bindings[controlKey('pad', 2, 5)].action).toBe('pad:C:5');
    expect(profile.bindings[controlKey('pad', 3, 0)].action).toBe('chord:degree:0');
    expect(profile.bindings[controlKey('pad', 3, 15)].action).toBe('chord:degree:15');
  });

  it('binds knobs and faders as continuous parameters', () => {
    const knob = profile.bindings[controlKey('knob', 0, 0)];
    expect(knob.messageType).toBe('cc');
    expect(knob.action).toBe('fx:filterFreq');
    expect(knob.min).toBe(200);
    expect(knob.max).toBe(18000);
    expect(knob.curve).toBe('log');

    const fader = profile.bindings[controlKey('fader', 0, 3)];
    expect(fader.action).toBe('tempo:bpm');
    expect(fader.min).toBe(60);
    expect(fader.max).toBe(200);
  });

  it('matches the measured preset #15 CCs', () => {
    expect(profile.bindings[controlKey('knob', 0, 0)].number).toBe(3);
    expect(profile.bindings[controlKey('knob', 0, 1)].number).toBe(9);
    expect(profile.bindings[controlKey('knob', 0, 2)].number).toBe(14);
    expect(profile.bindings[controlKey('knob', 0, 3)].number).toBe(15);
    expect(profile.bindings[controlKey('fader', 0, 0)].number).toBe(20);
    expect(profile.bindings[controlKey('fader', 0, 1)].number).toBe(21);
    expect(profile.bindings[controlKey('fader', 0, 2)].number).toBe(22);
    expect(profile.bindings[controlKey('fader', 0, 3)].number).toBe(23);
    expect(profile.bindings[controlKey('knob', 0, 0)].enabled).toBe(true);
  });

  it('disables unverified control banks but readies the Control Bank 1 switches', () => {
    expect(profile.bindings[controlKey('knob', 1, 0)].enabled).toBe(false);
    expect(profile.bindings[controlKey('fader', 2, 0)].enabled).toBe(false);
    // Control Bank 1 switches are expected to be configured to CC 36–39 in the
    // MPD226 Editor, so they ship enabled.
    expect(profile.bindings[controlKey('switch', 0, 0)].enabled).toBe(true);
    expect(profile.bindings[controlKey('switch', 1, 0)].enabled).toBe(false);
  });

  it('binds switches to trigger actions', () => {
    expect(profile.bindings[controlKey('switch', 0, 0)].action).toBe('transport:play');
    expect(profile.bindings[controlKey('switch', 2, 1)].action).toBe('chord:toggle');
  });

  it('binds transport to the measured CCs plus MIDI-realtime fallback', () => {
    expect(profile.bindings[controlKey('transport', 0, 'play')]).toMatchObject({
      messageType: 'cc', number: 118, action: 'transport:play',
    });
    expect(profile.bindings[controlKey('transport', 0, 'stop')]).toMatchObject({
      messageType: 'cc', number: 117, action: 'transport:stop',
    });
    expect(profile.bindings[controlKey('transport', 0, 'record')]).toMatchObject({
      messageType: 'cc', number: 119, action: 'transport:record',
    });
    expect(profile.bindings[controlKey('transport', 0, 'rt-start')]).toMatchObject({
      messageType: 'realtime', number: 0, action: 'transport:play',
    });
    expect(profile.bindings[controlKey('transport', 0, 'rt-stop')]).toMatchObject({
      messageType: 'realtime', number: 2, action: 'transport:stop',
    });
  });

  it('exposes chord controls across control bank 3', () => {
    expect(profile.bindings[controlKey('knob', 2, 0)].action).toBe('chord:param:inversion');
    expect(profile.bindings[controlKey('fader', 2, 0)].action).toBe('chord:param:rootPc');
  });
});

describe('createBlankProfile', () => {
  const blank = createBlankProfile('Test');
  it('only binds the 64 pads', () => {
    expect(Object.keys(blank.bindings)).toHaveLength(64);
    expect(blank.name).toBe('Test');
    expect(blank.bindings[controlKey('knob', 0, 0)]).toBeUndefined();
    expect(blank.bindings[controlKey('pad', 1, 2)].action).toBe('pad:B:2');
  });
});

describe('defaultActionFor', () => {
  it('gives pads a program/chord action', () => {
    expect(defaultActionFor('pad:0:0').action).toBe('pad:A:0');
    expect(defaultActionFor('pad:2:7').action).toBe('pad:C:7');
    expect(defaultActionFor('pad:3:5').action).toBe('chord:degree:5');
  });

  it('gives knobs and faders a continuous spec with a range', () => {
    const knob = defaultActionFor('knob:0:0');
    expect(knob.action).toBe('fx:filterFreq');
    expect(knob.min).toBe(200);
    expect(knob.max).toBe(18000);

    const fader = defaultActionFor('fader:0:0');
    expect(fader.action).toBe('mix:master');
    expect(fader.min).toBe(0);
    expect(fader.max).toBe(1.5);
  });

  it('gives switches and transport sensible triggers', () => {
    expect(defaultActionFor('switch:0:0').action).toBe('transport:play');
    expect(defaultActionFor('transport:0:record').action).toBe('transport:record');
    expect(defaultActionFor('transport:0:rt-start').action).toBe('transport:play');
  });

  it('returns an empty action for unknown keys', () => {
    expect(defaultActionFor('nonsense').action).toBe('');
    expect(defaultActionFor('transport:0:weird').action).toBe('');
  });
});

describe('createMpd226SamplerProfile', () => {
  const sampler = createMpd226SamplerProfile();

  it('is identifiable as the sampler mapping', () => {
    expect(sampler.id).toBe('mpd226-sampler');
    expect(sampler.name).toContain('Sampler');
  });

  it('turns pad bank A into a chromatic sample keygroup', () => {
    expect(sampler.bindings[controlKey('pad', 0, 0)].action).toBe('sample:pad:0');
    expect(sampler.bindings[controlKey('pad', 0, 15)].action).toBe('sample:pad:15');
    expect(sampler.bindings[controlKey('pad', 0, 0)].messageType).toBe('note');
    // Banks B–D remain program pads for finger-drumming.
    expect(sampler.bindings[controlKey('pad', 1, 0)].action).toBe('pad:B:0');
  });

  it('maps the control surface to sampler actions', () => {
    expect(sampler.bindings[controlKey('knob', 0, 0)].action).toBe('sample:param:zoom');
    expect(sampler.bindings[controlKey('knob', 0, 2)].action).toBe('sample:param:selStart');
    expect(sampler.bindings[controlKey('fader', 0, 0)].action).toBe('sample:param:pitch');
    expect(sampler.bindings[controlKey('switch', 0, 0)].action).toBe('sample:reverse');
    expect(sampler.bindings[controlKey('transport', 0, 'play')].action).toBe('sample:preview');
    expect(sampler.bindings[controlKey('transport', 0, 'record')].action).toBe('sample:glitch');
    // Realtime transport follows the sampler mode too.
    expect(sampler.bindings[controlKey('transport', 0, 'rt-start')].action).toBe('sample:preview');
    expect(sampler.bindings[controlKey('transport', 0, 'rt-stop')].action).toBe('sample:stop');
  });
});

describe('createMpd226RecourseProfile', () => {
  const profile = createMpd226RecourseProfile();

  it('is identifiable as the composer mapping', () => {
    expect(profile.id).toBe('mpd226-recourse');
    expect(profile.name).toContain('Recourse');
  });

  it('maps pad bank A to composer commands', () => {
    expect(profile.bindings[controlKey('pad', 0, 0)].action).toBe('recourse:generate');
    expect(profile.bindings[controlKey('pad', 0, 1)].action).toBe('recourse:load');
    expect(profile.bindings[controlKey('pad', 0, 2)].action).toBe('recourse:toPattern');
    expect(profile.bindings[controlKey('pad', 0, 12)].action).toBe('recourse:seedRandom');
  });

  it('maps the control surface to composer params and commands', () => {
    expect(profile.bindings[controlKey('knob', 0, 0)].action).toBe('recourse:param:styleIndex');
    expect(profile.bindings[controlKey('fader', 0, 0)].action).toBe('recourse:param:mode');
    expect(profile.bindings[controlKey('switch', 0, 0)].action).toBe('recourse:generate');
    expect(profile.bindings[controlKey('transport', 0, 'play')].action).toBe('recourse:generate');
    expect(profile.bindings[controlKey('transport', 0, 'rt-start')].action).toBe('recourse:generate');
    expect(profile.bindings[controlKey('transport', 0, 'rt-stop')].action).toBe('recourse:modeNext');
  });
});
