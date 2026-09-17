/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Standalone MIDI controller panel: owns its engine subscription and renders
 * the shared `ControllerPanelView`. Prefer the App-level `ControllerHost`
 * (single subscription across sections); use this only where a self-contained
 * panel is wanted.
 */

import React from 'react';
import { useControllerMidi } from './useControllerMidi';
import { ControllerPanelView } from './ControllerPanelView';
import type { ControllerHandlers } from '../../lib/controller/actions';

interface ControllerPanelProps {
  handlers: ControllerHandlers;
}

export const ControllerPanel: React.FC<ControllerPanelProps> = ({ handlers }) => {
  const midi = useControllerMidi(handlers);
  return <ControllerPanelView handlers={handlers} midi={midi} />;
};

export default ControllerPanel;
