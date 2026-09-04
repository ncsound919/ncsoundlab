/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Rating data export as a self-contained JSON envelope.
 *
 * Downloaded via Blob + anchor click (no server, no upload). The envelope is
 * the artifact the operator and I analyze together.
 */

import type {
  EloStanding,
  RatingChoice,
  RatingSession,
} from './types';

export interface RatingExportEnvelope {
  format: 'soundlab.ratings.v1';
  exportedAt: number;
  appVersion: string;
  sessions: RatingSession[];
  choices: RatingChoice[];
  standings: EloStanding[];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function buildExportEnvelope(
  sessions: RatingSession[],
  choices: RatingChoice[],
  standings: EloStanding[],
  appVersion: string,
): RatingExportEnvelope {
  return {
    format: 'soundlab.ratings.v1',
    exportedAt: Date.now(),
    appVersion,
    sessions,
    choices,
    standings,
  };
}

export function downloadExport(envelope: RatingExportEnvelope): void {
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `soundlab-ratings-${formatDate()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
