import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Keyboard, Sparkles } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutCategory {
  title: string;
  items: { keys: string[]; description: string }[];
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: 'Playback & Preview',
    items: [
      { keys: ['Space'], description: 'Play / Stop the master mix' },
      { keys: ['Shift', 'Space'], description: 'Preview the full master mix' },
    ]
  },
  {
    title: 'Layer Management',
    items: [
      { keys: ['M'], description: 'Toggle Mute on selected layer' },
      { keys: ['S'], description: 'Toggle Solo on selected layer' },
      { keys: ['Del / ⌫'], description: 'Delete the selected layer' },
      { keys: ['1', '2', '3', '…'], description: 'Quick-select layer 1 through 8' },
    ]
  },
  {
    title: 'Patterns',
    items: [
      { keys: ['A', 'B', 'C', 'D'], description: 'Switch active pattern' },
    ]
  },
  {
    title: 'Performance',
    items: [
      { keys: ['Z S X D C …'], description: 'Trigger the 16 pads (MPC-style key band)' },
      { keys: ['A W S E …'], description: 'Piano-row notes (scale-lock + chord mode aware)' },
      { keys: ['Shift', 'Key'], description: '16-levels velocity on pad keys' },
    ]
  },
  {
    title: 'Workflow & History',
    items: [
      { keys: ['Ctrl / ⌘', 'Z'], description: 'Undo last sound layer change' },
      { keys: ['Ctrl / ⌘', 'Y'], description: 'Redo previously undone change' },
      { keys: ['Ctrl / ⌘', 'S'], description: 'Open Save / Project Manager' },
      { keys: ['Ctrl / ⌘', 'N'], description: 'New session (clears the workspace)' },
      { keys: ['← / →'], description: 'Move between production stages' },
      { keys: ['?'], description: 'Open / Close this keyboard shortcuts guide' },
      { keys: ['Esc'], description: 'Close any open window' },
    ]
  }
];

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Keyboard Shortcuts">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-[#0f0f13] border border-[#22222a] rounded-2xl p-6 w-full max-w-2xl shadow-2xl space-y-6 relative text-white"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#1d1d26] pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
                <Keyboard size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Keyboard Shortcuts <Sparkles size={14} className="text-amber-400" />
                </h3>
                <p className="text-xs text-gray-400 font-mono">Speed up sound design with studio hotkeys</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[#1a1a22] text-gray-400 hover:text-white hover:bg-[#252530] transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Grid Categories */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {SHORTCUT_CATEGORIES.map((cat, idx) => (
              <div key={idx} className="space-y-3">
                <h4 className="text-[11px] font-bold text-amber-400 uppercase tracking-wider font-mono border-b border-[#1d1d26] pb-1.5">
                  {cat.title}
                </h4>
                <div className="space-y-2.5">
                  {cat.items.map((item, itemIdx) => (
                    <div key={itemIdx} className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        {item.keys.map((k, kIdx) => (
                          <span 
                            key={kIdx} 
                            className="px-2 py-0.5 bg-[#1a1a24] border border-[#2e2e3e] rounded text-[10px] font-mono font-bold text-gray-200 shadow-sm"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-gray-400 leading-tight">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t border-[#1d1d26] pt-4 flex items-center justify-between text-xs text-gray-500 font-mono">
            <span>Press <kbd className="px-1.5 py-0.5 bg-[#1c1c26] text-amber-400 border border-[#2e2e3e] rounded">Esc</kbd> or <kbd className="px-1.5 py-0.5 bg-[#1c1c26] text-amber-400 border border-[#2e2e3e] rounded">?</kbd> anytime to close</span>
            <button 
              onClick={onClose}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs transition-colors"
            >
              Got It
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
