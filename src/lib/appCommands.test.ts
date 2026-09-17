/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { buildCommands, type AppCommandContext } from './appCommands';
import { DEFAULT_ENVELOPE, DEFAULT_FX, type SoundLayer } from '../types';

const layer = (id: string): SoundLayer => ({
  id,
  name: id,
  type: 'synth',
  enabled: true,
  gain: 1,
  pan: 0,
  pitch: 0,
  envelope: { ...DEFAULT_ENVELOPE },
  fx: { ...DEFAULT_FX },
});

const ctx = (over: Partial<AppCommandContext> = {}): AppCommandContext => ({
  setActiveTab: vi.fn(),
  layers: [layer('a'), layer('b')],
  selectedLayer: layer('a'),
  selectedLayerId: 'a',
  setSelectedLayerId: vi.fn(),
  addLayer: vi.fn(),
  sampleFileInput: { current: null },
  duplicateLayer: vi.fn(),
  removeLayer: vi.fn(),
  updateLayer: vi.fn(),
  playSelectedLayer: vi.fn(),
  isPlaying: false,
  playAll: vi.fn(),
  stopAll: vi.fn(),
  bpm: 120,
  setBpm: vi.fn(),
  loopEnabled: false,
  toggleLoop: vi.fn(),
  exportWav: vi.fn(),
  setProjectManagerOpen: vi.fn(),
  newSession: vi.fn(),
  toggleSidebar: vi.fn(),
  setShortcutsOpen: vi.fn(),
  setManualOpen: vi.fn(),
  ...over,
});

const run = (c: AppCommandContext, id: string) => {
  const command = buildCommands(c).find((cmd) => cmd.id === id);
  expect(command, `command ${id} missing`).toBeTruthy();
  command!.run();
};

describe('buildCommands', () => {
  it('covers every group and has unique ids', () => {
    const commands = buildCommands(ctx());
    const groups = new Set(commands.map((c) => c.group));
    expect(groups).toEqual(new Set(['Navigate', 'Layers', 'Transport', 'Project', 'View']));
    expect(new Set(commands.map((c) => c.id)).size).toBe(commands.length);
  });

  it('runs every command without throwing and reaches its handler', () => {
    const c = ctx();
    for (const command of buildCommands(c)) {
      expect(() => command.run()).not.toThrow();
    }
    expect(c.addLayer).toHaveBeenCalledWith('synth');
    expect(c.playSelectedLayer).toHaveBeenCalled();
    expect(c.exportWav).toHaveBeenCalled();
    expect(c.newSession).toHaveBeenCalled();
    expect(c.toggleSidebar).toHaveBeenCalled();
    expect(c.setShortcutsOpen).toHaveBeenCalledWith(true);
    expect(c.setManualOpen).toHaveBeenCalledWith(true);
    expect(c.setProjectManagerOpen).toHaveBeenCalledWith(true);
    expect(c.setActiveTab).toHaveBeenCalled();
  });

  it('uploads through the hidden file input', () => {
    const click = vi.fn();
    run(ctx({ sampleFileInput: { current: { click } as unknown as HTMLInputElement } }), 'layer:add-sample');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('toggles mute and solo on the selected layer', () => {
    const c = ctx();
    run(c, 'layer:mute');
    run(c, 'layer:solo');
    expect(c.updateLayer).toHaveBeenCalledWith('a', { muted: true });
    expect(c.updateLayer).toHaveBeenCalledWith('a', { soloed: true });
  });

  it('selects relative layers, wrapping around', () => {
    const c = ctx();
    run(c, 'layer:next');
    expect(c.setSelectedLayerId).toHaveBeenLastCalledWith('b');

    const wrap = ctx();
    run(wrap, 'layer:prev');
    expect(wrap.setSelectedLayerId).toHaveBeenLastCalledWith('b'); // first -> last of 2
  });

  it('no-ops layer actions with no selection and no layers', () => {
    const c = ctx({ selectedLayerId: null, selectedLayer: null, layers: [] });
    run(c, 'layer:delete');
    run(c, 'layer:next');
    run(c, 'layer:prev');
    expect(c.removeLayer).not.toHaveBeenCalled();
    expect(c.setSelectedLayerId).not.toHaveBeenCalled();
  });

  it('clamps tempo nudges to the supported range', () => {
    const up = vi.fn();
    run(ctx({ bpm: 199, setBpm: up }), 'transport:bpm-up');
    expect(up).toHaveBeenCalledWith(200);

    const down = vi.fn();
    run(ctx({ bpm: 61, setBpm: down }), 'transport:bpm-down');
    expect(down).toHaveBeenCalledWith(60);
  });

  it('stops when playing and plays when stopped', () => {
    const playing = ctx({ isPlaying: true });
    run(playing, 'transport:playstop');
    expect(playing.stopAll).toHaveBeenCalled();
    expect(playing.playAll).not.toHaveBeenCalled();

    const stopped = ctx({ isPlaying: false });
    run(stopped, 'transport:playstop');
    expect(stopped.playAll).toHaveBeenCalled();
  });

  it('labels the loop command from current state', () => {
    expect(buildCommands(ctx({ loopEnabled: true })).find((c) => c.id === 'transport:loop')?.label).toMatch(/Off/);
    expect(buildCommands(ctx({ loopEnabled: false })).find((c) => c.id === 'transport:loop')?.label).toMatch(/On/);
  });
});
