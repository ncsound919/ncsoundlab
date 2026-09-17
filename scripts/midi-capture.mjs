/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Hardware MIDI capture — verifies what a connected controller ACTUALLY sends.
 * Run from the soundlab folder:
 *
 *   node scripts/midi-capture.mjs                 # 120s capture
 *   MIDI_CAPTURE_MS=20000 node scripts/midi-capture.mjs
 *   MIDI_CAPTURE_OUT=mpd.log node scripts/midi-capture.mjs
 *
 * Uses the `webmidi` package (Node backend provided by `jzz`) so the message
 * shapes match the browser exactly. Every message is echoed to stdout and
 * appended to the log file.
 */

import fs from 'node:fs';
import { WebMidi } from 'webmidi';

const durationMs = Number(process.env.MIDI_CAPTURE_MS || 120000);
const out = process.env.MIDI_CAPTURE_OUT || 'midi-capture.log';

const line = (obj) => {
  const text = JSON.stringify(obj);
  console.log(text);
  fs.appendFileSync(out, text + '\n');
};

const raw = (e) => (typeof e?.rawValue === 'number' ? e.rawValue : Math.round((e?.value ?? 0) * 127));

await WebMidi.enable();
const names = WebMidi.inputs.map((i) => `${i.name} [${i.manufacturer}]`).join(' | ') || '(none)';
console.log(`INPUTS: ${names}`);
fs.appendFileSync(out, `# ${new Date().toISOString()} inputs: ${names}\n`);

for (const input of WebMidi.inputs) {
  input.addListener('noteon', (e) => line({ input: input.name, t: 'noteon', n: e.note.number, v: e.velocity, ch: e.channel }));
  input.addListener('noteoff', (e) => line({ input: input.name, t: 'noteoff', n: e.note.number, ch: e.channel }));
  input.addListener('controlchange', (e) => line({ input: input.name, t: 'cc', cc: e.controller.number, v: raw(e), ch: e.channel }));
  input.addListener('programchange', (e) => line({ input: input.name, t: 'program', p: raw(e), ch: e.channel }));
  input.addListener('pitchbend', (e) => line({ input: input.name, t: 'pitchbend', v: raw(e), ch: e.channel }));
  input.addListener('channelaftertouch', (e) => line({ input: input.name, t: 'aftertouch', v: raw(e), ch: e.channel }));
  input.addListener('start', () => line({ input: input.name, t: 'start' }));
  input.addListener('continue', () => line({ input: input.name, t: 'continue' }));
  input.addListener('stop', () => line({ input: input.name, t: 'stop' }));
}

console.log(`CAPTURING for ${durationMs}ms -> ${out}`);
setTimeout(() => {
  console.log('CAPTURE DONE');
  process.exit(0);
}, durationMs);
