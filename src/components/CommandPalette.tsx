/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ⌘/Ctrl+K command palette.
 *
 * The fastest path to any action: jump to a screen or sub-tab, add/duplicate a
 * layer, toggle mute/solo, set transport, export. Commands are supplied by App
 * (each carries a `run` closure); this component only handles search, keyboard
 * navigation and rendering.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import { filterCommands, COMMAND_GROUP_ORDER, type Command } from '../lib/commands';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, commands }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const results = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActive(0);
      // Focus after paint so the input exists.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-command-index="${active}"]`);
    // scrollIntoView is not implemented in jsdom; guard so tests/older envs pass.
    node?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  if (!isOpen) return null;

  const runAt = (index: number) => {
    const command = results[index];
    if (!command) return;
    onClose();
    command.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runAt(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = '';

  return (
    <div
      className="fixed inset-0 z-[140] flex items-start justify-center pt-[12vh] px-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#0d0d11] border border-[#2a2a35] rounded-2xl shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e293b] bg-black">
          <Search size={16} className="text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command…  (jump, add layer, mute, export)"
            aria-label="Command palette search"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none"
          />
          <kbd className="hidden sm:inline text-[9px] font-mono text-slate-500 border border-[#2a2a35] rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto custom-scrollbar p-2" role="listbox" aria-label="Commands">
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-[11px] text-slate-500 font-mono">No matching commands</div>
          ) : (
            results.map((command, index) => {
              const showGroup = command.group !== lastGroup;
              lastGroup = command.group;
              const isActive = index === active;
              return (
                <React.Fragment key={command.id}>
                  {showGroup && (
                    <div className="px-2 pt-2 pb-1 text-[9px] font-black uppercase tracking-widest text-cyan-500/80">
                      {COMMAND_GROUP_ORDER.includes(command.group) ? command.group : 'Other'}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    data-command-index={index}
                    data-command-id={command.id}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => runAt(index)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      isActive ? 'bg-[#12203a] text-white' : 'text-slate-300 hover:bg-[#141419]'
                    }`}
                  >
                    <span className="text-[12px] font-bold truncate">{command.label}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      {command.hint && <span className="text-[9px] font-mono text-slate-500">{command.hint}</span>}
                      {isActive && <CornerDownLeft size={12} className="text-cyan-400" />}
                    </span>
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
