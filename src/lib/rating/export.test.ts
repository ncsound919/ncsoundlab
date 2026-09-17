/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the rating export envelope + browser download helper.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildExportEnvelope, downloadExport } from './export';
import type { EloStanding, RatingChoice, RatingSession } from './types';

const makeSession = (): RatingSession => ({
  sessionId: 'sess-1',
  schemaVersion: 1,
  appVersion: '1.1.0',
  startedAt: 1,
  source: 'manual',
  seedId: 'seed-1',
  plannedPairs: 4,
  completedPairs: 3,
  skippedPairs: 1,
  ratingSystem: 'elo_v1_k32',
  contextLatencyHint: 'playback',
});

const makeChoice = (): RatingChoice => ({
  pairId: 'pair-1',
  sessionId: 'sess-1',
  choice: 'A',
  confidence: 2,
  dimensions: { tags: ['knock'] },
  listenMsA: 1500,
  listenMsB: 1500,
  decidedAt: 2,
  elapsedMs: 3000,
});

const makeStanding = (): EloStanding => ({
  paramHash: 'hash-1',
  rating: 1216,
  wins: 1,
  losses: 0,
  exposures: 1,
  lastSeenAt: 2,
  seedId: 'seed-1',
  generation: 1,
});

describe('buildExportEnvelope', () => {
  it('tags the payload with the v1 format and stamps the export time', () => {
    const before = Date.now();
    const env = buildExportEnvelope([makeSession()], [makeChoice()], [makeStanding()], '1.1.0');
    expect(env.format).toBe('soundlab.ratings.v1');
    expect(env.appVersion).toBe('1.1.0');
    expect(env.sessions).toHaveLength(1);
    expect(env.choices).toHaveLength(1);
    expect(env.standings).toHaveLength(1);
    expect(env.exportedAt).toBeGreaterThanOrEqual(before);
  });

  it('supports an empty dataset', () => {
    const env = buildExportEnvelope([], [], [], '1.1.0');
    expect(env.sessions).toEqual([]);
    expect(env.choices).toEqual([]);
    expect(env.standings).toEqual([]);
  });
});

describe('downloadExport', () => {
  it('creates an object URL, clicks a download anchor and revokes the URL', () => {
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const removeSpy = vi.spyOn(document.body, 'removeChild');

    try {
      downloadExport(buildExportEnvelope([], [], [], '1.1.0'));
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(removeSpy).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    } finally {
      (URL as unknown as { createObjectURL: unknown }).createObjectURL = originalCreate;
      (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = originalRevoke;
      clickSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });
});
