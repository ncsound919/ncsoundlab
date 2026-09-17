/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Condensed production pipeline.
 *
 * The app used to expose nine top-level stages; several were the same job split
 * in two (layering vs tweaking a layer, mixing vs placing it in space, creating
 * vs publishing a kit). They are now grouped into six pipeline stages, each
 * owning one or more workspace *tabs*. `activeTab` still holds the granular
 * `TabType` so existing screens/tests keep working; the sidebar, header and
 * controller only ever speak in stage ids.
 */

import type { ElementType } from 'react';
import { Drum, Layers, Package, Sparkles, Volume2 } from 'lucide-react';

/** Granular workspace tab (still the internal routing value). */
export type TabType =
  | 'soundlab'
  | 'tweaking'
  | 'mixer'
  | 'spatial'
  | 'evolution'
  | 'compare'
  | 'kitcreator'
  | 'catalog'
  | 'produce';

/** Condensed pipeline stage shown in the sidebar / header. */
export type StageId = 'design' | 'produce' | 'mixspace' | 'evolution' | 'kits';

export interface WorkflowStage {
  id: StageId;
  stageNumber: string;
  name: string;
  shortName: string;
  subtitle: string;
  description: string;
  icon: ElementType;
  accentClass: string;
  badgeClass: string;
  borderActive: string;
  /** Workspace tabs this stage contains, in sub-tab order. */
  tabs: TabType[];
  /** Tab selected when the stage is opened from the sidebar. */
  defaultTab: TabType;
}

/** Short labels for a stage's sub-tab strip. */
export const TAB_LABELS: Record<TabType, string> = {
  soundlab: 'Samples & Layers',
  tweaking: 'Synth & FX',
  mixer: 'Console',
  spatial: '3D Space',
  evolution: 'Evolution',
  compare: 'Compare',
  kitcreator: 'Create',
  catalog: 'Catalog',
  produce: 'Beat Studio',
};

export const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    id: 'design',
    stageNumber: '01',
    name: 'Sound Design',
    shortName: '01 Design',
    subtitle: 'Layers · Samples · Synth · FX',
    description: 'Build the sound: manage layers and samples, then synthesize and process the active layer.',
    icon: Layers,
    accentClass: 'text-blue-400',
    badgeClass: 'bg-blue-600/20 text-blue-300 border-blue-500/40 shadow-[0_0_10px_rgba(37,99,235,0.3)]',
    borderActive: 'border-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.45)]',
    tabs: ['soundlab', 'tweaking'],
    defaultTab: 'soundlab',
  },
  {
    id: 'produce',
    stageNumber: '02',
    name: 'Beat Studio & Sequencer',
    shortName: '02 Beat Studio',
    subtitle: 'MPC Pads · Step Sequencer · Piano',
    description: 'Build beats on MPC pads, program 16-step patterns per layer, and play the piano.',
    icon: Drum,
    accentClass: 'text-rose-400',
    badgeClass: 'bg-rose-600/20 text-rose-300 border-rose-500/40 shadow-[0_0_10px_rgba(244,63,94,0.3)]',
    borderActive: 'border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.45)]',
    tabs: ['produce'],
    defaultTab: 'produce',
  },
  {
    id: 'mixspace',
    stageNumber: '03',
    name: 'Mix, Space & Compare',
    shortName: '03 Mix & Space',
    subtitle: 'Console · 3D Room · Dry/Wet',
    description: 'Balance the stack, place it in the room with 3D panning and reverb, then A/B it against a reference.',
    icon: Volume2,
    accentClass: 'text-indigo-400',
    badgeClass: 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40 shadow-[0_0_10px_rgba(99,102,241,0.3)]',
    borderActive: 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.45)]',
    tabs: ['mixer', 'spatial', 'compare'],
    defaultTab: 'mixer',
  },
  {
    id: 'evolution',
    stageNumber: '04',
    name: 'Sound Evolution Engine',
    shortName: '04 Evolution',
    subtitle: 'Mutant Variation Lab',
    description: 'Take a sound and mutate it through multiple states to generate 10–50 unique variations.',
    icon: Sparkles,
    accentClass: 'text-fuchsia-300',
    badgeClass: 'bg-fuchsia-600/20 text-fuchsia-300 border-fuchsia-500/40 shadow-[0_0_10px_rgba(232,121,249,0.3)]',
    borderActive: 'border-fuchsia-400 shadow-[0_0_20px_rgba(232,121,249,0.45)]',
    tabs: ['evolution'],
    defaultTab: 'evolution',
  },
  {
    id: 'kits',
    stageNumber: '05',
    name: 'Sound Kits',
    shortName: '05 Kits',
    subtitle: 'Create · Catalog · Publish',
    description: 'Bundle sounds into distribution kits with artwork, then publish and audition the catalog.',
    icon: Package,
    accentClass: 'text-yellow-400',
    badgeClass: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40 shadow-[0_0_10px_rgba(250,204,21,0.3)]',
    borderActive: 'border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.45)]',
    tabs: ['kitcreator', 'catalog'],
    defaultTab: 'kitcreator',
  },
];

export const STAGE_IDS: Set<string> = new Set(WORKFLOW_STAGES.map((s) => s.id));
export const TAB_IDS: Set<string> = new Set(Object.keys(TAB_LABELS));

/** The stage that owns a given workspace tab. */
export function stageForTab(tab: TabType): WorkflowStage {
  return WORKFLOW_STAGES.find((s) => s.tabs.includes(tab)) ?? WORKFLOW_STAGES[0];
}

/** The stage at a pipeline index, clamped to the valid range. */
export function stageAt(index: number): WorkflowStage {
  return WORKFLOW_STAGES[Math.max(0, Math.min(WORKFLOW_STAGES.length - 1, index))];
}

/**
 * Resolve a `#stage=` hash value against both stage ids and the legacy
 * per-tab ids so old bookmarks still land on the right screen.
 */
export function resolveHashTarget(value: string): { stage: WorkflowStage; tab: TabType } | null {
  const stage = WORKFLOW_STAGES.find((s) => s.id === value);
  if (stage) return { stage, tab: stage.defaultTab };
  if (TAB_IDS.has(value)) {
    const tab = value as TabType;
    return { stage: stageForTab(tab), tab };
  }
  return null;
}
