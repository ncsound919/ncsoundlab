import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, BookOpen, Sparkles, Layers, Zap, Sliders, 
  ShieldCheck, Flame, Radio, Play,
  Package, Compass, Cpu, Activity, RotateCcw, Wand2,
  FolderPlus, Cloud, Download, Search, Dna, Command,
  Dices, Lock
} from 'lucide-react';

interface UserManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTryPreset?: (presetId: string) => void;
}

type ChapterId = 
  | 'welcome' 
  | 'lego-layers' 
  | 'transient-punch' 
  | 'dual-osc-unison' 
  | 'filters-drive-lfo' 
  | 'master-rack-meter'
  | 'sound-kits-cloud'
  | '3d-space-visual'
  | 'workflow-ab-macros'
  | 'mutant-evolution'
  | 'smart-randomizer'
  | 'producer-cookbook'
  | 'beat-studio'
  | 'console-mixer'
  | 'sampling-recording'
  | 'pro-tools-stems'
  | 'projects-autosave'
  | 'demo-purchase'
  | 'hotkey-reference';

interface Chapter {
  id: ChapterId;
  title: string;
  badge: string;
  icon: React.ReactNode;
}

const CHAPTERS: Chapter[] = [
  { id: 'welcome', title: '1. Quick Start & Architecture', badge: 'EASY START', icon: <Sparkles className="text-blue-400" size={18} /> },
  { id: 'lego-layers', title: '2. Layering like LEGOs', badge: 'MIXER STRIP', icon: <Layers className="text-sky-400" size={18} /> },
  { id: 'transient-punch', title: '3. Transient Attack Punch', badge: 'DSP ENVELOPE', icon: <Zap className="text-orange-400" size={18} /> },
  { id: 'dual-osc-unison', title: '4. Oscillators & 3D Unison', badge: 'SYNTH ENGINE', icon: <Radio className="text-purple-400" size={18} /> },
  { id: 'filters-drive-lfo', title: '5. Filters, Drive & LFO', badge: 'TONE & WOBBLE', icon: <Sliders className="text-emerald-400" size={18} /> },
  { id: 'master-rack-meter', title: '6. Master Studio Rack', badge: 'PRO DYNAMICS', icon: <Cpu className="text-rose-400" size={18} /> },
  { id: 'sound-kits-cloud', title: '7. Sound Kits & Cloud Sync', badge: 'EXPORT & CLOUD', icon: <Package className="text-yellow-400" size={18} /> },
  { id: '3d-space-visual', title: '8. 3D Spatial Canvas', badge: '3D PAN & DEPTH', icon: <Compass className="text-blue-400" size={18} /> },
  { id: 'workflow-ab-macros', title: '9. A/B Compare & Macros', badge: 'SPEED WORKFLOW', icon: <Wand2 className="text-indigo-400" size={18} /> },
  { id: 'mutant-evolution', title: '10. Evolution Engine Stage 04', badge: 'CHAOS MUTATOR', icon: <Dna className="text-pink-400" size={18} /> },
  { id: 'smart-randomizer', title: '11. Smart Selective Randomizer', badge: 'SECTION LOCKS', icon: <Dices className="text-blue-400" size={18} /> },
  { id: 'producer-cookbook', title: '12. Producer Cookbook Recipes', badge: 'COOKBOOK & AUDIO', icon: <Flame className="text-rose-500" size={18} /> },
  { id: 'beat-studio', title: '13. Beat Studio & Sequencer', badge: 'MPC PADS', icon: <Zap className="text-rose-400" size={18} /> },
  { id: 'console-mixer', title: '14. Console Mixer & Sends', badge: 'MIX & BUSSES', icon: <Sliders className="text-indigo-400" size={18} /> },
  { id: 'sampling-recording', title: '15. Sampling & Recording', badge: 'TAKES & CHOPS', icon: <Layers className="text-teal-400" size={18} /> },
  { id: 'pro-tools-stems', title: '16. Stems, AAF & Pro Tools', badge: 'INTERCHANGE', icon: <Download className="text-sky-400" size={18} /> },
  { id: 'projects-autosave', title: '17. Projects & Autosave', badge: 'SAVE / LOAD', icon: <FolderPlus className="text-amber-400" size={18} /> },
  { id: 'demo-purchase', title: '18. Web Demo & Purchase', badge: 'GET THE APP', icon: <Cloud className="text-yellow-400" size={18} /> },
  { id: 'hotkey-reference', title: '19. Keyboard Hotkey Index', badge: 'COMMANDS', icon: <Command className="text-blue-400" size={18} /> },
];

function playDemoSound(type: string) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    
    if (type === 'punch_kick') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.18);
      gain.gain.setValueAtTime(1.0, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'flat_kick') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(55, now);
      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'sub_808') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.14);
      gain.gain.setValueAtTime(0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.95);
    } else if (type === 'snare_snap') {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.1);
      oscGain.gain.setValueAtTime(0.7, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);

      const bufferSize = ctx.sampleRate * 0.15;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.6, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      noise.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now);
    } else if (type === 'unison_lead') {
      [261.63, 329.63, 392.00].forEach((freq) => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc1.frequency.value = freq;
        osc2.frequency.value = freq * 1.012;
        
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.6);
        osc2.stop(now + 0.6);
      });
    } else if (type === 'filter_sweep') {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.value = 130.81;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(100, now);
      filter.frequency.exponentialRampToValueAtTime(3200, now + 0.25);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.5);
      
      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.55);
    } else if (type === 'lofi_pluck') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now);
      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'drill_slide') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.35);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.7);
      gain.gain.setValueAtTime(0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.8);
    }
  } catch (err) {
    console.error('Audio audition failed:', err);
  }
}

export function UserManualModal({ isOpen, onClose }: UserManualModalProps) {
  const [activeChapter, setActiveChapter] = useState<ChapterId>('welcome');
  const [activeTabDemo, setActiveTabDemo] = useState<'punch' | 'flat'>('punch');
  const [shortcutSearch, setShortcutSearch] = useState('');

  if (!isOpen) return null;

  const HOTKEYS = [
    { key: 'Spacebar', action: 'Play / Stop Currently Selected Sound Layer' },
    { key: 'Shift + Space', action: 'Preview All Mixed Audio Layers Simultaneously' },
    { key: 'S', action: 'Solo Selected Sound Layer (Silences all other layers)' },
    { key: 'M', action: 'Mute Selected Sound Layer' },
    { key: '?', action: 'Toggle Quick Keyboard Shortcuts Guide' },
    { key: 'Ctrl / Cmd + Z', action: 'Undo Last Parameter Adjustment' },
    { key: 'Ctrl / Cmd + Y', action: 'Redo Undone Parameter Adjustment' },
    { key: 'A', action: 'Switch Real-Time Monitoring to Dry Signal (Buffer A)' },
    { key: 'B', action: 'Switch Real-Time Monitoring to Wet Signal (Buffer B)' },
    { key: 'Dup', action: 'Duplicate Selected Layer with All Settings Intact' },
    { key: 'Del / Backspace', action: 'Delete Selected Sound Layer' },
    { key: 'Esc', action: 'Close Modal Windows & Clear Selection' },
    { key: 'Arrow Left / Right', action: 'Navigate Between Workflow Stages' },
    { key: '1–9', action: 'Jump to a Workflow Stage by Number' },
  ];

  const filteredHotkeys = HOTKEYS.filter(
    h => h.key.toLowerCase().includes(shortcutSearch.toLowerCase()) || 
         h.action.toLowerCase().includes(shortcutSearch.toLowerCase())
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/85 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Studio User Manual">
        <motion.div 
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          className="bg-[#0b0b0f] border border-[#22222d] rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden text-white relative"
        >
          {/* Header Bar */}
          <div className="bg-[#121218] border-b border-[#22222e] px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-blue-600/20 to-yellow-400/20 border border-blue-500/40 rounded-xl text-yellow-400 shadow-inner">
                <BookOpen size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black tracking-tight text-white font-sans">COMPLETE STUDIO PRODUCER MANUAL</h2>
                  <span className="px-2.5 py-0.5 bg-blue-600/20 border border-blue-500/40 text-blue-300 font-mono text-[10px] font-bold rounded-full">
                    18 DEEP SYSTEM CHAPTERS 🚀
                  </span>
                </div>
                <p className="text-xs text-gray-400 font-mono">Master every single synth parameter, DSP routing, 3D spatial visualizer, Stage 04 Evolution Engine & kit creator!</p>
              </div>
            </div>

            <button 
              onClick={onClose}
              className="p-2 rounded-xl bg-[#1c1c26] text-gray-400 hover:text-white hover:bg-[#282836] transition-all border border-[#2e2e3e]"
              title="Close Manual"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body: Sidebar + Main Content */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Sidebar Navigation */}
            <div className="w-full md:w-64 bg-[#0e0e14] border-r border-[#1e1e28] p-3 space-y-1 shrink-0 overflow-y-auto">
              <div className="px-3 py-1.5 text-[9px] font-mono font-bold text-blue-400/80 uppercase tracking-wider">
                System Guide Chapters
              </div>
              {CHAPTERS.map((ch) => {
                const isActive = activeChapter === ch.id;
                return (
                  <button
                    key={ch.id}
                    onClick={() => setActiveChapter(ch.id)}
                    className={`w-full text-left p-2 rounded-xl transition-all flex items-center justify-between group border ${
                      isActive 
                        ? 'bg-gradient-to-r from-blue-600/15 to-yellow-400/10 border-blue-500/50 text-white font-bold shadow-lg' 
                        : 'bg-[#14141c]/50 hover:bg-[#1a1a24] border-transparent text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${isActive ? 'bg-blue-600/20 text-blue-400' : 'bg-[#1e1e2a] text-gray-400'}`}>
                        {ch.icon}
                      </div>
                      <div className="overflow-hidden">
                        <div className="text-xs font-semibold leading-tight truncate">{ch.title}</div>
                        <div className="text-[9px] font-mono text-gray-500 group-hover:text-gray-400">{ch.badge}</div>
                      </div>
                    </div>
                  </button>
                );
              })}

              <div className="pt-3 border-t border-[#1a1a24] mt-3 px-3 space-y-2">
                <div className="text-[10px] font-mono text-blue-400 font-bold uppercase flex items-center gap-1">
                  <ShieldCheck size={12} /> 100% Comprehensive Guide
                </div>
                <p className="text-[10px] text-gray-500 leading-normal">
                  Every control in the studio is labeled in simple language with visual diagrams, signal routing math, and pro producer recipes.
                </p>
              </div>
            </div>

            {/* Main Chapter Display */}
            <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-[#0a0a0d]">
              
              {/* CHAPTER 1: WELCOME & QUICK START */}
              {activeChapter === 'welcome' && (
                <div className="space-y-6">
                  <div className="bg-gradient-to-br from-amber-950/40 via-[#13131a] to-[#0a0a0d] border border-amber-500/30 rounded-2xl p-6 relative overflow-hidden space-y-3">
                    <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-bold uppercase tracking-wider">
                      <Sparkles size={16} /> Welcome to the Sound Designer Studio Architecture
                    </div>
                    <h1 className="text-2xl font-black text-white">How to Make Epic Sounds in 3 Easy Steps</h1>
                    <p className="text-xs text-gray-300 leading-relaxed max-w-3xl">
                      Think of this studio like an <strong>Ultra Sound Creator Workshop</strong>! You can build custom drum kicks, snares, 808 sub basses, or futuristic synth sounds by stacking layers together like LEGO blocks.
                    </p>
                  </div>

                  {/* 3 Step Visual Guide Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-3 relative group hover:border-amber-500/50 transition-all">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 font-bold font-mono text-sm flex items-center justify-center border border-amber-500/30">
                        1
                      </div>
                      <h3 className="text-sm font-bold text-white">Pick or Create a Layer</h3>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        Click <strong>"+ Add Synth Layer"</strong> to create a fresh sound generator, or click <strong>1-Click Presets</strong> for instant 808s, Snares & HiHats.
                      </p>
                      <div className="bg-[#08080a] p-2.5 rounded-lg border border-[#1e1e28] flex items-center justify-between text-[10px] font-mono text-amber-400">
                        <span>⚡ 1-Click 808 Sub</span>
                        <span className="px-2 py-0.5 bg-amber-500/20 rounded">CLICK ME</span>
                      </div>
                    </div>

                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-3 relative group hover:border-sky-500/50 transition-all">
                      <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 font-bold font-mono text-sm flex items-center justify-center border border-sky-500/30">
                        2
                      </div>
                      <h3 className="text-sm font-bold text-white">Twist the Knobs</h3>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        Drag the <strong>Attack Punch</strong> knob for extra snap, turn up <strong>Tube Drive</strong> for sizzle, or boost <strong>Sub Depth</strong> for heavy bass in your chest.
                      </p>
                      <div className="bg-[#08080a] p-2 rounded-lg border border-[#1e1e28] flex items-center justify-center gap-3">
                        <div className="w-8 h-8 rounded-full border-2 border-sky-400 flex items-center justify-center font-mono text-[9px] font-bold text-sky-300">
                          75%
                        </div>
                        <span className="text-[10px] text-gray-300 font-bold font-mono">Attack Punch</span>
                      </div>
                    </div>

                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-3 relative group hover:border-emerald-500/50 transition-all">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold font-mono text-sm flex items-center justify-center border border-emerald-500/30">
                        3
                      </div>
                      <h3 className="text-sm font-bold text-white">Listen & Save to Sound Kit</h3>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        Press <strong>Spacebar</strong> to play your sound live! When you love it, click <strong>"Add to Sound Kit"</strong> or export as a WAV file.
                      </p>
                      <div className="bg-[#08080a] p-2 rounded-lg border border-[#1e1e28] flex items-center justify-center gap-2">
                        <Play size={12} className="text-emerald-400 fill-emerald-400" />
                        <span className="text-[10px] text-emerald-300 font-mono font-bold">Spacebar = Play</span>
                      </div>
                    </div>
                  </div>

                  {/* System Architecture Deep Signal Flow Diagram */}
                  <div className="bg-[#111116] border border-[#22222a] rounded-xl p-5 space-y-4">
                    <h4 className="text-xs font-mono font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                      <Activity size={16} /> WEB AUDIO API DSP SIGNAL FLOW ARCHITECTURE
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-center text-xs font-mono">
                      <div className="p-3 bg-[#181822] rounded-xl border border-[#252535] space-y-1">
                        <span className="text-amber-400 font-bold">1. OSC ENGINE</span>
                        <div className="text-[10px] text-gray-400">Dual Wave Oscillators + Sub Sine Generator</div>
                      </div>
                      <div className="p-3 bg-[#181822] rounded-xl border border-[#252535] space-y-1">
                        <span className="text-orange-400 font-bold">2. TRANSIENT SHAPER</span>
                        <div className="text-[10px] text-gray-400">1-20ms Pitch/Gain Snap Burst Window</div>
                      </div>
                      <div className="p-3 bg-[#181822] rounded-xl border border-[#252535] space-y-1">
                        <span className="text-emerald-400 font-bold">3. FILTER & DRIVE</span>
                        <div className="text-[10px] text-gray-400">Biquad Filter + Vacuum Tube Saturator</div>
                      </div>
                      <div className="p-3 bg-[#181822] rounded-xl border border-[#252535] space-y-1">
                        <span className="text-sky-400 font-bold">4. SPATIAL PANNER</span>
                        <div className="text-[10px] text-gray-400">3D Position Node + Equal Power Panner</div>
                      </div>
                      <div className="p-3 bg-[#181822] rounded-xl border border-[#252535] space-y-1">
                        <span className="text-rose-400 font-bold">5. MASTER RACK</span>
                        <div className="text-[10px] text-gray-400">Multiband Dynamics + Brickwall Limiter</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CHAPTER 2: LAYERING LIKE LEGOS */}
              {activeChapter === 'lego-layers' && (
                <div className="space-y-6">
                  <div className="space-y-2 border-b border-[#1c1c26] pb-4">
                    <div className="text-sky-400 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                      <Layers size={16} /> Sound Stacking Secrets & Layer Strip Parameters
                    </div>
                    <h2 className="text-xl font-extrabold text-white">How Professional Producers Layer Sounds</h2>
                    <p className="text-xs text-gray-400">
                      Great sounds aren't just one wave! They are built by stacking 3 distinct frequency elements together:
                    </p>
                  </div>

                  <div className="bg-[#111116] border border-[#22222e] rounded-xl p-5 space-y-4">
                    <h3 className="text-xs font-bold text-gray-300 font-mono uppercase tracking-widest text-center">
                      THE 3-LAYER DRUM & SYNTH FORMULA
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative">
                      <div className="bg-[#181822] border-2 border-amber-500/50 rounded-xl p-4 space-y-2 relative text-center">
                        <div className="text-2xl">⚡</div>
                        <h4 className="text-xs font-bold text-amber-300">1. Top Transient Snap</h4>
                        <p className="text-[11px] text-gray-400">High pitch click (0-20ms). Gives your sound instant attack power on phone speakers!</p>
                      </div>

                      <div className="bg-[#181822] border-2 border-sky-500/50 rounded-xl p-4 space-y-2 relative text-center">
                        <div className="text-2xl">🎯</div>
                        <h4 className="text-xs font-bold text-sky-300">2. Mid Body Tonal Ring</h4>
                        <p className="text-[11px] text-gray-400">Tonal pitch envelope (100-300ms). Gives musical identity and character!</p>
                      </div>

                      <div className="bg-[#181822] border-2 border-emerald-500/50 rounded-xl p-4 space-y-2 relative text-center">
                        <div className="text-2xl">🔊</div>
                        <h4 className="text-xs font-bold text-emerald-300">3. Sub/Air Resonance</h4>
                        <p className="text-[11px] text-gray-400">Low sine bass or high white noise (300ms+). Makes club subwoofers rumble!</p>
                      </div>
                    </div>
                  </div>

                  {/* Layer Mixer Parameters Deep Table */}
                  <div className="bg-[#121218] border border-[#22222a] rounded-xl p-5 space-y-3">
                    <h4 className="text-xs font-bold text-white uppercase font-mono">Layer Strip Controls Deep Breakdown</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 bg-[#181822] rounded-lg border border-[#222232] space-y-1">
                        <span className="font-bold text-amber-400 font-mono">VOLUME (dB) & PAN L/R</span>
                        <p className="text-gray-300 text-[11px]">Controls individual layer level relative to the mix and places it in the left/right stereo image.</p>
                      </div>
                      <div className="p-3 bg-[#181822] rounded-lg border border-[#222232] space-y-1">
                        <span className="font-bold text-sky-400 font-mono">PITCH DETUNE (-24 to +24 ST)</span>
                        <p className="text-gray-300 text-[11px]">Transposes the layer in musical semitones. Stacking 0st, +7st (fifth), and +12st creates thick chords.</p>
                      </div>
                      <div className="p-3 bg-[#181822] rounded-lg border border-[#222232] space-y-1">
                        <span className="font-bold text-emerald-400 font-mono">START OFFSET TIME (0-200ms)</span>
                        <p className="text-gray-300 text-[11px]">Delays when a layer triggers. Useful for creating natural human flam snares or clapping ensembles.</p>
                      </div>
                      <div className="p-3 bg-[#181822] rounded-lg border border-[#222232] space-y-1">
                        <span className="font-bold text-purple-400 font-mono">PHASE ANGLE (0° to 360°)</span>
                        <p className="text-gray-300 text-[11px]">Inverts or rotates waveform starting phase. Essential for preventing low-end phase cancellation when stacking sub-bass layers.</p>
                      </div>
                      <div className="p-3 bg-[#181822] rounded-lg border border-[#222232] space-y-1">
                        <span className="font-bold text-rose-400 font-mono">SOLO [S] & MUTE [M]</span>
                        <p className="text-gray-300 text-[11px]">Isolates a layer for surgical editing, or silences it to test mix interactions with other layers.</p>
                      </div>
                      <div className="p-3 bg-[#181822] rounded-lg border border-[#222232] space-y-1">
                        <span className="font-bold text-amber-300 font-mono">DUPLICATE [DUP]</span>
                        <p className="text-gray-300 text-[11px]">Instantly clones the layer along with all its oscillator, envelope, and filter settings.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CHAPTER 3: TRANSIENT ATTACK PUNCH */}
              {activeChapter === 'transient-punch' && (
                <div className="space-y-6">
                  <div className="space-y-2 border-b border-[#1c1c26] pb-4">
                    <div className="text-orange-400 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                      <Zap size={16} /> Transient Attack & Pitch Envelope Mechanics
                    </div>
                    <h2 className="text-xl font-extrabold text-white">Understanding Transient Attack Punch</h2>
                    <p className="text-xs text-gray-400">
                      Why do commercial drums sound so punchy? It's all in the first <strong>1 to 20 milliseconds</strong>!
                    </p>
                  </div>

                  <div className="bg-[#111116] border border-[#22222e] rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-[#1e1e28] pb-3">
                      <div className="text-xs font-bold text-gray-300 font-mono uppercase">
                        Interactive Waveform Comparison
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setActiveTabDemo('punch')}
                          className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                            activeTabDemo === 'punch' 
                              ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/30' 
                              : 'bg-[#1a1a24] text-gray-400'
                          }`}
                        >
                          ⚡ Punchy Transient
                        </button>
                        <button
                          onClick={() => setActiveTabDemo('flat')}
                          className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                            activeTabDemo === 'flat' 
                              ? 'bg-sky-500 text-black shadow-lg shadow-sky-500/30' 
                              : 'bg-[#1a1a24] text-gray-400'
                          }`}
                        >
                          ☁️ Soft / Flat
                        </button>
                      </div>
                    </div>

                    <div className="h-32 bg-[#060608] border border-[#1e1e28] rounded-xl flex items-center justify-center relative overflow-hidden px-8">
                      {activeTabDemo === 'punch' ? (
                        <div className="w-full flex items-center justify-center gap-1 h-24">
                          <div className="w-3 bg-orange-400 h-24 rounded-full animate-pulse shadow-lg shadow-orange-500/50" />
                          <div className="w-2 bg-orange-500 h-16 rounded-full" />
                          <div className="w-2 bg-amber-500 h-10 rounded-full" />
                          <div className="w-2 bg-amber-600 h-6 rounded-full" />
                          <div className="w-2 bg-amber-700 h-4 rounded-full" />
                          <div className="w-16 h-2 bg-amber-800 rounded-full" />
                        </div>
                      ) : (
                        <div className="w-full flex items-center justify-center gap-1 h-24">
                          <div className="w-2 bg-sky-500 h-8 rounded-full" />
                          <div className="w-2 bg-sky-500 h-8 rounded-full" />
                          <div className="w-2 bg-sky-500 h-8 rounded-full" />
                          <div className="w-2 bg-sky-500 h-8 rounded-full" />
                          <div className="w-16 h-2 bg-sky-800 rounded-full" />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between bg-[#181822] p-3 rounded-lg border border-[#252535]">
                      <div className="text-xs text-gray-300">
                        {activeTabDemo === 'punch' 
                          ? 'Notice the tall initial peak spike! That spike cuts through loud guitars and heavy synths.' 
                          : 'Flat waveform without initial attack spike. Sounds weak and gets buried in a song.'}
                      </div>
                      <button
                        onClick={() => playDemoSound(activeTabDemo === 'punch' ? 'punch_kick' : 'flat_kick')}
                        className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-xs rounded-lg flex items-center gap-1.5 shrink-0"
                      >
                        <Play size={12} fill="currentColor" /> Audition Demo
                      </button>
                    </div>
                  </div>

                  <div className="bg-[#121218] border border-[#22222a] rounded-xl p-4 space-y-2 text-xs">
                    <h4 className="font-mono font-bold text-amber-400">PRO TIP: PITCH ENVELOPE DROP MATH</h4>
                    <p className="text-gray-300 leading-relaxed">
                      For 808 kicks, configure a fast exponential pitch drop starting at <strong>280 Hz</strong> and decaying down to <strong>45 Hz</strong> over <strong>18ms</strong>. This initial pitch spike tricks the human brain into hearing a crisp attack click while preserving the deep low-end sub rumble!
                    </p>
                  </div>
                </div>
              )}

              {/* CHAPTER 4: DUAL OSC & SUPER-UNISON */}
              {activeChapter === 'dual-osc-unison' && (
                <div className="space-y-6">
                  <div className="space-y-2 border-b border-[#1c1c26] pb-4">
                    <div className="text-purple-400 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                      <Radio size={16} /> Synthetic Waves & Width
                    </div>
                    <h2 className="text-xl font-extrabold text-white">Dual Oscillators & 7-Voice Super Unison Engine</h2>
                    <p className="text-xs text-gray-400">
                      Transform thin single-channel waves into massive 3D stereo supersaws!
                    </p>
                  </div>

                  <div className="bg-[#111116] border border-[#22222e] rounded-xl p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-[#181822] border border-[#2a2a3a] rounded-xl p-4 text-center space-y-3">
                        <div className="text-xs font-bold text-gray-400 uppercase font-mono">1 Voice (Mono Center)</div>
                        <div className="h-20 bg-[#0a0a0d] border border-[#1e1e28] rounded-lg flex items-center justify-center">
                          <div className="w-3 h-12 bg-gray-500 rounded-full" />
                        </div>
                        <p className="text-[11px] text-gray-400">Sound comes directly from the center point between speakers.</p>
                      </div>

                      <div className="bg-[#181822] border-2 border-purple-500/50 rounded-xl p-4 text-center space-y-3">
                        <div className="text-xs font-bold text-purple-300 uppercase font-mono">7 Voices (Hyper-Wide 3D)</div>
                        <div className="h-20 bg-[#0a0a0d] border border-[#1e1e28] rounded-lg flex items-center justify-between px-4">
                          <div className="w-2 h-16 bg-purple-500 rounded-full shadow-lg shadow-purple-500/50" />
                          <div className="w-2 h-12 bg-purple-400 rounded-full" />
                          <div className="w-3 h-8 bg-purple-300 rounded-full" />
                          <div className="w-2 h-12 bg-purple-400 rounded-full" />
                          <div className="w-2 h-16 bg-purple-500 rounded-full shadow-lg shadow-purple-500/50" />
                        </div>
                        <p className="text-[11px] text-purple-300 font-medium">Fills both left and right ears with rich stereo chorus!</p>
                      </div>
                    </div>

                    <div className="flex justify-center pt-2">
                      <button
                        onClick={() => playDemoSound('unison_lead')}
                        className="px-4 py-2 bg-purple-500 hover:bg-purple-400 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-purple-500/20"
                      >
                        <Play size={14} fill="currentColor" /> Audition 7-Voice Super-Unison Lead
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                    <div className="p-3 bg-[#121218] border border-[#22222e] rounded-xl space-y-1">
                      <span className="text-purple-400 font-bold">WAVEFORM SELECTOR</span>
                      <p className="text-gray-300 text-[11px]">Sine (pure tone), Sawtooth (buzzy lead), Square/PWM (retro synth), Triangle (smooth bell), White Noise (percussion sizzle).</p>
                    </div>
                    <div className="p-3 bg-[#121218] border border-[#22222e] rounded-xl space-y-1">
                      <span className="text-amber-400 font-bold">DEDICATED SUB OSCILLATOR</span>
                      <p className="text-gray-300 text-[11px]">Clean sub-sine wave locked 1 octave below Osc 1 to provide solid bass foundation without detuning artifacts.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* CHAPTER 5: FILTERS, DRIVE & LFO */}
              {activeChapter === 'filters-drive-lfo' && (
                <div className="space-y-6">
                  <div className="space-y-2 border-b border-[#1c1c26] pb-4">
                    <div className="text-emerald-400 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                      <Sliders size={16} /> Resonant Filters, Vacuum Drive & LFO Modulation
                    </div>
                    <h2 className="text-xl font-extrabold text-white">Resonant Filters, Tube Drive & LFO Wobble</h2>
                    <p className="text-xs text-gray-400">
                      Sculpt your sound frequencies and add rhythmic movement!
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-emerald-400 font-mono">1. LOWPASS FILTER</div>
                      <p className="text-xs text-gray-300">Cuts harsh high frequencies above cutoff point. Makes synths sound warm, muffled, or underwater.</p>
                    </div>

                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-sky-400 font-mono">2. HIGHPASS FILTER</div>
                      <p className="text-xs text-gray-300">Cuts low bass rumble below cutoff. Keeps hi-hats and snares clean so they don't muddy the mix.</p>
                    </div>

                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-amber-400 font-mono">3. TUBE DRIVE & LFO</div>
                      <p className="text-xs text-gray-300">Tube drive adds warm analog saturation; LFO modulates filter cutoff for Dubstep wobbles!</p>
                    </div>
                  </div>

                  <div className="flex justify-center pt-2">
                    <button
                      onClick={() => playDemoSound('filter_sweep')}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-blue-500/20"
                    >
                      <Play size={14} fill="currentColor" /> Audition Resonant Filter Sweep
                    </button>
                  </div>
                </div>
              )}

              {/* CHAPTER 6: MASTER STUDIO RACK */}
              {activeChapter === 'master-rack-meter' && (
                <div className="space-y-6">
                  <div className="space-y-2 border-b border-[#1c1c26] pb-4">
                    <div className="text-rose-400 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                      <Cpu size={16} /> Professional Output
                    </div>
                    <h2 className="text-xl font-extrabold text-white">Master Studio Rack & Precision Peak Meter</h2>
                    <p className="text-xs text-gray-400">
                      Glue all your layers into one commercial radio-ready master track with no clipping or distortion!
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#12121a] border border-[#22222e] rounded-xl p-4 space-y-3">
                      <h4 className="text-xs font-bold text-rose-400 font-mono">MULTIBAND MASTER COMPRESSOR</h4>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        Evens out volume spikes! Set <strong>Threshold</strong> to -12dB and <strong>Ratio</strong> to 4:1 for aggressive glue punch.
                      </p>
                    </div>

                    <div className="bg-[#12121a] border border-[#22222e] rounded-xl p-4 space-y-3">
                      <h4 className="text-xs font-bold text-amber-400 font-mono">PARAMETRIC MASTER EQ</h4>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        Boost high frequencies for air sparkle (+3dB at 10kHz) or cut low mud (-2dB at 250Hz)!
                      </p>
                    </div>
                  </div>

                  <div className="bg-[#111116] border border-[#22222a] rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Activity className="text-emerald-400" size={24} />
                      <div>
                        <h4 className="text-xs font-bold text-white">Precision Peak dB & Phase Correlation Meter</h4>
                        <p className="text-[11px] text-gray-400">Green = Safe (-6dB headroom) | Red = Soft Clipper Active!</p>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold rounded-lg border border-emerald-500/30">
                      NO CLIPPING
                    </span>
                  </div>
                </div>
              )}

              {/* CHAPTER 7: SOUND KITS & CLOUD */}
              {activeChapter === 'sound-kits-cloud' && (
                <div className="space-y-6">
                  <div className="space-y-2 border-b border-[#1c1c26] pb-4">
                    <div className="text-amber-300 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                      <Package size={16} /> Exporting & Cloud Sync
                    </div>
                    <h2 className="text-xl font-extrabold text-white">Creating, Exporting & Cloud Syncing Sound Kits</h2>
                    <p className="text-xs text-gray-400">
                      Turn your designed one-shots into a complete sample pack ready for export or cloud sharing!
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-amber-400 font-mono flex items-center gap-1.5">
                        <Download size={14} /> WAV File Export
                      </div>
                      <p className="text-xs text-gray-300">
                        Export crystal-clear 24-bit 44.1kHz WAV files directly into your computer downloads folder!
                      </p>
                    </div>

                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-sky-400 font-mono flex items-center gap-1.5">
                        <FolderPlus size={14} /> ZIP Kit Bundle
                      </div>
                      <p className="text-xs text-gray-300">
                        Bundle 8-16 sounds into a single .zip Sound Kit with custom tags (808, Snare, HiHat)!
                      </p>
                    </div>

                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-emerald-400 font-mono flex items-center gap-1.5">
                        <Cloud size={14} /> Local Sound Kit Catalog
                      </div>
                      <p className="text-xs text-gray-300">
                        Publish your Sound Kit to the live community catalog so producers around the world can try your samples!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* CHAPTER 8: 3D SPATIAL CANVAS & REVERB STAGE */}
              {activeChapter === '3d-space-visual' && (
                <div className="space-y-6">
                  <div className="space-y-2 border-b border-[#1c1c26] pb-4">
                    <div className="text-amber-400 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                      <Compass size={16} /> Stage 04: Dedicated Spatial 3D & Reverb Stage
                    </div>
                    <h2 className="text-xl font-extrabold text-white">Full-Screen 3D Spatial Room & Schroeder Reverb Engine</h2>
                    <p className="text-xs text-gray-400">
                      Position sound sources in a 3D binaural listener environment and tweak unified acoustic room space.
                    </p>
                  </div>

                  <div className="bg-[#111116] border border-[#22222e] rounded-xl p-6 space-y-4 text-center">
                    <div className="h-44 bg-[#08080c] border border-[#1e1e28] rounded-xl relative flex items-center justify-center overflow-hidden p-4">
                      <div className="absolute inset-0 bg-[radial-gradient(#222232_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />
                      
                      <div className="absolute left-1/6 top-1/4 p-2 bg-amber-500 text-black font-bold font-mono text-[9px] rounded-full shadow-lg shadow-amber-500/50">
                        Layer 1 (Far Left / High Room Decay)
                      </div>
                      <div className="absolute right-1/6 bottom-1/4 p-2 bg-sky-500 text-black font-bold font-mono text-[9px] rounded-full shadow-lg shadow-sky-500/50">
                        Layer 2 (Far Right / Stereo Width)
                      </div>
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-2.5 bg-purple-500 text-white font-bold font-mono text-[10px] rounded-full shadow-xl ring-4 ring-purple-500/20">
                        LISTENER BINAURAL HEAD (0,0)
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-left pt-2">
                      <div className="bg-[#181822] border border-[#222230] p-3 rounded-lg space-y-1">
                        <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">Dedicated Full Page</span>
                        <p className="text-[11px] text-gray-300">Stage 04 now gives the 3D canvas and reverb space full room to breathe on desktop and mobile.</p>
                      </div>
                      <div className="bg-[#181822] border border-[#222230] p-3 rounded-lg space-y-1">
                        <span className="text-[10px] font-mono font-bold text-sky-400 uppercase">Unified Reverb & Spatial FX</span>
                        <p className="text-[11px] text-gray-300">All convolution & algorithmic reverb settings, wet mix, and 3D pan coordinates act in perfect acoustic unison.</p>
                      </div>
                      <div className="bg-[#181822] border border-[#222230] p-3 rounded-lg space-y-1">
                        <span className="text-[10px] font-mono font-bold text-purple-400 uppercase">Interactive Node Dragging</span>
                        <p className="text-[11px] text-gray-300">Drag layer orbits in real-time to adjust stereo balance, distance attenuation, and reverberant depth.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CHAPTER 9: WORKFLOW TOOLS & A/B MACROS */}
              {activeChapter === 'workflow-ab-macros' && (
                <div className="space-y-6">
                  <div className="space-y-2 border-b border-[#1c1c26] pb-4">
                    <div className="text-indigo-400 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                      <Wand2 size={16} /> Power User Speed
                    </div>
                    <h2 className="text-xl font-extrabold text-white">A/B Snapshots, Quick Copy FX & Performance Macros</h2>
                    <p className="text-xs text-gray-400">
                      Work 10x faster with snapshot comparisons and performance macro knobs.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-bold text-amber-400 font-mono">A/B SNAPSHOT COMPARISON</h4>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        Save state to <strong>Save A</strong> or <strong>Save B</strong>. Click <strong>A</strong> or <strong>B</strong> to instantly toggle and compare mix settings without losing work!
                      </p>
                    </div>

                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-bold text-indigo-400 font-mono">COPY & PASTE LAYER FX</h4>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        Loved the reverb and filter on Layer 1? Click <strong>Copy FX</strong> on Layer 1, select Layer 2, and click <strong>Paste FX</strong>!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* CHAPTER 10: SOUND EVOLUTION ENGINE */}
              {activeChapter === 'mutant-evolution' && (
                <div className="space-y-6">
                  <div className="space-y-2 border-b border-[#1c1c26] pb-4">
                    <div className="text-pink-400 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                      <Dna size={16} /> Procedural Chaos Mutator
                    </div>
                    <h2 className="text-xl font-extrabold text-white">Stage 04 Evolution Engine & Mutant Variations</h2>
                    <p className="text-xs text-gray-400">
                      Generate 10 to 50 unique procedural variations from a single sound layer using chaotic DSP routing!
                    </p>
                  </div>

                  <div className="bg-[#111116] border border-[#22222e] rounded-xl p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-[#181822] border border-[#2a2a3a] rounded-xl p-4 space-y-2">
                        <span className="text-xs font-bold text-pink-400 font-mono">1. MUTATION SEED</span>
                        <p className="text-xs text-gray-300">Applies randomized pitch shifts, time stretches, and reverse fragments.</p>
                      </div>
                      <div className="bg-[#181822] border border-[#2a2a3a] rounded-xl p-4 space-y-2">
                        <span className="text-xs font-bold text-amber-400 font-mono">2. ROUTING CHAOS</span>
                        <p className="text-xs text-gray-300">Routes audio through bitcrushers, ring modulators, and comb filters.</p>
                      </div>
                      <div className="bg-[#181822] border border-[#2a2a3a] rounded-xl p-4 space-y-2">
                        <span className="text-xs font-bold text-emerald-400 font-mono">3. ONE-CLICK SAVING</span>
                        <p className="text-xs text-gray-300">Audition each mutant variation live and add the best ones directly into your Sound Kit!</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CHAPTER 11: SMART SELECTIVE RANDOMIZER & SECTION LOCKS */}
              {activeChapter === 'smart-randomizer' && (
                <div className="space-y-6">
                  <div className="space-y-2 border-b border-[#1c1c26] pb-4">
                    <div className="text-amber-400 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                      <Dices size={16} /> Targeted Sound Generation & Preservation
                    </div>
                    <h2 className="text-xl font-extrabold text-white">Smart Selective Randomizer & Section Locks</h2>
                    <p className="text-xs text-gray-400">
                      Generate hundreds of fresh sound variations in seconds while maintaining your favorite locked sound sections!
                    </p>
                  </div>

                  <div className="bg-[#111116] border border-[#22222e] rounded-xl p-5 space-y-4">
                    <h3 className="text-xs font-bold text-amber-300 font-mono uppercase tracking-wider">
                      How Section Locking Works
                    </h3>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      Traditional randomizers overwrite your entire sound patch, destroying delicate sub bass tuning or transient punch. The <strong>Smart Selective Randomizer</strong> solves this with <strong>Independent Section Locks</strong>.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2">
                      <div className="bg-[#181822] border border-[#2a2a3e] rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center gap-2 text-amber-400 font-bold text-xs font-mono">
                          <Lock size={14} /> 1. Lock What You Love
                        </div>
                        <p className="text-xs text-gray-300">
                          Click padlock icons on sections like <strong>Oscillators & Sub</strong> or <strong>Amp Envelope</strong>. Locked sections will remain 100% untouched during randomized rolls.
                        </p>
                      </div>

                      <div className="bg-[#181822] border border-[#2a2a3e] rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center gap-2 text-sky-400 font-bold text-xs font-mono">
                          <Dices size={14} /> 2. Randomize Unlocked FX & Wobbles
                        </div>
                        <p className="text-xs text-gray-300">
                          Roll random settings for <strong>Filters, Saturation, LFOs, Delay/Reverb, or Chaos Engines</strong> while keeping your pristine low-end sub bass intact.
                        </p>
                      </div>

                      <div className="bg-[#181822] border border-[#2a2a3e] rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs font-mono">
                          <Sliders size={14} /> 3. Intensity Slider (10% - 100%)
                        </div>
                        <p className="text-xs text-gray-300">
                          Set intensity to 15% for micro-tweaks and organic variation, or 100% for radical re-synthesis and wild sonic metamorphosis.
                        </p>
                      </div>

                      <div className="bg-[#181822] border border-[#2a2a3e] rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center gap-2 text-pink-400 font-bold text-xs font-mono">
                          <RotateCcw size={14} /> 4. Instant Undo History Stack
                        </div>
                        <p className="text-xs text-gray-300">
                          Rolled a variation that was slightly better 2 rolls ago? Hit <strong>Undo Roll</strong> to instantly jump back up to 10 states in history!
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                    <h4 className="text-xs font-bold text-indigo-400 font-mono">PRO TIP: THE PERFECT SUB & TRANSIENT LOCK WORKFLOW</h4>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      To create 20 snare or lead variations for an album: create a punchy transient attack and sub drop first. Lock <strong>Pitch Env & Transient Punch</strong> and <strong>Amp Volume Envelope</strong>. Now hit <strong>Generate</strong> rapidly—every single result will retain the exact same punchy transient impact, but with wild new filter textures, choruses, and granular tails!
                    </p>
                  </div>
                </div>
              )}

              {/* CHAPTER 12: PRODUCER SOUND COOKBOOK */}
              {activeChapter === 'producer-cookbook' && (
                <div className="space-y-6">
                  <div className="space-y-2 border-b border-[#1c1c26] pb-4">
                    <div className="text-rose-400 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                      <Flame size={16} /> Secret Sound Recipes & Live Audition
                    </div>
                    <h2 className="text-xl font-extrabold text-white">Producer Sound Cookbook Recipes</h2>
                    <p className="text-xs text-gray-400">
                      Follow these exact knob settings to make industry-standard drums and synths, and test-listen live!
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-[#1e1e2a] pb-2">
                        <span className="text-xs font-bold text-yellow-400 font-mono">EARTH-SHAKING 808 SUB KICK</span>
                        <button 
                          onClick={() => playDemoSound('sub_808')}
                          className="px-2.5 py-1 bg-yellow-400/20 hover:bg-yellow-400 hover:text-black text-yellow-300 text-[10px] font-bold rounded flex items-center gap-1 transition-colors"
                        >
                          <Play size={10} fill="currentColor" /> Test Sound
                        </button>
                      </div>
                      <ul className="text-xs text-gray-300 space-y-1 font-mono">
                        <li>• Waveform: <strong>Sine Wave</strong></li>
                        <li>• Pitch Drop: <strong>110Hz to 38Hz</strong> over 140ms</li>
                        <li>• Tube Drive: <strong>40%</strong> (for subtle harmonic sizzle)</li>
                        <li>• Envelope: Decay = 0.95s | Release = 0.8s</li>
                      </ul>
                    </div>

                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-[#1e1e2a] pb-2">
                        <span className="text-xs font-bold text-sky-400 font-mono">HARD TRAP SNAP SNARE</span>
                        <button 
                          onClick={() => playDemoSound('snare_snap')}
                          className="px-2.5 py-1 bg-sky-500/20 hover:bg-sky-500 hover:text-black text-sky-300 text-[10px] font-bold rounded flex items-center gap-1 transition-colors"
                        >
                          <Play size={10} fill="currentColor" /> Test Sound
                        </button>
                      </div>
                      <ul className="text-xs text-gray-300 space-y-1 font-mono">
                        <li>• Layer 1: Triangle Osc (220Hz -&gt; 120Hz, Decay = 0.15s)</li>
                        <li>• Layer 2: White Noise (Highpass @ 2kHz, Decay = 0.15s)</li>
                        <li>• Transient Attack: <strong>85% Punch</strong></li>
                        <li>• Reverb Tail: Room Size = 15%, Decay = 0.2s</li>
                      </ul>
                    </div>

                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-[#1e1e2a] pb-2">
                        <span className="text-xs font-bold text-blue-400 font-mono">AMBIENT LO-FI PLUCK</span>
                        <button 
                          onClick={() => playDemoSound('lofi_pluck')}
                          className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-500 hover:text-white text-blue-300 text-[10px] font-bold rounded flex items-center gap-1 transition-colors"
                        >
                          <Play size={10} fill="currentColor" /> Test Sound
                        </button>
                      </div>
                      <ul className="text-xs text-gray-300 space-y-1 font-mono">
                        <li>• Waveform: <strong>Sine + Square</strong></li>
                        <li>• Lowpass Filter: Cutoff @ 1.2kHz, Resonance = 2.5</li>
                        <li>• Bitcrusher: 10-bit depth reduction</li>
                        <li>• Tape Wobble: LFO Rate = 0.8Hz to Cutoff</li>
                      </ul>
                    </div>

                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-[#1e1e2a] pb-2">
                        <span className="text-xs font-bold text-purple-400 font-mono">UK DRILL SLIDE 808</span>
                        <button 
                          onClick={() => playDemoSound('drill_slide')}
                          className="px-2.5 py-1 bg-purple-500/20 hover:bg-purple-500 hover:text-white text-purple-300 text-[10px] font-bold rounded flex items-center gap-1 transition-colors"
                        >
                          <Play size={10} fill="currentColor" /> Test Sound
                        </button>
                      </div>
                      <ul className="text-xs text-gray-300 space-y-1 font-mono">
                        <li>• Waveform: Pure Sine + Hard Saturation</li>
                        <li>• Pitch Glide: Fast legato octave slide (+12 semitones)</li>
                        <li>• Tube Drive: <strong>65% Overdrive</strong></li>
                        <li>• Highpass Filter: 30Hz cut to protect subs</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* CHAPTER 13: BEAT STUDIO & SEQUENCER */}
              {activeChapter === 'beat-studio' && (
                <div className="space-y-6">
                  <div className="space-y-2 border-b border-[#1c1c26] pb-4">
                    <div className="text-rose-400 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                      <Zap size={16} /> Stage 03: Beat Studio
                    </div>
                    <h2 className="text-xl font-extrabold text-white">Beat Studio & Sequencer — MPC Pads, Step Grid & Piano Roll</h2>
                    <p className="text-xs text-gray-400">
                      Build full beats: hit MPC pads live, program 16/32-step patterns per layer, and arrange them into a song chain.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-rose-400 font-mono flex items-center gap-1.5">
                        <Zap size={14} /> MPC PAD BANK
                      </div>
                      <p className="text-xs text-gray-300">
                        Four banks (A/B/C/D) × 16 pads map to your sound layers. Hit pads live with pointer or QWERTY keys — velocity scales with pointer Y position.
                      </p>
                    </div>
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-sky-400 font-mono flex items-center gap-1.5">
                        <Activity size={14} /> STEP SEQUENCER
                      </div>
                      <p className="text-xs text-gray-300">
                        Program patterns per layer over 16 or 32 steps with per-step velocity and probability. Swing and groove templates add human feel.
                      </p>
                    </div>
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-purple-400 font-mono flex items-center gap-1.5">
                        <Layers size={14} /> SONG CHAIN
                      </div>
                      <p className="text-xs text-gray-300">
                        Chain patterns A–D into an arrangement and let the transport drive the whole song with a master BPM.
                      </p>
                    </div>
                  </div>

                  <div className="bg-[#111116] border border-[#22222a] rounded-xl p-4 space-y-2">
                    <h4 className="text-xs font-bold text-white font-mono">TRANSPORT & RECORDING</h4>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Use the transport bar to play/stop, set BPM, quantize input, and record. The metronome, count-in and
                      per-take recording capture your performance with real velocity. Keyboard shortcuts: Spacebar = play/stop,
                      R = arm record.
                    </p>
                  </div>
                </div>
              )}

              {/* CHAPTER 14: CONSOLE MIXER & SENDS */}
              {activeChapter === 'console-mixer' && (
                <div className="space-y-6">
                  <div className="space-y-2 border-b border-[#1c1c26] pb-4">
                    <div className="text-indigo-400 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                      <Sliders size={16} /> Stage 04: Studio Console
                    </div>
                    <h2 className="text-xl font-extrabold text-white">Console Mixer & Sends — Faders, Channel Strips & Busses</h2>
                    <p className="text-xs text-gray-400">
                      Mix every layer on a full-screen console: faders, pan, mute/solo, per-channel EQ and dynamics, plus FX send busses.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-indigo-400 font-mono flex items-center gap-1.5">
                        <Sliders size={14} /> CHANNEL STRIP
                      </div>
                      <p className="text-xs text-gray-300">
                        Per-layer fader, pan, mute, solo and meter. Each strip carries its own EQ, compressor and FX chain routed into the mix.
                      </p>
                    </div>
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-amber-400 font-mono flex items-center gap-1.5">
                        <RotateCcw size={14} /> SEND / RETURN BUSSES
                      </div>
                      <p className="text-xs text-gray-300">
                        Send any channel to shared reverb and delay return busses. Adjust send level per channel; the return sum feeds the master.
                      </p>
                    </div>
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-rose-400 font-mono flex items-center gap-1.5">
                        <Cpu size={14} /> MASTER DYNAMICS
                      </div>
                      <p className="text-xs text-gray-300">
                        The master console hosts a brickwall limiter and compressor so the final mix stays clean and loud without clipping.
                      </p>
                    </div>
                  </div>

                  <div className="bg-[#111116] border border-[#22222a] rounded-xl p-4">
                    <h4 className="text-xs font-bold text-white font-mono mb-1">REAL METERS, NOT FAKES</h4>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Every channel and the master show real peak/RMS metering from the Web Audio analysers — move a fader and watch the meter respond.
                    </p>
                  </div>
                </div>
              )}

              {/* CHAPTER 15: SAMPLING & RECORDING */}
              {activeChapter === 'sampling-recording' && (
                <div className="space-y-6">
                  <div className="space-y-2 border-b border-[#1c1c26] pb-4">
                    <div className="text-teal-400 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                      <Layers size={16} /> Sample & Record
                    </div>
                    <h2 className="text-xl font-extrabold text-white">Sampling & Recording — Library, Chop Editor, Takes & Waveform DSP</h2>
                    <p className="text-xs text-gray-400">
                      Import your own audio, organize it into a persistent sample library, chop loops, record takes with punch-in, and edit waveforms destructively.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-teal-400 font-mono flex items-center gap-1.5">
                        <FolderPlus size={14} /> SAMPLE BROWSER & LIBRARY
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        Drag-and-drop WAV/MP3/OGG/AIFF files, keep them in persistent folders with search and preview, and drop samples straight onto pads or layers.
                      </p>
                    </div>
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-orange-400 font-mono flex items-center gap-1.5">
                        <Zap size={14} /> CHOP EDITOR
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        Auto-chop on transients (onset detection) or split evenly/tap to chop a loop into slices, then map each slice to its own pad with tuning.
                      </p>
                    </div>
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-sky-400 font-mono flex items-center gap-1.5">
                        <Radio size={14} /> TAKES RECORDER
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        Record mic/instrument input with metronome + count-in, punch in/out on a loop, and keep multiple takes to comp the best one.
                      </p>
                    </div>
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-emerald-400 font-mono flex items-center gap-1.5">
                        <Activity size={14} /> WAVEFORM EDITOR
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        Select a region of any sample and apply destructive DSP: trim, normalize, pitch-shift, saturate, bitcrush, reverb, stereo width and more.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* CHAPTER 16: STEMS, AAF & PRO TOOLS */}
              {activeChapter === 'pro-tools-stems' && (
                <div className="space-y-6">
                  <div className="space-y-2 border-b border-[#1c1c26] pb-4">
                    <div className="text-sky-400 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                      <Download size={16} /> Pro Interchange
                    </div>
                    <h2 className="text-xl font-extrabold text-white">Stems, AAF & Pro Tools — Round-Trip With Your DAW</h2>
                    <p className="text-xs text-gray-400">
                      Get your mix out into Pro Tools and back again: per-layer stems, a multi-track bundle, and a real SMPTE AAF file (desktop).
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-sky-400 font-mono flex items-center gap-1.5">
                        <Download size={14} /> STEM EXPORT
                      </div>
                      <p className="text-xs text-gray-300">
                        Render every audible layer as its own WAV stem at 16/24/32-bit and 44.1/48/96 kHz — with or without its send FX baked in.
                      </p>
                    </div>
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-blue-400 font-mono flex items-center gap-1.5">
                        <Package size={14} /> MULTI-TRACK BUNDLE
                      </div>
                      <p className="text-xs text-gray-300">
                        Export a .zip with the master mixdown, one WAV per stem, a Pro Tools Markers.csv tempo map, and import instructions.
                      </p>
                    </div>
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-purple-400 font-mono flex items-center gap-1.5">
                        <Command size={14} /> AAF EXPORT / IMPORT
                      </div>
                      <p className="text-xs text-gray-300">
                        Desktop app: write a real SMPTE ST 377-1 AAF (one track per stem, embedded PCM) and import AAFs back for A/B and tempo work.
                      </p>
                    </div>
                  </div>

                  <div className="bg-[#111116] border border-[#22222a] rounded-xl p-4">
                    <h4 className="text-xs font-bold text-white font-mono mb-1">REFERENCE TRACKS & TEMPO DETECTION</h4>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Drop a reference track into the Compare stage for A/B loudness matching (real EBU R128 / BS.1770-4 integrated LUFS via the Compare Engine),
                      and auto-detect its BPM to snap your project tempo to match.
                    </p>
                  </div>
                </div>
              )}

              {/* CHAPTER 17: PROJECTS & AUTOSAVE */}
              {activeChapter === 'projects-autosave' && (
                <div className="space-y-6">
                  <div className="space-y-2 border-b border-[#1c1c26] pb-4">
                    <div className="text-amber-400 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                      <FolderPlus size={16} /> Persistence
                    </div>
                    <h2 className="text-xl font-extrabold text-white">Projects & Autosave — Save Everything, Lose Nothing</h2>
                    <p className="text-xs text-gray-400">
                      Full project round-trip: layers with their audio, patterns, pads, song chain and mixer state — saved locally and recoverable.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-amber-400 font-mono flex items-center gap-1.5">
                        <FolderPlus size={14} /> SAVE / LOAD PROJECT
                      </div>
                      <p className="text-xs text-gray-300">
                        Save the whole session to IndexedDB or export a self-contained .nsl project file (samples embedded), then reload it later with audio intact.
                      </p>
                    </div>
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-emerald-400 font-mono flex items-center gap-1.5">
                        <RotateCcw size={14} /> UNDO / REDO HISTORY
                      </div>
                      <p className="text-xs text-gray-300">
                        Ctrl/Cmd+Z undoes and Ctrl/Cmd+Y redoes across layers, patterns, pads, song chain and mixer — a real command history, not just layer edits.
                      </p>
                    </div>
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-blue-400 font-mono flex items-center gap-1.5">
                        <Cloud size={14} /> AUTOSAVE & RECOVERY
                      </div>
                      <p className="text-xs text-gray-300">
                        The app autosaves your full project while you work. If a session is interrupted, a recovery banner offers to restore the latest version.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* CHAPTER 18: WEB DEMO & PURCHASE */}
              {activeChapter === 'demo-purchase' && (
                <div className="space-y-6">
                  <div className="space-y-2 border-b border-[#1c1c26] pb-4">
                    <div className="text-yellow-400 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                      <Cloud size={16} /> Try & Buy
                    </div>
                    <h2 className="text-xl font-extrabold text-white">Web Demo & Purchase — 20 Minutes, Then One-Time $5</h2>
                    <p className="text-xs text-gray-400">
                      The web build is a free, timed 20-minute demo. The desktop app (Windows) is the full product — one-time purchase, no subscriptions.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-yellow-400 font-mono flex items-center gap-1.5">
                        <Play size={14} /> THE FREE DEMO
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        A countdown pill tracks your 20-minute session (wall-clock based — refreshing doesn't reset it). When time's up, the paywall explains the full product.
                      </p>
                    </div>
                    <div className="bg-[#121218] border border-[#22222e] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-bold text-blue-400 font-mono flex items-center gap-1.5">
                        <Download size={14} /> FULL DESKTOP APP
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        A one-time $5 unlocks the offline Windows app: no accounts, no cloud, no limits. Premium sound kits in the catalog are part of the paid product.
                      </p>
                    </div>
                  </div>

                  <div className="bg-[#111116] border border-[#22222a] rounded-xl p-4">
                    <h4 className="text-xs font-bold text-white font-mono mb-1">DESKTOP EXTRAS</h4>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      The desktop build adds Pro Tools AAF export/import and runs fully offline. All your kits, projects and favorites persist locally in the app's own data folder.
                    </p>
                  </div>
                </div>
              )}

              {/* CHAPTER 19: HOTKEY REFERENCE */}
              {activeChapter === 'hotkey-reference' && (
                <div className="space-y-6">
                  <div className="space-y-2 border-b border-[#1c1c26] pb-4">
                    <div className="text-amber-400 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                      <Command size={16} /> Keyboard Shortcuts & Navigation Index
                    </div>
                    <h2 className="text-xl font-extrabold text-white">Studio Hotkeys & Command Reference</h2>
                    <p className="text-xs text-gray-400">
                      Speed up your sound design workflow with these instant keyboard shortcuts:
                    </p>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-3 text-gray-500" size={16} />
                    <input
                      type="text"
                      placeholder="Search hotkeys (e.g. space, solo, buffer)..."
                      value={shortcutSearch}
                      onChange={(e) => setShortcutSearch(e.target.value)}
                      className="w-full bg-[#121218] border border-[#22222e] rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 font-mono"
                    />
                  </div>

                  <div className="bg-[#111116] border border-[#22222a] rounded-xl divide-y divide-[#1e1e28]">
                    {filteredHotkeys.map((hk, idx) => (
                      <div key={idx} className="p-3.5 flex items-center justify-between text-xs">
                        <div className="font-mono font-bold text-amber-300 bg-[#181822] px-2.5 py-1 rounded-lg border border-[#282838] shadow-sm">
                          {hk.key}
                        </div>
                        <div className="text-gray-300 font-medium">{hk.action}</div>
                      </div>
                    ))}
                    {filteredHotkeys.length === 0 && (
                      <div className="p-8 text-center text-xs text-gray-500 font-mono">
                        No shortcuts found matching "{shortcutSearch}".
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Footer Bar */}
          <div className="bg-[#121218] border-t border-[#22222e] px-6 py-3 flex items-center justify-between shrink-0 font-mono text-xs text-gray-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span>Interactive Manual Active — 18 System Chapters Loaded</span>
            </div>
            <button 
              onClick={onClose}
              className="px-4 py-1.5 bg-yellow-400 text-black font-extrabold rounded-lg hover:bg-yellow-300 transition-colors"
            >
              Back to Studio 🚀
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
