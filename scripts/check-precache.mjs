#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phone precache gate.
 *
 * The phone install must be offline-complete and must not carry the
 * workstation. This script walks the real `dist/` graph from `field.html`
 * (static and dynamic imports, script/link tags, CSS url() references) and
 * fails unless:
 *
 *   1. every file reachable from the field entry is in the generated
 *      Workbox precache (so the installed app works with no network), and
 *   2. no workstation-only chunk is in that precache (so a phone install
 *      does not download panels it can never render).
 *
 * Run after `npm run build`. CI runs it right after the build step.
 *
 *   npm run build && npm run precache:check
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const SW = path.join(DIST, 'sw.js');

const fail = (message) => {
  console.error(`\nprecache:check FAILED — ${message}`);
  process.exit(1);
};

if (!existsSync(path.join(DIST, 'field.html')) || !existsSync(SW)) {
  fail('dist/field.html or dist/sw.js is missing. Run `npm run build` first.');
}

/** Reference extraction from one built file (Vite emits relative, hashed URLs). */
function collectRefs(file, text) {
  const refs = new Set();
  const patterns = [
    /from\s*["'](\.[^"']+)["']/g,
    /import\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
    /import\s*["'](\.[^"']+)["']/g,
    /<script[^>]+src=["']([^"']+)["']/g,
    /<link[^>]+href=["']([^"']+)["']/g,
    /url\((?:["']?)([^"')]+)(?:["']?)\)/g,
    /new\s+URL\s*\(\s*["'](\.[^"']+)["']/g,
  ];
  for (const re of patterns) {
    for (const match of text.matchAll(re)) {
      const spec = match[1];
      if (/^(https?:|data:|blob:|#|mailto:)/.test(spec)) continue;
      if (spec.startsWith('/')) {
        refs.add(spec.slice(1));
        continue;
      }
      if (!spec.startsWith('.')) continue;
      refs.add(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)));
    }
  }
  return refs;
}

/** Every dist file reachable from an HTML entry. */
function closure(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const abs = path.join(DIST, file);
    if (!existsSync(abs)) continue;
    if (!/\.(js|css|html)$/.test(file)) continue;
    for (const ref of collectRefs(file, readFileSync(abs, 'utf8'))) queue.push(ref);
  }
  return seen;
}

/** The precache manifest Workbox actually shipped, parsed out of sw.js. */
function precacheUrls() {
  const sw = readFileSync(SW, 'utf8');
  const start = sw.indexOf('precacheAndRoute([');
  if (start < 0) fail('could not find precacheAndRoute([...]) in dist/sw.js');
  const open = sw.indexOf('[', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < sw.length; i += 1) {
    if (sw[i] === '[') depth += 1;
    else if (sw[i] === ']') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) fail('could not read the precache array from dist/sw.js');
  let manifest;
  try {
    // generateSW minifies the manifest with unquoted keys ({url:"x",revision:"y"}).
    const raw = sw
      .slice(open, end + 1)
      .replace(/([{,])([A-Za-z_][A-Za-z0-9_]*):/g, '$1"$2":');
    manifest = JSON.parse(raw);
  } catch (error) {
    fail(`precache manifest is not valid JSON: ${error.message}`);
  }
  return manifest.map((entry) => String(entry.url ?? entry));
}

const fieldClosure = closure('field.html');
const desktopClosure = closure('index.html');
const precache = new Set(precacheUrls());

const allAssets = existsSync(path.join(DIST, 'assets'))
  ? readdirSync(path.join(DIST, 'assets')).map((f) => `assets/${f}`)
  : [];
const desktopOnly = new Set(allAssets.filter((f) => desktopClosure.has(f) && !fieldClosure.has(f)));

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const sizeOf = (files) =>
  files.reduce((n, f) => {
    const abs = path.join(DIST, f);
    return existsSync(abs) ? n + readFileSync(abs).length : n;
  }, 0);

// 1. Offline-complete phone install: everything the field entry can load
//    (including HTML, CSS, icons and fonts) must be precached.
const missing = [...fieldClosure].filter((f) => !precache.has(f)).sort();
if (missing.length) {
  console.error(`\n${missing.length} field-reachable file(s) missing from the precache:`);
  for (const file of missing) console.error(`  - ${file}`);
  fail('the installed phone app would break offline. Add them back or fix vite.config.ts globIgnores.');
}

// 2. Phone install stays phone-sized: no workstation-only chunk precached.
const bloated = allAssets.filter((f) => desktopOnly.has(f) && precache.has(f)).sort();
if (bloated.length) {
  console.error(`\n${bloated.length} workstation-only chunk(s) in the phone precache:`);
  for (const file of bloated) console.error(`  - ${file}`);
  fail('a phone install would download workstation code. Add the stem to globIgnores.');
}

const fieldAssets = [...fieldClosure].filter((f) => f.startsWith('assets/'));
console.log('precache:check OK');
console.log(`  precache entries: ${precache.size}`);
console.log(`  field closure:    ${fieldAssets.length} assets, ${kb(sizeOf(fieldAssets))} (all precached)`);
console.log(`  excluded:         ${desktopOnly.size} workstation-only assets, ${kb(sizeOf([...desktopOnly]))} (not precached)`);
