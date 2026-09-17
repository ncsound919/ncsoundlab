/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  TAB_LABELS,
  WORKFLOW_STAGES,
  resolveHashTarget,
  stageForTab,
  type TabType,
} from './workflowStages';

describe('condensed workflow stages', () => {
  it('collapses the pipeline to five stages', () => {
    expect(WORKFLOW_STAGES.map((s) => s.id)).toEqual([
      'design',
      'produce',
      'mixspace',
      'evolution',
      'kits',
    ]);
  });

  it('groups the merged screens under one stage', () => {
    expect(stageForTab('soundlab').id).toBe('design');
    expect(stageForTab('tweaking').id).toBe('design');
    expect(stageForTab('produce').id).toBe('produce');
    expect(stageForTab('mixer').id).toBe('mixspace');
    expect(stageForTab('spatial').id).toBe('mixspace');
    expect(stageForTab('compare').id).toBe('mixspace');
    expect(stageForTab('evolution').id).toBe('evolution');
    expect(stageForTab('kitcreator').id).toBe('kits');
    expect(stageForTab('catalog').id).toBe('kits');
  });

  it('labels every tab and defaults each stage to its first tab', () => {
    const tabs = WORKFLOW_STAGES.flatMap((s) => s.tabs);
    expect(new Set(tabs).size).toBe(tabs.length);
    for (const tab of tabs) {
      expect(TAB_LABELS[tab as TabType]).toBeTruthy();
    }
    for (const stage of WORKFLOW_STAGES) {
      expect(stage.tabs[0]).toBe(stage.defaultTab);
    }
  });

  it('resolves condensed stage ids and legacy tab ids from the hash', () => {
    expect(resolveHashTarget('mixspace')?.tab).toBe('mixer');
    expect(resolveHashTarget('kits')?.tab).toBe('kitcreator');
    expect(resolveHashTarget('tweaking')?.stage.id).toBe('design');
    expect(resolveHashTarget('catalog')?.stage.id).toBe('kits');
    expect(resolveHashTarget('nonsense')).toBeNull();
  });
});
