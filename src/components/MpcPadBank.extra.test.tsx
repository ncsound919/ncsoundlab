/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Interaction tests for the `MpcPadBank` component (the pad grid + MPC
 * control strip). The existing `MpcPadBank.test.tsx` covers the pure helpers;
 * these cover the render/pointer/control paths.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { MpcPadBank, PadEntry, VelocityCurve } from './MpcPadBank';
import type { BankId } from '../store/sequencerStore';

const rect = {
  top: 0,
  bottom: 100,
  left: 0,
  right: 100,
  width: 100,
  height: 100,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

type Props = Parameters<typeof MpcPadBank>[0];

function makeEntry(id: string, name = id, type = 'Kick'): PadEntry {
  return { layerId: id, name, type };
}

function makeEntries(count = 16): (PadEntry | null)[] {
  return Array.from({ length: count }, (_, i) => (i === 0 ? makeEntry('layer-1', 'Kick') : null));
}

function makeProps(overrides: Partial<Props> = {}): Props {
  const calls = {
    onBankChange: vi.fn(),
    onSelectPad: vi.fn(),
    onSetSwing: vi.fn(),
    onSetPocket: vi.fn(),
    onSetTune: vi.fn(),
    onSetChoke: vi.fn(),
    onTogglePadMute: vi.fn(),
    onClearPad: vi.fn(),
    onAssignActiveLayer: vi.fn(),
    onSetGlobalSwing: vi.fn(),
    onTriggerPad: vi.fn(),
    onPadInput: vi.fn(),
    onNoteRepeatChange: vi.fn(),
    onSixteenLevelsChange: vi.fn(),
    onFullLevelChange: vi.fn(),
    onVelocityCurveChange: vi.fn(),
    onSetTimeCorrect: vi.fn(),
    onQuantize: vi.fn(),
    onPadDrop: vi.fn(),
  };
  const base: Props = {
    entries: makeEntries(),
    activeBank: 'A',
    selectedPad: 0,
    focusedLayerId: 'layer-1',
    padSwing: { 'layer-1': 10 },
    padPocket: { 'layer-1': -5 },
    padTune: { 'layer-1': 3 },
    padChoke: { 'layer-1': 2 },
    padMuted: { 'layer-1': false },
    bpm: 120,
    noteRepeat: { active: false, division: 4 },
    sixteenLevels: false,
    globalSwing: 50,
    fullLevel: false,
    velocityCurve: 'linear',
    timeCorrect: 1,
    ...calls,
    ...overrides,
  };
  return base;
}

function getPads(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button')).filter((b) =>
    b.className.includes('aspect-[4/3]')
  ) as HTMLButtonElement[];
}

function setRect(el: HTMLElement): void {
  (el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => rect;
}

function findRow(label: string, container: HTMLElement): HTMLElement {
  const span = Array.from(container.querySelectorAll('span')).find((s) => s.textContent === label);
  if (!span) throw new Error(`row label not found: ${label}`);
  return span.parentElement as HTMLElement;
}

function findSection(label: string, container: HTMLElement): HTMLElement {
  const span = Array.from(container.querySelectorAll('span')).find((s) => s.textContent === label);
  if (!span) throw new Error(`section label not found: ${label}`);
  let node = span;
  for (let i = 0; i < 8 && node; i++) {
    node = node.parentElement as HTMLElement;
    if (node && (node.className.includes('space-y-1.5') || node.className.includes('space-y-2.5'))) {
      return node;
    }
  }
  throw new Error(`no section container for: ${label}`);
}

describe('MpcPadBank interactions', () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture = vi.fn() as never;
    Element.prototype.hasPointerCapture = vi.fn(() => true) as never;
    Element.prototype.releasePointerCapture = vi.fn() as never;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the four bank tabs and switches programs', () => {
    const props = makeProps();
    const { container } = render(<MpcPadBank {...props} />);
    expect(container.querySelector('div')?.textContent).toBeDefined();
    for (const label of ['A', 'B', 'C', 'D']) {
      fireEvent.click(screen.getByRole('button', { name: label }));
    }
    expect(props.onBankChange).toHaveBeenCalledTimes(4);
    expect(props.onBankChange).toHaveBeenLastCalledWith('D');
    expect(screen.getByText(/Program A/i)).toBeDefined();
  });

  it('renders filled and empty pads, then triggers a pad on pointer-down', () => {
    const props = makeProps();
    const { container } = render(<MpcPadBank {...props} />);
    const pads = getPads(container);
    expect(pads).toHaveLength(16);

    // Pad 0 is filled: pointer down computes velocity from clientY.
    setRect(pads[0]);
    fireEvent.pointerDown(pads[0], { pointerId: 1, clientY: 25 });
    expect(props.onSelectPad).toHaveBeenCalledWith(0);
    expect((props.onTriggerPad as any)).toHaveBeenCalledWith('layer-1', 3, expect.closeTo(0.75, 3));
    expect(props.onPadInput).toHaveBeenCalledWith('layer-1', expect.closeTo(0.75, 3));

    fireEvent.pointerUp(pads[0], { pointerId: 1 });
    expect(Element.prototype.releasePointerCapture).toHaveBeenCalled();

    // Pointer leave stops any note repeat.
    fireEvent.pointerDown(pads[0], { pointerId: 1, clientY: 25 });
    fireEvent.pointerLeave(pads[0]);
    fireEvent.pointerCancel(pads[0], { pointerId: 1 });
    fireEvent.contextMenu(pads[0]);
  });

  it('empty pads only select and never trigger audio', () => {
    const props = makeProps({ entries: Array.from({ length: 16 }, () => null) });
    const { container } = render(<MpcPadBank {...props} />);
    const pads = getPads(container);
    setRect(pads[0]);
    fireEvent.pointerDown(pads[0], { pointerId: 1, clientY: 50 });
    expect(props.onSelectPad).toHaveBeenCalledWith(0);
    expect((props.onTriggerPad as any)).not.toHaveBeenCalled();
    expect(props.onPadInput).not.toHaveBeenCalled();
    expect(screen.getByText(/Empty pad/i)).toBeDefined();

    // Empty pad drag-and-drop of a library sample assigns the slot.
    fireEvent.dragOver(pads[0], { dataTransfer: { types: ['application/x-ncsoundlab-sample'], dropEffect: 'copy' } });
    fireEvent.drop(pads[0], { dataTransfer: { getData: () => 'sample-abc' } });
    expect(props.onPadDrop).toHaveBeenCalledWith('sample-abc', 0);
  });

  it('only assigns a filled pad on drop when a sample id is present', () => {
    const onPadDrop = vi.fn();
    const props = makeProps({ onPadDrop });
    const { container } = render(<MpcPadBank {...props} />);
    const pads = getPads(container);

    // Drag over with a non-sample mime: no effect.
    fireEvent.dragOver(pads[0], { dataTransfer: { types: ['text/plain'], dropEffect: 'copy' } });
    // Drop without a sample id: no assignment.
    fireEvent.drop(pads[0], { dataTransfer: { getData: () => '' } });
    expect(onPadDrop).not.toHaveBeenCalled();

    // Drop with a sample id: assignment happens.
    fireEvent.drop(pads[0], { dataTransfer: { getData: () => 'sample-abc' } });
    expect(onPadDrop).toHaveBeenCalledWith('sample-abc', 0);
  });

  it('tolerates a missing onPadDrop handler', () => {
    const props = makeProps({ onPadDrop: undefined });
    const { container } = render(<MpcPadBank {...props} />);
    const pads = getPads(container);
    fireEvent.dragOver(pads[1], { dataTransfer: { types: ['text/plain'], dropEffect: 'copy' } });
    fireEvent.drop(pads[1], { dataTransfer: { getData: () => 'sample-abc' } });
    // Empty pad with no handler simply ignores the drop.
    expect(() => fireEvent.drop(pads[0], { dataTransfer: { getData: () => 'sample-abc' } })).not.toThrow();
  });

  it('toggles mute, clears, and assigns the active layer', () => {
    const props = makeProps();
    render(<MpcPadBank {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(props.onTogglePadMute).toHaveBeenCalledWith('layer-1');

    fireEvent.click(screen.getByRole('button', { name: 'Clear Pad' }));
    expect(props.onClearPad).toHaveBeenCalledWith(0);

    fireEvent.click(screen.getByRole('button', { name: 'Set Pad ← Active Layer' }));
    expect(props.onAssignActiveLayer).toHaveBeenCalledWith(0);
  });

  it('shows Unmute and disables triggering for a muted pad', () => {
    const props = makeProps({ padMuted: { 'layer-1': true } });
    const { container } = render(<MpcPadBank {...props} />);
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeDefined();

    const pads = getPads(container);
    setRect(pads[0]);
    fireEvent.pointerDown(pads[0], { pointerId: 1, clientY: 25 });
    expect((props.onTriggerPad as any)).not.toHaveBeenCalled();
    expect(props.onPadInput).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(props.onTogglePadMute).toHaveBeenCalledWith('layer-1');
  });

  it('toggles 16 levels, full level, and the velocity curve', () => {
    const props = makeProps();
    render(<MpcPadBank {...props} />);

    fireEvent.click(within(findRow('16 Levels', document.body)).getByRole('button'));
    expect(props.onSixteenLevelsChange).toHaveBeenCalledWith(true);

    fireEvent.click(within(findRow('Full Level', document.body)).getByRole('button'));
    expect(props.onFullLevelChange).toHaveBeenCalledWith(true);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'log' } });
    expect(props.onVelocityCurveChange).toHaveBeenCalledWith('log');
  });

  it('edits per-pad swing, pocket, tune, choke, and global swing', () => {
    const props = makeProps();
    render(<MpcPadBank {...props} />);

    fireEvent.change(screen.getByLabelText('Per-pad swing'), { target: { value: '40' } });
    expect(props.onSetSwing).toHaveBeenCalledWith('layer-1', 40);

    fireEvent.change(screen.getByLabelText('Per-pad pocket'), { target: { value: '12' } });
    expect(props.onSetPocket).toHaveBeenCalledWith('layer-1', 12);

    fireEvent.change(screen.getByLabelText('Per-pad tune (semitones)'), { target: { value: '-7' } });
    expect(props.onSetTune).toHaveBeenCalledWith('layer-1', -7);

    const chokeSection = findSection('Choke Group', document.body);
    fireEvent.click(within(chokeSection).getByRole('button', { name: '3' }));
    expect(props.onSetChoke).toHaveBeenCalledWith('layer-1', 3);

    fireEvent.change(screen.getByLabelText('Global swing'), { target: { value: '60' } });
    expect(props.onSetGlobalSwing).toHaveBeenCalledWith(60);
  });

  it('changes note repeat division and time correct resolution', () => {
    const props = makeProps();
    render(<MpcPadBank {...props} />);

    fireEvent.click(within(findRow('Note Repeat', document.body)).getByRole('button'));
    expect(props.onNoteRepeatChange).toHaveBeenCalledWith({ active: true, division: 4 });

    const nrSection = findSection('Note Repeat', document.body);
    fireEvent.click(within(nrSection).getByRole('button', { name: '1/32' }));
    expect(props.onNoteRepeatChange).toHaveBeenCalledWith({ active: false, division: 8 });

    const tcSection = findSection('Time Correct', document.body);
    fireEvent.click(within(tcSection).getByRole('button', { name: '1/8' }));
    expect(props.onSetTimeCorrect).toHaveBeenCalledWith(2);

    fireEvent.click(within(tcSection).getByRole('button', { name: 'Quantize Pattern' }));
    expect(props.onQuantize).toHaveBeenCalled();
  });

  it('disables per-pad controls when no pad is selected', () => {
    const props = makeProps({ entries: Array.from({ length: 16 }, () => null) });
    render(<MpcPadBank {...props} />);

    expect(screen.getByRole('button', { name: 'Mute' })).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Per-pad swing')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Per-pad pocket')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Per-pad tune (semitones)')).toHaveProperty('disabled', true);

    // Global swing stays enabled regardless.
    fireEvent.change(screen.getByLabelText('Global swing'), { target: { value: '25' } });
    expect(props.onSetGlobalSwing).toHaveBeenCalledWith(25);
  });

  it('renders 16-level mode with per-pad level labels and triggers by level', () => {
    const props = makeProps({ sixteenLevels: true });
    const { container } = render(<MpcPadBank {...props} />);
    const pads = getPads(container);
    expect(pads).toHaveLength(16);

    setRect(pads[5]);
    fireEvent.pointerDown(pads[5], { pointerId: 1, clientY: 50 });
    expect((props.onTriggerPad as any)).toHaveBeenCalledWith('layer-1', 5, expect.closeTo(0.5, 3));
    expect(pads[5].textContent).toContain('LVL');
  });

  it('falls back to the global swing/tune values and shows focus indicator', () => {
    const props = makeProps({
      padSwing: {},
      padPocket: {},
      padTune: {},
      padChoke: {},
      focusedLayerId: 'layer-1',
    });
    const { container } = render(<MpcPadBank {...props} />);
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0); // global swing fallback
    const pads = getPads(container);
    expect(pads[0].title).toContain('active layer');
    expect(pads[0].className).toContain('outline');
  });

  it('repeats notes at the note-repeat interval while held', () => {
    vi.useFakeTimers();
    const props = makeProps({ noteRepeat: { active: true, division: 4 }, bpm: 120 });
    const { container } = render(<MpcPadBank {...props} />);
    const pads = getPads(container);
    setRect(pads[0]);

    fireEvent.pointerDown(pads[0], { pointerId: 1, clientY: 25 });
    // Initial trigger from the pointer-down.
    expect((props.onTriggerPad as any)).toHaveBeenCalledWith('layer-1', 3, expect.closeTo(0.75, 3));

    vi.advanceTimersByTime(500); // 125ms interval -> ~4 repeat triggers
    const repeatCalls = (props.onTriggerPad as any).mock.calls.filter((c) => c[2] === 1).length;
    expect(repeatCalls).toBeGreaterThanOrEqual(3);

    fireEvent.pointerUp(pads[0], { pointerId: 1 });
    const callsAfterUp = (props.onTriggerPad as any).mock.calls.length;
    vi.advanceTimersByTime(500);
    expect((props.onTriggerPad as any).mock.calls.length).toBe(callsAfterUp);
  });

  it('does not start note repeat when the feature is off', () => {
    vi.useFakeTimers();
    const props = makeProps({ noteRepeat: { active: false, division: 4 } });
    const { container } = render(<MpcPadBank {...props} />);
    const pads = getPads(container);
    setRect(pads[0]);

    fireEvent.pointerDown(pads[0], { pointerId: 1, clientY: 25 });
    vi.advanceTimersByTime(500);
    const repeatCalls = (props.onTriggerPad as any).mock.calls.filter((c) => c[2] === 1).length;
    expect(repeatCalls).toBe(0);
  });

  it('re-tempos an active repeat when the BPM changes', () => {
    vi.useFakeTimers();
    const props = makeProps({ noteRepeat: { active: true, division: 4 }, bpm: 120 });
    const { container, rerender } = render(<MpcPadBank {...props} />);
    const pads = getPads(container);
    setRect(pads[0]);

    fireEvent.pointerDown(pads[0], { pointerId: 1, clientY: 25 });
    (props.onTriggerPad as any).mockClear();

    const next = makeProps({ noteRepeat: { active: true, division: 4 }, bpm: 60 });
    rerender(<MpcPadBank {...next} />);
    // 60000/60/4 = 250ms interval.
    vi.advanceTimersByTime(750);
    expect((next.onTriggerPad as any).mock.calls.filter((c) => c[2] === 1).length).toBeGreaterThanOrEqual(2);
  });

  it('clears any running repeat on unmount', () => {
    vi.useFakeTimers();
    const props = makeProps({ noteRepeat: { active: true, division: 4 } });
    const { container, unmount } = render(<MpcPadBank {...props} />);
    const pads = getPads(container);
    setRect(pads[0]);

    fireEvent.pointerDown(pads[0], { pointerId: 1, clientY: 25 });
    (props.onTriggerPad as any).mockClear();
    unmount();
    vi.advanceTimersByTime(1000);
    expect((props.onTriggerPad as any)).not.toHaveBeenCalled();
  });

  it('renders an exponential velocity curve pad hit correctly', () => {
    const props = makeProps({ velocityCurve: 'exponential' as VelocityCurve });
    const { container } = render(<MpcPadBank {...props} />);
    const pads = getPads(container);
    setRect(pads[0]);
    fireEvent.pointerDown(pads[0], { pointerId: 1, clientY: 50 });
    // t = 0.5, t^2 = 0.25
    expect((props.onTriggerPad as any)).toHaveBeenCalledWith('layer-1', 3, expect.closeTo(0.25, 3));
  });

  it('renders full-level pads at velocity 1', () => {
    const props = makeProps({ fullLevel: true });
    const { container } = render(<MpcPadBank {...props} />);
    const pads = getPads(container);
    setRect(pads[0]);
    fireEvent.pointerDown(pads[0], { pointerId: 1, clientY: 25 });
    expect((props.onTriggerPad as any)).toHaveBeenCalledWith('layer-1', 3, 1);
  });
});
