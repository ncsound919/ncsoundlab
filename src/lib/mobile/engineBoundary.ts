/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Engine boundary — the rule that keeps `src/audio/mobile` and `src/lib/mobile`
 * portable.
 *
 * The mobile engine has to run in three places: the web build, a jsdom test, and
 * (later) a native port. That only works if it never reaches for React, Tauri,
 * a global audio context or a database directly — those are injected by the
 * caller through `EngineContext`. This module is the enforceable half of that
 * rule: `findViolations` scans source text, `scripts/check-engine-boundary.ts`
 * runs it over the tree, and `engineBoundary.test.ts` asserts the rule holds.
 */

export interface StorageAdapter {
  /** Desktop: IndexedDB/Dexie. Mobile: filesystem. Injected either way. */
  readAudio(id: string): Promise<ArrayBuffer>;
  writeAudio(id: string, data: ArrayBuffer): Promise<void>;
  readMeta(id: string): Promise<Record<string, unknown>>;
  writeMeta(id: string, meta: Record<string, unknown>): Promise<void>;
}

export interface EngineContext {
  /** Injected audio context; the engine never constructs one. */
  audioContext: unknown;
  /** Injected storage; the engine never opens a database. */
  storage: StorageAdapter;
}

export interface ForbiddenRule {
  id: string;
  pattern: RegExp;
  severity: 'error' | 'warn';
  reason: string;
}

/** Directories the rule applies to. Everything here must stay portable. */
export const ENGINE_DIRS = ['src/audio/mobile', 'src/lib/mobile'] as const;

/** Shared DSP that both surfaces call — held to the same rule. */
export const ENGINE_FILES = ['src/audio/dsp/spectralFlux.ts'] as const;

/**
 * Rules, in the order they are reported. Errors break the portability contract;
 * warnings flag code that will need a native twin before the field build ships.
 */
export const FORBIDDEN_ENGINE_PATTERNS: ForbiddenRule[] = [
  {
    id: 'react',
    // `[ \t]*` rather than `\s*`: `\s` crosses newlines, which would make a
    // blank line above an import report the match one line too early.
    pattern: /^[ \t]*import[^;]*\bfrom\s+['"](react|react-dom|react\/[^'"]*)['"]/m,
    severity: 'error',
    reason: 'The engine is not a React component tree; UI passes data in.',
  },
  {
    id: 'tauri',
    pattern: /^[ \t]*import[^;]*\bfrom\s+['"]@tauri-apps\/[^'"]*['"]/m,
    severity: 'error',
    reason: 'Tauri APIs are host-specific; the engine stays host-agnostic.',
  },
  {
    id: 'state-lib',
    pattern: /^[ \t]*import[^;]*\bfrom\s+['"](zustand|jotai|redux|motion|lucide-react|wavesurfer\.js)['"]/m,
    severity: 'error',
    reason: 'UI/state libraries do not belong in the engine.',
  },
  {
    id: 'dexie-runtime',
    pattern: /^[ \t]*import\s+(?!type\b)[^;]*\bfrom\s+['"]dexie['"]/m,
    severity: 'error',
    reason: 'Storage is injected; only a type-only Dexie import is allowed.',
  },
  {
    id: 'audio-context',
    pattern: /new\s+(AudioContext|OfflineAudioContext|webkitAudioContext)\s*\(/,
    severity: 'error',
    reason: 'The audio context is injected through EngineContext.',
  },
  {
    id: 'dom-access',
    pattern: /\b(document\s*\.|localStorage\b|indexedDB\b|navigator\s*\.\s*userAgent\b)/,
    severity: 'warn',
    reason: 'DOM access needs a native twin before the field build; prefer injected capability flags.',
  },
];

export interface BoundaryViolation {
  file: string;
  line: number;
  ruleId: string;
  severity: 'error' | 'warn';
  reason: string;
  text: string;
}

/**
 * The rule table lives in this file, so its own regex literals match the
 * patterns they define. A checker that reports itself is noise; skip it.
 */
export const BOUNDARY_SELF_FILES = ['src/lib/mobile/engineBoundary.ts'];

export interface BoundaryReport {
  ok: boolean;
  scannedFiles: number;
  violations: BoundaryViolation[];
  errors: BoundaryViolation[];
  warnings: BoundaryViolation[];
}

/** Strip type-only imports: they erase at runtime and are allowed by design. */
function stripTypeImports(source: string): string {
  return source.replace(/^[ \t]*import\s+type\s[^;]*;?/gm, (match) =>
    match.replace(/[^\n]/g, ' ')
  );
}

/** Find boundary violations in one file's source text. */
export function findViolations(file: string, source: string): BoundaryViolation[] {
  const scannable = stripTypeImports(source);
  const lines = source.split('\n');
  const violations: BoundaryViolation[] = [];
  for (const rule of FORBIDDEN_ENGINE_PATTERNS) {
    const matcher = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`);
    let match = matcher.exec(scannable);
    while (match) {
      const index = match.index;
      const line = scannable.slice(0, index).split('\n').length;
      violations.push({
        file,
        line,
        ruleId: rule.id,
        severity: rule.severity,
        reason: rule.reason,
        text: (lines[line - 1] ?? match[0]).trim(),
      });
      if (match[0].length === 0) break;
      match = matcher.exec(scannable);
    }
  }
  // One report per line per rule: several matches on a single line (a pattern
  // definition, a list of banned identifiers) are the same finding.
  const seen = new Set<string>();
  return violations
    .filter((violation) => {
      const key = `${violation.file}:${violation.line}:${violation.ruleId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.line - b.line || a.ruleId.localeCompare(b.ruleId));
}

/**
 * Check a set of files. `ok` is false when any *error* was found; warnings are
 * reported but do not fail the gate.
 */
export function checkEngineBoundary(
  files: { path: string; source: string }[],
  options: { includeWarnings?: boolean } = {}
): BoundaryReport {
  const includeWarnings = options.includeWarnings ?? true;
  const violations: BoundaryViolation[] = [];
  for (const file of files) {
    if (BOUNDARY_SELF_FILES.includes(file.path)) continue;
    violations.push(...findViolations(file.path, file.source));
  }
  const errors = violations.filter((v) => v.severity === 'error');
  const warnings = violations.filter((v) => v.severity === 'warn');
  return {
    ok: errors.length === 0,
    scannedFiles: files.length,
    violations: includeWarnings ? violations : errors,
    errors,
    warnings,
  };
}
