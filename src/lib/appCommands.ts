/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The ⌘/Ctrl+K command registry.
 *
 * Extracted from App so the whole palette can be unit-tested without mounting
 * the shell: call `buildCommands` with a context of state + setters, then invoke
 * each command's `run`. App only supplies references — no per-command closures.
 */

import { sortCommands, type Command } from './commands';
import { TAB_LABELS, WORKFLOW_STAGES, type TabType } from './workflowStages';
import type { SoundLayer } from '../types';

export interface AppCommandContext {
  setActiveTab: (tab: TabType) => void;

  // Layers
  layers: SoundLayer[];
  selectedLayer: SoundLayer | null;
  selectedLayerId: string | null;
  setSelectedLayerId: (id: string | null) => void;
  addLayer: (type: 'sample' | 'synth') => void;
  sampleFileInput: { current: HTMLInputElement | null };
  duplicateLayer: (id?: string) => void;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, updates: Partial<SoundLayer>) => void;
  playSelectedLayer: () => void;

  // Transport
  isPlaying: boolean;
  playAll: () => void;
  stopAll: () => void;
  bpm: number;
  setBpm: (bpm: number) => void;
  loopEnabled: boolean;
  toggleLoop: () => void;

  // Project
  exportWav: () => void;
  setProjectManagerOpen: (open: boolean) => void;
  newSession: () => void;

  // View
  toggleSidebar: () => void;
  setShortcutsOpen: (open: boolean) => void;
  setManualOpen: (open: boolean) => void;
}

const MIN_BPM = 60;
const MAX_BPM = 200;
const clampBpm = (v: number) => Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(v)));

export function buildCommands(ctx: AppCommandContext): Command[] {
  const selectedId = ctx.selectedLayerId;

  return sortCommands([
    ...WORKFLOW_STAGES.map((stage) => ({
      id: `nav:${stage.id}`,
      label: `Go to ${stage.name}`,
      hint: stage.subtitle,
      group: 'Navigate' as const,
      keywords: `${stage.shortName} ${stage.tabs.join(' ')}`,
      run: () => ctx.setActiveTab(stage.defaultTab),
    })),
    ...WORKFLOW_STAGES.flatMap((stage) =>
      stage.tabs.length > 1
        ? stage.tabs.map((tab) => ({
            id: `nav:${tab}`,
            label: `Go to ${stage.name} · ${TAB_LABELS[tab]}`,
            hint: 'view',
            group: 'Navigate' as const,
            keywords: tab,
            run: () => ctx.setActiveTab(tab),
          }))
        : []
    ),

    { id: 'layer:add-synth', label: 'Add Synth Layer', group: 'Layers', hint: 'new', run: () => ctx.addLayer('synth') },
    { id: 'layer:add-sample', label: 'Upload Sample…', group: 'Layers', hint: 'file', run: () => ctx.sampleFileInput.current?.click() },
    { id: 'layer:duplicate', label: 'Duplicate Selected Layer', group: 'Layers', run: () => ctx.duplicateLayer(selectedId ?? undefined) },
    { id: 'layer:delete', label: 'Delete Selected Layer', group: 'Layers', hint: 'Del', run: () => { if (selectedId) ctx.removeLayer(selectedId); } },
    { id: 'layer:mute', label: 'Mute / Unmute Selected Layer', group: 'Layers', hint: 'M', run: () => { if (selectedId) ctx.updateLayer(selectedId, { muted: !ctx.selectedLayer?.muted }); } },
    { id: 'layer:solo', label: 'Solo / Unsolo Selected Layer', group: 'Layers', hint: 'S', run: () => { if (selectedId) ctx.updateLayer(selectedId, { soloed: !ctx.selectedLayer?.soloed }); } },
    { id: 'layer:play', label: 'Play Selected Layer', group: 'Layers', run: () => ctx.playSelectedLayer() },
    { id: 'layer:next', label: 'Select Next Layer', group: 'Layers', run: () => selectRelative(ctx, 1) },
    { id: 'layer:prev', label: 'Select Previous Layer', group: 'Layers', run: () => selectRelative(ctx, -1) },

    { id: 'transport:playstop', label: 'Play / Stop Master Mix', group: 'Transport', hint: 'Space', run: () => { if (ctx.isPlaying) ctx.stopAll(); else ctx.playAll(); } },
    { id: 'transport:bpm-up', label: 'Increase Tempo +5 BPM', group: 'Transport', run: () => ctx.setBpm(clampBpm(ctx.bpm + 5)) },
    { id: 'transport:bpm-down', label: 'Decrease Tempo −5 BPM', group: 'Transport', run: () => ctx.setBpm(clampBpm(ctx.bpm - 5)) },
    { id: 'transport:loop', label: `Turn Loop ${ctx.loopEnabled ? 'Off' : 'On'}`, group: 'Transport', run: () => ctx.toggleLoop() },

    { id: 'project:export', label: 'Export One-Shot WAV', group: 'Project', run: () => ctx.exportWav() },
    { id: 'project:save', label: 'Open Save / Load Projects', group: 'Project', hint: '⌘S', run: () => ctx.setProjectManagerOpen(true) },
    { id: 'project:new', label: 'New Session', group: 'Project', hint: '⌘N', run: () => ctx.newSession() },

    { id: 'view:sidebar', label: 'Toggle Sidebar', group: 'View', run: () => ctx.toggleSidebar() },
    { id: 'view:shortcuts', label: 'Keyboard Shortcuts', group: 'View', hint: '?', run: () => ctx.setShortcutsOpen(true) },
    { id: 'view:manual', label: 'Studio Manual', group: 'View', run: () => ctx.setManualOpen(true) },
  ]);
}

function selectRelative(ctx: AppCommandContext, delta: number): void {
  const { layers } = ctx;
  if (layers.length === 0) return;
  const i = layers.findIndex((l) => l.id === ctx.selectedLayerId);
  const next = layers[(i + delta + layers.length) % layers.length];
  ctx.setSelectedLayerId(next.id);
}
