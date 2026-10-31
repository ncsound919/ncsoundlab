#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Engine boundary check.
 *
 * The mobile engine (`src/audio/mobile`, `src/lib/mobile`, plus the shared DSP in
 * `src/audio/dsp/spectralFlux.ts`) must stay free of React, Tauri, state
 * libraries, a self-constructed AudioContext and direct database access, so the
 * same code can run in the web build, in tests and later in a native port.
 *
 *   npm run boundary:check
 *
 * Errors fail the run; warnings are printed and reported but do not.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { checkEngineBoundary, ENGINE_DIRS, ENGINE_FILES } from '../src/lib/mobile/engineBoundary';

const ROOT = process.cwd();
const EXTENSIONS = new Set(['.ts', '.tsx']);

function collect(dir: string, files: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, files);
    } else if (EXTENSIONS.has(path.extname(entry)) && !/\.test\.tsx?$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const targets = [
  ...ENGINE_DIRS.flatMap((dir) => collect(path.join(ROOT, dir))),
  ...ENGINE_FILES.map((file) => path.join(ROOT, file)),
];

const files = targets.map((absolute) => ({
  path: path.relative(ROOT, absolute).replace(/\\/g, '/'),
  source: readFileSync(absolute, 'utf8'),
}));

const report = checkEngineBoundary(files);

console.log(`\nEngine boundary check — ${report.scannedFiles} file(s)`);
for (const dir of ENGINE_DIRS) console.log(`  scanning ${dir}`);
for (const file of ENGINE_FILES) console.log(`  scanning ${file}`);

if (report.violations.length === 0) {
  console.log('\nNo forbidden imports or host dependencies found.');
} else {
  for (const violation of report.violations) {
    const mark = violation.severity === 'error' ? 'FAIL' : 'WARN';
    console.log(
      `${mark} ${violation.file}:${violation.line} [${violation.ruleId}] ${violation.reason}\n     ${violation.text}`
    );
  }
}

console.log(
  `\n${report.errors.length} error(s), ${report.warnings.length} warning(s).${
    report.ok ? ' Boundary OK.' : ' Boundary VIOLATED.'
  }`
);

if (!report.ok) process.exit(1);
