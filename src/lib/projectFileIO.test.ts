/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `.nsl` file I/O helpers (Phase 0.2).
 */

import { describe, expect, it } from 'vitest';
import {
  PROJECT_FORMAT_TAG,
  PROJECT_SCHEMA_VERSION,
  parseProjectText,
  stringifyProject,
  type ProjectDocument,
} from './projectFormat';

const minimalDoc: ProjectDocument = {
  format: PROJECT_FORMAT_TAG,
  schemaVersion: PROJECT_SCHEMA_VERSION,
  appVersion: '1.0.0',
  id: 'p1',
  title: 'T',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  bpm: 120,
  timeSignature: [4, 4],
  globalSwing: 0,
  masterLevel: 0.8,
  masterRack: { modules: [] },
  layers: [],
  patterns: {
    A: { id: 'A', name: 'A', layerRows: {}, timeSignature: [4, 4], stepLength: 16, swing: 0, bpm: 120 },
    B: { id: 'B', name: 'B', layerRows: {}, timeSignature: [4, 4], stepLength: 16, swing: 0, bpm: 120 },
    C: { id: 'C', name: 'C', layerRows: {}, timeSignature: [4, 4], stepLength: 16, swing: 0, bpm: 120 },
    D: { id: 'D', name: 'D', layerRows: {}, timeSignature: [4, 4], stepLength: 16, swing: 0, bpm: 120 },
  },
  activePatternId: 'A',
  songChain: { order: ['A', 'B', 'C', 'D'] },
  programs: {
    A: Array.from({ length: 16 }, () => null),
    B: Array.from({ length: 16 }, () => null),
    C: Array.from({ length: 16 }, () => null),
    D: Array.from({ length: 16 }, () => null),
  },
  activeBank: 'A',
};

describe('projectFileIO — parseProjectText', () => {
  it('round-trips a document through stringify + parse', () => {
    const text = stringifyProject(minimalDoc);
    const parsed = parseProjectText(text);
    expect(parsed.id).toBe(minimalDoc.id);
    expect(parsed.title).toBe(minimalDoc.title);
    expect(parsed.format).toBe(PROJECT_FORMAT_TAG);
    expect(parsed.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseProjectText('not json')).toThrow();
  });

  it('throws on an unrecognized format tag', () => {
    expect(() => parseProjectText(JSON.stringify({ format: 'other', schemaVersion: 1 }))).toThrow();
  });

  it('migrates a partial document into defaults', () => {
    const raw = JSON.stringify({
      format: PROJECT_FORMAT_TAG,
      schemaVersion: 1,
      title: 'Partial',
      layers: [],
      patterns: { A: {}, B: {}, C: {}, D: {} },
      programs: {},
    });
    const parsed = parseProjectText(raw);
    expect(parsed.bpm).toBe(120);
    expect(parsed.songChain.order).toEqual(['A', 'B', 'C', 'D']);
    expect(parsed.programs.A).toHaveLength(16);
  });
});
