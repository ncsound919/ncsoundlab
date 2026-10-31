/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StudioKnob } from './studio/StudioControls';

export interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  size?: number;
  color?: string;
  defaultValue?: number;          // reset on double-click, defaults to min if not provided
  onChange: (value: number) => void;
  className?: string;
}

/**
 * Desktop adapter for the shared studio knob. The implementation, palette and
 * 270-degree geometry live in `components/studio/StudioControls.tsx` so Sound
 * Lab matches NC Studio and NC Phone Beat.
 */
export function Knob(props: KnobProps) {
  return <StudioKnob {...props} />;
}
