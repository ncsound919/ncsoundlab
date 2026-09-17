/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `ModuleCard` — rack module chrome: power/duplicate/remove/collapse,
 * the per-type editor dispatch, parallel-branch controls and macro-linking hint.
 * The individual editor components are stubbed; this file owns ModuleCard's
 * own branching.
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Reorder } from 'motion/react';
import { ModuleCard } from './ModuleCard';
import { useRackStore } from '../store/rackStore';

vi.mock('./AdvancedEQEditor', () => ({ AdvancedEQEditor: (p: any) => { p.onChange?.({}); return <div data-testid="editor-eq" />; } }));
vi.mock('./AdvancedCompEditor', () => ({ AdvancedCompEditor: (p: any) => { p.onChange?.({}); return <div data-testid="editor-compressor" />; } }));
vi.mock('../audio/dsp/Tremolo', () => ({ AdvancedTremoloEditor: (p: any) => { p.onChange?.({}); return <div data-testid="editor-tremolo" />; } }));
vi.mock('./editors/TapeEmulationEditor', () => ({ TapeEmulationEditor: (p: any) => { p.onChange?.({}); return <div data-testid="editor-tape" />; } }));
vi.mock('./editors/ReverbUI', () => ({ ReverbUI: (p: any) => { p.onChange?.({}); return <div data-testid="editor-reverb" />; } }));
vi.mock('./editors/DelayEditor', () => ({ DelayEditor: (p: any) => { p.onChange?.({}); return <div data-testid="editor-delay" />; } }));
vi.mock('./editors/ChorusEditor', () => ({ ChorusEditor: (p: any) => { p.onChange?.({}); return <div data-testid="editor-chorus" />; } }));
vi.mock('./editors/FlangerEditor', () => ({ FlangerEditor: (p: any) => { p.onChange?.({}); return <div data-testid="editor-flanger" />; } }));
vi.mock('./editors/PhaserEditor', () => ({ PhaserEditor: (p: any) => { p.onChange?.({}); return <div data-testid="editor-phaser" />; } }));
vi.mock('./editors/SaturatorEditor', () => ({ SaturatorEditor: (p: any) => { p.onChange?.({}); return <div data-testid="editor-saturator" />; } }));
vi.mock('./editors/ImagerEditor', () => ({ ImagerEditor: (p: any) => { p.onChange?.({}); return <div data-testid="editor-imager" />; } }));
vi.mock('./editors/ClipperEditor', () => ({ ClipperEditor: (p: any) => { p.onChange?.({}); return <div data-testid="editor-clipper" />; } }));
vi.mock('./editors/LimiterEditor', () => ({ LimiterEditor: (p: any) => { p.onChange?.({}); return <div data-testid="editor-limiter" />; } }));
vi.mock('./editors/ExciterEditor', () => ({ ExciterEditor: (p: any) => { p.onChange?.({}); return <div data-testid="editor-exciter" />; } }));

const EDITOR_TYPES = [
  ['eq', 'editor-eq'],
  ['compressor', 'editor-compressor'],
  ['tremolo', 'editor-tremolo'],
  ['tape', 'editor-tape'],
  ['reverb', 'editor-reverb'],
  ['delay', 'editor-delay'],
  ['chorus', 'editor-chorus'],
  ['flanger', 'editor-flanger'],
  ['phaser', 'editor-phaser'],
  ['saturator', 'editor-saturator'],
  ['imager', 'editor-imager'],
  ['clipper', 'editor-clipper'],
  ['limiter', 'editor-limiter'],
  ['exciter', 'editor-exciter'],
] as const;

const makeModule = (type: string, over: Record<string, unknown> = {}) => ({
  id: 'mod-1234',
  type,
  enabled: true,
  settings: {},
  onUpdate: vi.fn(),
  ...over,
});

const renderCard = (module: any, props: Record<string, unknown> = {}) => {
  const onRemove = vi.fn();
  const onDuplicate = vi.fn();
  const result = render(
    <Reorder.Group axis="y" values={[module]} onReorder={() => {}}>
      <ModuleCard module={module} onRemove={onRemove} onDuplicate={onDuplicate} {...props} />
    </Reorder.Group>,
  );
  return { ...result, onRemove, onDuplicate };
};

describe('ModuleCard', () => {
  beforeEach(() => {
    useRackStore.setState({ routingMode: 'serial' });
  });

  it('dispatches every supported module type to its editor', () => {
    const modules = EDITOR_TYPES.map(([type]) => makeModule(type));
    render(
      <Reorder.Group axis="y" values={modules} onReorder={() => {}}>
        {modules.map((m, i) => (
          <ModuleCard key={i} module={m} onRemove={vi.fn()} onDuplicate={vi.fn()} />
        ))}
      </Reorder.Group>,
    );
    for (const [, testId] of EDITOR_TYPES) {
      expect(screen.getByTestId(testId)).toBeDefined();
    }
  });

  it('renders the fallback knob row for an unknown module type', () => {
    const module = makeModule('utility');
    renderCard(module);
    // No editor testid, but the card chrome still renders.
    expect(screen.getByText('utility')).toBeDefined();
    expect(screen.queryByTestId(/^editor-/)).toBeNull();
  });

  it('toggles power and takes the disabled visual path', () => {
    const module = makeModule('chorus', { enabled: false });
    renderCard(module);
    fireEvent.click(screen.getByLabelText('Toggle Power'));
    expect(module.onUpdate).toHaveBeenCalledWith('mod-1234', { enabled: true });
  });

  it('duplicates and removes with the correct id', () => {
    const module = makeModule('chorus');
    const { onRemove, onDuplicate } = renderCard(module);
    fireEvent.click(screen.getByLabelText('Duplicate Module'));
    expect(onDuplicate).toHaveBeenCalledWith('mod-1234');
    fireEvent.click(screen.getByLabelText('Remove Module'));
    expect(onRemove).toHaveBeenCalledWith('mod-1234');
  });

  it('collapses and expands the editor body', () => {
    const module = makeModule('chorus');
    const { container } = renderCard(module);
    expect(screen.getByTestId('editor-chorus')).toBeDefined();
    const collapse = container.querySelector('svg.lucide-chevron-up')?.closest('button') as HTMLElement;
    act(() => fireEvent.click(collapse));
    expect(screen.queryByTestId('editor-chorus')).toBeNull();
  });

  it('renders the parallel-split controls and updates branch state', () => {
    useRackStore.setState({ routingMode: 'parallel' });
    const module = makeModule('chorus');
    renderCard(module);
    expect(screen.getByText(/Split Branch/i)).toBeDefined();

    fireEvent.click(screen.getByText('M'));
    expect(module.onUpdate).toHaveBeenCalledWith('mod-1234', { parallelMute: true });
    fireEvent.click(screen.getByText('S'));
    expect(module.onUpdate).toHaveBeenCalledWith('mod-1234', { parallelSolo: true });

    // P-GAIN / P-PAN knobs commit through their slider keyboard handler.
    fireEvent.keyDown(screen.getByLabelText('P-GAIN'), { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByLabelText('P-PAN'), { key: 'ArrowUp' });
    expect(module.onUpdate).toHaveBeenCalledWith('mod-1234', expect.objectContaining({ parallelGain: expect.any(Number) }));
    expect(module.onUpdate).toHaveBeenCalledWith('mod-1234', expect.objectContaining({ parallelPan: expect.any(Number) }));
  });

  it('starts dragging from the grip handle', () => {
    const module = makeModule('chorus');
    const { container } = renderCard(module);
    const grip = container.querySelector('svg.lucide-grip-vertical')?.closest('button') as HTMLElement;
    expect(grip).toBeTruthy();
    expect(() => fireEvent.pointerDown(grip, { pointerId: 1 })).not.toThrow();
  });

  it('shows the macro-linking hint when a macro slot is selected', () => {
    renderCard(makeModule('chorus'), { isLinkingMode: true, selectedMacroIndex: 0 });
    expect(screen.getByText(/Click any/i)).toBeDefined();
    expect(screen.getByText(/Macro 1/)).toBeDefined();
  });
});
