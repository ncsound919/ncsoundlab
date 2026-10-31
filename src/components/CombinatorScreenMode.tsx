/**
 * @license SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from 'react';
import { CombinatorXYPad } from './CombinatorXYPad';

interface Props {
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
  recording?: boolean;
  onRecordToggle?: () => void;
}

export const CombinatorScreenMode: React.FC<Props> = ({ x, y, onChange, recording, onRecordToggle }) => {
  const [landscape] = useState(true);
  return (
    <div className={`fixed inset-0 z-[120] bg-black flex flex-col items-center justify-center gap-4 p-4 ${landscape ? '' : ''}`}>
      <div className="text-yellow-400 text-sm font-bold uppercase tracking-widest">Screen Mode — Sound Shifting</div>
      <CombinatorXYPad x={x} y={y} onChange={onChange} recording={recording} onRecordToggle={onRecordToggle} labelX="Shift X" labelY="Shift Y" />
    </div>
  );
};
