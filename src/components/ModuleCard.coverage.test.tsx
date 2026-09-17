/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extra coverage for `ModuleCard` — enabled/disabled chrome, the parallel
 * split-branch level/pan labels (-inf, L/C/R), mute/solo toggling off,
 * missing-`onUpdate` safety, and the macro-linking mode with no slot
 * selected. Editor components are stubbed; this file owns the card chrome.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Reorder } from 'motion/react';
import { ModuleCard } from './ModuleCard';
import { useRackStore } from '../store/rackStore';

vi.mock('./AdvancedEQEditor', () => ({ AdvancedEQEditor: () => <div data-testid="editor-eq" /> }));
vi.mock('./AdvancedCompEditor', () => ({ AdvancedCompEditor: () => <div data-testid="editor-compressor" /> }));
vi.mock('../audio/dsp/Tremolo', () => ({ AdvancedTremoloEditor: () => <div data-testid="editor-tremolo" /> }));
vi.mock('./editors/TapeEmulationEditor', () => ({ TapeEmulationEditor: () => <div data-testid="editor-tape" /> }));
vi.mock('./editors/ReverbUI', () => ({ ReverbUI: () => <div data-testid="editor-reverb" /> }));
vi.mock('./editors/DelayEditor', () => ({ DelayEditor: () => <div data-testid="editor-delay" /> }));
vi.mock('./editors/ChorusEditor', () => ({ ChorusEditor: () => <div data-testid="editor-chorus" /> }));
vi.mock('./editors/FlangerEditor', () => ({ FlangerEditor: () => <div data-testid="editor-flanger" /> }));
vi.mock('./editors/PhaserEditor', () => ({ PhaserEditor: () => <div data-testid="editor-phaser" /> }));
vi.mock('./editors/SaturatorEditor', () => ({ SaturatorEditor: () => <div data-testid="editor-saturator" /> }));
vi.mock('./editors/ImagerEditor', () => ({ ImagerEditor: () => <div data-testid="editor-imager" /> }));
vi.mock('./editors/ClipperEditor', () => ({ ClipperEditor: () => <div data-testid="editor-clipper" /> }));
vi.mock('./editors/LimiterEditor', () => ({ LimiterEditor: () => <div data-testid="editor-limiter" /> }));
vi.mock('./editors/ExciterEditor', () => ({ ExciterEditor: () => <div data-testid="editor-exciter" /> }));

const makeModule = (over: Record<string, unknown> = {}) => ({
  id: 'mod-1234abcd',
  type: 'chorus',
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

describe('ModuleCard coverage', () => {
  beforeEach(() => {
    useRackStore.setState({ routingMode: 'serial' });
    vi.clearAllMocks();
  });

  it('shows the short id hash and enabled gradient bar', () => {
    const { container } = renderCard(makeModule());
    expect(screen.getByText('#mod-')).toBeDefined();
    expect(
      container.querySelector('.from-blue-600.via-yellow-400'),
    ).toBeTruthy();
  });

  it('dims a disabled module and hides its gradient bar', () => {
    const { container } = renderCard(makeModule({ enabled: false }));
    expect(
      container.querySelector('.from-blue-600.via-yellow-400'),
    ).toBeNull();
    expect(container.querySelector('.grayscale-\\[0\\.8\\]')).toBeTruthy();
  });

  it('powers a disabled module back on through onUpdate', () => {
    const module = makeModule({ enabled: false });
    renderCard(module);
    fireEvent.click(screen.getByLabelText('Toggle Power'));
    expect(module.onUpdate).toHaveBeenCalledWith('mod-1234abcd', {
      enabled: true,
    });
  });

  it('renders the unknown-type fallback with no editor and no knobs', () => {
    renderCard(makeModule({ type: 'mystery-box' }));
    expect(screen.getByText('mystery-box')).toBeDefined();
    expect(screen.queryByTestId(/^editor-/)).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('shows -inf dB when the parallel gain is fully down', () => {
    useRackStore.setState({ routingMode: 'parallel' });
    renderCard(makeModule({ parallelGain: -40 }));
    expect(screen.getByText('-∞ dB')).toBeDefined();
  });

  it('formats the parallel gain level otherwise', () => {
    useRackStore.setState({ routingMode: 'parallel' });
    renderCard(makeModule({ parallelGain: -3.25 }));
    expect(screen.getByText('-3.3 dB')).toBeDefined();
  });

  it('labels parallel pan as L / C / R', () => {
    useRackStore.setState({ routingMode: 'parallel' });
    const { rerender } = render(
      <Reorder.Group axis="y" values={[]} onReorder={() => {}}>
        <ModuleCard
          module={makeModule({ parallelPan: -0.5 })}
          onRemove={vi.fn()}
          onDuplicate={vi.fn()}
        />
      </Reorder.Group>,
    );
    expect(screen.getByText('L50')).toBeDefined();
    rerender(
      <Reorder.Group axis="y" values={[]} onReorder={() => {}}>
        <ModuleCard
          module={makeModule({ parallelPan: 0.75 })}
          onRemove={vi.fn()}
          onDuplicate={vi.fn()}
        />
      </Reorder.Group>,
    );
    expect(screen.getByText('R75')).toBeDefined();
    rerender(
      <Reorder.Group axis="y" values={[]} onReorder={() => {}}>
        <ModuleCard
          module={makeModule({ parallelPan: 0 })}
          onRemove={vi.fn()}
          onDuplicate={vi.fn()}
        />
      </Reorder.Group>,
    );
    expect(screen.getByText('C')).toBeDefined();
  });

  it('toggles mute/solo off when already engaged', () => {
    useRackStore.setState({ routingMode: 'parallel' });
    const module = makeModule({ parallelMute: true, parallelSolo: true });
    renderCard(module);
    fireEvent.click(screen.getByText('M'));
    expect(module.onUpdate).toHaveBeenCalledWith('mod-1234abcd', {
      parallelMute: false,
    });
    fireEvent.click(screen.getByText('S'));
    expect(module.onUpdate).toHaveBeenCalledWith('mod-1234abcd', {
      parallelSolo: false,
    });
  });

  it('survives power / mute / knob edits when module.onUpdate is absent', () => {
    useRackStore.setState({ routingMode: 'parallel' });
    const { onUpdate: _omit, ...noUpdate } = makeModule();
    renderCard(noUpdate);
    expect(() => {
      fireEvent.click(screen.getByLabelText('Toggle Power'));
      fireEvent.click(screen.getByText('M'));
      fireEvent.click(screen.getByText('S'));
      fireEvent.keyDown(screen.getByLabelText('P-GAIN'), { key: 'ArrowUp' });
      fireEvent.keyDown(screen.getByLabelText('P-PAN'), { key: 'ArrowDown' });
    }).not.toThrow();
  });

  it('hides the linking hint when no macro slot is selected', () => {
    const onAssignParam = vi.fn();
    const { container } = renderCard(makeModule({ type: 'mystery-box' }), {
      isLinkingMode: true,
      selectedMacroIndex: null,
      onAssignParam,
    });
    expect(screen.queryByText(/Click any/i)).toBeNull();
    expect(
      container.querySelector('.bg-orange-500.rounded-full.animate-pulse'),
    ).toBeNull();
    // Clicking the (empty) knob area without a selected slot assigns nothing.
    const knobArea = container.querySelector('.flex.flex-wrap');
    if (knobArea) fireEvent.click(knobArea as HTMLElement);
    expect(onAssignParam).not.toHaveBeenCalled();
  });

  it('defaults onAssignParam to a no-op when linking without a handler', () => {
    // isLinkingMode + slot but no onAssignParam prop: chorus renders an editor
    // (no knob wrappers), so nothing explodes on background clicks.
    renderCard(makeModule(), { isLinkingMode: true, selectedMacroIndex: 2 });
    expect(screen.getByText(/Macro 3/)).toBeDefined();
  });
});
