#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Generate the install icons for the phone (field) PWA from the project logo.
 *
 * Chrome and Android reject a manifest whose declared icon sizes do not match
 * the files, and iOS ignores non-square icons. The source logo is 1408x768, so
 * it is letterboxed onto a square canvas in the app's own background colour
 * rather than stretched. The maskable variant keeps the artwork inside the
 * 80% safe zone so a round/system-shaped launcher does not crop it.
 *
 * Usage: bun run icons   (or: node scripts/generate-pwa-icons.mjs)
 */

import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'public', 'logo.png');
const OUT_DIR = path.join(ROOT, 'public', 'icons');
const BACKGROUND = '#05070f';

/** @param {number} size @param {number} inner @param {string} file */
async function writeIcon(size, inner, file) {
  const pad = Math.round((size - inner) / 2);
  const suffix = pad * 2;
  const target = path.join(OUT_DIR, file);
  await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: BACKGROUND })
    .extend({
      top: pad,
      bottom: size - inner - pad,
      left: pad,
      right: size - inner - pad,
      background: BACKGROUND,
    })
    .png({ compressionLevel: 9 })
    .toFile(target);
  const { size: bytes } = await stat(target);
  console.log(`  ${file.padEnd(24)} ${size}x${size}  ${(bytes / 1024).toFixed(1)} KB${suffix ? ' (padded)' : ''}`);
}

await mkdir(OUT_DIR, { recursive: true });
console.log('Generating PWA icons from public/logo.png');
await writeIcon(192, 192, 'icon-192.png');
await writeIcon(512, 512, 'icon-512.png');
// 80% safe zone for the maskable icon.
await writeIcon(512, 410, 'maskable-512.png');
await writeIcon(180, 180, 'apple-touch-icon.png');
console.log('Done.');
