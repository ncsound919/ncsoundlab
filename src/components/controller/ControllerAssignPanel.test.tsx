/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ControllerAssignPanel } from './ControllerAssignPanel';
import { createDefaultMpd226Profile } from '../../lib/controller/defaultMpd226';
import { useControllerStore } from '../../store/controllerStore';

beforeEach(() => {
  localStorage.clear();
  useControllerStore.getState().setProfile(createDefaultMpd226Profile());
  useControllerStore.getState().cancelLearn();
});

describe('ControllerAssignPanel', () => {
  it('prompts when nothing is selected', () => {
    render(<ControllerAssignPanel selected={null} learnTarget={null} onStartLearn={vi.fn()} />);
    expect(screen.getByText(/Click a pad, knob, fader/)).toBeTruthy();
  });

  it('edits the selected binding action', () => {
    const { container } = render(<ControllerAssignPanel selected="knob:0:0" learnTarget={null} onStartLearn={vi.fn()} />);
    expect(screen.getByText('knob 1')).toBeTruthy();
    const actionSelect = container.querySelector('select')!;
    fireEvent.change(actionSelect, { target: { value: 'transport:play' } });
    expect(useControllerStore.getState().profile.bindings['knob:0:0'].action).toBe('transport:play');
    // A trigger action hides the range controls.
    expect(screen.queryByText('Min')).toBeNull();
  });

  it('shows range controls for continuous actions and edits them', () => {
    const { container } = render(<ControllerAssignPanel selected="knob:0:0" learnTarget={null} onStartLearn={vi.fn()} />);
    expect(screen.getByText('Min')).toBeTruthy();
    const [minInput] = screen.getAllByDisplayValue(/^200$|^18000$/);
    fireEvent.change(minInput, { target: { value: '300' } });
    expect(useControllerStore.getState().profile.bindings['knob:0:0'].min).toBe(300);

    fireEvent.click(container.querySelector('input[type="checkbox"]')!);
    expect(useControllerStore.getState().profile.bindings['knob:0:0'].invert).toBe(true);
  });

  it('changes the message type and number', () => {
    const { container } = render(<ControllerAssignPanel selected="knob:0:0" learnTarget={null} onStartLearn={vi.fn()} />);
    const selects = container.querySelectorAll('select');
    fireEvent.change(selects[1], { target: { value: 'note' } });
    expect(useControllerStore.getState().profile.bindings['knob:0:0'].messageType).toBe('note');

    const numberInput = container.querySelector('input[type="number"]')!;
    fireEvent.change(numberInput, { target: { value: '55' } });
    expect(useControllerStore.getState().profile.bindings['knob:0:0'].number).toBe(55);
  });

  it('toggles enabled, arms learn, and clears', () => {
    const onStartLearn = vi.fn();
    render(<ControllerAssignPanel selected="knob:0:1" learnTarget={null} onStartLearn={onStartLearn} />);

    fireEvent.click(screen.getByRole('button', { name: /enabled/i }));
    expect(useControllerStore.getState().profile.bindings['knob:0:1'].enabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /learn/i }));
    expect(onStartLearn).toHaveBeenCalledWith('knob:0:1');

    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(useControllerStore.getState().profile.bindings['knob:0:1']).toBeUndefined();
  });

  it('shows a cancel button while listening', () => {
    render(<ControllerAssignPanel selected="knob:0:2" learnTarget="knob:0:2" onStartLearn={vi.fn()} />);
    expect(screen.getByText('Listening…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(useControllerStore.getState().learnTarget).toBeNull();
  });

  it('handles transport and realtime command selection', () => {
    const { container } = render(
      <ControllerAssignPanel selected="transport:0:rt-start" learnTarget={null} onStartLearn={vi.fn()} />
    );
    const selects = container.querySelectorAll('select');
    // Realtime transport bindings render a Command dropdown rather than a number input.
    expect(selects.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Command')).toBeTruthy();
    fireEvent.change(selects[selects.length - 1], { target: { value: '2' } });
    expect(useControllerStore.getState().profile.bindings['transport:0:rt-start'].number).toBe(2);
  });

  it('edits the channel filter, curve and inverted flag', () => {
    const { container } = render(<ControllerAssignPanel selected="knob:0:0" learnTarget={null} onStartLearn={vi.fn()} />);
    const channel = container.querySelectorAll('input[type="number"]')[1]!;
    fireEvent.change(channel, { target: { value: '4' } });
    expect(useControllerStore.getState().profile.bindings['knob:0:0'].channel).toBe(4);
    fireEvent.change(channel, { target: { value: '' } });
    expect(useControllerStore.getState().profile.bindings['knob:0:0'].channel).toBeNull();

    const curve = container.querySelectorAll('select')[2]!;
    fireEvent.change(curve, { target: { value: 'log' } });
    expect(useControllerStore.getState().profile.bindings['knob:0:0'].curve).toBe('log');
  });

  it('re-enables a disabled binding', () => {
    useControllerStore.getState().setBinding('knob:0:0', { enabled: false });
    render(<ControllerAssignPanel selected="knob:0:0" learnTarget={null} onStartLearn={vi.fn()} />);
    expect(screen.getByRole('button', { name: /disabled/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /disabled/i }));
    expect(useControllerStore.getState().profile.bindings['knob:0:0'].enabled).toBe(true);
  });
});
