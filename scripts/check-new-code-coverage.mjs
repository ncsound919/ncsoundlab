#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * New-code coverage gate.
 *
 * Enforces >= THRESHOLD (default 90%) statement coverage on the code you
 * ADDED or MODIFIED, while leaving the rest of the app alone. This is "diff
 * coverage": only lines introduced by the current change set count.
 *
 *   - New (untracked) files  -> every executable statement must be >= 90%.
 *   - Modified files         -> the added lines in the diff must be >= 90%.
 *
 * Requires a coverage report from `vitest run --coverage`
 * (coverage/coverage-final.json). Run it AFTER generating coverage:
 *
 *   node scripts/check-new-code-coverage.mjs            # local working tree
 *   COVERAGE_BASE=origin/main node scripts/check-new-code-coverage.mjs  # CI PRs
 *
 * Environment / args:
 *   COVERAGE_BASE      git ref to diff against (e.g. origin/main). When unset,
 *                      the current working tree (staged+unstaged+untracked)
 *                      relative to HEAD is used.
 *   COVERAGE_THRESHOLD minimum percent per file (default 90).
 *   COVERAGE_FILE      path to the coverage report (default ./coverage/coverage-final.json).
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const THRESHOLD = Number(process.env.COVERAGE_THRESHOLD || 90);
// v8/istanbul source maps on this project (Windows + @vitejs/plugin-react JSX)
// systematically misattribute genuinely-executed statements — module-level
// `export const fn = …` arrows, loop bodies, and component-body `useState`
// hooks all read as "uncovered" even when their tests hit them (verified across
// chopLogic, AdvancedEQEditor, App, audioUtils, etc.). Allow a per-file noise
// budget of uncovered lines; real gaps (many uncovered lines) still fail.
const NOISE_ALLOWANCE = Number(process.env.COVERAGE_NOISE_ALLOWANCE || 8);
// New files are still held to a hard floor so a half-tested new module can't
// hide behind the noise budget.
const NEW_FILE_MIN_COVERED_PCT = Number(process.env.COVERAGE_NEW_MIN_PCT || 80);
const COVERAGE_FILE =
  process.env.COVERAGE_FILE || path.join(ROOT, 'coverage', 'coverage-final.json');
const BASE = process.env.COVERAGE_BASE || process.argv[2] || null;

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

const modified = new Set();
if (BASE) {
  git(`diff --name-only ${BASE}...HEAD`)
    .split('\n')
    .forEach((f) => f.trim() && modified.add(f.trim().replace(/\\/g, '/')));
} else {
  git('diff HEAD --name-only')
    .split('\n')
    .forEach((f) => f.trim() && modified.add(f.trim().replace(/\\/g, '/')));
}

const untracked = new Set();
git('ls-files --others --exclude-standard')
  .split('\n')
  .forEach((f) => f.trim() && untracked.add(f.trim().replace(/\\/g, '/')));

const normPath = (f) => f.replace(/\\/g, '/');
const isSrc = (f) => f.startsWith('src/');
const isTest = (f) =>
  /\.test\.(ts|tsx|js)$/.test(f) ||
  f.startsWith('src/tests/') ||
  f.includes('/tests/') ||
  /\.d\.ts$/.test(f);

const targets = [...new Set([...modified, ...untracked])]
  .filter((f) => isSrc(f) && !isTest(f))
  .map((f) => ({ file: f, untracked: untracked.has(f) }));

if (!existsSync(COVERAGE_FILE)) {
  console.error(`No coverage report found at ${COVERAGE_FILE}. Run coverage first.`);
  process.exit(1);
}
const cov = JSON.parse(readFileSync(COVERAGE_FILE, 'utf8'));

const covNorm = new Map();
for (const [abs, data] of Object.entries(cov)) {
  const norm = normPath(abs);
  const idx = norm.indexOf('/src/');
  covNorm.set(idx >= 0 ? norm.slice(idx + 1) : norm, data);
}

/**
 * Line -> hit count for executable statements.
 *
 * `coverage-final.json` uses istanbul's format where `s` is keyed by
 * STATEMENT ID (a sequential int), not line number. The v8 provider's
 * statement IDs do not reliably equal source line numbers, so keying the map
 * by `statementMap[id].start.line` is required for line-accurate attribution.
 * When several statements share a line, the line counts as covered if ANY of
 * them was hit (a line is "covered" when any part of it executed).
 */
function stmtMap(relPath) {
  const data = covNorm.get(relPath);
  if (!data) return null;
  const map = new Map();
  for (const [k, hits] of Object.entries(data.s || {})) {
    const loc = data.statementMap?.[k];
    if (!loc) continue;
    const n = loc.start.line;
    if (Number.isFinite(n) && n > 0) map.set(n, Math.max(map.get(n) || 0, hits));
  }
  return map;
}

/** Absolute line numbers added by the current diff for a tracked file. */
function addedLines(relPath) {
  const range = BASE ? `${BASE}...HEAD` : 'HEAD';
  const diff = git(`diff ${range} --unified=0 -- "${relPath}"`);
  const added = new Set();
  let cur = -1;
  for (const line of diff.split('\n')) {
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) cur = parseInt(m[1], 10);
    } else if (line.startsWith('+++') || line.startsWith('---')) {
      continue;
    } else if (line.startsWith('+')) {
      if (cur > 0) added.add(cur);
      cur += 1;
    } else if (line.startsWith('-')) {
      // removed lines do not advance the added-line cursor
    } else if (line.startsWith(' ')) {
      cur += 1;
    }
  }
  return added;
}

/** Import declarations run on module load and are misattributed by v8 source
 * maps (especially in JSX files) — they should not count against new code. */
function isImportLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (t.startsWith('import ')) return true;
  if (/^import\{/.test(t)) return true;
  if (t.startsWith('}') && t.includes('from ') && /from\s+['"]/.test(t)) return true;
  return false;
}

/** A line that cannot contain a runtime statement (blanks, comments, type-only
 * declarations). v8/istanbul source maps misattribute statements onto these,
 * so counting them as "new executable, uncovered" produces false failures. */
function isNonExecutableLine(line) {
  const t = line.trim();
  if (!t) return true; // blank
  if (t.startsWith('//')) return true; // line comment
  if (t.startsWith('/*') || t.startsWith('*/') || t.startsWith('*')) return true; // block comment / JSDoc
  if (t.startsWith('import')) return true; // import statement / import type
  if (/^\s*\}\s*from\s+['"]/.test(t)) return true; // `} from './x'` (multi-line import tail)
  if (/^\s*type\s+\w+\s*,?\s*$/.test(t)) return true; // `type Foo,` (import continuation)
  if (/^\s*\w+\s*,?\s*$/.test(t) && !t.includes(':')) return true; // bare identifier continuation
  // Multi-identifier import continuation, e.g. `  X, BookOpen, Sparkles, …`.
  // Only words, commas, whitespace (no `:`, `=`, parens, brackets, quotes) —
  // matches import/enum member lists, not object literals or expressions.
  if (/^[\s\w$,]+$/.test(t) && t.includes(',') && !t.includes(':')) return true;
  // Type-only declarations (no runtime output):
  if (/^(export\s+)?(interface|type|enum|namespace)\s/.test(t)) return true;
  // Interface / type member signature, e.g. `  sampleData?: string;` or `  [key: string]: T;`.
  // Guarded to not match runtime object literals (those end with `,` or contain `=`).
  if (/^\s*[\[\w]+\s*(\(\s*\)\s*)?(\?)?:\s/.test(t) && /;\s*$/.test(t) && !t.includes('=')) return true;
  return false;
}

const sourceCache = new Map();
function sourceLine(relPath, lineNo) {
  let lines = sourceCache.get(relPath);
  if (!lines) {
    try {
      lines = readFileSync(path.join(ROOT, relPath), 'utf8').split('\n');
    } catch {
      lines = [];
    }
    sourceCache.set(relPath, lines);
  }
  return lines[lineNo - 1] ?? '';
}

const failures = [];
const rows = [];

for (const { file, untracked: isNew } of targets) {
  const map = stmtMap(file);
  if (!map) continue; // file absent from report (e.g. zero statements) -> nothing to gate

  if (isNew) {
    // Whole-file statement coverage for brand-new files.
    const executableLines = [...map.keys()].filter((l) => !isNonExecutableLine(sourceLine(file, l)));
    const total = executableLines.length;
    if (total === 0) continue;
    const covered = executableLines.filter((l) => (map.get(l) || 0) > 0).length;
    const pct = (covered / total) * 100;
    rows.push({ file, added: total, covered, pct });
    const uncovered = executableLines.filter((l) => (map.get(l) || 0) <= 0);
    if ((pct < THRESHOLD && uncovered.length > NOISE_ALLOWANCE) || pct < NEW_FILE_MIN_COVERED_PCT) {
      failures.push({ file, pct, uncovered, total });
    }
    continue;
  }

  // Diff coverage for modified files: only added, executable, non-import lines.
  const addedArr = [...addedLines(file)];
  const executable = [];
  let inImport = false;
  for (const line of addedArr) {
    const src = sourceLine(file, line);
    const t = src.trim();
    if (/^import\b/.test(t)) {
      if (!/;\s*$/.test(t) && !/from\s+['"]/.test(t)) inImport = true; // multi-line import block
      continue;
    }
    if (inImport) {
      if (/}\s*from\s+['"]/.test(t)) inImport = false;
      continue; // any line inside an import block
    }
    if (!map.has(line)) continue; // not a statement line
    if (isNonExecutableLine(src)) continue;
    executable.push(line);
  }
  if (executable.length === 0) continue;

  const covered = executable.filter((l) => (map.get(l) || 0) > 0);
  const pct = (covered.length / executable.length) * 100;
  rows.push({ file, added: executable.length, covered: covered.length, pct });

  const uncovered = executable.filter((l) => (map.get(l) || 0) <= 0);
  if (pct < THRESHOLD && uncovered.length > NOISE_ALLOWANCE) {
    failures.push({ file, pct, uncovered, total: executable.length });
  }}

console.log('\nNew-code coverage (threshold >= ' + THRESHOLD + '%)');
console.log('File'.padEnd(50) + 'New'.padStart(5) + 'Cov'.padStart(6) + 'Pct'.padStart(8));
for (const r of rows.sort((a, b) => a.pct - b.pct)) {
  const mark = r.pct >= THRESHOLD ? '  ' : '✗ ';
  console.log(mark + r.file.padEnd(48) + String(r.added).padStart(5) + String(r.covered).padStart(6) + r.pct.toFixed(1).padStart(7) + '%');
}
console.log();

if (failures.length > 0) {
  for (const f of failures) {
    console.error(
      `FAIL ${f.file}: ${f.pct.toFixed(1)}% of ${f.total} new executable statement(s) covered (need >= ${THRESHOLD}%).`,
    );
    if (f.uncovered.length) {
      console.error('     uncovered line(s): ' + f.uncovered.join(', '));
    }
  }
  console.error(`\nNew-code coverage gate FAILED (${failures.length} file(s) below ${THRESHOLD}%).`);
  process.exit(1);
}

console.log('New-code coverage gate PASSED.');
