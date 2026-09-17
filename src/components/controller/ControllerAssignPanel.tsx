/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Binding editor for a single control. Everything a mapping needs — action,
 * MIDI message signature, range/curve, learn — lives here.
 */

import React, { useMemo } from 'react';
import { Radio, Eraser, Power } from 'lucide-react';
import { catalogForContext, describeAction, isContinuousAction } from '../../lib/controller/actions';
import { parseControlKey, describeMessage } from '../../lib/controller/mapping';
import { useControllerStore } from '../../store/controllerStore';
import type { ActionGroup } from '../../lib/controller/actions';
import type { MidiMessageType } from '../../lib/controller/types';

const MESSAGE_TYPES: { value: MidiMessageType; label: string }[] = [
  { value: 'note', label: 'Note' },
  { value: 'cc', label: 'CC' },
  { value: 'realtime', label: 'Transport' },
  { value: 'program', label: 'Program' },
  { value: 'pitchbend', label: 'Pitch bend' },
  { value: 'aftertouch', label: 'Aftertouch' },
];

const GROUP_ORDER: ActionGroup[] = [
  'Pads', 'Chord Pads', 'Chord Controls', 'Transport', 'Banks', 'Tempo', 'Mix', 'Layer', 'Sound Design', 'Synth', 'Pattern', 'Groove',
];

interface ControllerAssignPanelProps {
  selected: string | null;
  learnTarget: string | null;
  onStartLearn: (key: string) => void;
}

export const ControllerAssignPanel: React.FC<ControllerAssignPanelProps> = ({ selected, learnTarget, onStartLearn }) => {
  const profile = useControllerStore((s) => s.profile);
  const setBinding = useControllerStore((s) => s.setBinding);
  const clearBinding = useControllerStore((s) => s.clearBinding);
  const cancelLearn = useControllerStore((s) => s.cancelLearn);

  const parsed = selected ? parseControlKey(selected) : null;

  const catalog = useMemo(
    () => catalogForContext({ padPage: parsed?.kind === 'pad' ? parsed.page : 0 }),
    [parsed?.kind, parsed?.page]
  );

  const grouped = useMemo(() => {
    const map = new Map<ActionGroup, typeof catalog>();
    for (const def of catalog) {
      const arr = map.get(def.group) ?? [];
      arr.push(def);
      map.set(def.group, arr);
    }
    return map;
  }, [catalog]);

  if (!selected || !parsed) {
    return (
      <div className="bg-[#0f0f12] border border-[#1e293b] rounded-xl p-3 text-[10px] font-mono text-slate-500" data-controller-assign>
        Click a pad, knob, fader, switch or transport button on the controller above to edit its mapping.
      </div>
    );
  }

  const binding = profile.bindings[selected];
  const action = binding?.action ?? '';
  const continuous = action ? isContinuousAction(action) : false;
  const learning = learnTarget === selected;

  const patch = (p: Parameters<typeof setBinding>[1]) => setBinding(selected, p);

  return (
    <div className="bg-[#0f0f12] border border-[#1e293b] rounded-xl p-3 space-y-3" data-controller-assign>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-wider text-cyan-300 truncate">
            {parsed.kind} {parsed.kind !== 'transport' ? Number(parsed.index) + 1 : parsed.index}
          </div>
          <div className="text-[9px] font-mono text-slate-500 truncate">
            {binding ? describeMessage(binding) : 'unbound'}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onStartLearn(selected)}
            className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 ${
              learning ? 'bg-fuchsia-500/30 border-fuchsia-400 text-fuchsia-200 animate-pulse' : 'bg-[#121215] border-[#1e293b] text-fuchsia-300 hover:border-fuchsia-400'
            }`}
            title="Arm MIDI-learn, then move the control on your device"
          >
            <Radio size={10} /> {learning ? 'Listening…' : 'Learn'}
          </button>
          {learning && (
            <button type="button" onClick={cancelLearn} className="px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider border border-[#1e293b] text-slate-400 hover:text-white">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Action */}
      <label className="block space-y-1">
        <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">Action</span>
        <select
          value={action}
          onChange={(e) => patch({ action: e.target.value, enabled: true })}
          className="w-full bg-[#0a0a0c] border border-[#1e293b] rounded px-2 py-1 text-[10px] font-mono text-white"
        >
          <option value="">— unbound —</option>
          {GROUP_ORDER.map((group) => {
            const defs = grouped.get(group);
            if (!defs) return null;
            return (
              <optgroup key={group} label={group}>
                {defs.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>

      {/* Message signature */}
      <div className="grid grid-cols-3 gap-2">
        <label className="block space-y-1">
          <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">Type</span>
          <select
            value={binding?.messageType ?? 'cc'}
            onChange={(e) => patch({ messageType: e.target.value as MidiMessageType })}
            className="w-full bg-[#0a0a0c] border border-[#1e293b] rounded px-2 py-1 text-[10px] font-mono text-white"
          >
            {MESSAGE_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">
            {binding?.messageType === 'realtime' ? 'Command' : 'Number'}
          </span>
          {binding?.messageType === 'realtime' ? (
            <select
              value={binding.number ?? 0}
              onChange={(e) => patch({ number: Number(e.target.value) })}
              className="w-full bg-[#0a0a0c] border border-[#1e293b] rounded px-2 py-1 text-[10px] font-mono text-white"
            >
              <option value={0}>Start</option>
              <option value={1}>Continue</option>
              <option value={2}>Stop</option>
            </select>
          ) : (
            <input
              type="number"
              min={0}
              max={127}
              value={binding?.number ?? 0}
              onChange={(e) => patch({ number: Math.max(0, Math.min(127, parseInt(e.target.value) || 0)) })}
              className="w-full bg-[#0a0a0c] border border-[#1e293b] rounded px-2 py-1 text-[10px] font-mono text-white"
            />
          )}
        </label>
        <label className="block space-y-1">
          <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">Channel</span>
          <input
            type="number"
            min={0}
            max={16}
            placeholder="any"
            value={binding?.channel ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              patch({ channel: v === '' ? null : Math.max(1, Math.min(16, parseInt(v) || 1)) });
            }}
            className="w-full bg-[#0a0a0c] border border-[#1e293b] rounded px-2 py-1 text-[10px] font-mono text-white"
          />
        </label>
      </div>

      {continuous && (
        <div className="grid grid-cols-4 gap-2 items-end">
          <label className="block space-y-1">
            <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">Min</span>
            <input
              type="number"
              value={binding?.min ?? 0}
              onChange={(e) => patch({ min: Number(e.target.value) })}
              className="w-full bg-[#0a0a0c] border border-[#1e293b] rounded px-2 py-1 text-[10px] font-mono text-white"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">Max</span>
            <input
              type="number"
              value={binding?.max ?? 1}
              onChange={(e) => patch({ max: Number(e.target.value) })}
              className="w-full bg-[#0a0a0c] border border-[#1e293b] rounded px-2 py-1 text-[10px] font-mono text-white"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">Curve</span>
            <select
              value={binding?.curve ?? 'linear'}
              onChange={(e) => patch({ curve: e.target.value as 'linear' | 'log' })}
              className="w-full bg-[#0a0a0c] border border-[#1e293b] rounded px-2 py-1 text-[10px] font-mono text-white"
            >
              <option value="linear">Linear</option>
              <option value="log">Log</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 pb-1.5 text-[9px] font-mono uppercase text-slate-400">
            <input
              type="checkbox"
              checked={binding?.invert === true}
              onChange={(e) => patch({ invert: e.target.checked })}
              className="accent-fuchsia-400"
            />
            Invert
          </label>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#1e293b]">
        <button
          type="button"
          onClick={() => patch({ enabled: !(binding?.enabled ?? true) })}
          className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 ${
            binding?.enabled ?? true ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-[#121215] border-[#1e293b] text-slate-500'
          }`}
        >
          <Power size={10} /> {binding?.enabled ?? true ? 'Enabled' : 'Disabled'}
        </button>
        <span className="text-[9px] font-mono text-slate-600 truncate">
          {action ? describeAction(action).label : 'No action'}
        </span>
        <button
          type="button"
          onClick={() => { clearBinding(selected); cancelLearn(); }}
          className="px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider border border-[#1e293b] text-red-400 hover:border-red-500/50 flex items-center gap-1"
        >
          <Eraser size={10} /> Clear
        </button>
      </div>
    </div>
  );
};

export default ControllerAssignPanel;
