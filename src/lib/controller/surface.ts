/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Controller surface descriptors.
 *
 * The on-screen panel renders whatever hardware is actually connected: an
 * MPD226 shows 4 pads banks / 4 knobs / 4 faders / 4 switches / transport, an
 * MPD218 shows pads + knobs (no faders or switches), and anything unrecognized
 * falls back to a generic pads + knobs + faders surface.
 */

export type ControllerSkin = 'mpd226' | 'mpd218' | 'generic';

export interface ControllerSurface {
  skin: ControllerSkin;
  label: string;
  /** Number of selectable pad banks (16 pads each, 4x4). */
  padBanks: number;
  padRows: number;
  padCols: number;
  /** Number of selectable control banks (knobs/faders/switches). */
  controlBanks: number;
  knobs: number;
  faders: number;
  switches: number;
  /** Transport button names rendered for this surface. */
  transport: string[];
}

export const SURFACES: Record<ControllerSkin, ControllerSurface> = {
  mpd226: {
    skin: 'mpd226',
    label: 'Akai MPD226',
    padBanks: 4,
    padRows: 4,
    padCols: 4,
    controlBanks: 3,
    knobs: 4,
    faders: 4,
    switches: 4,
    transport: ['play', 'stop', 'record', 'tap'],
  },
  mpd218: {
    skin: 'mpd218',
    label: 'Akai MPD218',
    padBanks: 3,
    padRows: 4,
    padCols: 4,
    controlBanks: 1,
    knobs: 4,
    faders: 0,
    switches: 0,
    transport: [],
  },
  generic: {
    skin: 'generic',
    label: 'Generic MIDI controller',
    padBanks: 4,
    padRows: 4,
    padCols: 4,
    controlBanks: 1,
    knobs: 4,
    faders: 4,
    switches: 0,
    transport: ['play', 'stop', 'record'],
  },
};

/** Pick a skin from connected MIDI input names (case-insensitive substring). */
export function detectSkin(deviceNames: readonly string[]): ControllerSkin {
  const haystack = deviceNames.join(' ').toLowerCase();
  if (haystack.includes('mpd226')) return 'mpd226';
  if (haystack.includes('mpd218')) return 'mpd218';
  if (haystack.includes('mpd232')) return 'mpd226'; // same control surface family
  return 'generic';
}

export const surfaceFor = (skin: ControllerSkin): ControllerSurface => SURFACES[skin];
