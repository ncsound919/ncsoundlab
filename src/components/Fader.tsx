/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StudioFader, type StudioFaderProps } from './studio/StudioControls';

export type FaderProps = StudioFaderProps;

/**
 * Desktop adapter for the shared studio fader: absolute positioning, metal
 * cap, accent rule and the same palette as the phone apps.
 */
export function Fader(props: FaderProps) {
  return <StudioFader {...props} />;
}
