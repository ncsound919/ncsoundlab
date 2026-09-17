/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Command palette model.
 *
 * `Command` is a plain descriptor with a `run` closure, built by App from its
 * existing handlers. The only logic worth unit-testing is how a query ranks the
 * list, which lives here as a pure function.
 */

export interface Command {
  id: string;
  label: string;
  /** Secondary text shown on the right (screen, shortcut, value…). */
  hint?: string;
  group: CommandGroup;
  /** Extra search terms (synonyms) that should match without being displayed. */
  keywords?: string;
  run: () => void;
}

export type CommandGroup =
  | 'Navigate'
  | 'Layers'
  | 'Sound'
  | 'Transport'
  | 'Project'
  | 'View';

export const COMMAND_GROUP_ORDER: CommandGroup[] = [
  'Navigate',
  'Layers',
  'Sound',
  'Transport',
  'Project',
  'View',
];

/** Lower score = better match; -1 = no match. */
function score(command: Command, q: string): number {
  const label = command.label.toLowerCase();
  const hint = (command.hint ?? '').toLowerCase();
  const keywords = (command.keywords ?? '').toLowerCase();
  const group = command.group.toLowerCase();

  if (label.startsWith(q)) return 0;
  if (label.includes(` ${q}`)) return 1;
  if (label.includes(q)) return 2;
  if (keywords.split(/[\s,]+/).some((w) => w.startsWith(q))) return 3;
  if (hint.includes(q)) return 4;
  if (group.includes(q)) return 5;
  return -1;
}

/**
 * Filter + rank commands for a query. An empty query returns the input order
 * (which callers pre-sort by group). Matches are stable within a score.
 */
export function filterCommands(commands: readonly Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...commands];

  return commands
    .map((command, index) => ({ command, index, s: score(command, q) }))
    .filter((entry) => entry.s !== -1)
    .sort((a, b) => a.s - b.s || a.index - b.index)
    .map((entry) => entry.command);
}

/** Sort by the canonical group order, then alphabetically. */
export function sortCommands(commands: readonly Command[]): Command[] {
  return [...commands].sort((a, b) => {
    const ga = COMMAND_GROUP_ORDER.indexOf(a.group);
    const gb = COMMAND_GROUP_ORDER.indexOf(b.group);
    if (ga !== gb) return ga - gb;
    return a.label.localeCompare(b.label);
  });
}
