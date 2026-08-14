/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Download, Music, Zap, Sliders, Package, Lock, Check } from 'lucide-react';
import { useDemoSession } from '../demo/DemoSessionContext';
import { PURCHASE_URL, DOWNLOAD_URL, DEMO_PRICE_DISPLAY, DEMO_PRODUCT_NAME } from '../lib/demoConfig';

const FEATURES = [
  { icon: Music, label: 'Synth layering & MPC beat studio' },
  { icon: Sliders, label: 'Studio mixer, FX rack & master dynamics' },
  { icon: Package, label: 'Sound kit creator & production catalog' },
  { icon: Zap, label: 'All exports: WAV, project files, AAF (Pro Tools)' },
];

export function DemoGateModal() {
  const { locked, showWelcome, countdown, start, unlock } = useDemoSession();

  if (locked) {
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Free demo session ended"
          className="w-full max-w-lg rounded-2xl border border-blue-500/40 bg-[#0c0c10] p-6 sm:p-8 shadow-[0_0_60px_rgba(37,99,235,0.3)]"
        >
          <div className="flex items-center gap-2 text-xs font-mono font-black uppercase tracking-widest text-yellow-400 mb-3">
            <Lock size={14} /> Demo session ended
          </div>
          <h2 className="text-2xl font-fastblaze tracking-wide text-white mb-2">
            Thanks for trying NC Sound Lab.
          </h2>
          <p className="text-sm text-slate-300 mb-5">
            Your 20-minute demo is up. Get the full {DEMO_PRODUCT_NAME} app for a one-time{' '}
            {DEMO_PRICE_DISPLAY} — no accounts, no memberships, no subscriptions. Works fully
            offline, runs on Windows, and saves everything locally.
          </p>

          <ul className="space-y-2 mb-6">
            {FEATURES.map((f) => (
              <li key={f.label} className="flex items-center gap-2.5 text-[13px] text-slate-200">
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-400 shrink-0">
                  <f.icon size={13} />
                </span>
                {f.label}
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2">
            <a
              href={PURCHASE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-yellow-400 px-4 py-3.5 text-black text-sm font-black uppercase tracking-wider hover:opacity-95 transition-all"
            >
              <Download size={16} />
              Get {DEMO_PRODUCT_NAME} — {DEMO_PRICE_DISPLAY}
            </a>
            <a
              href={DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center rounded-xl px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
            >
              Download Windows installer
            </a>
            <button
              onClick={unlock}
              className="rounded-xl px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
              title="If you already own the app, unlock this web demo session on this browser."
            >
              Already purchased? Unlock web demo
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showWelcome) {
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to NC Sound Lab"
          className="w-full max-w-lg rounded-2xl border border-blue-500/40 bg-[#0c0c10] p-6 sm:p-8 shadow-[0_0_60px_rgba(37,99,235,0.3)]"
        >
          <div className="text-xs font-mono font-black uppercase tracking-widest text-blue-400 mb-3">
            Welcome to the free demo
          </div>
          <h2 className="text-2xl font-fastblaze tracking-wide text-white mb-2">
            NC Sound Lab — beatmaker & sound engine.
          </h2>
          <p className="text-sm text-slate-300 mb-5">
            You get a <strong className="text-white">{countdown}</strong> free session to feel the
            workflow — synths, pads, sequencer, mixer, the whole studio. No sign-up, no credit card.
          </p>

          <ul className="space-y-2 mb-6">
            {FEATURES.map((f) => (
              <li key={f.label} className="flex items-center gap-2.5 text-[13px] text-slate-200">
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-yellow-500/15 border border-yellow-500/40 text-yellow-400 shrink-0">
                  <Check size={13} />
                </span>
                {f.label}
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2">
            <button
              onClick={start}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-yellow-400 px-4 py-3.5 text-black text-sm font-black uppercase tracking-wider hover:opacity-95 transition-all"
            >
              Start my 20-minute demo
            </button>
            <a
              href={PURCHASE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center rounded-xl px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
            >
              Or get the full app — {DEMO_PRICE_DISPLAY} one-time
            </a>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
