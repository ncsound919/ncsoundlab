import { isV1Export, isV2Export } from './types';
import { migrateFromV1 } from './store/patternStore';
import type { Pattern, SequenceExport, SequenceExportV2, SongChain } from './types';

export function exportV2(
  _activeId: string,
  p: Pattern,
  songChain: SongChain = { order: [] },
): SequenceExportV2 {
  return {
    format: 'ncsoundlab-mpc-sequence',
    version: 2,
    bpm: p.bpm,
    timeSignature: p.timeSignature,
    stepLength: p.stepLength,
    swing: p.swing,
    steps: p.stepLength,
    ppq: 96,
    pattern: p.layerRows,
    songChain,
  };
}

export function importExport(data: unknown): SequenceExportV2 {
  if (isV2Export(data)) return data;
  if (isV1Export(data)) return migrateFromV1(data);
  throw new Error('Unrecognized sequence export format');
}
