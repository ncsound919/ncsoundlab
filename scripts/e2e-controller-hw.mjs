/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Runs the hardware-in-the-loop controller test against the physically
 * connected MPD226. It opens a headed Chromium, connects to the real Web MIDI
 * device, and waits for you to move a control — Playwright cannot synthesise
 * MIDI from a physical controller, so a human must play the unit.
 *
 * Usage: npm run test:e2e:controller:hw
 */

import { spawnSync } from 'node:child_process';

const args = [
  'playwright',
  'test',
  'e2e/controller.spec.ts',
  '--grep',
  'hardware in the loop',
  '--headed',
  '--reporter=line',
];

const result = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, MIDI_HW: '1' },
});

process.exit(result.status ?? 1);
