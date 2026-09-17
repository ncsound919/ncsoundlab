/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { filterCommands, sortCommands, type Command } from './commands';

const cmd = (over: Partial<Command> & Pick<Command, 'id' | 'label'>): Command => ({
  group: 'Navigate',
  run: () => undefined,
  ...over,
});

const COMMANDS: Command[] = [
  cmd({ id: 'a', label: 'Go to Sound Design', group: 'Navigate', keywords: 'layering synth' }),
  cmd({ id: 'b', label: 'Go to Beat Studio', group: 'Navigate' }),
  cmd({ id: 'c', label: 'Add Synth Layer', group: 'Layers', hint: 'new' }),
  cmd({ id: 'd', label: 'Mute Selected Layer', group: 'Layers', hint: 'M' }),
  cmd({ id: 'e', label: 'Export One-Shot WAV', group: 'Project' }),
];

describe('filterCommands', () => {
  it('returns everything for an empty query', () => {
    expect(filterCommands(COMMANDS, '')).toHaveLength(COMMANDS.length);
  });

  it('ranks label prefix matches first', () => {
    const out = filterCommands(COMMANDS, 'add');
    expect(out[0].id).toBe('c');
  });

  it('matches keywords and hints', () => {
    expect(filterCommands(COMMANDS, 'layering').map((c) => c.id)).toContain('a');
    expect(filterCommands(COMMANDS, 'new').map((c) => c.id)).toContain('c');
  });

  it('is case-insensitive and trims', () => {
    expect(filterCommands(COMMANDS, '  MUTE ').map((c) => c.id)).toEqual(['d']);
  });

  it('returns nothing when no match', () => {
    expect(filterCommands(COMMANDS, 'zzzzz')).toEqual([]);
  });
});

describe('sortCommands', () => {
  it('orders by the canonical group order then label', () => {
    // Navigate first (Beat Studio before Sound Design), then Layers, then Project.
    const out = sortCommands(COMMANDS).map((c) => c.id);
    expect(out).toEqual(['b', 'a', 'c', 'd', 'e']);
  });
});
