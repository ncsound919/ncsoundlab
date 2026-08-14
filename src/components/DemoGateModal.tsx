/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Download, Music, Zap, Sliders, Package, Lock, Check, Mail } from 'lucide-react';
import { useDemoSession } from '../demo/DemoSessionContext';
import { PURCHASE_URL, DOWNLOAD_URL, DEMO_PRICE_DISPLAY, DEMO_PRODUCT_NAME, EMAIL_CAPTURE_URL, ALBUM_1, ALBUM_2 } from '../lib/demoConfig';

const FEATURES = [
  { icon: Music, label: 'Synth layering & MPC beat studio' },
  { icon: Sliders, label: 'Studio mixer, FX rack & master dynamics' },
  { icon: Package, label: 'Sound kit creator & production catalog' },
  { icon: Zap, label: 'All exports: WAV, project files, AAF (Pro Tools)' },
];

export function DemoGateModal() {
  const { locked, showWelcome, countdown, start, unlock } = useDemoSession();
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem('ncs_email') || '';
    } catch {
      return '';
    }
  });
  const [emailSent, setEmailSent] = useState(false);

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) {
      start();
      return;
    }
    try {
      localStorage.setItem('ncs_email', value);
    } catch {
      /* ignore */
    }
    if (EMAIL_CAPTURE_URL && value) {
      const form = new FormData();
      form.append('email', value);
      form.append('source', 'nc-soundlab-welcome');
      fetch(EMAIL_CAPTURE_URL, { method: 'POST', body: form, mode: 'no-cors' }).catch(() => undefined);
    }
    setEmailSent(true);
    start();
  };

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

          {/* Founder's music — the real product behind the tool */}
          {(ALBUM_1.url || ALBUM_2.url) && (
            <div className="mb-6 rounded-xl border border-[#1e293b] bg-[#0a0a0e] p-3">
              <p className="text-[10px] font-mono font-black uppercase tracking-widest text-yellow-400 mb-2">
                Hear the founder's music
              </p>
              <div className="flex flex-wrap gap-2">
                {ALBUM_1.url && (
                  <a
                    href={ALBUM_1.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#16161a] border border-[#262632] px-3 py-1.5 text-[11px] font-bold text-blue-300 hover:border-blue-500 transition-colors"
                  >
                    <Music size={12} /> {ALBUM_1.title}
                  </a>
                )}
                {ALBUM_2.url && (
                  <a
                    href={ALBUM_2.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#16161a] border border-[#262632] px-3 py-1.5 text-[11px] font-bold text-blue-300 hover:border-blue-500 transition-colors"
                  >
                    <Music size={12} /> {ALBUM_2.title}
                  </a>
                )}
              </div>
            </div>
          )}

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
            <form
              onSubmit={submitEmail}
              className="flex flex-col gap-2"
              aria-label="Optional email to save your session"
            >
              {!emailSent && (
                <div className="flex items-center gap-2 rounded-xl border border-[#1e293b] bg-[#0a0a0e] px-3 py-2 focus-within:border-blue-500">
                  <Mail size={14} className="text-blue-400 shrink-0" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email (optional) — get the $5 offer if you leave"
                    aria-label="Email address (optional)"
                    className="w-full bg-transparent text-xs text-white placeholder-gray-600 focus:outline-none"
                  />
                </div>
              )}
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-yellow-400 px-4 py-3.5 text-black text-sm font-black uppercase tracking-wider hover:opacity-95 transition-all"
              >
                Start my 20-minute demo
              </button>
            </form>
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
