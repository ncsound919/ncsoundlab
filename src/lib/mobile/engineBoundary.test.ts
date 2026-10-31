/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ENGINE_DIRS,
  ENGINE_FILES,
  checkEngineBoundary,
  findViolations,
  type BoundaryViolation,
} from './engineBoundary';

const ROOT = path.resolve(__dirname, '../../..');

const collect = (absolute: string, out: string[] = []): string[] => {
  let entries: string[];
  try {
    entries = readdirSync(absolute);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(absolute, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
};

const ruleIds = (violations: BoundaryViolation[]): string[] => violations.map((v) => v.ruleId);

describe('findViolations', () => {
  it('flags a React import as an error', () => {
    const found = findViolations('src/lib/mobile/example.ts', "import { useState } from 'react';\n");
    expect(ruleIds(found)).toContain('react');
    expect(found[0].severity).toBe('error');
    expect(found[0].line).toBe(1);
  });

  it('flags Tauri, state libraries and direct database access', () => {
    const source = [
      "import { invoke } from '@tauri-apps/api/core';",
      "import { create } from 'zustand';",
      "import Dexie from 'dexie';",
    ].join('\n');
    const found = findViolations('src/lib/mobile/x.ts', source);
    expect(ruleIds(found)).toEqual(expect.arrayContaining(['tauri', 'state-lib', 'dexie-runtime']));
  });

  it('flags a self-constructed AudioContext', () => {
    const found = findViolations('src/audio/mobile/x.ts', 'const ctx = new AudioContext();\n');
    expect(ruleIds(found)).toContain('audio-context');
  });

  it('warns (not errors) about DOM access', () => {
    const found = findViolations('src/audio/mobile/x.ts', 'const ua = document.title;\n');
    expect(found[0].severity).toBe('warn');
  });

  it('allows type-only imports from otherwise-forbidden packages', () => {
    const source = [
      "import type { Table } from 'dexie';",
      "import type { ReactNode } from 'react';",
    ].join('\n');
    expect(findViolations('src/lib/mobile/x.ts', source)).toHaveLength(0);
  });

  it('reports the line number of each violation', () => {
    const source = ['// header', '', "import { useState } from 'react';"].join('\n');
    expect(findViolations('src/lib/mobile/x.ts', source)[0].line).toBe(3);
  });

  it('leaves host-free code alone', () => {
    const source = ['import { fft } from "./fft";', 'export const gain = (x: number) => x * 2;'].join('\n');
    expect(findViolations('src/audio/mobile/x.ts', source)).toHaveLength(0);
  });
});

describe('checkEngineBoundary', () => {
  it('fails when a file has an error', () => {
    const report = checkEngineBoundary([
      { path: 'a.ts', source: "import React from 'react';" },
      { path: 'b.ts', source: 'export const ok = 1;' },
    ]);
    expect(report.ok).toBe(false);
    expect(report.errors).toHaveLength(1);
    expect(report.scannedFiles).toBe(2);
  });

  it('passes when there are only warnings', () => {
    const report = checkEngineBoundary([{ path: 'a.ts', source: 'document.title = "x";' }]);
    expect(report.ok).toBe(true);
    expect(report.warnings).toHaveLength(1);
  });

  it('can hide warnings from the visible list', () => {
    const report = checkEngineBoundary([{ path: 'a.ts', source: 'localStorage.clear();' }], {
      includeWarnings: false,
    });
    expect(report.violations).toHaveLength(0);
    expect(report.warnings).toHaveLength(1);
  });

  it('reports one finding per line even when a line matches twice', () => {
    const report = checkEngineBoundary([
      { path: 'a.ts', source: 'const x = document.title; localStorage.clear();' },
    ]);
    expect(report.warnings).toHaveLength(1);
  });

  it('does not report the rule table against itself', () => {
    const source = readFileSync(path.join(ROOT, 'src/lib/mobile/engineBoundary.ts'), 'utf8');
    expect(checkEngineBoundary([{ path: 'src/lib/mobile/engineBoundary.ts', source }]).violations).toEqual([]);
    // The raw scanner still sees it — the skip is deliberate, not accidental.
    expect(findViolations('src/lib/mobile/engineBoundary.ts', source).length).toBeGreaterThan(0);
  });
});

describe('the real engine tree', () => {
  const files = [
    ...ENGINE_DIRS.flatMap((dir) => collect(path.join(ROOT, dir))),
    ...ENGINE_FILES.map((file) => path.join(ROOT, file)),
  ].map((absolute) => ({
    path: path.relative(ROOT, absolute).replace(/\\/g, '/'),
    source: readFileSync(absolute, 'utf8'),
  }));

  it('scans the mobile engine and the shared DSP', () => {
    expect(files.length).toBeGreaterThan(8);
    expect(files.some((file) => file.path === 'src/lib/mobile/genome.ts')).toBe(true);
    expect(files.some((file) => file.path === 'src/audio/dsp/spectralFlux.ts')).toBe(true);
  });

  it('has no React, Tauri, state-library or AudioContext violations', () => {
    const report = checkEngineBoundary(files);
    expect(report.errors.map((v) => `${v.file}:${v.line} ${v.ruleId}`)).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
