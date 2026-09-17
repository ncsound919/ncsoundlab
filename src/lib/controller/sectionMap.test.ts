/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  resolveSectionBinding,
  sectionDisplayName,
  sectionOverrideFor,
  sectionRoleSummary,
} from './sectionMap';
import type { ControllerBinding } from './types';

const binding = (over: Partial<ControllerBinding> = {}): ControllerBinding => ({
  enabled: true,
  messageType: 'cc',
  number: 3,
  channel: null,
  action: 'fx:filterFreq',
  min: 200,
  max: 18000,
  curve: 'log',
  ...over,
});

describe('sectionOverrideFor', () => {
  it('maps mixer faders/knobs to channel gain/pan', () => {
    expect(sectionOverrideFor('mixer', 'fader:0:0')?.action).toBe('section:channel:gain:0');
    expect(sectionOverrideFor('mixer', 'knob:0:3')?.action).toBe('section:channel:pan:3');
    expect(sectionOverrideFor('mixer', 'knob:0:3')?.min).toBe(-1);
  });

  it('maps design knobs to selected-layer sound design', () => {
    expect(sectionOverrideFor('tweaking', 'knob:0:0')?.action).toBe('section:layer:filterFreq');
    expect(sectionOverrideFor('soundlab', 'knob:0:0')?.action).toBe('section:layer:filterFreq');
    expect(sectionOverrideFor('tweaking', 'fader:0:3')?.action).toBe('section:layer:reverbMix');
  });

  it('maps spatial knobs to room placement', () => {
    expect(sectionOverrideFor('spatial', 'knob:0:0')?.action).toBe('section:layer:pan');
    expect(sectionOverrideFor('spatial', 'knob:0:2')?.action).toBe('section:layer:reverbMix');
  });

  it('maps compare knobs/faders to the reference engine', () => {
    expect(sectionOverrideFor('compare', 'knob:0:0')?.action).toBe('section:compare:refGain');
    expect(sectionOverrideFor('compare', 'knob:0:3')?.action).toBe('section:compare:track');
    expect(sectionOverrideFor('compare', 'fader:0:2')?.action).toBe('section:compare:levelMatch');
    expect(sectionOverrideFor('compare', 'knob:0:0')?.min).toBe(-18);
  });

  it('maps evolution knobs/faders to the evolution engine', () => {
    expect(sectionOverrideFor('evolution', 'knob:0:0')?.action).toBe('section:evolution:mode');
    expect(sectionOverrideFor('evolution', 'knob:0:1')?.action).toBe('section:evolution:fx');
    expect(sectionOverrideFor('evolution', 'fader:0:1')?.action).toBe('section:evolution:add');
  });

  it('maps pad bank A per screen', () => {
    expect(sectionOverrideFor('mixer', 'pad:0:0')?.action).toBe('section:pad:mute:0');
    expect(sectionOverrideFor('soundlab', 'pad:0:3')?.action).toBe('section:pad:layer:3');
    expect(sectionOverrideFor('tweaking', 'pad:0:0')?.action).toBe('section:pad:layer:0');
    expect(sectionOverrideFor('evolution', 'pad:0:0')?.action).toBe('section:pad:variation:0');
    expect(sectionOverrideFor('compare', 'pad:0:0')?.action).toBe('section:pad:track:0');
  });

  it('returns null outside followed screens and controls', () => {
    expect(sectionOverrideFor('produce', 'fader:0:0')).toBeNull();
    expect(sectionOverrideFor('kitcreator', 'fader:0:0')).toBeNull();
    expect(sectionOverrideFor('catalog', 'knob:0:0')).toBeNull();
    expect(sectionOverrideFor('mixer', 'knob:1:0')).toBeNull();
    expect(sectionOverrideFor('mixer', 'pad:1:0')).toBeNull();
  });
});

describe('resolveSectionBinding', () => {
  it('remaps bank-0 knobs/faders in beat mode with the override range', () => {
    const out = resolveSectionBinding({
      mode: 'beat',
      section: 'mixer',
      controlKey: 'knob:0:0',
      binding: binding(),
    });
    expect(out?.action).toBe('section:channel:pan:0');
    // The override range wins over the profile's filter-cutoff range.
    expect(out?.min).toBe(-1);
    expect(out?.max).toBe(1);
    expect(out?.curve).toBe('linear');
    // Transport identity of the binding is preserved.
    expect(out?.number).toBe(3);
    expect(out?.messageType).toBe('cc');
  });

  it('keeps the log curve for filter overrides', () => {
    const out = resolveSectionBinding({
      mode: 'beat',
      section: 'tweaking',
      controlKey: 'knob:0:0',
      binding: binding({ action: 'mix:master', min: 0, max: 1.5, curve: 'linear' }),
    });
    expect(out?.action).toBe('section:layer:filterFreq');
    expect(out?.curve).toBe('log');
  });

  it('never remaps sampler/recourse modes', () => {
    for (const mode of ['sampler', 'recourse']) {
      expect(
        resolveSectionBinding({ mode, section: 'mixer', controlKey: 'fader:0:0', binding: binding() })
      ).toBeNull();
    }
  });

  it('remaps every followed screen in beat mode', () => {
    for (const section of ['soundlab', 'tweaking', 'mixer', 'spatial', 'compare', 'evolution']) {
      const out = resolveSectionBinding({
        mode: 'beat',
        section,
        controlKey: 'fader:0:0',
        binding: binding(),
      });
      expect(out?.action).toMatch(/^section:/);
    }
  });

  it('remaps pad bank A to the screen action', () => {
    const out = resolveSectionBinding({
      mode: 'beat',
      section: 'mixer',
      controlKey: 'pad:0:0',
      binding: binding({ messageType: 'note', number: 36, action: 'pad:A:0' }),
    });
    expect(out?.action).toBe('section:pad:mute:0');
    expect(out?.messageType).toBe('note');
    expect(out?.number).toBe(36);
  });

  it('never remaps disabled bindings, other banks, or other sections', () => {
    expect(
      resolveSectionBinding({
        mode: 'beat',
        section: 'mixer',
        controlKey: 'fader:0:0',
        binding: binding({ enabled: false }),
      })
    ).toBeNull();
    expect(
      resolveSectionBinding({ mode: 'beat', section: 'mixer', controlKey: 'fader:1:0', binding: binding() })
    ).toBeNull();
    expect(
      resolveSectionBinding({ mode: 'beat', section: 'produce', controlKey: 'fader:0:0', binding: binding() })
    ).toBeNull();
  });
});

describe('readout helpers', () => {
  it('summarizes each followed screen', () => {
    expect(sectionRoleSummary('mixer')).toContain('ch 1–4 gain');
    expect(sectionRoleSummary('tweaking')).toContain('cutoff');
    expect(sectionRoleSummary('spatial')).toContain('L/R');
    expect(sectionRoleSummary('compare')).toContain('ref gain');
    expect(sectionRoleSummary('evolution')).toContain('mode');
    expect(sectionRoleSummary('produce')).toBe('Profile bindings');
  });

  it('names screens for display', () => {
    expect(sectionDisplayName('produce')).toBe('Beat Studio');
    expect(sectionDisplayName('mixer')).toBe('Mixer');
    expect(sectionDisplayName('spatial')).toBe('3D Space');
    expect(sectionDisplayName('catalog')).toBe('Catalog');
  });
});
